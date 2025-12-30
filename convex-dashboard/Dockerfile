# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk update && apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk update && apk add --no-cache openssl

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client (with dummy DATABASE_URL since it's not needed for generation)
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:skip-checks

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install openssl for Prisma
RUN apk update && apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and migrations (needed for migrations)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy package.json and install Prisma CLI for migrations
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
RUN npm install --omit=dev prisma

USER nextjs

EXPOSE 3000

# Default PORT if not set by Coolify
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run database migrations and start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
