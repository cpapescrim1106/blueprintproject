#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const { PrismaClient } = require("../convex-dashboard/node_modules/@prisma/client");
const { parse } = require("csv-parse/sync");
const minimist = require("minimist");
const { exit } = require("process");

const prisma = new PrismaClient();

const REPORT_CONFIG = {
  "Referral Source - Appointments": {
    targetTable: "appointments",
    uniqueKeyColumns: ["Location", "Patient ID", "Appt. date", "Appointment type", "Provider"],
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

const TABLE_CLIENTS = {
  appointments: () => prisma.appointment,
  patientRecalls: () => prisma.patientRecall,
  activePatients: () => prisma.activePatient,
  salesByIncomeAccount: () => prisma.salesByIncomeAccount,
};

const PATIENT_ID_KEYS = ["Patient ID", "Patient", "Account Number", "ID", "Reference #"];

const ACTIVE_PATIENT_KEYS = ["Patient", "Patient ID", "Account Number", "ID", "Reference #"];

function extractPatientIdForTable(tableName, record) {
  const keys = tableName === "activePatients" ? ACTIVE_PATIENT_KEYS : PATIENT_ID_KEYS;
  for (const key of keys) {
    const value = record[key];
    if (value) {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function canonicalize(record) {
  const ordered = Object.keys(record)
    .sort()
    .reduce((acc, key) => {
      acc[key] = record[key];
      return acc;
    }, {});
  return JSON.stringify(ordered);
}

async function main() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  const prismaEnv = path.resolve(__dirname, "..", "convex-dashboard", ".env.local");
  if (fs.existsSync(prismaEnv)) {
    dotenv.config({ path: prismaEnv });
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
    `Uploading ${payload.rows.length} rows from ${csvPath} into Prisma database...`,
  );

  const result = await ingestWithPrisma(payload);
  if (result && typeof result === "object" && "ingestionId" in result) {
    console.log(`Ingestion complete. Ingestion ID: ${result.ingestionId}`);
    if (result.stats) {
      console.log(
        `Dedup summary → inserted: ${result.stats.inserted}, updated: ${result.stats.updated}, unchanged: ${result.stats.unchanged}`,
      );
    }
  } else {
    console.log(`Ingestion complete.`);
  }
}

async function ingestWithPrisma(payload) {
  const capturedAtBigInt = BigInt(Math.trunc(payload.capturedAt));
  const ingestion = await prisma.ingestion.upsert({
    where: { sourceKey: payload.sourceKey },
    update: {
      reportName: payload.reportName,
      capturedAt: capturedAtBigInt,
      rowCount: payload.rows.length,
    },
    create: {
      reportName: payload.reportName,
      capturedAt: capturedAtBigInt,
      sourceKey: payload.sourceKey,
      rowCount: payload.rows.length,
    },
  });

  await prisma.reportRow.deleteMany({
    where: { ingestionId: ingestion.id },
  });

  const stats = { inserted: 0, updated: 0, unchanged: 0 };
  for (const row of payload.rows) {
    const record = { ...row.data };
    const uniqueKey = record.__uniqueKey;
    if (uniqueKey) {
      delete record.__uniqueKey;
    }

    await prisma.reportRow.create({
      data: {
        ingestionId: ingestion.id,
        reportName: payload.reportName,
        rowIndex: row.rowIndex,
        data: record,
      },
    });

    if (!uniqueKey) {
      continue;
    }

    const tableClientFactory = TABLE_CLIENTS[payload.targetTable];
    if (!tableClientFactory) {
      continue;
    }
    const tableClient = tableClientFactory();
    const patientIdValue = extractPatientIdForTable(
      payload.targetTable,
      record,
    );

    const existing = await tableClient.findUnique({
      where: { uniqueKey },
    });

    if (!existing) {
      await tableClient.create({
        data: {
          uniqueKey,
          reportName: payload.reportName,
          patientId: patientIdValue ?? null,
          data: record,
          firstCapturedAt: capturedAtBigInt,
          lastCapturedAt: capturedAtBigInt,
          lastIngestionId: ingestion.id,
        },
      });
      stats.inserted += 1;
      continue;
    }

    const existingSignature = canonicalize(existing.data);
    const incomingSignature = canonicalize(record);
    if (existingSignature !== incomingSignature) {
      await tableClient.update({
        where: { uniqueKey },
        data: {
          reportName: payload.reportName,
          patientId: patientIdValue ?? existing.patientId,
          data: record,
          lastCapturedAt: capturedAtBigInt,
          lastIngestionId: ingestion.id,
        },
      });
      stats.updated += 1;
    } else {
      stats.unchanged += 1;
    }
  }

  return { ingestionId: ingestion.id, stats };
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
