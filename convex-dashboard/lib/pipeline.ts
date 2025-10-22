import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.resolve(process.cwd(), "..");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const DEFAULT_REPORT_NAME =
  process.env.NEXT_PUBLIC_APPOINTMENT_REPORT_NAME ||
  "Referral Source - Appointments";

function truncateOutput(output: string, lines = 40) {
  const parts = output.trim().split(/\r?\n/);
  if (parts.length <= lines) {
    return output.trim();
  }
  const tail = parts.slice(-lines).join("\n");
  return `${tail}\n... (${parts.length - lines} earlier lines truncated)`;
}

export async function runPipeline(window: "short" | "full") {
  const scriptPath = path.join(ROOT_DIR, "scripts", "run_report_pipeline.py");
  const args = [
    scriptPath,
    "--report-name",
    DEFAULT_REPORT_NAME,
    "--window",
    window,
  ];

  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
      cwd: ROOT_DIR,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      success: true,
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
    };
  } catch (error) {
    const execError =
      error && typeof error === "object"
        ? (error as { message?: string; stdout?: string; stderr?: string })
        : {};
    return {
      success: false,
      error: execError.message || "Pipeline execution failed",
      stdout: execError.stdout ? truncateOutput(execError.stdout) : "",
      stderr: execError.stderr ? truncateOutput(execError.stderr) : "",
    };
  }
}
