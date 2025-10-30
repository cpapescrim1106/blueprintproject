from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


_REPORT_ALIASES: Dict[str, str] = {
    # "All Active Patients" export reuses the Campaign export payload.
    "All Active Patients": "Campaign export",
}


@dataclass(frozen=True)
class ReportRequest:
    message: Dict[str, Any]
    attributes: Dict[str, str]

    @property
    def report_name(self) -> Optional[str]:
        return self.message.get("reportName")

    def envelope(self) -> Dict[str, Any]:
        return {
            "Message": self.message_json(),
            "MessageAttributes": self.attributes,
        }

    def message_json(self) -> str:
        return json.dumps(self.message, separators=(",", ":"), sort_keys=False)

    def sqs_attributes(self) -> Dict[str, Dict[str, str]]:
        return {
            key: {"DataType": "String", "StringValue": value}
            for key, value in self.attributes.items()
        }

    def message_body(self) -> str:
        return json.dumps(self.envelope(), separators=(",", ":"), sort_keys=False)


@dataclass(frozen=True)
class ReportResponse:
    message: Dict[str, Any]

    @property
    def report_name(self) -> Optional[str]:
        return self.message.get("reportName")

    @property
    def result_key(self) -> Optional[str]:
        return self.message.get("reportResultXml")


@dataclass(frozen=True)
class ReportMessages:
    requests: List[ReportRequest]
    responses: List[ReportResponse]
    s3_pointers: List[Dict[str, Any]]
    notifications: List[Dict[str, Any]]

    def _candidate_names(self, report_name: str) -> Iterable[str]:
        seen = set()
        current = report_name
        while current not in seen:
            yield current
            seen.add(current)
            mapped = _REPORT_ALIASES.get(current)
            if mapped is None:
                break
            current = mapped

    def request_by_name(self, report_name: str) -> ReportRequest:
        for candidate in self._candidate_names(report_name):
            for request in self.requests:
                if request.report_name == candidate:
                    return request
        raise KeyError(f"Report request for '{report_name}' not found.")

    def response_by_name(self, report_name: str) -> ReportResponse:
        for candidate in self._candidate_names(report_name):
            for response in self.responses:
                if response.report_name == candidate:
                    return response
        raise KeyError(f"Report response for '{report_name}' not found.")


def _load_requests(raw: Iterable[Dict[str, Any]]) -> List[ReportRequest]:
    requests: List[ReportRequest] = []
    for entry in raw:
        message = entry.get("message", {})
        attributes_raw = entry.get("attributes", {})
        attributes: Dict[str, str] = {}
        for key, value in attributes_raw.items():
            if isinstance(value, dict) and "StringValue" in value:
                attributes[key] = value["StringValue"]
            elif isinstance(value, str):
                attributes[key] = value
        requests.append(ReportRequest(message=message, attributes=attributes))
    return requests


def _load_responses(raw: Iterable[Dict[str, Any]]) -> List[ReportResponse]:
    responses: List[ReportResponse] = []
    for entry in raw:
        message = entry.get("message")
        if isinstance(message, dict):
            responses.append(ReportResponse(message=message))
    return responses


def load_processed_messages(path: Path) -> ReportMessages:
    data = json.loads(path.read_text())
    return ReportMessages(
        requests=_load_requests(data.get("report_requests", [])),
        responses=_load_responses(data.get("report_responses", [])),
        s3_pointers=data.get("report_s3_pointers", []),
        notifications=data.get("service_notifications", []),
    )
