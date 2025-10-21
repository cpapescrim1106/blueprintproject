# Blueprint OMS Reporting Capture – 2025‑10‑20

This folder archives the mitmproxy capture we just performed against the Blueprint OMS desktop client (v4.8.1) while requesting two sample reports. It also contains the decoded queue payloads and the S3 artefacts returned by the reporting service so we can build a fully automated exporter.

## Layout

- `captures/2025-10-20/raw/`
  - `oms.flows`: mitmproxy dump of the entire session.
  - `mitmdump_run.log`: listener log showing each upstream target contacted.
  - `request_urls.txt`, `flows_detail.txt`, `filtered.txt`: quick summaries that make it easy to grep the capture.
  - `sqs.txt`: decoded HTTP traffic against Amazon SQS (all queue names, payloads, and responses).
  - `extract_s3.log`: log from the helper script that wrote S3 objects to disk.
- `captures/2025-10-20/s3/`
  - `374528a8-042a-4259-8615-2776e98bfd87`: JSON catalogue listing available reports for the logged-in user.
  - `FL_acc_50_1760990484533`, `FL_acc_50_1760990516201`: gzip-compressed JasperPrint binaries for “Referral Source – Appointments” and “Sales by Income Account”.
- `captures/2025-10-20/processed/report_messages.json`: parsed view of the queue messages (requests, responses, S3 pointers, and the service outage broadcast we saw).
- `scripts/parse_sqs.py`: helper to regenerate `report_messages.json` from any raw SQS transcript.
- `reference/`: supporting config captured from the Java Web Start bundle (client config, mapping definitions, Info.plist).

## How the reports are delivered

1. The client authenticates against AWS SQS/SNS using application credentials (see `sqs.txt` for the exact queue names and payloads).
2. Report jobs are enqueued on `reportRequest_us1_v4_8_1.fifo`. Each job’s `Message` JSON contains the report name, parameters (date range, clinic, output format), and the per-device response queue.
3. The client long-polls `FL_accQueue_UserNotification_50_Christophers-MacBook-Prolocal`. Responses either embed the rendered result (`reportResultXml`) or point to an S3 object stored in `bp-temp-us`.
4. For large payloads (what we captured) the response is a pointer; the actual JasperPrint comes from S3. Those gzip files are stored in `captures/2025-10-20/s3/`.

## Replaying the workflow in code

- **Queue side:** use the same JSON payloads in `processed/report_messages.json["report_requests"]` with AWS SDK `SendMessage` calls. The queue URL is visible in `sqs.txt`.
- **Response handling:** poll the notification queue and look for `MESSAGE_PAYLOAD_TYPE_PROPERTY == "reportResponse"`. Resolve the `reportResultXml` key against bucket `bp-temp-us` to download the result.
- **Rendering:** the downloaded files are gzip-compressed JasperPrint objects. Feed them through JasperReports (the jars are listed in the JNLP, e.g. `shared/lib/jasperreports-5.5.0.jar`) to export XLS/CSV/PDF for the dashboards.

## Next steps

1. Wire up a small SDK script (Python/boto3 or Java/AWS SDK v2) that reuses one of the captured request payloads and confirms you can receive the matching response file.
2. Add a renderer that takes the JasperPrint binaries from S3 and exports them to the format your reporting stack needs.
3. Expand coverage by capturing additional reports and generalising the request builder so parameters (date range, clinic, grouping) are injected dynamically. Re-run `scripts/parse_sqs.py` to refresh the processed summary after each capture.

## Tooling

- `scripts/replay_reports.py` wraps the captured queue payloads. Use `--mode offline` (default) to inspect and decompress the saved S3 artefacts without touching AWS. Pass `--decompress` to emit `.jrprint` files and `--jasperstarter` with `--export-format` once you provide a JasperReports CLI.
- `scripts/replay_reports.py --list-reports` enumerates the report catalogue we grabbed from S3 so you can choose meaningful names when replaying.
- Modules under `blueprint_exporter/` expose helpers for reading the capture (`payloads`, `catalog`), pushing jobs (`sqs_replay`), downloading results (`s3_download`), and handling JasperPrint payloads (`jasper`).
