# Deployment Guide for Coolify

This guide covers deploying the Blueprint Dashboard to Coolify.

## Production Triage Checklist

Use this when a deployment refuses to boot or Coolify reports health‑check failures.

1. **Missing `DATABASE_URL`** – Prisma will crash before Next.js starts if this env var is unset. In Coolify → Environment Variables add  
   `DATABASE_URL=postgresql://username:password@your-db-host:5432/your-database?schema=public`. Save and redeploy.
2. **Wrong build pack** – Coolify defaults to Nixpacks. Switch Build Pack to **Docker**, set **Base Directory** to `/convex-dashboard`, and point the Dockerfile field at `convex-dashboard/Dockerfile`. Clear any custom Install/Build/Start commands so Coolify lets Docker handle the lifecycle.
3. **Check the logs tab** – `Logs → Build` shows Docker build failures (e.g., Prisma errors when `DATABASE_URL` is missing). `Logs → Application` shows runtime issues such as Postgres auth failures. Copy the exact error before changing settings.

## Prerequisites

1. **Database**: PostgreSQL database (can be provisioned via Coolify or external)
2. **Environment Variables**: Set the following in Coolify:
   - `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:password@host:5432/database?schema=public`)
   - `NODE_ENV=production`

## Coolify Configuration

### Build Settings

- **Build Pack**: Docker (Nixpacks will not run the multi-stage Dockerfile)
- **Base Directory**: `/convex-dashboard`
- **Dockerfile Path**: `convex-dashboard/Dockerfile`
- **Build Context**: Repo root (Coolify auto-prepends the Base Directory)
- **Install/Build/Start commands**: leave blank so Docker controls the steps
- **Port**: `3000` (Coolify will handle port mapping)

### Environment Variables

Required environment variables to set in Coolify:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
NODE_ENV=production
```

> `DATABASE_URL` must point at the same Postgres instance that already has the Prisma migrations applied. Use a managed database in Coolify or an external cluster and confirm credentials manually before redeploying.

Optional environment variables (if using RingCentral messaging):

```bash
RINGCENTRAL_CLIENT_ID=your_client_id
RINGCENTRAL_CLIENT_SECRET=your_client_secret
RINGCENTRAL_JWT=your_jwt
RINGCENTRAL_FROM_NUMBER=your_number
RINGCENTRAL_WEBHOOK_URL=https://your-domain.com/api/ringcentral/inbound
```

### Database Setup

1. Ensure PostgreSQL is running and accessible
2. The Dockerfile will automatically run `prisma migrate deploy` on startup
3. Make sure the database user has permissions to create tables and run migrations

## Build Process

The Dockerfile uses a multi-stage build:

1. **Dependencies**: Installs npm packages
2. **Builder**: Generates Prisma client and builds Next.js app
3. **Runner**: Creates minimal production image with only necessary files

## Troubleshooting

### Build Failures

- **Missing DATABASE_URL**: Ensure `DATABASE_URL` is set in Coolify environment variables
- **Prisma generation fails**: Check that `prisma/schema.prisma` is present and valid
- **Next.js build fails**: Check for TypeScript errors or missing dependencies

### Runtime Issues

- **Database connection errors**: Verify `DATABASE_URL` is correct and database is accessible
- **Migration failures**: Check database permissions and ensure migrations directory exists
- **Port conflicts**: Ensure port 3000 is available or configure Coolify to use a different port

### Common Issues

1. **Prisma Client not found**: The Dockerfile should handle this, but if issues occur, verify `node_modules/@prisma/client` is copied correctly
2. **Static files not found**: Ensure `.next/static` is copied in the Dockerfile
3. **Environment variables not loading**: Verify they're set in Coolify's environment variable section

## Health Checks

The application runs on port 3000. Coolify can use `/` as a health check endpoint.

## Post-Deployment

After successful deployment:

1. Verify database migrations ran successfully (check logs)
2. Test the application at the provided URL
3. Check that API routes are responding correctly
