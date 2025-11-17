# Welcome to your Convex + Next.js app

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Next.js](https://nextjs.org/) for optimized web hosting and page routing
- [Tailwind](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/) for building great looking accessible UI fast

## Get started

If you just cloned this codebase and didn't use `npm create convex`, run:

```
npm install
npm run dev
```

> ℹ️ This dashboard reuses the Convex functions defined in the parent
> directory (`../convex`). The `npm run dev` script automatically starts
> them by running `npx convex dev` from the repository root, so make sure
> the root `.env.local` contains the correct Convex deployment settings.

If you're reading this README on GitHub and want to use this template, run:

```
npm create convex@latest -- -t nextjs-shadcn
```

## Learn more

To learn more about developing your project with Convex, check out:

- The [Tour of Convex](https://docs.convex.dev/get-started) for a thorough introduction to Convex principles.
- The rest of [Convex docs](https://docs.convex.dev/) to learn about all Convex features.
- [Stack](https://stack.convex.dev/) for in-depth articles on advanced topics.

## Join the community

Join thousands of developers building full-stack apps with Convex:

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

# Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

- Join the [Convex Discord community](https://convex.dev/community) to get help in real-time.
- Follow [Convex on GitHub](https://github.com/get-convex/), star and contribute to the open-source implementation of Convex.

## Patient Messaging via RingCentral

The `/messaging` workspace adds two-way SMS support on top of the existing Blueprint dashboards:

- A five-day appointment agenda sourced from Convex ingestion tables.
- One-to-one patient threads stored in new `messageThreads` / `messages` tables.
- Bulk reminder sending with templates that accept `{name}`, `{date}`, `{time}`, and `{location}` tokens.

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
