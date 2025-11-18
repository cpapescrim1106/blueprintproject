import { NextResponse } from "next/server";
import { quarterlySalesSummary } from "@/lib/reporting/service";

export async function GET() {
  const result = await quarterlySalesSummary();
  return NextResponse.json(result);
}
