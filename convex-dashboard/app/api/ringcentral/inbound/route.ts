import { NextRequest, NextResponse } from "next/server";
import { recordInboundMessage } from "@/lib/messagingServer";

const okResponse = (body?: unknown, headers?: HeadersInit) =>
  new NextResponse(body ? JSON.stringify(body) : null, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

type RingCentralRecord = {
  id?: string | number;
  direction?: string;
  type?: string;
  subject?: string;
  messageStatus?: string;
  smsDeliveryStatus?: string;
  creationTime?: string;
  from?: { phoneNumber?: string; extensionNumber?: string };
};

type RingCentralPayload = {
  uuid?: string;
  event?: string;
  body?: {
    records?: RingCentralRecord[];
  };
};

async function handlePayload(payload: RingCentralPayload) {
  const records = payload?.body?.records ?? [];
  let processed = 0;

  for (const record of records) {
    if (!record) {
      continue;
    }
    const direction = record.direction?.toLowerCase();
    if (direction !== "inbound") {
      continue;
    }
    const type = record.type?.toLowerCase();
    if (type !== "sms") {
      continue;
    }
    const phoneNumber =
      record.from?.phoneNumber ?? record.from?.extensionNumber ?? null;
    if (!phoneNumber) {
      continue;
    }
    const body = record.subject ?? "";
    if (!body) {
      continue;
    }
    const receivedAt = record.creationTime
      ? new Date(record.creationTime).getTime()
      : Date.now();

    await recordInboundMessage({
      phoneNumber,
      body,
      receivedAt,
      ringcentralId: record.id ? record.id.toString() : undefined,
      status: record.messageStatus ?? record.smsDeliveryStatus,
    });
    processed += 1;
  }

  return processed;
}

export async function POST(request: NextRequest) {
  const validationToken = request.headers.get("validation-token");
  if (validationToken) {
    return okResponse(undefined, {
      "Validation-Token": validationToken,
    });
  }

  let payload: RingCentralPayload;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON payload");
  }

  try {
    const processed = await handlePayload(payload);
    console.log(
      `[ringcentral webhook] processed ${processed} record(s)`,
      payload?.body?.records?.map((record) => ({
        id: record?.id,
        direction: record?.direction,
        type: record?.type,
        subject: record?.subject,
      })) ?? [],
    );
    return NextResponse.json({ processed });
  } catch (error) {
    console.error("[ringcentral webhook] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}

export async function GET(_request: NextRequest) {
  const validationToken = _request.headers.get("validation-token");
  if (validationToken) {
    return okResponse(undefined, {
      "Validation-Token": validationToken,
    });
  }
  return okResponse({ ok: true });
}
