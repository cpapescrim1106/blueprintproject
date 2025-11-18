import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { calculatePhScore } from "@/lib/patientScore";
import {
  JsonRecord,
  MS_PER_DAY,
  MS_PER_WEEK,
  composeNameKey,
  extractPatientAge,
  extractThirdPartyBenefit,
  parseCurrency,
  parseMmDdYyyy,
  startOfWeekMonday,
  toRecord,
} from "./utils";

const DEFAULT_APPOINTMENT_REPORT = "Referral Source - Appointments";

const serializeJson = (value: Prisma.JsonValue): JsonRecord => toRecord(value);

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
  return new Date(ms).toISOString();
};

const categorizeRecallStatus = (data: Record<string, string>): RecallStatusKey => {
  const completedDate = parseMmDdYyyy((data["Completed Date"] ?? "").trim());
  const nextAppointment = parseMmDdYyyy(
    (data["Next appointment"] ?? "").trim(),
  );
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

export async function listIngestions({
  reportName,
  limit = 100,
}: {
  reportName?: string;
  limit?: number;
}) {
  const rows = await prisma.ingestion.findMany({
    where: reportName ? { reportName } : undefined,
    orderBy: { capturedAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    reportName: row.reportName,
    capturedAt: Number(row.capturedAt),
    sourceKey: row.sourceKey,
    rowCount: row.rowCount,
  }));
}

export async function getRowsForIngestion({
  ingestionId,
  limit = 1000,
}: {
  ingestionId: number;
  limit?: number;
}) {
  const rows = await prisma.reportRow.findMany({
    where: { ingestionId },
    orderBy: { rowIndex: "asc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    ingestionId: row.ingestionId,
    reportName: row.reportName,
    rowIndex: row.rowIndex,
    data: serializeJson(row.data),
  }));
}

export async function activePatientsKpi() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayMs = now.getTime();
  const seen = new Set<string>();

  const appointments = await prisma.appointment.findMany();
  for (const record of appointments) {
    const data = serializeJson(record.data);
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
}

type AppointmentBucket = {
  weekStart: number;
  weekEnd: number;
  completedCount: number;
  createdCount: number;
};

export async function weeklyAppointmentSummary({
  reportName = DEFAULT_APPOINTMENT_REPORT,
  weeks = 15,
}: {
  reportName?: string;
  weeks?: number;
}) {
  const maxWeeks = Math.max(1, Math.min(weeks, 52));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = startOfWeekMonday(today.getTime());

  const buckets = new Map<number, AppointmentBucket>();
  for (let i = maxWeeks - 1; i >= 0; i--) {
    const weekStart = currentWeekStart - i * MS_PER_WEEK;
    buckets.set(weekStart, {
      weekStart,
      weekEnd: weekStart + MS_PER_WEEK,
      completedCount: 0,
      createdCount: 0,
    });
  }

  const appointments = await prisma.appointment.findMany({
    where: { reportName },
  });

  const incrementBucket = (
    dateMs: number | null,
    field: keyof Pick<AppointmentBucket, "completedCount" | "createdCount">,
  ) => {
    if (dateMs === null) {
      return;
    }
    const weekStart = startOfWeekMonday(dateMs);
    const bucket = buckets.get(weekStart);
    if (bucket) {
      bucket[field] += 1;
    }
  };

  for (const record of appointments) {
    const data = serializeJson(record.data);
    const completedDate = parseMmDdYyyy(
      (data["Appt. date"] ?? "").toString().trim(),
    );
    const createdDate = parseMmDdYyyy(
      (data["Created date"] ?? "").toString().trim(),
    );
    const status = (data["Status"] ?? "").toLowerCase();
    if (status === "complete") {
      incrementBucket(completedDate, "completedCount");
    }
    incrementBucket(createdDate, "createdCount");
  }

  return Array.from(buckets.values()).map((bucket) => ({
    weekStart: bucket.weekStart,
    weekEnd: bucket.weekEnd,
    completed: bucket.completedCount,
    created: bucket.createdCount,
    gap: bucket.createdCount - bucket.completedCount,
  }));
}

export async function completedAppointmentsByYear({
  onlyNewPatients = false,
}: {
  onlyNewPatients?: boolean;
}) {
  const appointments = await prisma.appointment.findMany({
    where: { reportName: DEFAULT_APPOINTMENT_REPORT },
  });

  const yearBuckets = new Map<number, Map<number, number>>();
  let maxMonthIndex = 0;

  for (const row of appointments) {
    const data = serializeJson(row.data);
    const status = (data["Status"] ?? "").toString().trim().toLowerCase();
    if (status !== "complete" && status !== "completed") {
      continue;
    }

    const apptDate = (data["Appt. date"] ?? "").toString().trim();
    const apptMs = apptDate ? parseMmDdYyyy(apptDate) : null;
    if (apptMs === null) {
      continue;
    }
    const appt = new Date(apptMs);
    const year = appt.getFullYear();
    const monthIndex = appt.getMonth();

    if (onlyNewPatients) {
      const appointmentTypeRaw =
        data["Appointment type"] ??
        data["Appointment Type"] ??
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
}

export async function quarterlySalesSummary() {
  const rows = await prisma.salesByIncomeAccount.findMany();
  const yearTotals = new Map<number, Map<number, number>>();

  for (const row of rows) {
    const data = serializeJson(row.data);
    const dateStr = (data["Date"] ?? "").toString().trim();
    const revenueStr = (data["Revenue"] ?? data["Amount"] ?? "")
      .toString()
      .trim();

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
    const quarter = Math.floor(date.getMonth() / 3) + 1;

    if (!yearTotals.has(year)) {
      yearTotals.set(year, new Map<number, number>());
    }
    const quarterMap = yearTotals.get(year)!;
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
}

export async function recallOverview({
  reportName = "Patient Recalls",
}: {
  reportName?: string;
} = {}) {
  const rows = await prisma.patientRecall.findMany({
    where: { reportName },
  });

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
    const data = serializeJson(row.data);
    const statusKey = categorizeRecallStatus(data);
    statusCounts[statusKey] += 1;

    const recallDateMs = toMs(data["Recall date"]);
    if (
      recallDateMs !== null &&
      statusKey !== "completed" &&
      statusKey !== "canceled"
    ) {
      if (recallDateMs < todayMs) {
        const bucket = assignBucket(
          (todayMs - recallDateMs) / MS_PER_DAY,
          BUCKETS_OVERDUE,
        );
        overdueBuckets.set(bucket, (overdueBuckets.get(bucket) ?? 0) + 1);
      } else {
        const bucket = assignBucket(
          (recallDateMs - todayMs) / MS_PER_DAY,
          BUCKETS_UPCOMING,
        );
        upcomingBuckets.set(bucket, (upcomingBuckets.get(bucket) ?? 0) + 1);
      }
    }

    const dueDate = toMs(data["Recall date"]);
    const completedDate = toMs(data["Completed Date"]);
    if (dueDate !== null && completedDate !== null) {
      const diff = Math.max(
        0,
        Math.round((completedDate - dueDate) / MS_PER_DAY),
      );
      actionSamples.push(diff);
      const bucket = assignBucket(diff, BUCKETS_ACTION);
      actionBuckets.set(bucket, (actionBuckets.get(bucket) ?? 0) + 1);
    }
  }

  const totalRecalls = rows.length;

  const overdueSeries = BUCKETS_OVERDUE.map((bucket) => ({
    key: bucket.key,
    label:
      {
        "1-14": "1–14 days",
        "15-30": "15–30 days",
        "31-60": "31–60 days",
        "61+": "61+ days",
      }[bucket.key] ?? bucket.key,
    count: overdueBuckets.get(bucket.key) ?? 0,
  }));

  const upcomingSeries = BUCKETS_UPCOMING.map((bucket) => ({
    key: bucket.key,
    label:
      {
        "0-30": "0–30 days",
        "31-60": "31–60 days",
        "61-90": "61–90 days",
        "90+": "90+ days",
      }[bucket.key] ?? bucket.key,
    count: upcomingBuckets.get(bucket.key) ?? 0,
  }));

  const timeToActionSeries = BUCKETS_ACTION.map((bucket) => ({
    key: bucket.key,
    label:
      {
        "0-7": "0–7 days",
        "8-30": "8–30 days",
        "31-60": "31–60 days",
        "60+": "60+ days",
      }[bucket.key] ?? bucket.key,
    count: actionBuckets.get(bucket.key) ?? 0,
  }));

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
}

export async function recallPatientDetails({
  reportName = "Patient Recalls",
  limit = 500,
}: {
  reportName?: string;
  limit?: number;
} = {}) {
  const recalls = await prisma.patientRecall.findMany({
    where: { reportName },
    orderBy: { lastCapturedAt: "desc" },
    take: limit,
  });

  const recallData = recalls.map((row) => ({
    id: row.id,
    reportName: row.reportName,
    data: serializeJson(row.data),
  }));

  const patientIds = new Set<string>();
  for (const recall of recallData) {
    const patientId = (recall.data["Patient ID"] ?? "").toString().trim();
    if (patientId) {
      patientIds.add(patientId);
    }
  }

  const patientIdList = Array.from(patientIds);

  const appointmentDocs = await prisma.appointment.findMany({
    where: {
      patientId: {
        in: patientIdList.filter((id) => !!id),
      },
    },
  });

  const appointmentMetrics = new Map<
    string,
    {
      lastCompletedMs: number | null;
      completedCount: number;
      createdWithinWindow: number;
    }
  >();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const createdWindowStart = today.getTime() - 730 * MS_PER_DAY;

  for (const doc of appointmentDocs) {
    const patientId = doc.patientId;
    if (!patientId) {
      continue;
    }
    const data = serializeJson(doc.data);
    if (!appointmentMetrics.has(patientId)) {
      appointmentMetrics.set(patientId, {
        lastCompletedMs: null,
        completedCount: 0,
        createdWithinWindow: 0,
      });
    }
    const metrics = appointmentMetrics.get(patientId)!;
    const status = (data["Status"] ?? "").toString().trim().toLowerCase();
    if (status === "completed") {
      const apptMs = toMs((data["Appt. date"] ?? "").toString());
      if (apptMs !== null) {
        metrics.completedCount += 1;
        if (
          metrics.lastCompletedMs === null ||
          apptMs > metrics.lastCompletedMs
        ) {
          metrics.lastCompletedMs = apptMs;
        }
      }
    }
    const createdDateRaw = (
      data["Created date"] ??
      data["Created Date"] ??
      ""
    ).toString();
    const createdMs = toMs(createdDateRaw);
    if (createdMs !== null && createdMs >= createdWindowStart) {
      metrics.createdWithinWindow += 1;
    }
  }

  const salesDocs = await prisma.salesByIncomeAccount.findMany({
    where: {
      patientId: {
        in: patientIdList.filter((id) => !!id),
      },
    },
  });
  const salesSummary = new Map<
    string,
    { totalRevenue: number; lastSaleMs: number | null }
  >();
  for (const sale of salesDocs) {
    const patientId = sale.patientId;
    if (!patientId) {
      continue;
    }
    const data = serializeJson(sale.data);
    if (!salesSummary.has(patientId)) {
      salesSummary.set(patientId, { totalRevenue: 0, lastSaleMs: null });
    }
    const summary = salesSummary.get(patientId)!;
    const revenue = parseCurrency((data["Revenue"] ?? "").toString());
    if (revenue !== null) {
      summary.totalRevenue += revenue;
    }
    const saleMs = toMs((data["Date"] ?? "").toString());
    if (saleMs !== null) {
      if (summary.lastSaleMs === null || saleMs > summary.lastSaleMs) {
        summary.lastSaleMs = saleMs;
      }
    }
  }

  const activeRecords = await prisma.activePatient.findMany({
    where: {
      OR: [
        { patientId: { in: patientIdList.filter((id) => !!id) } },
        { reportName: "All Active Patients" },
      ],
    },
  });
  const activeByPatientId = new Map<string, JsonRecord>();
  const activeByNameKey = new Map<string, JsonRecord>();

  for (const record of activeRecords) {
    const data = serializeJson(record.data);
    const patientId = record.patientId ?? data["Patient ID"] ?? "";
    if (patientId) {
      activeByPatientId.set(patientId, data);
    }
    const firstName = (data["First Name"] ?? "").toString().trim();
    const lastName = (data["Last Name"] ?? "").toString().trim();
    const combinedName = `${firstName} ${lastName}`.trim();
    const patientField = (data["Patient"] ?? "").toString();
    const nameKey = composeNameKey(
      combinedName || patientField,
      data["Location"],
    );
    if (nameKey) {
      activeByNameKey.set(nameKey, data);
    }
  }

  const todayMs = today.getTime();
  const details = recallData.map((recall) => {
    const data = recall.data;
    const patientId = (data["Patient ID"] ?? "").toString().trim();
    const patientName = (data["Patient"] ?? "").toString().trim();
    const location = (data["Location"] ?? "").toString().trim();
    const recallDateMs = toMs((data["Recall date"] ?? "").toString());
    const recallStatusKey = categorizeRecallStatus(data);
    const recallType = (data["Recall type"] ?? "").toString().trim();
    const assignee = (data["Assignee"] ?? "").toString().trim();
    const outcome = (data["Outcome"] ?? "").toString().trim();
    const notes = (data["Notes"] ?? "").toString().trim();
    const nextAppointment = toMs((data["Next appointment"] ?? "").toString());
    const followUp = toMs((data["Follow-up date"] ?? "").toString());
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

    const appointmentInfo = appointmentMetrics.get(patientId) ?? {
      lastCompletedMs: null,
      completedCount: 0,
      createdWithinWindow: 0,
    };
    const salesInfo = salesSummary.get(patientId) ?? {
      totalRevenue: 0,
      lastSaleMs: null,
    };

    let activeRecord = patientId ? activeByPatientId.get(patientId) : undefined;
    if (!activeRecord) {
      const nameKey = composeNameKey(patientName, location);
      if (nameKey) {
        activeRecord = activeByNameKey.get(nameKey);
      }
    }
    const patientAgeYears = extractPatientAge(activeRecord);
    const benefitAmount = extractThirdPartyBenefit(activeRecord, data);

    let deviceAgeDays: number | null = null;
    let deviceAgeYears: number | null = null;
    if (salesInfo.lastSaleMs !== null) {
      deviceAgeDays = Math.max(
        0,
        Math.round((todayMs - salesInfo.lastSaleMs) / MS_PER_DAY),
      );
      deviceAgeYears = Number(
        ((todayMs - salesInfo.lastSaleMs) / (MS_PER_DAY * 365)).toFixed(1),
      );
    }

    const phScoreResult = calculatePhScore({
      patientAgeYears,
      deviceAgeYears,
      appointmentsCreated24M: appointmentInfo.createdWithinWindow,
      lastAppointmentCompletedMs: appointmentInfo.lastCompletedMs,
      thirdPartyBenefitAmount: benefitAmount,
      accountValue: salesInfo.totalRevenue,
    });

    return {
      id: recall.id,
      reportName: recall.reportName,
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
      nextAppointmentIso: formatIsoDate(nextAppointment),
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
        createdLast24Months: appointmentInfo.createdWithinWindow,
      },
      salesSummary: {
        totalRevenue: salesInfo.totalRevenue,
        lastSaleMs: salesInfo.lastSaleMs,
        lastSaleIso: formatIsoDate(salesInfo.lastSaleMs),
        deviceAgeDays,
        deviceAgeYears,
      },
      patientAgeYears,
      thirdPartyBenefitAmount: benefitAmount,
      phScore: phScoreResult.total,
      phScoreBreakdown: phScoreResult.components,
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
}

export async function agenda({
  days = 5,
  startDateIso,
}: {
  days?: number;
  startDateIso?: string;
}) {
  const limitDays = Math.min(Math.max(days, 1), 14);
  const startDate = startDateIso ? new Date(startDateIso) : new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + limitDays * MS_PER_DAY);

  const appointments = await prisma.appointment.findMany({
    where: { reportName: DEFAULT_APPOINTMENT_REPORT },
  });

  const buildEntry = (record: JsonRecord) => {
    const patientId = (record["Patient ID"] ?? "").toString().trim();
    const patientName = (record["Patient"] ?? "").toString().trim();
    const location = (record["Location"] ?? "").toString().trim();
    const status = (record["Status"] ?? "").toString().trim();
    const appointmentDate = (record["Appt. date"] ?? "").toString().trim();
    const appointmentTime =
      (record["Appt. time"] ??
        record["Appt. Time"] ??
        record["Time"] ??
        "").toString();
    const appointmentMs = parseMmDdYyyy(appointmentDate);
    let appointmentIso: string | null = null;
    if (appointmentMs !== null) {
      const date = new Date(appointmentMs);
      if (appointmentTime) {
        const timeMatch = appointmentTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (timeMatch) {
          let hour = Number(timeMatch[1]);
          const minute = Number(timeMatch[2]);
          const period = timeMatch[3]?.toUpperCase();
          if (period === "PM" && hour < 12) {
            hour += 12;
          }
          if (period === "AM" && hour === 12) {
            hour = 0;
          }
          date.setHours(hour, minute, 0, 0);
        }
      }
      appointmentIso = date.toISOString();
    }

    const phoneColumns = [
      "Home phone",
      "Home Phone",
      "Work phone",
      "Work Phone",
      "Mobile phone",
      "Mobile Phone",
    ];
    const phoneNumbers = phoneColumns
      .map((column) => (record[column] ?? "").toString().trim())
      .filter((value) => value);

    return {
      patientId: patientId || null,
      patientName: patientName || null,
      location: location || null,
      appointmentIso,
      appointmentMs,
      status: status || null,
      phoneNumbers,
    };
  };

  const agendaEntries = appointments
    .map((doc) => buildEntry(serializeJson(doc.data)))
    .filter(
      (entry) =>
        entry.appointmentMs !== null &&
        entry.appointmentMs >= startDate.getTime() &&
        entry.appointmentMs < endDate.getTime(),
    )
    .sort((a, b) => {
      const aMs = a.appointmentMs ?? Number.MAX_SAFE_INTEGER;
      const bMs = b.appointmentMs ?? Number.MAX_SAFE_INTEGER;
      return aMs - bMs;
    });

  const byDate = new Map<string, typeof agendaEntries>();
  for (const entry of agendaEntries) {
    const key = entry.appointmentIso
      ? entry.appointmentIso.slice(0, 10)
      : "unknown";
    if (!byDate.has(key)) {
      byDate.set(key, []);
    }
    byDate.get(key)!.push(entry);
  }

  const daysList = [];
  for (let offset = 0; offset < limitDays; offset++) {
    const day = new Date(startDate.getTime() + offset * MS_PER_DAY);
    const key = day.toISOString().slice(0, 10);
    daysList.push({
      dateIso: day.toISOString(),
      label: day.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
      entries: byDate.get(key) ?? [],
    });
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    days: daysList,
  };
}
