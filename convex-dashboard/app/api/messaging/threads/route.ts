import { NextRequest, NextResponse } from "next/server";
import { listThreads } from "@/lib/messagingServer";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 20;
  const threads = await listThreads(Number.isNaN(limit) ? 20 : limit);
  return NextResponse.json(
    threads.map((thread) => ({
      ...thread,
      lastMessageAt: Number(thread.lastMessageAt ?? 0),
      lastOutboundAt: thread.lastOutboundAt
        ? Number(thread.lastOutboundAt)
        : null,
    })),
  );
}
