# Patient Recall Service Bridge (tabled concept)

## Goal
Replace the current “Patient Recalls” CSV/report ingestion pipeline with a live integration that lets the web roster edit recalls (booked, other, change date) directly against Blueprint OMS, while still enriching the table with completion/performance metrics from the reports.

## Proposed Architecture
1. **Runtime bridge**
   - Stand up a headless JVM helper that boots the captured OMS client runtime, logs in via `OMSController`, and keeps the session alive.
   - Use the existing shaded Spring stack (`org.springframework.remoting.b.*`, `com.blueprint.oms.b.b`, etc.) so we can call `OMSService` methods like `getClientRecallList` and `updateClientRecalls`.
   - Expose the helper through a local CLI/HTTP bridge that the Convex/Next backend can call.
2. **Backend wiring**
   - Replace report parsing for operational data with live `getClientRecallList` / `getClientRecallByRecallId`.
   - Keep the report-derived performance metrics (completion counts, revenue, device age) by continuing to ingest the CSVs on a schedule and storing them in Convex keyed by recall/patient id.
   - Provide mutation endpoints that take a recall id (or list), look up the latest DTO from the helper, patch the necessary fields (`recallDate`, `cancelReasonId`, etc.), and send them back through `updateClientRecalls`.
3. **Frontend updates**
   - In the Patient Recall roster, display both the live recall fields and the stored metrics.
   - Add action buttons (`Booked`, `Other`, `Change date`) that call the new backend endpoints and optimistically update the row.
   - Support batch edits by passing multiple recall ids to the backend.

## Requirements & Risks
- Securely store Blueprint credentials / host the helper in a controlled environment.
- Manage session lifecycle, retries, and error reporting when the remote OMS service is unavailable.
- Ensure logging/observability so recall mutations are auditable.
- Align with compliance/security expectations before invoking proprietary OMS services outside the desktop client.

## Status
We now have full logging of the recall payloads (including `cancelReasonId`, `recallDate`, etc.) and understand the service calls required, but the bridge itself has not been implemented. Work is **tabled** until we commit to provisioning the JVM helper and backend integration described above.
