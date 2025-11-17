#!/usr/bin/env node

/**
 * Helper CLI to manage RingCentral message-store webhook subscriptions.
 *
 * Usage:
 *   node scripts/register_ringcentral_subscription.js --webhook https://example.com/api/ringcentral/inbound
 *   node scripts/register_ringcentral_subscription.js --list
 *   node scripts/register_ringcentral_subscription.js --delete <subscriptionId>
 *
 * Environment variables (loaded from .env.local when present):
 *   RC_CLIENT_ID
 *   RC_CLIENT_SECRET
 *   RC_JWT_TOKEN
 *   RC_SERVER_URL (optional, defaults to production)
 *   RINGCENTRAL_WEBHOOK_URL (optional default for --webhook)
 */

const fs = require("fs");
const path = require("path");
const minimist = require("minimist");
const dotenv = require("dotenv");

const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const {
  RC_CLIENT_ID,
  RC_CLIENT_SECRET,
  RC_JWT_TOKEN,
  RC_SERVER_URL = "https://platform.ringcentral.com",
  RINGCENTRAL_WEBHOOK_URL,
} = process.env;

if (!RC_CLIENT_ID || !RC_CLIENT_SECRET || !RC_JWT_TOKEN) {
  console.error(
    "Missing RingCentral credentials. Ensure RC_CLIENT_ID, RC_CLIENT_SECRET, and RC_JWT_TOKEN are set.",
  );
  process.exit(1);
}

const args = minimist(process.argv.slice(2), {
  string: ["webhook", "event", "delete"],
  boolean: ["list"],
  alias: {
    w: "webhook",
    e: "event",
    l: "list",
    d: "delete",
  },
});

const DEFAULT_EVENTS = [
  "/restapi/v1.0/account/~/extension/~/message-store?type=SMS&direction=Inbound",
];
const SUBSCRIPTION_TTL = 60 * 60 * 24 * 7; // 7 days

async function getAccessToken() {
  const basicAuth = Buffer.from(`${RC_CLIENT_ID}:${RC_CLIENT_SECRET}`).toString(
    "base64",
  );
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: RC_JWT_TOKEN,
  });
  const response = await fetch(`${RC_SERVER_URL}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch access token: ${text}`);
  }
  const json = await response.json();
  return json.access_token;
}

async function listSubscriptions(accessToken) {
  const response = await fetch(`${RC_SERVER_URL}/restapi/v1.0/subscription`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list subscriptions: ${text}`);
  }
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

async function deleteSubscription(accessToken, id) {
  const response = await fetch(
    `${RC_SERVER_URL}/restapi/v1.0/subscription/${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (response.status === 204) {
    console.log(`Subscription ${id} deleted.`);
    return;
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to delete subscription: ${text}`);
  }
  console.log(text);
}

async function createSubscription(accessToken, webhookUrl, eventFilters) {
  const payload = {
    eventFilters: eventFilters.length > 0 ? eventFilters : DEFAULT_EVENTS,
    deliveryMode: {
      transportType: "WebHook",
      address: webhookUrl,
    },
    expiresIn: SUBSCRIPTION_TTL,
  };
  const response = await fetch(`${RC_SERVER_URL}/restapi/v1.0/subscription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to create subscription: ${text}`);
  }
  console.log(text);
}

async function main() {
  const accessToken = await getAccessToken();

  if (args.list) {
    await listSubscriptions(accessToken);
    return;
  }

  if (args.delete) {
    await deleteSubscription(accessToken, args.delete);
    return;
  }

  const webhookUrl = args.webhook || RINGCENTRAL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error(
      "Missing webhook URL. Pass --webhook https://your-domain/api/ringcentral/inbound or set RINGCENTRAL_WEBHOOK_URL.",
    );
    process.exit(1);
  }

  const events = [];
  if (Array.isArray(args.event)) {
    events.push(...args.event);
  } else if (typeof args.event === "string") {
    events.push(args.event);
  }

  await createSubscription(accessToken, webhookUrl, events);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
