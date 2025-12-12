import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type SendMessageRequest = {
  patientId?: string;
  patientName?: string;
  phoneNumber: string;
  messageBody: string;
  location?: string;
  phScore?: number;
  threadId?: number;
};

type BulkRecipient = {
  patientId?: string;
  patientName?: string;
  phoneNumber: string;
  appointmentIso?: string | null;
  location?: string;
  phScore?: number;
};

export type MessageThreadResponse = Prisma.MessageThreadGetPayload<{
  include: { messages: true };
}>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

const getRingCentralConfig = () => {
  const {
    RINGCENTRAL_CLIENT_ID: clientId,
    RINGCENTRAL_CLIENT_SECRET: clientSecret,
    RINGCENTRAL_JWT: jwt,
    RINGCENTRAL_FROM_NUMBER: fromNumber,
    RINGCENTRAL_SERVER_URL: serverUrl = "https://platform.ringcentral.com",
  } = process.env;

  if (!clientId || !clientSecret || !jwt || !fromNumber) {
    throw new Error(
      "RingCentral environment variables are missing. Set RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, RINGCENTRAL_JWT, and RINGCENTRAL_FROM_NUMBER.",
    );
  }

  return { clientId, clientSecret, jwt, fromNumber, serverUrl };
};

let cachedToken: { token: string; expiresAt: number } | null = null;

const encodeBase64 = (input: string) => {
  const encoder =
    typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
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
    throw new Error(`RingCentral authentication failed: ${text}`);
  }

  const data: { access_token: string; expires_in: number } =
    await response.json();
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
    throw new Error(`RingCentral SMS failed: ${message}`);
  }

  return {
    ringcentralId: json?.id !== undefined ? String(json.id) : undefined,
    status: json?.messageStatus ?? "sent",
    creationTime: json?.creationTime
      ? new Date(json.creationTime).getTime()
      : Date.now(),
  };
};

export async function fetchRingCentralMessage(messageId: string) {
  if (!messageId) {
    throw new Error("Message ID is required");
  }
  const config = getRingCentralConfig();
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${config.serverUrl}/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RingCentral fetch failed: ${text}`);
  }
  return response.json();
}

export async function ensureThread({
  patientId,
  patientName,
  phoneNumber,
  location,
  phScore,
}: {
  patientId?: string;
  patientName?: string;
  phoneNumber: string;
  location?: string;
  phScore?: number;
}) {
  const normalizedPhone = normalizePhone(phoneNumber);
  if (!normalizedPhone) {
    throw new Error("Unable to normalize phone number");
  }

  const existing = await prisma.messageThread.findFirst({
    where: { normalizedPhone },
  });

  const now = Date.now();
  if (existing) {
    await prisma.messageThread.update({
      where: { id: existing.id },
      data: {
        patientId: patientId ?? existing.patientId,
        patientName: patientName ?? existing.patientName,
        location: location ?? existing.location,
        phScore: phScore ?? existing.phScore,
        lastMessageAt: existing.lastMessageAt ?? BigInt(now),
      },
    });
    return existing.id;
  }

  const thread = await prisma.messageThread.create({
    data: {
      patientId,
      patientName,
      normalizedPhone,
      displayPhone: phoneNumber,
      location,
      phScore,
      tags: [],
      lastMessageAt: BigInt(now),
    },
    select: { id: true },
  });
  return thread.id;
}

export async function recordOutboundMessage({
  threadId,
  body,
  status,
  sentAt,
  ringcentralId,
  patientId,
  normalizedPhone,
  error,
}: {
  threadId: number;
  body: string;
  status: string;
  sentAt: number;
  ringcentralId?: string;
  patientId?: string;
  normalizedPhone?: string | null;
  error?: string | null;
}) {
  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId,
        direction: "outbound",
        body,
        status,
        sentAt: BigInt(sentAt),
        normalizedPhone: normalizedPhone ?? null,
        ringcentralId,
        patientId: patientId ?? null,
        error: error ?? null,
      },
    }),
    prisma.messageThread.update({
      where: { id: threadId },
      data: {
        lastMessageAt: BigInt(sentAt),
        lastMessageSnippet: body.slice(0, 160),
        lastOutboundStatus: status,
        lastOutboundAt: BigInt(sentAt),
      },
    }),
  ]);
}

export async function recordInboundMessage({
  phoneNumber,
  body,
  receivedAt,
  ringcentralId,
  status,
}: {
  phoneNumber: string;
  body: string;
  receivedAt: number;
  ringcentralId?: string;
  status?: string | null;
}) {
  const normalizedPhone = normalizePhone(phoneNumber);
  if (!normalizedPhone) {
    throw new Error("Unable to normalize phone number");
  }

  let thread = await prisma.messageThread.findFirst({
    where: { normalizedPhone },
  });

  if (!thread) {
    const created = await prisma.messageThread.create({
      data: {
        normalizedPhone,
        displayPhone: phoneNumber,
        lastMessageAt: BigInt(receivedAt),
        tags: [],
      },
    });
    thread = created;
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: thread.id,
        direction: "inbound",
        body,
        status: status ?? "received",
        sentAt: BigInt(receivedAt),
        normalizedPhone,
        ringcentralId,
      },
    }),
    prisma.messageThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: BigInt(receivedAt),
        lastMessageSnippet: body.slice(0, 160),
      },
    }),
  ]);
}

export async function listThreads(limit = 20) {
  const threads = await prisma.messageThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: limit,
  });
  return threads;
}

export async function getThread(threadId: number) {
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { sentAt: "asc" },
        take: 500,
      },
    },
  });
  return thread;
}

export async function findThreadByPatient({
  patientId,
  phoneNumber,
}: {
  patientId?: string;
  phoneNumber?: string;
}) {
  if (patientId) {
    const byPatient = await prisma.messageThread.findFirst({
      where: { patientId },
    });
    if (byPatient) {
      return byPatient;
    }
  }
  if (phoneNumber) {
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return null;
    }
    return prisma.messageThread.findFirst({
      where: { normalizedPhone },
    });
  }
  return null;
}

export async function sendPatientMessage(params: SendMessageRequest) {
  const normalizedPhone = normalizePhone(params.phoneNumber);
  if (!normalizedPhone) {
    throw new Error("Phone number is invalid");
  }

  const threadId =
    params.threadId ??
    (await ensureThread({
      patientId: params.patientId,
      patientName: params.patientName,
      phoneNumber: params.phoneNumber,
      location: params.location,
      phScore: params.phScore,
    }));

  try {
    const sendResult = await sendSms(normalizedPhone, params.messageBody);
    await recordOutboundMessage({
      threadId,
      body: params.messageBody,
      status: sendResult.status ?? "sent",
      sentAt: sendResult.creationTime,
      ringcentralId: sendResult.ringcentralId,
      patientId: params.patientId,
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
      error instanceof Error ? error.message : "Failed to send message";
    const fallbackTime = Date.now();
    await recordOutboundMessage({
      threadId,
      body: params.messageBody,
      status: "failed",
      sentAt: fallbackTime,
      ringcentralId: undefined,
      patientId: params.patientId,
      normalizedPhone,
      error: message,
    });
    throw new Error(message);
  }
}

const renderTemplate = (template: string, entry: BulkRecipient) => {
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

export async function sendBulkReminders({
  template,
  recipients,
}: {
  template: string;
  recipients: BulkRecipient[];
}) {
  if (recipients.length === 0) {
    throw new Error("No recipients provided");
  }
  if (recipients.length > 50) {
    throw new Error("Too many recipients (limit 50 per bulk send)");
  }

  const results: Array<{
    patientId?: string;
    phoneNumber: string;
    status: string;
    error?: string;
  }> = [];

  for (const recipient of recipients) {
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
    const personalized = renderTemplate(template, recipient);
    try {
      const sendResult = await sendSms(normalized, personalized);
      const threadId = await ensureThread({
        patientId: recipient.patientId,
        patientName: recipient.patientName,
        phoneNumber: recipient.phoneNumber,
        location: recipient.location,
        phScore: recipient.phScore,
      });
      await recordOutboundMessage({
        threadId,
        body: personalized,
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
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      results.push({
        patientId: recipient.patientId ?? undefined,
        phoneNumber: recipient.phoneNumber,
        status: "failed",
        error: message,
      });
    }
  }

  const summary = {
    successful: results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  return summary;
}

export function paginationWindow(days = 5) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + days * MS_PER_DAY);
  return { startDate, endDate };
}
