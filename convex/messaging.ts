import { action, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

type TokenCache = {
  token: string;
  expiresAt: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
let cachedToken: TokenCache | null = null;

const encodeBase64 = (input: string) => {
  const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const bytes = encoder
    ? encoder.encode(input)
    : Uint8Array.from(Array.from(input), (char) => char.charCodeAt(0));

  const base64Table =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i];
    const hasByte2 = i + 1 < bytes.length;
    const hasByte3 = i + 2 < bytes.length;
    const byte2 = hasByte2 ? bytes[i + 1] : 0;
    const byte3 = hasByte3 ? bytes[i + 2] : 0;

    const combined = (byte1 << 16) | (byte2 << 8) | byte3;
    output +=
      base64Table[(combined >> 18) & 63] +
      base64Table[(combined >> 12) & 63] +
      (hasByte2 ? base64Table[(combined >> 6) & 63] : "=") +
      (hasByte3 ? base64Table[combined & 63] : "=");
  }
  return output;
};

const normalizePhone = (raw: string | null | undefined) => {
  if (!raw) {
    return null;
  }
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  if (digits.length === 10) {
    return `1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits;
  }
  return digits;
};

const toMs = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) {
    return null;
  }
  const [, monthStr, dayStr, yearFragment] = match;
  const month = Number(monthStr);
  const day = Number(dayStr);
  let year = Number(yearFragment);
  if (month < 1 || month > 12 || day < 1 || day > 31 || Number.isNaN(year)) {
    return null;
  }
  if (yearFragment.length === 2) {
    year += year >= 70 ? 1900 : 2000;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getTime();
};

const formatIsoDate = (ms: number | null) => {
  if (ms === null) {
    return null;
  }
  return new Date(ms).toISOString();
};

const getRingCentralConfig = () => {
  const {
    RINGCENTRAL_CLIENT_ID: clientId,
    RINGCENTRAL_CLIENT_SECRET: clientSecret,
    RINGCENTRAL_JWT: jwt,
    RINGCENTRAL_FROM_NUMBER: fromNumber,
    RINGCENTRAL_SERVER_URL: serverUrl = "https://platform.ringcentral.com",
  } = process.env;

  if (!clientId || !clientSecret || !jwt || !fromNumber) {
    throw new ConvexError(
      "RingCentral environment variables are missing. Set RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, RINGCENTRAL_JWT, and RINGCENTRAL_FROM_NUMBER.",
    );
  }

  return { clientId, clientSecret, jwt, fromNumber, serverUrl };
};

const getAccessToken = async () => {
  const config = getRingCentralConfig();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const authHeader = encodeBase64(`${config.clientId}:${config.clientSecret}`);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: config.jwt,
  });

  const response = await fetch(`${config.serverUrl}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ConvexError(`RingCentral authentication failed: ${text}`);
  }

  const data: { access_token: string; expires_in: number } = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
};

const sendSms = async (toNumber: string, text: string) => {
  const config = getRingCentralConfig();
  const accessToken = await getAccessToken();

  const payload = {
    from: { phoneNumber: config.fromNumber },
    to: [{ phoneNumber: `+${toNumber}`.replace(/\+\+/, "+") }],
    text,
  };

  const response = await fetch(
    `${config.serverUrl}/restapi/v1.0/account/~/extension/~/sms`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const json = await response.json();
  if (!response.ok) {
    const message =
      typeof json?.message === "string"
        ? json.message
        : JSON.stringify(json ?? {});
    throw new ConvexError(`RingCentral SMS failed: ${message}`);
  }

  return {
    ringcentralId: json?.id !== undefined ? String(json.id) : undefined,
    status: json?.messageStatus ?? "sent",
    creationTime: json?.creationTime ? new Date(json.creationTime).getTime() : Date.now(),
  };
};

export const ensureThread = mutation({
  args: {
    patientId: v.optional(v.string()),
    patientName: v.optional(v.string()),
    phoneNumber: v.string(),
    location: v.optional(v.string()),
    phScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phoneNumber);
    if (!normalizedPhone) {
      throw new ConvexError("Unable to normalize phone number");
    }

    const existing = await ctx.db
      .query("messageThreads")
      .withIndex("by_phone", (q) => q.eq("normalizedPhone", normalizedPhone))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        patientId: args.patientId ?? existing.patientId,
        patientName: args.patientName ?? existing.patientName,
        location: args.location ?? existing.location,
        phScore: args.phScore ?? existing.phScore,
        lastMessageAt: existing.lastMessageAt ?? now,
      });
      return existing._id;
    }

    return await ctx.db.insert("messageThreads", {
      patientId: args.patientId,
      patientName: args.patientName,
      normalizedPhone,
      displayPhone: args.phoneNumber,
      location: args.location,
      phScore: args.phScore,
      tags: [],
      lastMessageAt: now,
      lastMessageSnippet: undefined,
      lastOutboundStatus: undefined,
      lastOutboundAt: undefined,
    });
  },
});

export const recordOutboundMessage = mutation({
  args: {
    threadId: v.id("messageThreads"),
    body: v.string(),
    status: v.string(),
    sentAt: v.number(),
    ringcentralId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    normalizedPhone: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      direction: "outbound",
      body: args.body,
      status: args.status,
      sentAt: args.sentAt,
      normalizedPhone: args.normalizedPhone ?? thread.normalizedPhone,
      ringcentralId: args.ringcentralId,
      patientId: args.patientId ?? thread.patientId,
      error: args.error,
    });

    await ctx.db.patch(args.threadId, {
      lastMessageAt: args.sentAt,
      lastMessageSnippet: args.body.slice(0, 160),
      lastOutboundStatus: args.status,
      lastOutboundAt: args.sentAt,
    });
  },
});

export const recordInboundMessage = mutation({
  args: {
    phoneNumber: v.string(),
    body: v.string(),
    receivedAt: v.number(),
    ringcentralId: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phoneNumber);
    if (!normalizedPhone) {
      throw new ConvexError("Unable to normalize phone number for inbound message");
    }

    let thread = await ctx.db
      .query("messageThreads")
      .withIndex("by_phone", (q) => q.eq("normalizedPhone", normalizedPhone))
      .unique();

    if (!thread) {
      const now = Date.now();
      const threadId = await ctx.db.insert("messageThreads", {
        patientId: undefined,
        patientName: undefined,
        normalizedPhone,
        displayPhone: args.phoneNumber,
        location: undefined,
        phScore: undefined,
        tags: [],
        lastMessageAt: now,
        lastMessageSnippet: undefined,
        lastOutboundStatus: undefined,
        lastOutboundAt: undefined,
      });
      thread = await ctx.db.get(threadId);
    }

    if (!thread) {
      throw new ConvexError("Failed to upsert thread for inbound message");
    }

    await ctx.db.insert("messages", {
      threadId: thread._id,
      direction: "inbound",
      body: args.body,
      status: args.status ?? "received",
      sentAt: args.receivedAt,
      normalizedPhone,
      ringcentralId: args.ringcentralId,
      patientId: thread.patientId,
      error: undefined,
    });

    await ctx.db.patch(thread._id, {
      lastMessageAt: args.receivedAt,
      lastMessageSnippet: args.body.slice(0, 160),
    });
  },
});

export const listThreads = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const threads = await ctx.db
      .query("messageThreads")
      .withIndex("by_lastMessage", (q) => q.gt("lastMessageAt", 0))
      .order("desc")
      .take(limit);
    return threads;
  },
});

export const getThread = query({
  args: {
    threadId: v.id("messageThreads"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      return null;
    }
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(500);
    return { thread, messages };
  },
});

export const findThreadByPatient = query({
  args: {
    patientId: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.patientId) {
      const thread = await ctx.db
        .query("messageThreads")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId!))
        .unique();
      if (thread) {
        return thread;
      }
    }
    if (args.phoneNumber) {
      const normalized = normalizePhone(args.phoneNumber);
      if (normalized) {
        const thread = await ctx.db
          .query("messageThreads")
          .withIndex("by_phone", (q) => q.eq("normalizedPhone", normalized))
          .unique();
        if (thread) {
          return thread;
        }
      }
    }
    return null;
  },
});

type AgendaEntry = {
  patientId: string | null;
  patientName: string | null;
  location: string | null;
  appointmentIso: string | null;
  appointmentMs: number | null;
  status: string | null;
  phoneNumbers: string[];
};

const buildAgendaEntry = (record: Record<string, string>): AgendaEntry => {
  const patientId = (record["Patient ID"] ?? "").toString().trim();
  const patientName = (record["Patient"] ?? "").toString().trim();
  const location = (record["Location"] ?? "").toString().trim();
  const status = (record["Status"] ?? "").toString().trim();
  const appointmentDate = (record["Appt. date"] ?? "").toString().trim();
  const appointmentTime =
    (record["Appt. time"] ??
      record["Appt. Time"] ??
      record["Time"] ??
      "").toString();
  const appointmentMs = toMs(appointmentDate);
  let appointmentIso: string | null = null;
  if (appointmentMs !== null) {
    const date = new Date(appointmentMs);
    if (appointmentTime) {
      const timeMatch = appointmentTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (timeMatch) {
        let hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2]);
        const period = timeMatch[3]?.toUpperCase();
        if (period === "PM" && hour < 12) {
          hour += 12;
        }
        if (period === "AM" && hour === 12) {
          hour = 0;
        }
        date.setHours(hour, minute, 0, 0);
      }
    }
    appointmentIso = date.toISOString();
  }

  const phoneColumns = [
    "Home phone",
    "Home Phone",
    "Work phone",
    "Work Phone",
    "Mobile phone",
    "Mobile Phone",
  ];
  const phoneNumbers = phoneColumns
    .map((column) => (record[column] ?? "").toString().trim())
    .filter((value) => value);

  return {
    patientId: patientId || null,
    patientName: patientName || null,
    location: location || null,
    appointmentIso,
    appointmentMs,
    status: status || null,
    phoneNumbers,
  };
};

export const agenda = query({
  args: {
    days: v.optional(v.number()),
    startDateIso: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.days ?? 5, 1), 14);
    const startDate = args.startDateIso ? new Date(args.startDateIso) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + days * MS_PER_DAY);

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_report", (q) => q.eq("reportName", "Referral Source - Appointments"))
      .collect();

    const agendaEntries = appointments
      .map((doc) => buildAgendaEntry(doc.data))
      .filter(
        (entry) =>
          entry.appointmentMs !== null &&
          entry.appointmentMs >= startDate.getTime() &&
          entry.appointmentMs < endDate.getTime(),
      );

    agendaEntries.sort((a, b) => {
      const aMs = a.appointmentMs ?? Number.MAX_SAFE_INTEGER;
      const bMs = b.appointmentMs ?? Number.MAX_SAFE_INTEGER;
      return aMs - bMs;
    });

    const byDate = new Map<string, AgendaEntry[]>();
    for (const entry of agendaEntries) {
      const key = entry.appointmentIso
        ? entry.appointmentIso.slice(0, 10)
        : "unknown";
      if (!byDate.has(key)) {
        byDate.set(key, []);
      }
      byDate.get(key)!.push(entry);
    }

    const daysList = [];
    for (let offset = 0; offset < days; offset++) {
      const day = new Date(startDate.getTime() + offset * MS_PER_DAY);
      const key = day.toISOString().slice(0, 10);
      daysList.push({
        dateIso: day.toISOString(),
        label: day.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        }),
        entries: byDate.get(key) ?? [],
      });
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days: daysList,
    };
  },
});

export const sendPatientMessage = action({
  args: {
    patientId: v.optional(v.string()),
    patientName: v.optional(v.string()),
    phoneNumber: v.string(),
    messageBody: v.string(),
    location: v.optional(v.string()),
    phScore: v.optional(v.number()),
    threadId: v.optional(v.id("messageThreads")),
  },
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phoneNumber);
    if (!normalizedPhone) {
      throw new ConvexError("Phone number is invalid");
    }

    const threadId =
      args.threadId ??
      (await ctx.runMutation("messaging:ensureThread" as any, {
        patientId: args.patientId,
        patientName: args.patientName,
        phoneNumber: args.phoneNumber,
        location: args.location,
        phScore: args.phScore,
      }));

    try {
      const sendResult = await sendSms(normalizedPhone, args.messageBody);
      await ctx.runMutation("messaging:recordOutboundMessage" as any, {
        threadId,
        body: args.messageBody,
        status: sendResult.status ?? "sent",
        sentAt: sendResult.creationTime,
        ringcentralId: sendResult.ringcentralId,
        patientId: args.patientId,
        normalizedPhone,
      });
      return {
        threadId,
        status: "sent" as const,
        sentAt: sendResult.creationTime,
        ringcentralId: sendResult.ringcentralId,
      };
    } catch (error) {
      const message =
        error instanceof ConvexError ? error.data : (error as Error).message;
      const fallbackTime = Date.now();
      await ctx.runMutation("messaging:recordOutboundMessage" as any, {
        threadId,
        body: args.messageBody,
        status: "failed",
        sentAt: fallbackTime,
        ringcentralId: undefined,
        patientId: args.patientId,
        normalizedPhone,
        error: message,
      });
      throw new ConvexError(message);
    }
  },
});

const renderTemplate = (
  template: string,
  entry: AgendaEntry,
) => {
  const date = entry.appointmentIso ? new Date(entry.appointmentIso) : null;
  const formatDate = date
    ? date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "your upcoming appointment";
  const formatTime = date
    ? date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  return template
    .replace(/\{name\}/gi, entry.patientName ?? "there")
    .replace(/\{date\}/gi, formatDate)
    .replace(/\{time\}/gi, formatTime)
    .replace(/\{location\}/gi, entry.location ?? "our office");
};

export const sendBulkReminders = action({
  args: {
    template: v.string(),
    recipients: v.array(
      v.object({
        patientId: v.optional(v.string()),
        patientName: v.optional(v.string()),
        phoneNumber: v.string(),
        appointmentIso: v.optional(v.string()),
        location: v.optional(v.string()),
        phScore: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.recipients.length === 0) {
      throw new ConvexError("No recipients provided");
    }
    if (args.recipients.length > 50) {
      throw new ConvexError("Too many recipients (limit 50 per bulk send)");
    }

    const results: Array<{
      patientId?: string;
      phoneNumber: string;
      status: string;
      error?: string;
    }> = [];

    for (const recipient of args.recipients) {
      const normalized = normalizePhone(recipient.phoneNumber);
      if (!normalized) {
        results.push({
          patientId: recipient.patientId ?? undefined,
          phoneNumber: recipient.phoneNumber,
          status: "failed",
          error: "Invalid phone number",
        });
        continue;
      }

      const message = renderTemplate(args.template, {
        patientId: recipient.patientId ?? null,
        patientName: recipient.patientName ?? null,
        location: recipient.location ?? null,
        appointmentIso: recipient.appointmentIso ?? null,
        appointmentMs: recipient.appointmentIso
          ? new Date(recipient.appointmentIso).getTime()
          : null,
        status: null,
        phoneNumbers: [recipient.phoneNumber],
      });

      const threadId = await ctx.runMutation("messaging:ensureThread" as any, {
        patientId: recipient.patientId,
        patientName: recipient.patientName,
        phoneNumber: recipient.phoneNumber,
        location: recipient.location,
        phScore: recipient.phScore,
      });

      try {
        const sendResult = await sendSms(normalized, message);
        await ctx.runMutation("messaging:recordOutboundMessage" as any, {
          threadId,
          body: message,
          status: sendResult.status ?? "sent",
          sentAt: sendResult.creationTime,
          ringcentralId: sendResult.ringcentralId,
          patientId: recipient.patientId,
          normalizedPhone: normalized,
        });
        results.push({
          patientId: recipient.patientId ?? undefined,
          phoneNumber: recipient.phoneNumber,
          status: "sent",
        });
      } catch (error) {
        const messageText =
          error instanceof ConvexError ? error.data : (error as Error).message;
        const fallbackTime = Date.now();
        await ctx.runMutation("messaging:recordOutboundMessage" as any, {
          threadId,
          body: message,
          status: "failed",
          sentAt: fallbackTime,
          ringcentralId: undefined,
          patientId: recipient.patientId,
          normalizedPhone: normalized,
          error: messageText,
        });
        results.push({
          patientId: recipient.patientId ?? undefined,
          phoneNumber: recipient.phoneNumber,
          status: "failed",
          error: messageText,
        });
      }
    }

    return {
      total: args.recipients.length,
      successful: results.filter((r) => r.status === "sent").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    };
  },
});
