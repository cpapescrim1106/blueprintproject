import { NextRequest, NextResponse } from "next/server";
import { findThreadByPatient } from "@/lib/messagingServer";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patientId") ?? undefined;
  const phoneNumber = searchParams.get("phoneNumber") ?? undefined;
  if (!patientId && !phoneNumber) {
    return NextResponse.json(
      { error: "patientId or phoneNumber required" },
      { status: 400 },
    );
  }
  const thread = await findThreadByPatient({ patientId, phoneNumber });
  if (!thread) {
    return NextResponse.json({ thread: null });
  }
  return NextResponse.json({
    thread: {
      ...thread,
      lastMessageAt: Number(thread.lastMessageAt ?? 0),
      lastOutboundAt: thread.lastOutboundAt
        ? Number(thread.lastOutboundAt)
        : null,
    },
  });
}
