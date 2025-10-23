import { query } from "./_generated/server";
import { v } from "convex/values";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = MS_PER_DAY * 7;

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

const parseCurrency = (value: string): number | null => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[^0-9.\-]/g, "");
  if (!normalized) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isNaN(amount) ? null : amount;
};

const startOfWeekMonday = (ms: number): number => {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // number of days to backtrack to Monday
  date.setDate(date.getDate() - diff);
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

export const weeklyAppointmentSummary = query({
  args: {
    reportName: v.optional(v.string()),
    weeks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const targetReport =
      args.reportName ?? "Referral Source - Appointments";
    const maxWeeks = Math.max(1, Math.min(args.weeks ?? 15, 52));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekStart = startOfWeekMonday(today.getTime());

    const buckets = new Map<
      number,
      {
        weekStart: number;
        weekEnd: number;
        completedCount: number;
        createdCount: number;
      }
    >();

    for (let i = maxWeeks - 1; i >= 0; i--) {
      const weekStart = currentWeekStart - i * MS_PER_WEEK;
      buckets.set(weekStart, {
        weekStart,
        weekEnd: weekStart + MS_PER_WEEK,
        completedCount: 0,
        createdCount: 0,
      });
    }

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_report", (q) => q.eq("reportName", targetReport))
      .collect();

    const incrementBucket = (
      dateMs: number | null,
      field: "completedCount" | "createdCount",
    ) => {
      if (dateMs === null) {
        return;
      }
      const bucketStart = startOfWeekMonday(dateMs);
      const bucket = buckets.get(bucketStart);
      if (!bucket) {
        return;
      }
      bucket[field] += 1;
    };

    for (const record of appointments) {
      const data = record.data;
      const status = (data["Status"] ?? "").toString().trim().toLowerCase();

      if (status === "completed") {
        const apptDate = (data["Appt. date"] ?? "").toString().trim();
        const apptMs = apptDate ? parseMmDdYyyy(apptDate) : null;
        incrementBucket(apptMs, "completedCount");
      }

      const createdDate = (data["Created date"] ?? "")
        .toString()
        .trim();
      const createdMs = createdDate ? parseMmDdYyyy(createdDate) : null;
      incrementBucket(createdMs, "createdCount");
    }

    const results = Array.from(buckets.values()).map((bucket) => ({
      weekStart: bucket.weekStart,
      weekEnd: bucket.weekEnd,
      completed: bucket.completedCount,
      created: bucket.createdCount,
      gap: bucket.createdCount - bucket.completedCount,
    }));

    results.sort((a, b) => a.weekStart - b.weekStart);
    return results;
  },
});

export const completedAppointmentsByYear = query({
  args: {
    reportName: v.optional(v.string()),
    minYear: v.optional(v.number()),
    maxYear: v.optional(v.number()),
    onlyNewPatients: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const targetReport =
      args.reportName ?? "Referral Source - Appointments";
    const onlyNewPatients = args.onlyNewPatients ?? false;

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_report", (q) => q.eq("reportName", targetReport))
      .collect();

    const yearBuckets = new Map<number, Map<number, number>>();
    let maxMonthIndex = 0;

    for (const record of appointments) {
      const data = record.data;
      const status = (data["Status"] ?? "").toString().trim().toLowerCase();
      if (status !== "completed") {
        continue;
      }

      const apptDate = (data["Appt. date"] ?? "").toString().trim();
      const apptMs = apptDate ? parseMmDdYyyy(apptDate) : null;
      if (apptMs === null) {
        continue;
      }

      const appt = new Date(apptMs);
      const year = appt.getFullYear();
      const monthIndex = appt.getMonth(); // 0 = January

      if (onlyNewPatients) {
        const appointmentTypeRaw =
          data["Appointment type"] ??
          data["Appointment Type"] ??
          data["Appointment Type "] ??
          data["Type"] ??
          "";
        const appointmentType = appointmentTypeRaw
          .toString()
          .toLowerCase()
          .trim();
        if (!appointmentType.includes("new patient")) {
          continue;
        }
      }

      if (args.minYear !== undefined && year < args.minYear) {
        continue;
      }
      if (args.maxYear !== undefined && year > args.maxYear) {
        continue;
      }

      let monthMap = yearBuckets.get(year);
      if (!monthMap) {
        monthMap = new Map<number, number>();
        yearBuckets.set(year, monthMap);
      }
      monthMap.set(monthIndex, (monthMap.get(monthIndex) ?? 0) + 1);
      if (monthIndex > maxMonthIndex) {
        maxMonthIndex = monthIndex;
      }
    }

    const series = Array.from(yearBuckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, monthMap]) => ({
        year,
        months: Array.from(monthMap.entries())
          .map(([monthIndex, count]) => ({
            monthIndex,
            count,
          }))
          .sort((a, b) => a.monthIndex - b.monthIndex),
      }));

    return {
      maxMonthIndex,
      series,
    };
  },
});

export const quarterlySalesSummary = query({
  args: {
    minYear: v.optional(v.number()),
    maxYear: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("salesByIncomeAccount")
      .collect();

    const yearTotals = new Map<number, Map<number, number>>();

    for (const record of rows) {
      const data = record.data;
      const dateStr = (data["Date"] ?? "").toString().trim();
      const revenueStr = (data["Revenue"] ?? "").toString().trim();

      if (!dateStr || !revenueStr) {
        continue;
      }

      const dateMs = parseMmDdYyyy(dateStr);
      if (dateMs === null) {
        continue;
      }

      const amount = parseCurrency(revenueStr);
      if (amount === null) {
        continue;
      }

      const date = new Date(dateMs);
      const year = date.getFullYear();
      if (args.minYear !== undefined && year < args.minYear) {
        continue;
      }
      if (args.maxYear !== undefined && year > args.maxYear) {
        continue;
      }
      const month = date.getMonth();
      const quarter = Math.floor(month / 3) + 1; // 1-4

      let quarterMap = yearTotals.get(year);
      if (!quarterMap) {
        quarterMap = new Map<number, number>();
        yearTotals.set(year, quarterMap);
      }
      quarterMap.set(quarter, (quarterMap.get(quarter) ?? 0) + amount);
    }

    const years = Array.from(yearTotals.keys()).sort((a, b) => a - b);
    if (years.length === 0) {
      return { years: [], quarters: [] };
    }

    const quarters = [1, 2, 3, 4].map((quarter) => {
      const row: Record<string, number | string> = {
        quarter,
        label: `Q${quarter}`,
      };
      for (const year of years) {
        const amount = yearTotals.get(year)?.get(quarter) ?? 0;
        row[year.toString()] = amount;
      }
      return row;
    });

    return {
      years,
      quarters,
    };
  },
});

type RecallStatusKey =
  | "new"
  | "contacted"
  | "scheduled"
  | "completed"
  | "canceled";

const statusOrder: RecallStatusKey[] = [
  "new",
  "contacted",
  "scheduled",
  "completed",
  "canceled",
];

const recallStatusLabels: Record<RecallStatusKey, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  completed: "Completed",
  canceled: "Canceled",
};

const BUCKETS_OVERDUE = [
  { key: "1-14", min: 1, max: 14 },
  { key: "15-30", min: 15, max: 30 },
  { key: "31-60", min: 31, max: 60 },
  { key: "61+", min: 61, max: Number.POSITIVE_INFINITY },
];

const BUCKETS_UPCOMING = [
  { key: "0-30", min: 0, max: 30 },
  { key: "31-60", min: 31, max: 60 },
  { key: "61-90", min: 61, max: 90 },
  { key: "90+", min: 91, max: Number.POSITIVE_INFINITY },
];

const BUCKETS_ACTION = [
  { key: "0-7", min: 0, max: 7 },
  { key: "8-30", min: 8, max: 30 },
  { key: "31-60", min: 31, max: 60 },
  { key: "60+", min: 61, max: Number.POSITIVE_INFINITY },
];

const categorizeRecallStatus = (data: Record<string, string>): RecallStatusKey => {
  const completedDate = parseMmDdYyyy((data["Completed Date"] ?? "").trim());
  const nextAppointment = parseMmDdYyyy((data["Next appointment"] ?? "").trim());
  const outcome = (data["Outcome"] ?? "").toLowerCase().trim();
  const recallStatus = (data["Recall status"] ?? "").toLowerCase().trim();

  if (completedDate !== null || outcome.includes("completed")) {
    return "completed";
  }
  if (outcome.includes("cancel")) {
    return "canceled";
  }
  if (nextAppointment !== null || recallStatus.includes("schedule")) {
    return "scheduled";
  }
  if (
    recallStatus.includes("left message") ||
    recallStatus.includes("contacted") ||
    recallStatus.includes("hold") ||
    recallStatus.includes("open")
  ) {
    return "contacted";
  }
  if (outcome.includes("left message") || outcome.includes("contacted")) {
    return "contacted";
  }
  return "new";
};

const assignBucket = (
  days: number,
  buckets: { key: string; min: number; max: number }[],
) => {
  const normalized = Math.max(0, Math.floor(days));
  for (const bucket of buckets) {
    if (normalized >= bucket.min && normalized <= bucket.max) {
      return bucket.key;
    }
  }
  return buckets[buckets.length - 1]?.key ?? "other";
};

const median = (values: number[]): number | null => {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
};

export const recallOverview = query({
  args: {
    reportName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const targetReport = args.reportName ?? "Patient Recalls";
    const rows = await ctx.db
      .query("patientRecalls")
      .withIndex("by_report", (q) => q.eq("reportName", targetReport))
      .collect();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const statusCounts: Record<RecallStatusKey, number> = {
      new: 0,
      contacted: 0,
      scheduled: 0,
      completed: 0,
      canceled: 0,
    };

    const overdueBuckets = new Map<string, number>();
    const upcomingBuckets = new Map<string, number>();
    const actionBuckets = new Map<string, number>();
    const actionSamples: number[] = [];

    for (const row of rows) {
      const data = row.data;
      const status = categorizeRecallStatus(data);
      statusCounts[status] += 1;

      const recallDateStr = (data["Recall date"] ?? "").trim();
      const recallMs = recallDateStr ? parseMmDdYyyy(recallDateStr) : null;
      const completedMs = parseMmDdYyyy((data["Completed Date"] ?? "").trim());

      if (status === "completed" && recallMs !== null) {
        const completionSource =
          completedMs ??
          parseMmDdYyyy((data["Next appointment"] ?? "").trim()) ??
          null;
        if (completionSource !== null) {
          const deltaDays = Math.max(
            0,
            Math.round((completionSource - recallMs) / MS_PER_DAY),
          );
          const bucketKey = assignBucket(deltaDays, BUCKETS_ACTION);
          actionBuckets.set(bucketKey, (actionBuckets.get(bucketKey) ?? 0) + 1);
          actionSamples.push(deltaDays);
        }
      }

      const isActive =
        status !== "completed" && status !== "canceled";
      if (!isActive || recallMs === null) {
        continue;
      }

      if (recallMs < todayMs) {
        const overdueDays = Math.max(
          1,
          Math.round((todayMs - recallMs) / MS_PER_DAY),
        );
        const bucketKey = assignBucket(overdueDays, BUCKETS_OVERDUE);
        overdueBuckets.set(bucketKey, (overdueBuckets.get(bucketKey) ?? 0) + 1);
      } else {
        const leadDays = Math.max(
          0,
          Math.round((recallMs - todayMs) / MS_PER_DAY),
        );
        const bucketKey = assignBucket(leadDays, BUCKETS_UPCOMING);
        upcomingBuckets.set(bucketKey, (upcomingBuckets.get(bucketKey) ?? 0) + 1);
      }
    }

    const buildSeries = (
      buckets: { key: string; min: number; max: number }[],
      counts: Map<string, number>,
      labels: Record<string, string>,
    ) =>
      buckets.map((bucket) => ({
        key: bucket.key,
        label: labels[bucket.key] ?? bucket.key,
        count: counts.get(bucket.key) ?? 0,
      }));

    const overdueSeries = buildSeries(
      BUCKETS_OVERDUE,
      overdueBuckets,
      {
        "1-14": "1–14 days",
        "15-30": "15–30 days",
        "31-60": "31–60 days",
        "61+": "61+ days",
      },
    );

    const upcomingSeries = buildSeries(
      BUCKETS_UPCOMING,
      upcomingBuckets,
      {
        "0-30": "Next 30 days",
        "31-60": "31–60 days",
        "61-90": "61–90 days",
        "90+": "90+ days",
      },
    );

    const timeToActionSeries = buildSeries(
      BUCKETS_ACTION,
      actionBuckets,
      {
        "0-7": "0–7 days",
        "8-30": "8–30 days",
        "31-60": "31–60 days",
        "60+": "60+ days",
      },
    );

    const totalRecalls = rows.length;
    return {
      totalRecalls,
      statuses: statusOrder.map((key) => ({
        key,
        label: recallStatusLabels[key],
        count: statusCounts[key],
      })),
      overdue: overdueSeries,
      upcoming: upcomingSeries,
      timeToAction: {
        series: timeToActionSeries,
        medianDays: median(actionSamples),
      },
    };
  },
});

const toMs = (dateStr: string | undefined | null): number | null => {
  if (!dateStr) {
    return null;
  }
  return parseMmDdYyyy(dateStr.trim());
};

const formatIsoDate = (ms: number | null): string | null => {
  if (ms === null) {
    return null;
  }
  const date = new Date(ms);
  return date.toISOString();
};

export const recallPatientDetails = query({
  args: {
    reportName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const targetReport = args.reportName ?? "Patient Recalls";
    const limit = args.limit ?? 500;

    const recalls = await ctx.db
      .query("patientRecalls")
      .withIndex("by_report", (q) => q.eq("reportName", targetReport))
      .take(limit);

    const patientIds = new Set<string>();
    for (const recall of recalls) {
      const patientId = (recall.data["Patient ID"] ?? "").toString().trim();
      if (patientId) {
        patientIds.add(patientId);
      }
    }

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_report", (q) =>
        q.eq("reportName", "Referral Source - Appointments"),
      )
      .collect();

    const sales = await ctx.db
      .query("salesByIncomeAccount")
      .collect();

    const appointmentSummary = new Map<
      string,
      { lastCompletedMs: number | null; completedCount: number }
    >();

    for (const appointment of appointments) {
      const data = appointment.data;
      const status = (data["Status"] ?? "").toString().trim().toLowerCase();
      if (status !== "completed") {
        continue;
      }
      const patientId = (data["Patient ID"] ?? "").toString().trim();
      if (!patientId || !patientIds.has(patientId)) {
        continue;
      }
      const apptMs = toMs((data["Appt. date"] ?? "").toString());
      if (apptMs === null) {
        continue;
      }
      const summary =
        appointmentSummary.get(patientId) ?? {
          lastCompletedMs: null,
          completedCount: 0,
        };
      summary.completedCount += 1;
      if (summary.lastCompletedMs === null || apptMs > summary.lastCompletedMs) {
        summary.lastCompletedMs = apptMs;
      }
      appointmentSummary.set(patientId, summary);
    }

    const salesSummary = new Map<
      string,
      { totalRevenue: number; lastSaleMs: number | null }
    >();
    for (const sale of sales) {
      const data = sale.data;
      const patientId = (data["Patient ID"] ?? "").toString().trim();
      if (!patientId || !patientIds.has(patientId)) {
        continue;
      }
      const revenue = parseCurrency((data["Revenue"] ?? "").toString());
      if (revenue === null) {
        continue;
      }
      const saleMs = toMs((data["Date"] ?? "").toString());
      const summary =
        salesSummary.get(patientId) ?? {
          totalRevenue: 0,
          lastSaleMs: null,
        };
      summary.totalRevenue += revenue;
      if (saleMs !== null) {
        if (summary.lastSaleMs === null || saleMs > summary.lastSaleMs) {
          summary.lastSaleMs = saleMs;
        }
      }
      salesSummary.set(patientId, summary);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const details = recalls.map((recall) => {
      const data = recall.data;
      const patientId = (data["Patient ID"] ?? "").toString().trim();
      const patientName = (data["Patient"] ?? "").toString().trim();
      const recallDateMs = toMs((data["Recall date"] ?? "").toString());
      const recallStatusKey = categorizeRecallStatus(data);
      const recallType = (data["Recall type"] ?? "").toString().trim();
      const assignee = (data["Assignee"] ?? "").toString().trim();
      const outcome = (data["Outcome"] ?? "").toString().trim();
      const notes = (data["Notes"] ?? "").toString().trim();
      const nextAppointment = toMs((data["Next appointment"] ?? "").toString());
      const followUp = toMs((data["Follow-up date"] ?? "").toString());
      const location = (data["Location"] ?? "").toString().trim();
      const mobilePhone = (data["Mobile phone"] ?? "").toString().trim();
      const homePhone = (data["Home phone"] ?? "").toString().trim();
      const workPhone = (data["Work phone"] ?? "").toString().trim();

      let overdueDays: number | null = null;
      let daysUntil: number | null = null;
      if (
        recallDateMs !== null &&
        recallStatusKey !== "completed" &&
        recallStatusKey !== "canceled"
      ) {
        if (recallDateMs < todayMs) {
          overdueDays = Math.max(
            1,
            Math.round((todayMs - recallDateMs) / MS_PER_DAY),
          );
        } else {
          daysUntil = Math.round((recallDateMs - todayMs) / MS_PER_DAY);
        }
      }

      const appointmentInfo = appointmentSummary.get(patientId) ?? {
        lastCompletedMs: null,
        completedCount: 0,
      };
      const salesInfo = salesSummary.get(patientId) ?? {
        totalRevenue: 0,
        lastSaleMs: null,
      };

      const deviceAgeDays =
        salesInfo.lastSaleMs !== null
          ? Math.max(
              0,
              Math.round((todayMs - salesInfo.lastSaleMs) / MS_PER_DAY),
            )
          : null;

      return {
        patientId,
        patientName,
        location,
        recallDateMs,
        recallDateIso: formatIsoDate(recallDateMs),
        recallType,
        recallStatusKey,
        recallStatusLabel: recallStatusLabels[recallStatusKey],
        assignee,
        outcome,
        notes,
        nextAppointmentMs: nextAppointment,
        nextAppointmentIso: formatIsoDate(nextAppointment),
        followUpMs: followUp,
        followUpIso: formatIsoDate(followUp),
        mobilePhone,
        homePhone,
        workPhone,
        overdueDays,
        daysUntil,
        appointmentSummary: {
          completedCount: appointmentInfo.completedCount,
          lastCompletedMs: appointmentInfo.lastCompletedMs,
          lastCompletedIso: formatIsoDate(appointmentInfo.lastCompletedMs),
        },
        salesSummary: {
          totalRevenue: salesInfo.totalRevenue,
          lastSaleMs: salesInfo.lastSaleMs,
          lastSaleIso: formatIsoDate(salesInfo.lastSaleMs),
          deviceAgeDays,
        },
      };
    });

    details.sort((a, b) => {
      const aDate = a.recallDateMs ?? Number.MAX_SAFE_INTEGER;
      const bDate = b.recallDateMs ?? Number.MAX_SAFE_INTEGER;
      if (aDate !== bDate) {
        return aDate - bDate;
      }
      return a.patientName.localeCompare(b.patientName);
    });

    return details;
  },
});
