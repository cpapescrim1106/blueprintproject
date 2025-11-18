import { NextRequest, NextResponse } from "next/server";
import { sendBulkReminders } from "@/lib/messagingServer";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.template !== "string") {
    return NextResponse.json(
      { error: "Template is required" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.recipients)) {
    return NextResponse.json(
      { error: "Recipients array is required" },
      { status: 400 },
    );
  }
  try {
    const summary = await sendBulkReminders({
      template: body.template,
      recipients: body.recipients,
    });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reminders" },
      { status: 500 },
    );
  }
}
