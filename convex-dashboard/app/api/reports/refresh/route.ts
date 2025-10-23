import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export async function POST() {
  const result = await runPipeline("appointments", "short");
  if (!result.success) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
