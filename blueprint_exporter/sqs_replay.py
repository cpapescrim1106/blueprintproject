from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, TYPE_CHECKING

try:
    import boto3  # type: ignore
    from botocore.exceptions import ClientError  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - offline mode without boto3
    boto3 = None  # type: ignore
    ClientError = Exception  # type: ignore

if TYPE_CHECKING:
    from botocore.client import BaseClient  # type: ignore
else:
    BaseClient = Any  # type: ignore[misc, assignment]

from .config import ReplayConfig
from .payloads import ReportRequest


# Circuit breaker for credential errors
# Prevents repeated API calls when credentials are invalid
CIRCUIT_BREAKER_FILE = Path("/tmp/aws_circuit_breaker.json")
CREDENTIAL_ERROR_CODES = {
    "InvalidClientTokenId",
    "SignatureDoesNotMatch",
    "AccessDenied",
    "ExpiredToken",
    "ExpiredTokenException",
    "UnrecognizedClientException",
}


class CredentialCircuitOpenError(Exception):
    """Raised when the circuit breaker is open due to credential errors."""
    def __init__(self, message: str, last_error: str, opened_at: str):
        super().__init__(message)
        self.last_error = last_error
        self.opened_at = opened_at


def _load_circuit_state() -> Dict[str, Any]:
    """Load circuit breaker state from file."""
    if CIRCUIT_BREAKER_FILE.exists():
        try:
            return json.loads(CIRCUIT_BREAKER_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"open": False, "last_error": None, "opened_at": None}


def _save_circuit_state(state: Dict[str, Any]) -> None:
    """Save circuit breaker state to file."""
    try:
        CIRCUIT_BREAKER_FILE.write_text(json.dumps(state))
    except OSError:
        pass  # Best effort


def check_circuit_breaker() -> None:
    """Check if circuit breaker is open and raise if so."""
    state = _load_circuit_state()
    if state.get("open"):
        raise CredentialCircuitOpenError(
            f"AWS credential circuit breaker is OPEN. Last error: {state.get('last_error')}. "
            f"Fix credentials and delete {CIRCUIT_BREAKER_FILE} to reset.",
            last_error=state.get("last_error", "Unknown"),
            opened_at=state.get("opened_at", "Unknown"),
        )


def open_circuit_breaker(error_code: str, error_message: str) -> None:
    """Open the circuit breaker due to a credential error."""
    state = {
        "open": True,
        "last_error": f"{error_code}: {error_message}",
        "opened_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "error_code": error_code,
    }
    _save_circuit_state(state)
    print(f"\n{'='*60}")
    print("AWS CREDENTIAL ERROR - CIRCUIT BREAKER OPENED")
    print(f"Error: {error_code}: {error_message}")
    print(f"No further AWS API calls will be attempted.")
    print(f"To reset: fix credentials and delete {CIRCUIT_BREAKER_FILE}")
    print(f"{'='*60}\n")


def reset_circuit_breaker() -> None:
    """Reset the circuit breaker (call after fixing credentials)."""
    if CIRCUIT_BREAKER_FILE.exists():
        CIRCUIT_BREAKER_FILE.unlink()
    print("AWS credential circuit breaker has been reset.")


def create_sqs_client(region_name: str) -> BaseClient:
    if boto3 is None:
        raise ModuleNotFoundError("boto3 is required for live mode SQS access.")
    return boto3.client("sqs", region_name=region_name)


def _ensure_string(value: object) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, separators=(",", ":"))


def _parse_body(raw_body: str) -> Dict[str, object]:
    try:
        envelope = json.loads(raw_body)
    except json.JSONDecodeError:
        return {}

    message = envelope.get("Message")
    if isinstance(message, str):
        try:
            return json.loads(message)
        except json.JSONDecodeError:
            return {"Message": message}
    if isinstance(message, dict):
        return message
    return envelope


@dataclass
class ReceivedNotification:
    raw: Dict[str, object]
    body: Dict[str, object]

    @property
    def report_name(self) -> Optional[str]:
        payload = self.body.get("reportName")
        return _ensure_string(payload) if payload is not None else None

    @property
    def result_key(self) -> Optional[str]:
        value = self.body.get("reportResultXml")
        return _ensure_string(value) if value is not None else None

    @property
    def receipt_handle(self) -> str:
        return _ensure_string(self.raw["ReceiptHandle"])


class SQSReplayClient:
    def __init__(self, sqs: BaseClient, config: ReplayConfig) -> None:
        self._sqs = sqs
        self._config = config

    def send_request(
        self,
        request: ReportRequest,
        *,
        message_group_id: Optional[str] = None,
        message_deduplication_id: Optional[str] = None,
        dry_run: bool = False,
    ) -> Dict[str, object]:
        # Check circuit breaker before making any AWS calls
        check_circuit_breaker()

        group_id = message_group_id or self._config.message_group_id
        dedup_id = message_deduplication_id or str(uuid.uuid4())
        if dry_run:
            return {
                "QueueUrl": self._config.request_queue_url,
                "MessageGroupId": group_id,
                "MessageDeduplicationId": dedup_id,
                "MessageBody": request.message_body(),
                "MessageAttributes": request.sqs_attributes(),
            }

        try:
            response = self._sqs.send_message(
                QueueUrl=self._config.request_queue_url,
                MessageBody=request.message_body(),
                MessageGroupId=group_id,
                MessageDeduplicationId=dedup_id,
                MessageAttributes=request.sqs_attributes(),
            )
            return response  # type: ignore[return-value]
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_message = e.response.get("Error", {}).get("Message", str(e))

            # Check if this is a credential error
            if error_code in CREDENTIAL_ERROR_CODES:
                open_circuit_breaker(error_code, error_message)

            raise

    def poll_notifications(
        self,
        *,
        wait_time_seconds: int = 20,
        max_messages: int = 5,
        visibility_timeout: Optional[int] = None,
        stop_after: Optional[int] = None,
        on_wait: Optional[Callable[[int], None]] = None,
    ) -> Iterator[ReceivedNotification]:
        received = 0
        attempts = 0
        params: Dict[str, object] = {
            "QueueUrl": self._config.notification_queue_url,
            "WaitTimeSeconds": wait_time_seconds,
            "MaxNumberOfMessages": max_messages,
            "AttributeNames": ["All"],
            "MessageAttributeNames": ["All"],
        }
        if visibility_timeout is not None:
            params["VisibilityTimeout"] = visibility_timeout

        while True:
            if stop_after is not None and received >= stop_after:
                return

            response = self._sqs.receive_message(**params)
            messages: List[Dict[str, object]] = response.get("Messages", [])  # type: ignore[assignment]
            if not messages:
                attempts += 1
                if on_wait:
                    on_wait(attempts)
                continue

            for raw in messages:
                body = _parse_body(_ensure_string(raw.get("Body")))
                received += 1
                yield ReceivedNotification(raw=raw, body=body)

    def delete_notification(self, notification: ReceivedNotification) -> None:
        self._sqs.delete_message(
            QueueUrl=self._config.notification_queue_url,
            ReceiptHandle=notification.receipt_handle,
        )

    def wait_for_result(
        self,
        *,
        expected_report: Optional[str] = None,
        poll_interval: int = 20,
        visibility_timeout: Optional[int] = None,
        timeout_seconds: int = 300,
        on_wait: Optional[Callable[[float, int], None]] = None,
        on_unexpected: Optional[Callable[[ReceivedNotification], None]] = None,
    ) -> Optional[ReceivedNotification]:
        deadline = time.time() + timeout_seconds

        def handle_wait(attempts: int) -> None:
            if on_wait is None:
                return
            remaining = max(0.0, deadline - time.time())
            on_wait(remaining, attempts)

        while time.time() < deadline:
            iterator = self.poll_notifications(
                wait_time_seconds=poll_interval,
                max_messages=5,
                visibility_timeout=visibility_timeout,
                stop_after=1,
                on_wait=handle_wait,
            )
            for notification in iterator:
                if expected_report and notification.report_name != expected_report:
                    # Leave the message on the queue for another consumer.
                    if on_unexpected:
                        on_unexpected(notification)
                    continue
                return notification
        return None
