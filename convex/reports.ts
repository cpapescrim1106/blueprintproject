import { query } from "./_generated/server";
import { v } from "convex/values";

const parseMmDdYyyy = (value: string): number | null => {
  const parts = value.split("/");
  if (parts.length !== 3) {
    return null;
  }
  const [monthStr, dayStr, yearStr] = parts;
  const month = Number(monthStr);
  const day = Number(dayStr);
  const year = Number(yearStr);
  if (
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getTime();
};

export const listIngestions = query({
  args: {
    reportName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const reportName = args.reportName;
    if (reportName) {
      return await ctx.db
        .query("ingestions")
        .withIndex("by_report_time", (q) =>
          q.eq("reportName", reportName),
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

export const activePatientsKpi = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayMs = now.getTime();
    const seen = new Set<string>();

    const appointments = await ctx.db.query("appointments").collect();
    for (const record of appointments) {
      const data = record.data;
      const status = (data["Status"] ?? "").toString().trim().toLowerCase();
      if (status !== "tentative") {
        continue;
      }

      const apptDate = (data["Appt. date"] ?? "").toString().trim();
      const patientId = (data["Patient ID"] ?? "").toString().trim();
      if (!apptDate || !patientId) {
        continue;
      }

      const apptMs = parseMmDdYyyy(apptDate);
      if (apptMs === null) {
        continue;
      }
      if (apptMs > todayMs) {
        seen.add(patientId);
      }
    }

    return { count: seen.size };
  },
});
