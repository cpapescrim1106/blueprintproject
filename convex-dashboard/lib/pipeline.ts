import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import {
  REPORT_CONFIG_BY_KEY,
  REPORT_CONFIGS,
  type PipelineWindow,
  type ReportKey,
} from "./reportConfig";

export type { PipelineWindow, ReportKey } from "./reportConfig";

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.resolve(process.cwd(), "..");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

export { REPORT_CONFIGS as REPORTS };

function truncateOutput(output: string | undefined, lines = 40) {
  if (!output) {
    return "";
  }
  const trimmed = output.trim();
  if (!trimmed) {
    return trimmed;
  }
  const parts = trimmed.split(/\r?\n/);
  if (parts.length <= lines) {
    return trimmed;
  }
  const tail = parts.slice(-lines).join("\n");
  return `${tail}\n... (${parts.length - lines} earlier lines truncated)`;
}

export async function runPipeline(reportKey: ReportKey, window: PipelineWindow) {
  const config = REPORT_CONFIG_BY_KEY[reportKey];
  if (!config) {
    return {
      success: false,
      error: `Unknown report key '${reportKey}'.`,
      stdout: "",
      stderr: "",
    };
  }

  const scriptPath = path.join(ROOT_DIR, "scripts", "run_report_pipeline.py");
  const args = [
    scriptPath,
    "--report-name",
    config.reportName,
    "--window",
    window,
  ];
  if (config.defaultArgs) {
    args.push(...config.defaultArgs);
  }
  const windowArgs = config.windowArgs?.[window];
  if (windowArgs && windowArgs.length > 0) {
    args.push(...windowArgs);
  }

  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
      cwd: ROOT_DIR,
      env: process.env,
      maxBuffer: 12 * 1024 * 1024,
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
      stdout: truncateOutput(execError.stdout),
      stderr: truncateOutput(execError.stderr),
    };
  }
}
