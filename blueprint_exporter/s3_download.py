from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Optional, TYPE_CHECKING

try:
    import boto3  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - offline mode without boto3
    boto3 = None  # type: ignore

if TYPE_CHECKING:
    from botocore.client import BaseClient  # type: ignore
else:
    BaseClient = Any  # type: ignore[misc, assignment]


def create_s3_client(region_name: str) -> BaseClient:
    if boto3 is None:
        raise ModuleNotFoundError("boto3 is required for live mode S3 access.")
    return boto3.client("s3", region_name=region_name)


def resolve_cached_object(root: Path, key: str) -> Optional[Path]:
    """
    Locate a captured S3 object under the project tree, if available.

    Captured artefacts live under captures/<date>/s3/.
    """
    captures_dir = root / "captures"
    if not captures_dir.exists():
        return None
    for date_dir in captures_dir.iterdir():
        candidate = date_dir / "s3" / key
        if candidate.exists():
            return candidate
    return None


def download_object(
    s3: BaseClient,
    *,
    bucket: str,
    key: str,
    destination: Path,
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    response = s3.get_object(Bucket=bucket, Key=key)
    with destination.open("wb") as handle:
        shutil.copyfileobj(response["Body"], handle)
    return destination


def ensure_object(
    s3: BaseClient,
    *,
    bucket: str,
    key: str,
    destination: Path,
    project_root: Optional[Path] = None,
    allow_cache: bool = True,
) -> Path:
    """
    Fetch an object from S3, reusing captured copies when present.
    """
    if allow_cache and project_root is not None:
        cached = resolve_cached_object(project_root, key)
        if cached:
            shutil.copyfile(cached, destination)
            return destination
    return download_object(s3, bucket=bucket, key=key, destination=destination)
