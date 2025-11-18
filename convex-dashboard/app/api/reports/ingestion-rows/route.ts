import { NextRequest, NextResponse } from "next/server";
import { getRowsForIngestion } from "@/lib/reporting/service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ingestionIdStr = searchParams.get("ingestionId");
  if (!ingestionIdStr) {
    return NextResponse.json(
      { error: "ingestionId is required" },
      { status: 400 },
    );
  }
  const ingestionId = Number(ingestionIdStr);
  if (Number.isNaN(ingestionId)) {
    return NextResponse.json(
      { error: "ingestionId must be numeric" },
      { status: 400 },
    );
  }
  const limit = searchParams.get("limit");
  const rows = await getRowsForIngestion({
    ingestionId,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json(rows);
}
