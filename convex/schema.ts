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
    patientId: v.optional(v.string()),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"])
    .index("by_patient", ["patientId"]),
  patientRecalls: defineTable({
    uniqueKey: v.string(),
    reportName: v.string(),
    patientId: v.optional(v.string()),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"])
    .index("by_patient", ["patientId"]),
  activePatients: defineTable({
    uniqueKey: v.string(),
    reportName: v.string(),
    patientId: v.optional(v.string()),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"])
    .index("by_patient", ["patientId"]),
  salesByIncomeAccount: defineTable({
    uniqueKey: v.string(),
    reportName: v.string(),
    patientId: v.optional(v.string()),
    data: v.record(v.string(), v.string()),
    firstCapturedAt: v.number(),
    lastCapturedAt: v.number(),
    lastIngestionId: v.id("ingestions"),
  })
    .index("by_unique", ["uniqueKey"])
    .index("by_report", ["reportName"])
    .index("by_patient", ["patientId"]),
  messageThreads: defineTable({
    patientId: v.optional(v.string()),
    patientName: v.optional(v.string()),
    normalizedPhone: v.string(),
    displayPhone: v.optional(v.string()),
    location: v.optional(v.string()),
    phScore: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    lastMessageAt: v.number(),
    lastMessageSnippet: v.optional(v.string()),
    lastOutboundStatus: v.optional(v.string()),
    lastOutboundAt: v.optional(v.number()),
  })
    .index("by_patient", ["patientId"])
    .index("by_phone", ["normalizedPhone"])
    .index("by_lastMessage", ["lastMessageAt"]),
  messages: defineTable({
    threadId: v.id("messageThreads"),
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    body: v.string(),
    status: v.optional(v.string()),
    sentAt: v.number(),
    normalizedPhone: v.optional(v.string()),
    ringcentralId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_thread", ["threadId", "sentAt"]),
});
