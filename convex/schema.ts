import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ingestions: defineTable({
    reportName: v.string(),
    capturedAt: v.number(),
    sourceKey: v.string(),
    rowCount: v.number(),
  })
    .index("by_report_time", ["reportName", "capturedAt"])
    .index("by_source", ["sourceKey"]),
  reportRows: defineTable({
    ingestionId: v.id("ingestions"),
    reportName: v.string(),
    rowIndex: v.number(),
    data: v.record(v.string(), v.string()),
  })
    .index("by_ingestion", ["ingestionId"])
    .index("by_report", ["reportName"]),
  appointments: defineTable({
    uniqueKey: v.string(),
    reportName: v.string(),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"]),
  patientRecalls: defineTable({
    uniqueKey: v.string(),
    reportName: v.string(),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"]),
  activePatients: defineTable({
    uniqueKey: v.string(),
    reportName: v.string(),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"]),
  salesByIncomeAccount: defineTable({
    uniqueKey: v.string(),
    reportName: v.string(),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"]),
});
