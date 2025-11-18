import { NextResponse } from "next/server";
import { activePatientsKpi } from "@/lib/reporting/service";

export async function GET() {
  const result = await activePatientsKpi();
  return NextResponse.json(result);
}
