import { NextResponse } from "next/server";

const WORKER_URL = process.env.WORKER_URL || "http://worker:8080";

export async function POST() {
  try {
    const response = await fetch(`${WORKER_URL}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to connect to worker container",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}

export async function GET() {
  try {
    const response = await fetch(`${WORKER_URL}/status`);
    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        is_running: false,
        last_result: {
          status: "unavailable",
          message: "Worker container is not reachable",
        },
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
