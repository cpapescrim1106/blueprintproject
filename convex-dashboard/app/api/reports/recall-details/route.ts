import { NextRequest, NextResponse } from "next/server";
import { recallPatientDetails } from "@/lib/reporting/service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const result = await recallPatientDetails({
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json(result);
}
