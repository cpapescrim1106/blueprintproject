#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from blueprint_exporter.catalog import load_catalog, iter_names
from blueprint_exporter.config import ReplayConfig
from blueprint_exporter.jasper import decompress_jasperprint, export_with_jasperstarter
from blueprint_exporter.payloads import (
    ReportMessages,
    ReportRequest,
    load_processed_messages,
)
from blueprint_exporter.s3_download import create_s3_client, ensure_object
from blueprint_exporter.sqs_replay import SQSReplayClient, create_sqs_client


DEFAULT_CONFIG = ReplayConfig(
    region_name="us-east-2",
    request_queue_url="https://sqs.us-east-2.amazonaws.com/438704307340/reportRequest_us1_v4_8_1.fifo",
    notification_queue_url="https://sqs.us-east-2.amazonaws.com/438704307340/FL_accQueue_UserNotification_50_Christophers-MacBook-Prolocal",
    bucket_name="bp-temp-us",
    processed_messages_path=Path("captures/merged_report_messages.json"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Replay captured Blueprint OMS report requests and export the resulting JasperPrint payloads.",
    )
    parser.add_argument(
        "--report-name",
        default="Sales by Income Account",
        help="Report to request. Must exist in the processed messages capture.",
    )
    parser.add_argument(
        "--mode",
        choices=["live", "offline"],
        default="offline",
        help="Live uses AWS APIs via boto3, offline reuses captured payloads only.",
    )
    parser.add_argument(
        "--list-reports",
        action="store_true",
        help="List report names from the captured catalogue and exit.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the SendMessage request without calling AWS.",
    )
    parser.add_argument(
        "--output-dir",
        default="exports",
        help="Directory for downloaded/exported artefacts.",
    )
    parser.add_argument(
        "--poll-timeout",
        type=int,
        default=300,
        help="Seconds to wait for a report response when running in live mode.",
    )
    parser.add_argument(
        "--poll-wait",
        type=int,
        default=20,
        help="WaitTimeSeconds parameter passed to ReceiveMessage.",
    )
    parser.add_argument(
        "--keep-message",
        action="store_true",
        help="Do not delete the notification message after downloading the result.",
    )
    parser.add_argument(
        "--decompress",
        action="store_true",
        help="Decompress the JasperPrint gzip into a .jrprint file.",
    )
    parser.add_argument(
        "--jasperstarter",
        type=Path,
        help="Optional path to jasperstarter binary for format export.",
    )
    parser.add_argument(
        "--export-format",
        action="append",
        help="Export format(s) when jasperstarter is provided (e.g. pdf, xls, xlsx).",
    )
    parser.add_argument(
        "--period-start",
        help="Override the report's periodStart parameter (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--period-end",
        help="Override the report's periodEnd parameter (YYYY-MM-DD).",
    )
    return parser.parse_args()


def ensure_output_dir(path: str) -> Path:
    output_dir = Path(path).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def print_json(obj: object) -> None:
    print(json.dumps(obj, indent=2))


def apply_period_overrides(
    request: ReportRequest,
    period_start: Optional[str],
    period_end: Optional[str],
) -> ReportRequest:
    if not period_start and not period_end:
        return request

    message = json.loads(request.message_json())
    parameters = message.setdefault("parameterMap", {})
    if period_start:
        parameters["periodStart"] = period_start
    if period_end:
        parameters["periodEnd"] = period_end
    return ReportRequest(
        message=message,
        attributes=dict(request.attributes),
    )


def offline_flow(
    *,
    root: Path,
    output_dir: Path,
    messages: ReportMessages,
    report_name: str,
    decompress: bool,
    jasperstarter: Optional[Path],
    export_formats: Optional[Iterable[str]],
) -> None:
    request = messages.request_by_name(report_name)
    response = messages.response_by_name(report_name)
    result_key = response.result_key
    if not result_key:
        raise SystemExit(f"No reportResultXml key found in response for {report_name}.")

    print("Replaying offline request payload:")
    print_json(request.envelope())

    download_path = output_dir / f"{result_key}.gz"
    cached = root / "captures" / "2025-10-20" / "s3" / result_key
    if not cached.exists():
        raise SystemExit(f"Captured artefact {cached} is missing.")
    download_path.write_bytes(cached.read_bytes())
    print(f"Copied captured artefact to {download_path}")

    jrprint_path: Optional[Path] = None
    if decompress:
        jrprint_path = output_dir / f"{result_key}.jrprint"
        decompress_jasperprint(download_path, jrprint_path)
        print(f"Decompressed JasperPrint to {jrprint_path}")

    if jasperstarter and jrprint_path and export_formats:
        export_with_jasperstarter(
            jrprint_path,
            jasperstarter=jasperstarter,
            formats=export_formats,
            output_dir=output_dir,
        )
        print(f"Exported JasperPrint via jasperstarter to {output_dir}")


def live_flow(
    *,
    root: Path,
    output_dir: Path,
    messages: ReportMessages,
    report_name: str,
    dry_run: bool,
    poll_timeout: int,
    poll_wait: int,
    keep_message: bool,
    decompress: bool,
    jasperstarter: Optional[Path],
    export_formats: Optional[Iterable[str]],
    period_start: Optional[str],
    period_end: Optional[str],
) -> None:
    base_request = messages.request_by_name(report_name)
    request = apply_period_overrides(base_request, period_start, period_end)
    expected_report_name = base_request.report_name or report_name

    sqs_client = create_sqs_client(DEFAULT_CONFIG.region_name)
    replay_client = SQSReplayClient(sqs_client, DEFAULT_CONFIG)

    send_response = replay_client.send_request(request, dry_run=dry_run)
    if dry_run:
        print("Dry-run SendMessage payload:")
        print_json(send_response)
        return

    print(
        f"Waiting for report result (timeout {poll_timeout}s, polling every {poll_wait}s)...",
        flush=True,
    )

    def log_wait(remaining: float, attempts: int) -> None:
        if attempts == 1 or attempts % 3 == 0:
            remaining_int = max(0, int(remaining))
            print(
                f"  Still waiting for '{report_name}' (attempt {attempts}, ~{remaining_int}s remaining)...",
                flush=True,
            )

    print("Sent SQS message:")
    print_json(send_response)

    def log_unexpected(notification):
        print(
            "  Received unrelated notification:",
            json.dumps(notification.body, indent=2),
            sep="\n",
            flush=True,
        )

    notification = replay_client.wait_for_result(
        expected_report=expected_report_name,
        poll_interval=poll_wait,
        timeout_seconds=poll_timeout,
        on_wait=log_wait,
        on_unexpected=log_unexpected,
    )
    if not notification:
        raise SystemExit("Timed out waiting for report response.")

    result_key = notification.result_key
    if not result_key:
        raise SystemExit("Received notification lacks reportResultXml key.")

    print(f"Received notification for {expected_report_name}:")
    print_json(notification.body)

    s3_client = create_s3_client(DEFAULT_CONFIG.region_name)
    download_path = output_dir / f"{result_key}.gz"
    ensure_object(
        s3_client,
        bucket=DEFAULT_CONFIG.bucket_name,
        key=result_key,
        destination=download_path,
        project_root=root,
        allow_cache=True,
    )
    print(f"Report artefact saved to {download_path}")

    if not keep_message:
        replay_client.delete_notification(notification)
        print("Deleted notification message from queue.")

    jrprint_path: Optional[Path] = None
    if decompress:
        jrprint_path = output_dir / f"{result_key}.jrprint"
        decompress_jasperprint(download_path, jrprint_path)
        print(f"Decompressed JasperPrint to {jrprint_path}")

    if jasperstarter and jrprint_path and export_formats:
        export_with_jasperstarter(
            jrprint_path,
            jasperstarter=jasperstarter,
            formats=export_formats,
            output_dir=output_dir,
        )
        print(f"Exported JasperPrint via jasperstarter to {output_dir}")


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent.parent
    output_dir = ensure_output_dir(args.output_dir)
    export_formats = args.export_format if args.export_format else None
    messages = load_processed_messages(DEFAULT_CONFIG.resolve_messages_path(root))

    if args.list_reports:
        catalog_key = None
        for pointer in messages.s3_pointers:
            if pointer.get("s3BucketName") == DEFAULT_CONFIG.bucket_name:
                catalog_key = pointer.get("s3Key")
                break
        if not catalog_key:
            raise SystemExit("No catalog pointer found in processed messages.")
        catalog_path = root / "captures" / "2025-10-20" / "s3" / catalog_key
        if not catalog_path.exists():
            raise SystemExit(f"Catalog artefact missing: {catalog_path}")
        entries = load_catalog(catalog_path)
        for entry in entries:
            status = "(inactive)" if not entry.active else ""
            print(f"{entry.description} [{entry.category}] {status}".strip())
        return

    if args.mode == "offline":
        offline_flow(
            root=root,
            output_dir=output_dir,
            messages=messages,
            report_name=args.report_name,
            decompress=args.decompress,
            jasperstarter=args.jasperstarter,
            export_formats=export_formats,
        )
    else:
        live_flow(
            root=root,
            output_dir=output_dir,
            messages=messages,
            report_name=args.report_name,
            dry_run=args.dry_run,
            poll_timeout=args.poll_timeout,
            poll_wait=args.poll_wait,
            keep_message=args.keep_message,
            decompress=args.decompress,
            jasperstarter=args.jasperstarter,
            export_formats=export_formats,
            period_start=args.period_start,
            period_end=args.period_end,
        )


if __name__ == "__main__":
    main()
