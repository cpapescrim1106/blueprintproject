import { NextRequest, NextResponse } from "next/server";
import { completedAppointmentsByYear } from "@/lib/reporting/service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const onlyNewPatients =
    searchParams.get("onlyNewPatients") === "true" ? true : false;
  const result = await completedAppointmentsByYear({ onlyNewPatients });
  return NextResponse.json(result);
}
