from __future__ import annotations

import gzip
import shutil
import subprocess
from pathlib import Path
from typing import Iterable, Optional


def decompress_jasperprint(source: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(source, "rb") as compressed, destination.open("wb") as handle:
        try:
            shutil.copyfileobj(compressed, handle)
        except gzip.BadGzipFile:
            # Some captured artefacts include trailing bytes after the gzip member.
            # The useful payload is already written before the exception fires.
            if destination.stat().st_size == 0:
                raise
    return destination


def export_with_jasperstarter(
    jrprint_path: Path,
    *,
    jasperstarter: Path,
    formats: Iterable[str],
    output_dir: Path,
) -> None:
    """
    Invoke jasperstarter CLI to export a JasperPrint file.

    Example:
        jasperstarter pr report.jrprint -f xls -o output/report
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    format_args = []
    for fmt in formats:
        format_args.extend(["-f", fmt])
    command = [
        str(jasperstarter),
        "pr",
        str(jrprint_path),
        *format_args,
        "-o",
        str(output_dir / jrprint_path.stem),
    ]
    subprocess.run(command, check=True)
