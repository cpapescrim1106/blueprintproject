import { NextRequest, NextResponse } from "next/server";
import { sendPatientMessage } from "@/lib/messagingServer";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.phoneNumber !== "string") {
    return NextResponse.json(
      { error: "phoneNumber and messageBody are required" },
      { status: 400 },
    );
  }
  if (typeof body.messageBody !== "string" || !body.messageBody.trim()) {
    return NextResponse.json(
      { error: "Message body is required" },
      { status: 400 },
    );
  }
  try {
    const result = await sendPatientMessage({
      patientId: body.patientId ?? undefined,
      patientName: body.patientName ?? undefined,
      phoneNumber: body.phoneNumber,
      messageBody: body.messageBody,
      location: body.location ?? undefined,
      phScore:
        typeof body.phScore === "number" ? body.phScore : undefined,
      threadId: typeof body.threadId === "number" ? body.threadId : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send message" },
      { status: 500 },
    );
  }
}
