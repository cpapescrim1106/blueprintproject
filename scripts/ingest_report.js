#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
    string: ["file", "report", "source", "capturedAt", "table"],
    alias: {
      f: "file",
      r: "report",
      s: "source",
      c: "capturedAt",
      t: "table",
    },
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

  const REPORT_CONFIG = {
    "Referral Source - Appointments": {
      targetTable: "appointments",
      uniqueKeyColumns: [
        "Location",
        "Patient ID",
        "Appt. date",
        "Appointment type",
        "Provider",
      ],
    },
    "Patient Recalls": {
      targetTable: "patientRecalls",
      uniqueKeyColumns: null,
    },
    "All Active Patients": {
      targetTable: "activePatients",
      uniqueKeyColumns: null,
    },
    "Campaign export": {
      targetTable: "activePatients",
      uniqueKeyColumns: null,
    },
    "Sales by Income Account": {
      targetTable: "salesByIncomeAccount",
      uniqueKeyColumns: null,
    },
  };

  const baseConfig = REPORT_CONFIG[reportName] || null;
  const targetTable = argv.table || baseConfig?.targetTable;
  if (!targetTable) {
    const available = Object.keys(REPORT_CONFIG).join(", ");
    console.error(
      `Unknown report '${reportName}'. Pass --table <tableName> or update REPORT_CONFIG. Known reports: ${available}`,
    );
    process.exit(1);
  }

  const uniqueKeyColumns = baseConfig?.uniqueKeyColumns || null;

  const csvPath = path.resolve(file);
  const csvData = fs.readFileSync(csvPath, "utf8");
  const rows = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  });

  const sanitizeKey = (key) =>
    key
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const sanitizeValue = (value) =>
    value === undefined || value === null
      ? ""
      : String(value)
          .replace(/[\r\n\t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

  const buildUniqueKey = (record) => {
    if (uniqueKeyColumns && Array.isArray(uniqueKeyColumns) && uniqueKeyColumns.length > 0) {
      const uniqueKeyMaterial = [
        reportName,
        ...uniqueKeyColumns.map((column) =>
          (record[column] || "").toLowerCase(),
        ),
      ].join("|");
      return crypto.createHash("sha256").update(uniqueKeyMaterial).digest("hex");
    }

    const orderedEntries = Object.keys(record)
      .sort()
      .map((key) => `${key}=${record[key]}`);
    return crypto.createHash("sha256").update(orderedEntries.join("|")).digest("hex");
  };

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
    targetTable,
    rows: rows.map((row, index) => ({
      rowIndex: index,
      data: (() => {
        const normalizedEntries = Object.entries(row).map(([key, value]) => [
          sanitizeKey(key),
          sanitizeValue(value),
        ]);
        const record = Object.fromEntries(normalizedEntries);
        record.__uniqueKey = buildUniqueKey(record);
        return record;
      })(),
    })),
  };

  console.log(
    `Uploading ${payload.rows.length} rows from ${csvPath} to Convex deployment ${convexUrl}...`,
  );

  const client = new ConvexHttpClient(convexUrl, {
    key: deployKey,
  });

  const result = await client.action("ingest:ingestReport", payload);
  if (result && typeof result === "object" && "ingestionId" in result) {
    console.log(`Ingestion complete. New ingestion ID: ${result.ingestionId}`);
    if (result.stats) {
      console.log(
        `Dedup summary → inserted: ${result.stats.inserted}, updated: ${result.stats.updated}, unchanged: ${result.stats.unchanged}`,
      );
    }
  } else {
    console.log(`Ingestion complete. Result: ${result}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
