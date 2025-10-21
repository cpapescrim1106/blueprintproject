#!/usr/bin/env python3
"""
Parse the mitmproxy-captured SQS transcript and emit a structured JSON summary.

Usage:
    python parse_sqs.py \
        --input ../captures/2025-10-20/raw/sqs.txt \
        --output ../captures/2025-10-20/processed/report_messages.json

The script understands the Blueprint OMS messaging format:
- report requests are double-encoded JSON payloads posted via SendMessage.
- report responses arrive as queue messages (sometimes with an S3 pointer).
- operational notifications (e.g. service outages) are JSON blobs on the same queue.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List


SEND_PATTERN = re.compile(r"^Action=SendMessage")
BODY_PATTERN = re.compile(r"<Body>(.*?)</Body>")


def parse(args: argparse.Namespace) -> Dict[str, Any]:
    raw = Path(args.input).read_text()
    requests: List[Dict[str, Any]] = []
    responses: List[Dict[str, Any]] = []
    s3_pointers: List[Dict[str, Any]] = []
    notifications: List[Dict[str, Any]] = []

    for line in raw.splitlines():
        if not SEND_PATTERN.match(line):
            continue
        qs = urllib.parse.parse_qs(line)
        encoded_body = urllib.parse.unquote(qs["MessageBody"][0])
        outer = json.loads(encoded_body)
        message = json.loads(outer["Message"])
        requests.append(
            {
                "type": "request",
                "message": message,
                "attributes": outer.get("MessageAttributes", {}),
            }
        )

    for match in BODY_PATTERN.finditer(raw):
        decoded = html.unescape(match.group(1))
        try:
            body = json.loads(decoded)
        except json.JSONDecodeError:
            continue

        if isinstance(body, list):
            if len(body) == 2 and isinstance(body[1], dict):
                s3_pointers.append(body[1])
            continue

        if "Message" not in body:
            continue

        raw_message = body["Message"]
        message = json.loads(raw_message) if isinstance(raw_message, str) else raw_message

        if isinstance(message, dict) and "reportResultXml" in message:
            responses.append({"type": "response", "message": message})
        elif isinstance(message, dict) and message.get("stackTrace"):
            notifications.append(message)

    return {
        "report_requests": requests,
        "report_responses": responses,
        "report_s3_pointers": s3_pointers,
        "service_notifications": notifications,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to the raw SQS transcript.")
    parser.add_argument(
        "--output",
        required=True,
        help="Where to write the parsed JSON summary.",
    )
    args = parser.parse_args()

    summary = parse(args)
    Path(args.output).write_text(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
