#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { ConvexHttpClient } = require("convex/browser");
const { parse } = require("csv-parse/sync");
const minimist = require("minimist");

async function main() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  const argv = minimist(process.argv.slice(2), {
    string: ["file", "report", "source", "capturedAt"],
    alias: { f: "file", r: "report", s: "source", c: "capturedAt" },
  });

  const file = argv.file;
  const reportName = argv.report;
  if (!file || !reportName) {
    console.error(
      "Usage: node scripts/ingest_report.js --file <csvPath> --report <name> [--source <id>] [--capturedAt <ms-since-epoch>]",
    );
    process.exit(1);
  }

  const convexUrl = process.env.CONVEX_URL;
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!convexUrl || !deployKey) {
    console.error(
      "Missing Convex configuration. Set CONVEX_URL and CONVEX_DEPLOY_KEY in your environment.",
    );
    process.exit(1);
  }

  const csvPath = path.resolve(file);
  const csvData = fs.readFileSync(csvPath, "utf8");
  const rows = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  });

  const capturedAt =
    argv.capturedAt !== undefined
      ? Number(argv.capturedAt)
      : Date.now();
  if (Number.isNaN(capturedAt)) {
    console.error("Invalid --capturedAt value; must be a number.");
    process.exit(1);
  }

  const sourceKey = argv.source || path.basename(csvPath);
  const payload = {
    reportName,
    capturedAt,
    sourceKey,
    rows: rows.map((row, index) => ({
      rowIndex: index,
      data: Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value === undefined || value === null ? "" : String(value),
        ]),
      ),
    })),
  };

  console.log(
    `Uploading ${payload.rows.length} rows from ${csvPath} to Convex deployment ${convexUrl}...`,
  );

  const client = new ConvexHttpClient(convexUrl, {
    key: deployKey,
  });

  const ingestionId = await client.mutation("ingest:ingestReport", payload);
  console.log(`Ingestion complete. New ingestion ID: ${ingestionId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
