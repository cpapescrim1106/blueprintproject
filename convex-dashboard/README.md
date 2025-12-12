# Blueprint Reporting Dashboard (Next.js + Prisma)

- Next.js 15 + shadcn UI
- Prisma for data access (SQLite locally by default; Postgres recommended for production)
- API routes live under `app/api/*` and back the dashboard pages
- Report ingestion comes from the parent repo scripts (Python + Node) writing into Prisma tables

## Run locally

```
npm install
npm run dev
```

Prisma uses `prisma/dev.db` in this workspace unless you override `DATABASE_URL`. Run `npx prisma migrate dev` before first boot. If you want to disable the Turbopack root warning, align lockfiles or set `turbopack.root` in `next.config.ts`.

## Patient Messaging via RingCentral

The `/messaging` workspace adds two-way SMS support on top of the existing Blueprint dashboards:

- A five-day appointment agenda sourced from Convex ingestion tables.
- One-to-one patient threads stored in new `messageThreads` / `messages` tables.
- Bulk reminder sending with templates that accept `{name}`, `{date}`, `{time}`, and `{location}` tokens.

### Local database (Prisma)

Messaging data now lives in the SQLite database managed by Prisma.

```
cd convex-dashboard
npx prisma migrate dev
npx prisma studio # optional GUI
```

The database file is generated at `prisma/dev.db`. To point at Postgres or another host, update `prisma/.env` and re-run the migration.

### Run the ingestion pipeline

`scripts/run_report_pipeline.py` still orchestrates the replay/export step, but data now lands in Prisma via the updated Node helper. From the repo root:

```
node scripts/ingest_report.js --file exports/appointments.csv --report "Referral Source - Appointments"
```

The script automatically truncates the previous ingestion for the same `sourceKey`, writes raw rows to `prisma.reportRows`, and upserts canonical records into `appointments`, `patientRecalls`, `activePatients`, or `salesByIncomeAccount`. Inspect the new rows with `npx prisma studio` before launching the dashboard.

### Configure credentials

Store the following secrets with `convex env set` (and in `.env.local` for local dev):

```
RINGCENTRAL_CLIENT_ID=...
RINGCENTRAL_CLIENT_SECRET=...
RINGCENTRAL_JWT=...
RINGCENTRAL_FROM_NUMBER=+15551234567
# Optional override, defaults to production:
RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com
```

> Ensure `RINGCENTRAL_FROM_NUMBER` is SMS-enabled. Rotate JWT tokens regularly.

Finally, redeploy Convex after updating secrets so the new schema and indexes are applied:

```
npx convex deploy
```

### Configure inbound webhooks

To capture patient replies, create a RingCentral Event Subscription (message-store, SMS only) pointing to:

```
https://<your-dashboard-domain>/api/ringcentral/inbound
```

From the project root you can automate this via the helper script:

```
# Optionally set RINGCENTRAL_WEBHOOK_URL in .env.local
npm run ringcentral:subscribe -- --webhook https://<your-dashboard-domain>/api/ringcentral/inbound
```

Use `--list` to inspect existing subscriptions and `--delete <id>` to remove one:

```
npm run ringcentral:subscribe -- --list
npm run ringcentral:subscribe -- --delete <subscriptionId>
```

On the first handshake RingCentral sends a `Validation-Token` header; our route now echoes that header back, so the subscription should activate automatically. Once configured, inbound SMS records are written to Convex via `api.messaging.recordInboundMessage`, and threads in `/messaging` update as replies arrive.
