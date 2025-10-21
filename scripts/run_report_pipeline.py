#!/usr/bin/env python3
"""
End-to-end helper that:
  1. Replays a report via scripts/replay_reports.py (live or offline).
  2. Converts the resulting JRPrint to CSV using ReportExporter.
  3. Uploads the CSV to Convex via scripts/ingest_report.js.

Example:
  python scripts/run_report_pipeline.py --report-name "Referral Source - Appointments"
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
import json


PROJECT_ROOT = Path(__file__).resolve().parent.parent
JAVA_HOME = PROJECT_ROOT / "jdk8u462-b08" / "Contents" / "Home"
JAVA_BIN = JAVA_HOME / "bin" / "java"
JAVAC_BIN = JAVA_HOME / "bin" / "javac"
REPORT_EXPORTER_JAVA = PROJECT_ROOT / "ReportExporter.java"
REPORT_EXPORTER_CLASS = PROJECT_ROOT / "ReportExporter.class"
CLIENT_CLASSPATH_FILE = PROJECT_ROOT / "client_classpath.txt"
REPLAY_SCRIPT = PROJECT_ROOT / "scripts" / "replay_reports.py"
INGEST_SCRIPT = PROJECT_ROOT / "scripts" / "ingest_report.js"


def arch_prefix() -> list[str]:
    if sys.platform == "darwin" and shutil.which("arch"):
        return ["arch", "-x86_64"]
    return []


def run_command(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    print(f"\n$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=cwd, env=env)


def ensure_report_exporter_compiled() -> None:
    if not CLIENT_CLASSPATH_FILE.exists():
        raise SystemExit("client_classpath.txt not found; cannot compile ReportExporter.")
    cp_text = CLIENT_CLASSPATH_FILE.read_text().strip()
    classpath = f".:{cp_text}" if cp_text else "."
    needs_compile = (
        not REPORT_EXPORTER_CLASS.exists()
        or REPORT_EXPORTER_CLASS.stat().st_mtime < REPORT_EXPORTER_JAVA.stat().st_mtime
    )
    if needs_compile:
        print("Compiling ReportExporter.java...")
        cmd = arch_prefix() + [
            str(JAVAC_BIN),
            "-cp",
            classpath,
            str(REPORT_EXPORTER_JAVA),
        ]
        run_command(cmd, cwd=PROJECT_ROOT)


def replay_report(report_name: str, mode: str, output_dir: Path, extra_args: list[str]) -> None:
    cmd = [
        sys.executable,
        str(REPLAY_SCRIPT),
        "--report-name",
        report_name,
        "--mode",
        mode,
        "--output-dir",
        str(output_dir),
        "--decompress",
    ] + extra_args
    run_command(cmd, cwd=PROJECT_ROOT)


def latest_jrprint(output_dir: Path) -> Path:
    jrprints = sorted(output_dir.glob("*.jrprint"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not jrprints:
        raise SystemExit(f"No .jrprint files found in {output_dir}. Did replay succeed?")
    return jrprints[0]


def convert_to_csv(jrprint_path: Path) -> Path:
    ensure_report_exporter_compiled()
    cp_text = CLIENT_CLASSPATH_FILE.read_text().strip()
    classpath = f".:{cp_text}" if cp_text else "."
    csv_path = jrprint_path.with_suffix(".csv")
    cmd = arch_prefix() + [
        str(JAVA_BIN),
        "-cp",
        classpath,
        "ReportExporter",
        str(jrprint_path),
        "csv",
        str(csv_path),
    ]
    run_command(cmd, cwd=PROJECT_ROOT)
    return csv_path


def ensure_aws_credentials() -> None:
    if os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
        return
    cred_path = PROJECT_ROOT / "aws_credentials.txt"
    if not cred_path.exists():
        raise SystemExit(
            "AWS credentials are not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY "
            "or provide aws_credentials.txt."
        )
    data: dict[str, str] = {}
    for line in cred_path.read_text().splitlines():
        if not line or line.strip().startswith("#"):
            continue
        if "=" in line:
            key, value = line.split("=", 1)
            data[key.strip()] = value.strip()
    access = data.get("awsAccessId")
    secret = data.get("awsSecretKey")
    if not access or not secret:
        raise SystemExit("aws_credentials.txt is missing awsAccessId or awsSecretKey entries.")
    os.environ.setdefault("AWS_ACCESS_KEY_ID", access)
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", secret)
    os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-2")


def infer_captured_at(source_key: str) -> int:
    match = re.search(r"(\d{10,})$", source_key)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return int(time.time() * 1000)


def ingest_csv(csv_path: Path, report_name: str, source_key: str, captured_at: int) -> None:
    cmd = [
        "node",
        str(INGEST_SCRIPT),
        "--file",
        str(csv_path),
        "--report",
        report_name,
        "--source",
        source_key,
        "--capturedAt",
        str(captured_at),
    ]
    run_command(cmd, cwd=PROJECT_ROOT, env=os.environ.copy())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay, export, and ingest a report end-to-end.")
    parser.add_argument("--report-name", required=True, help="Report name to request.")
    parser.add_argument(
        "--mode",
        choices=["live", "offline"],
        default="live",
        help="Replay mode. Default is live.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(PROJECT_ROOT / "exports" / "live"),
        help="Directory to store replay artefacts.",
    )
    parser.add_argument(
        "--captured-at",
        type=int,
        help="Override capturedAt timestamp (ms since epoch). Defaults to timestamp parsed from source key or now.",
    )
    parser.add_argument(
        "--replay-args",
        help="Additional JSON array of arguments to pass through to replay_reports.py.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    ensure_aws_credentials()

    extra_args: list[str] = []
    if args.replay_args:
        try:
            raw = json.loads(args.replay_args)
            if not isinstance(raw, list):
                raise ValueError
            extra_args = [str(item) for item in raw]
        except ValueError as exc:
            raise SystemExit(f"--replay-args must be a JSON array of strings: {exc}")

    replay_report(args.report_name, args.mode, output_dir, extra_args)

    jrprint = latest_jrprint(output_dir)
    source_key = jrprint.stem
    captured_at = args.captured_at or infer_captured_at(source_key)

    print(f"Latest JRPrint: {jrprint}")
    csv_path = convert_to_csv(jrprint)
    print(f"Generated CSV: {csv_path}")

    ingest_csv(csv_path, args.report_name, source_key, captured_at)
    print(
        f"\nPipeline completed. Report '{args.report_name}' ingested with source key '{source_key}'."
    )


if __name__ == "__main__":
    main()
