#!/bin/sh
set -e

# Set defaults if not provided by Coolify
export PORT=${PORT:-3000}
export HOSTNAME=${HOSTNAME:-0.0.0.0}

echo "Starting application on ${HOSTNAME}:${PORT}"
echo "PORT environment variable: ${PORT}"

# Run database migrations (non-blocking - allow app to start even if migrations fail)
echo "Running database migrations..."
npx prisma migrate deploy || {
  echo "Warning: Database migration failed or already applied. Continuing..."
}

# Start the Next.js server
# Next.js standalone mode automatically reads PORT from process.env.PORT
echo "Starting Next.js server on port ${PORT}..."
exec node server.js

