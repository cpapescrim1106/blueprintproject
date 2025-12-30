# Blueprint Project Reporting Dashboard (Next.js + Prisma)

- Next.js 15 + shadcn UI
- Prisma for data access (SQLite locally by default; Postgres recommended for production)
- API routes live under `app/api/*` and back the dashboard pages
- Report ingestion comes from the parent repo scripts (Python + Node) writing into Prisma tables

## Run locally

```
npm install
npm run dev
```

Prisma now targets Postgres. Copy `env.example` to `.env.local` and ensure `DATABASE_URL` points at your instance (the repo ships with a docker-compose service on port `55432`). Run `docker compose up -d postgres` from the repo root, then apply migrations with `DATABASE_URL=postgresql://blueprint:blueprint@localhost:55432/blueprint?schema=public npx prisma migrate deploy`. If you want to disable the Turbopack root warning, align lockfiles or set `turbopack.root` in `next.config.ts`.

## Patient Messaging via RingCentral

The `/messaging` workspace adds two-way SMS support on top of the Blueprint project dashboards:

- A five-day appointment agenda sourced from Prisma database tables.
- One-to-one patient threads stored in new `messageThreads` / `messages` tables.
- Bulk reminder sending with templates that accept `{name}`, `{date}`, `{time}`, and `{location}` tokens.

### Local database (Prisma)

Messaging data now lives in Postgres (managed by Prisma). Start the bundled database with `docker compose up -d postgres` from the repo root, then apply migrations:

```
cd convex-dashboard
npm run db:migrate
npx prisma studio # optional GUI
```

Set `DATABASE_URL` in `.env.local` (see `env.example`) if you want to point at a different Postgres host.

### Run the ingestion pipeline

`scripts/run_report_pipeline.py` still orchestrates the replay/export step, but data now lands in Prisma via the updated Node helper. From the repo root:

```
node scripts/ingest_report.js --file exports/appointments.csv --report "Referral Source - Appointments"
```

The script automatically truncates the previous ingestion for the same `sourceKey`, writes raw rows to `prisma.reportRows`, and upserts canonical records into `appointments`, `patientRecalls`, `activePatients`, or `salesByIncomeAccount`. Inspect the new rows with `npx prisma studio` before launching the dashboard.

### Configure credentials

Store the following secrets in `.env.local` for local dev (or in your deployment environment):

```
RINGCENTRAL_CLIENT_ID=...
RINGCENTRAL_CLIENT_SECRET=...
RINGCENTRAL_JWT=...
RINGCENTRAL_FROM_NUMBER=+15551234567
# Optional override, defaults to production:
RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com
```

> Ensure `RINGCENTRAL_FROM_NUMBER` is SMS-enabled. Rotate JWT tokens regularly.

### Configure inbound webhooks

To capture patient replies, create a RingCentral Event Subscription (message-store, SMS only) pointing to:

```
https://blueprintproject.scrimvibes.xyz/api/ringcentral/inbound
```

From the project root you can automate this via the helper script:

```
# Optionally set RINGCENTRAL_WEBHOOK_URL in .env.local
npm run ringcentral:subscribe -- --webhook https://blueprintproject.scrimvibes.xyz/api/ringcentral/inbound
```

Use `--list` to inspect existing subscriptions and `--delete <id>` to remove one:

```
npm run ringcentral:subscribe -- --list
npm run ringcentral:subscribe -- --delete <subscriptionId>
```

On the first handshake RingCentral sends a `Validation-Token` header; our route now echoes that header back, so the subscription should activate automatically. Once configured, inbound SMS records are written to Prisma via the API route, and threads in `/messaging` update as replies arrive.

### DNS + TLS for blueprintproject.scrimvibes.xyz

1. Add a CNAME (or ALIAS/ANAME if your provider requires it) for `blueprintproject.scrimvibes.xyz` that points at the host serving this Next.js app (Vercel, Cloudflare Pages, custom Nginx, etc.).
2. Ensure the hosting provider issues an HTTPS certificate for the new subdomain; most managed platforms do this automatically once the DNS record resolves.
3. Redeploy the dashboard so the public URL matches the new hostname and verify that `https://blueprintproject.scrimvibes.xyz` loads without certificate warnings.
