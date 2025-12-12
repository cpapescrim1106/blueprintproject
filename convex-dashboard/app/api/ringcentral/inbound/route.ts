import { NextRequest, NextResponse } from "next/server";
import {
  fetchRingCentralMessage,
  recordInboundMessage,
} from "@/lib/messagingServer";

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
  messageType?: string;
  subject?: string;
  messageStatus?: string;
  smsDeliveryStatus?: string;
  creationTime?: string;
  from?: { phoneNumber?: string; extensionNumber?: string };
};

type RingCentralChange = {
  type?: string;
  messageType?: string;
  id?: string | number;
  messageId?: string | number;
  resourceId?: string | number;
  ids?: Array<string | number>;
  messageIds?: Array<string | number>;
  newMessageIds?: Array<string | number>;
  updatedMessageIds?: Array<string | number>;
  resourceIds?: Array<string | number>;
};

type RingCentralPayload = {
  uuid?: string;
  event?: string;
  body?: {
    records?: RingCentralRecord[];
    changes?: RingCentralChange[];
  };
};

async function handlePayload(payload: RingCentralPayload) {
  const records = payload?.body?.records ?? [];
  const changes = payload?.body?.changes ?? [];
  let processed = 0;

  for (const record of records) {
    const succeeded = await processRecord(record);
    if (succeeded) {
      processed += 1;
    }
  }

  if (Array.isArray(changes) && changes.length > 0) {
    processed += await processChanges(changes);
  }

  return processed;
}

async function processRecord(record?: RingCentralRecord | null) {
  if (!record) {
    return false;
  }
  const direction = record.direction?.toLowerCase();
  if (direction !== "inbound") {
    return false;
  }
  const type = (record.type ?? record.messageType)?.toLowerCase();
  if (type && type !== "sms") {
    return false;
  }
  const phoneNumber =
    record.from?.phoneNumber ?? record.from?.extensionNumber ?? null;
  if (!phoneNumber) {
    return false;
  }
  const body = record.subject ?? (record as { body?: string })?.body ?? "";
  if (!body) {
    return false;
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
  return true;
}

async function processChanges(changes: RingCentralChange[]) {
  const messageIds = new Set<string>();

  for (const change of changes) {
    if (!change) {
      continue;
    }
    const type = (change.type ?? change.messageType)?.toLowerCase();
    if (type && !["sms", "text"].includes(type)) {
      continue;
    }

    const addId = (value?: string | number | null) => {
      if (value === undefined || value === null) {
        return;
      }
      const asString = value.toString();
      if (asString) {
        messageIds.add(asString);
      }
    };

    const addList = (list?: Array<string | number> | null) => {
      if (!list) {
        return;
      }
      for (const value of list) {
        addId(value);
      }
    };

    addId(change.id);
    addId(change.messageId);
    addId(change.resourceId);
    addList(change.ids);
    addList(change.messageIds);
    addList(change.newMessageIds);
    addList(change.updatedMessageIds);
    addList(change.resourceIds);
  }

  let processed = 0;
  for (const id of messageIds) {
    try {
      const record = await fetchRingCentralMessage(id);
      const success = await processRecord(record);
      if (success) {
        processed += 1;
      }
    } catch (error) {
      console.error(
        `[ringcentral webhook] failed to fetch message ${id}`,
        error,
      );
    }
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
    const recordSummary =
      payload?.body?.records?.map((record) => ({
        id: record?.id,
        direction: record?.direction,
        type: record?.type,
        subject: record?.subject,
      })) ?? [];
    const changeSummary =
      payload?.body?.changes?.map((change) => ({
        type: change?.type,
        hasIds: Boolean(
          change?.id ||
            change?.messageId ||
            change?.resourceId ||
            (change?.messageIds ?? change?.ids ?? change?.resourceIds)?.length,
        ),
      })) ?? [];
    console.log(
      `[ringcentral webhook] processed ${processed} record(s)`,
      { records: recordSummary, changes: changeSummary },
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
