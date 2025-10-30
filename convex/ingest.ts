import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const rowInput = v.object({
  rowIndex: v.number(),
  data: v.record(v.string(), v.string()),
});

const canonicalize = (record: Record<string, string>) => {
  const ordered = Object.keys(record)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = record[key];
      return acc;
    }, {});
  return JSON.stringify(ordered);
};

const CHUNK_SIZE = 200;
const CLEAR_LIMIT = 200;

const PATIENT_ID_KEYS = [
  "Patient ID",
  "Patient",
  "Account Number",
  "ID",
  "Reference #",
];

const ACTIVE_PATIENT_KEYS = [
  "Patient",
  "Patient ID",
  "Account Number",
  "ID",
  "Reference #",
];

function extractPatientIdForTable(
  tableName: string,
  record: Record<string, string>,
): string | undefined {
  const keys =
    tableName === "activePatients" ? ACTIVE_PATIENT_KEYS : PATIENT_ID_KEYS;
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

function chunkRows<T>(rows: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

type Stats = { inserted: number; updated: number; unchanged: number };

function mergeStats(target: Stats, delta: Stats) {
  target.inserted += delta.inserted;
  target.updated += delta.updated;
  target.unchanged += delta.unchanged;
}

export const ingestReport = action({
  args: {
    reportName: v.string(),
    capturedAt: v.number(),
    sourceKey: v.string(),
    targetTable: v.string(),
    rows: v.array(rowInput),
  },
  handler: async (ctx, args) => {
    const prep = await ctx.runMutation("ingest:createIngestion", {
      reportName: args.reportName,
      capturedAt: args.capturedAt,
      sourceKey: args.sourceKey,
    });

    if (prep.replaced) {
      while (true) {
        const removed = await ctx.runMutation("ingest:clearRowsBatch", {
          ingestionId: prep.ingestionId,
          limit: CLEAR_LIMIT,
        });
        if (removed === 0) {
          break;
        }
      }
    }

    const stats: Stats = { inserted: 0, updated: 0, unchanged: 0 };
    for (const chunk of chunkRows(args.rows, CHUNK_SIZE)) {
      const chunkStats = await ctx.runMutation("ingest:processRowsBatch", {
        ingestionId: prep.ingestionId,
        reportName: args.reportName,
        capturedAt: args.capturedAt,
        targetTable: args.targetTable,
        rows: chunk,
      });
      mergeStats(stats, chunkStats);
    }

    await ctx.runMutation("ingest:finalizeIngestion", {
      ingestionId: prep.ingestionId,
      capturedAt: args.capturedAt,
      rowCount: args.rows.length,
    });

    return { ingestionId: prep.ingestionId, stats };
  },
});

export const createIngestion = internalMutation({
  args: {
    reportName: v.string(),
    capturedAt: v.number(),
    sourceKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ingestions")
      .withIndex("by_source", (q) => q.eq("sourceKey", args.sourceKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        reportName: args.reportName,
        capturedAt: args.capturedAt,
        rowCount: 0,
      });
      return { ingestionId: existing._id, replaced: true };
    }

    const ingestionId = await ctx.db.insert("ingestions", {
      reportName: args.reportName,
      capturedAt: args.capturedAt,
      sourceKey: args.sourceKey,
      rowCount: 0,
    });
    return { ingestionId, replaced: false };
  },
});

export const clearRowsBatch = internalMutation({
  args: {
    ingestionId: v.id("ingestions"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reportRows")
      .withIndex("by_ingestion", (q) => q.eq("ingestionId", args.ingestionId))
      .take(args.limit);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});

export const processRowsBatch = internalMutation({
  args: {
    ingestionId: v.id("ingestions"),
    reportName: v.string(),
    capturedAt: v.number(),
    targetTable: v.string(),
    rows: v.array(rowInput),
  },
  handler: async (ctx, args) => {
    const stats: Stats = { inserted: 0, updated: 0, unchanged: 0 };
    const TABLE_CONFIG = {
      appointments: "appointments",
      patientRecalls: "patientRecalls",
      activePatients: "activePatients",
      salesByIncomeAccount: "salesByIncomeAccount",
    } as const;

    const targetTable = args.targetTable as keyof typeof TABLE_CONFIG;
    const tableName = TABLE_CONFIG[targetTable];
    if (!tableName) {
      throw new Error(`Unsupported target table '${args.targetTable}'.`);
    }

    for (const row of args.rows) {
      const rowData = { ...row.data };
      const uniqueKey = rowData.__uniqueKey;
      if (uniqueKey) {
        delete rowData.__uniqueKey;
      }
      const patientIdValue = extractPatientIdForTable(targetTable, rowData);

      await ctx.db.insert("reportRows", {
        ingestionId: args.ingestionId,
        reportName: args.reportName,
        rowIndex: row.rowIndex,
        data: rowData,
      });

      if (!uniqueKey) {
        continue;
      }

      const existing = await ctx.db
        .query(tableName as any)
        .withIndex("by_unique", (q) => q.eq("uniqueKey", uniqueKey))
        .first();

      if (!existing) {
        await ctx.db.insert(tableName as any, {
          uniqueKey,
          reportName: args.reportName,
          patientId: patientIdValue,
          data: rowData,
          firstCapturedAt: args.capturedAt,
          lastCapturedAt: args.capturedAt,
          lastIngestionId: args.ingestionId,
        });
        stats.inserted += 1;
        continue;
      }

      const existingSignature = canonicalize(existing.data);
      const incomingSignature = canonicalize(rowData);
      if (existingSignature !== incomingSignature) {
        await ctx.db.patch(existing._id, {
          reportName: args.reportName,
          patientId: patientIdValue,
          data: rowData,
          lastCapturedAt: args.capturedAt,
          lastIngestionId: args.ingestionId,
        });
        stats.updated += 1;
      } else {
        await ctx.db.patch(existing._id, {
          reportName: args.reportName,
          patientId: patientIdValue ?? existing.patientId,
          lastCapturedAt: args.capturedAt,
          lastIngestionId: args.ingestionId,
        });
        stats.unchanged += 1;
      }
    }

    return stats;
  },
});

export const finalizeIngestion = internalMutation({
  args: {
    ingestionId: v.id("ingestions"),
    capturedAt: v.number(),
    rowCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ingestionId, {
      capturedAt: args.capturedAt,
      rowCount: args.rowCount,
    });
  },
});
