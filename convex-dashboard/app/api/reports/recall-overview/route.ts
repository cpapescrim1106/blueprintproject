import { NextResponse } from "next/server";
import { recallOverview } from "@/lib/reporting/service";

export async function GET() {
  const result = await recallOverview();
  return NextResponse.json(result);
}
