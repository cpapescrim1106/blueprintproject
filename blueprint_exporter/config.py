from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse


def _queue_name_from_url(url: str) -> str:
    path = urlparse(url).path
    return path.rsplit("/", 1)[-1]


@dataclass(frozen=True)
class ReplayConfig:
    """Holds endpoints and paths needed to replay a captured report workflow."""

    region_name: str
    request_queue_url: str
    notification_queue_url: str
    bucket_name: str
    processed_messages_path: Path
    request_group_id: Optional[str] = None

    def resolve_messages_path(self, root: Path | None = None) -> Path:
        if self.processed_messages_path.is_absolute() or root is None:
            return self.processed_messages_path
        return (root / self.processed_messages_path).resolve()

    @property
    def request_queue_name(self) -> str:
        return _queue_name_from_url(self.request_queue_url)

    @property
    def notification_queue_name(self) -> str:
        return _queue_name_from_url(self.notification_queue_url)

    @property
    def message_group_id(self) -> str:
        if self.request_group_id:
            return self.request_group_id
        return self.request_queue_name
