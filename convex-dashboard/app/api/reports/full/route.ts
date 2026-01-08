import { NextResponse } from "next/server";

// In production, ingestion is handled by the worker container on a schedule.
// This endpoint is disabled to prevent 500 errors from missing Python dependencies.
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Manual ingestion is disabled in production. Data is automatically ingested by the worker container at 6 AM and 6 PM UTC daily.",
      hint: "Check the ingestions list to see the latest data refresh.",
    },
    { status: 501 }
  );
}
