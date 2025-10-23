import { NextResponse } from "next/server";
import {
  runPipeline,
  type PipelineWindow,
  type ReportKey,
} from "@/lib/pipeline";

type RequestBody = {
  reportKey?: ReportKey;
  window?: PipelineWindow;
};

export async function POST(request: Request) {
  let payload: RequestBody;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const { reportKey, window } = payload;
  if (!reportKey || !window) {
    return NextResponse.json(
      {
        success: false,
        error: "Both 'reportKey' and 'window' are required.",
      },
      { status: 400 },
    );
  }

  if (window !== "short" && window !== "full") {
    return NextResponse.json(
      {
        success: false,
        error: "Window must be 'short' or 'full'.",
      },
      { status: 400 },
    );
  }

  const result = await runPipeline(reportKey, window);
  if (!result.success) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
