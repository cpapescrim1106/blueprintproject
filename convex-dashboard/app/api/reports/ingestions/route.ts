import { NextRequest, NextResponse } from "next/server";
import { listIngestions } from "@/lib/reporting/service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reportName = searchParams.get("reportName") ?? undefined;
  const limit = searchParams.get("limit");
  const ingestions = await listIngestions({
    reportName,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json(ingestions);
}
