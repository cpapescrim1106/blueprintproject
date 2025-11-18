import { NextRequest, NextResponse } from "next/server";
import { weeklyAppointmentSummary } from "@/lib/reporting/service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const weeks = searchParams.get("weeks");
  const reportName = searchParams.get("reportName") ?? undefined;
  const result = await weeklyAppointmentSummary({
    weeks: weeks ? Number(weeks) : undefined,
    reportName: reportName || undefined,
  });
  return NextResponse.json(result);
}
