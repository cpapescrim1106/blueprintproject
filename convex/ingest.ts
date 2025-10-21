import { mutation } from "./_generated/server";
import { v } from "convex/values";

const rowInput = v.object({
  rowIndex: v.number(),
  data: v.record(v.string(), v.string()),
});

export const ingestReport = mutation({
  args: {
    reportName: v.string(),
    capturedAt: v.number(),
    sourceKey: v.string(),
    rows: v.array(rowInput),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ingestions")
      .withIndex("by_source", (q) => q.eq("sourceKey", args.sourceKey))
      .first();

    if (existing) {
      const existingRows = await ctx.db
        .query("reportRows")
        .withIndex("by_ingestion", (q) => q.eq("ingestionId", existing._id))
        .collect();
      await Promise.all(existingRows.map((row) => ctx.db.delete(row._id)));
      await ctx.db.delete(existing._id);
    }

    const ingestionId = await ctx.db.insert("ingestions", {
      reportName: args.reportName,
      capturedAt: args.capturedAt,
      sourceKey: args.sourceKey,
      rowCount: args.rows.length,
    });

    for (const row of args.rows) {
      await ctx.db.insert("reportRows", {
        ingestionId,
        reportName: args.reportName,
        rowIndex: row.rowIndex,
        data: row.data,
      });
    }

    return ingestionId;
  },
});
