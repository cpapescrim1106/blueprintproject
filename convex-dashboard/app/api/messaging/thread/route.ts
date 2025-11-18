import { NextRequest, NextResponse } from "next/server";
import { getThread } from "@/lib/messagingServer";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadIdParam = searchParams.get("threadId");
  if (!threadIdParam) {
    return NextResponse.json(
      { error: "threadId is required" },
      { status: 400 },
    );
  }
  const threadId = Number(threadIdParam);
  if (Number.isNaN(threadId)) {
    return NextResponse.json(
      { error: "threadId must be a number" },
      { status: 400 },
    );
  }
  const thread = await getThread(threadId);
  if (!thread) {
    return NextResponse.json({ thread: null });
  }
  return NextResponse.json({
    ...thread,
    lastMessageAt: Number(thread.lastMessageAt ?? 0),
    lastOutboundAt: thread.lastOutboundAt
      ? Number(thread.lastOutboundAt)
      : null,
    messages: thread.messages.map((message) => ({
      ...message,
      sentAt: Number(message.sentAt),
    })),
  });
}
