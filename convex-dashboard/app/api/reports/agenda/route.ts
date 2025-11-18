import { NextRequest, NextResponse } from "next/server";
import { agenda } from "@/lib/reporting/service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = searchParams.get("days");
  const startDateIso = searchParams.get("startDateIso") ?? undefined;
  const result = await agenda({
    days: days ? Number(days) : undefined,
    startDateIso: startDateIso || undefined,
  });
  return NextResponse.json(result);
}
