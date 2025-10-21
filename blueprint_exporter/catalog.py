from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


def _read_envelope(path: Path) -> dict:
    data = path.read_bytes()
    end = data.rfind(b"}")
    if end == -1:
        raise ValueError(f"Could not locate JSON terminator in {path}.")
    trimmed = data[: end + 1]
    return json.loads(trimmed.decode("utf-8"))


@dataclass(frozen=True)
class ReportEntry:
    category: str
    report_id: int
    description: str
    file: str
    active: bool


def load_catalog(path: Path) -> List[ReportEntry]:
    envelope = _read_envelope(path)
    payload_raw = envelope["Message"]
    payload = json.loads(payload_raw)

    entries: List[ReportEntry] = []
    for category in payload.get("allowedCategories", []):
        category_name = category.get("description", "Unknown")
        for report in category.get("reports", []):
            entries.append(
                ReportEntry(
                    category=category_name,
                    report_id=report.get("itemId"),
                    description=report.get("description", ""),
                    file=report.get("reportFile", ""),
                    active=bool(report.get("active", True)),
                )
            )
    return entries


def iter_names(entries: Iterable[ReportEntry]) -> Iterable[str]:
    seen = set()
    for entry in entries:
        if entry.description in seen:
            continue
        seen.add(entry.description)
        yield entry.description
