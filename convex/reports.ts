import { query } from "./_generated/server";
import { v } from "convex/values";

export const listIngestions = query({
  args: {
    reportName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    if (args.reportName) {
      return await ctx.db
        .query("ingestions")
        .withIndex("by_report_time", (q) =>
          q.eq("reportName", args.reportName),
        )
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("ingestions")
      .order("desc")
      .take(limit);
  },
});

export const getRowsForIngestion = query({
  args: {
    ingestionId: v.id("ingestions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 1000;
    return await ctx.db
      .query("reportRows")
      .withIndex("by_ingestion", (q) => q.eq("ingestionId", args.ingestionId))
      .order("asc")
      .take(limit);
  },
});
