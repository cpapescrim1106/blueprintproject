-- CreateTable
CREATE TABLE "Ingestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reportName" TEXT NOT NULL,
    "capturedAt" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ReportRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ingestionId" INTEGER NOT NULL,
    "reportName" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "ReportRow_ingestionId_fkey" FOREIGN KEY ("ingestionId") REFERENCES "Ingestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,
    CONSTRAINT "Appointment_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatientRecall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,
    CONSTRAINT "PatientRecall_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivePatient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,
    CONSTRAINT "ActivePatient_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesByIncomeAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,
    CONSTRAINT "SalesByIncomeAccount_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT,
    "patientName" TEXT,
    "normalizedPhone" TEXT NOT NULL,
    "displayPhone" TEXT,
    "location" TEXT,
    "phScore" REAL,
    "tags" JSONB,
    "lastMessageAt" BIGINT NOT NULL,
    "lastMessageSnippet" TEXT,
    "lastOutboundStatus" TEXT,
    "lastOutboundAt" BIGINT
);

-- CreateTable
CREATE TABLE "Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "threadId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT,
    "sentAt" BIGINT NOT NULL,
    "normalizedPhone" TEXT,
    "ringcentralId" TEXT,
    "patientId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_uniqueKey_key" ON "Appointment"("uniqueKey");

-- CreateIndex
CREATE UNIQUE INDEX "PatientRecall_uniqueKey_key" ON "PatientRecall"("uniqueKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActivePatient_uniqueKey_key" ON "ActivePatient"("uniqueKey");

-- CreateIndex
CREATE UNIQUE INDEX "SalesByIncomeAccount_uniqueKey_key" ON "SalesByIncomeAccount"("uniqueKey");

-- CreateIndex
CREATE INDEX "MessageThread_normalizedPhone_idx" ON "MessageThread"("normalizedPhone");

-- CreateIndex
CREATE INDEX "MessageThread_patientId_idx" ON "MessageThread"("patientId");

-- CreateIndex
CREATE INDEX "MessageThread_lastMessageAt_idx" ON "MessageThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Message_threadId_sentAt_idx" ON "Message"("threadId", "sentAt");

-- CreateIndex
CREATE INDEX "Message_ringcentralId_idx" ON "Message"("ringcentralId");
