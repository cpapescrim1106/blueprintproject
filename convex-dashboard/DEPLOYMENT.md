# Deployment Guide for Coolify

This guide covers deploying the Blueprint Dashboard to Coolify.

## Prerequisites

1. **Database**: PostgreSQL database (can be provisioned via Coolify or external)
2. **Environment Variables**: Set the following in Coolify:
   - `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:password@host:5432/database?schema=public`)
   - `NODE_ENV=production`

## Coolify Configuration

### Build Settings

- **Build Pack**: Docker
- **Dockerfile Path**: `convex-dashboard/Dockerfile`
- **Build Context**: `convex-dashboard/` (or root if building from repo root)
- **Port**: `3000` (Coolify will handle port mapping)

### Environment Variables

Required environment variables to set in Coolify:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
NODE_ENV=production
```

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

