-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('outbound', 'inbound');

-- CreateTable
CREATE TABLE "Ingestion" (
    "id" SERIAL NOT NULL,
    "reportName" TEXT NOT NULL,
    "capturedAt" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,

    CONSTRAINT "Ingestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRow" (
    "id" SERIAL NOT NULL,
    "ingestionId" INTEGER NOT NULL,
    "reportName" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "ReportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" SERIAL NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientRecall" (
    "id" SERIAL NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,

    CONSTRAINT "PatientRecall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivePatient" (
    "id" SERIAL NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,

    CONSTRAINT "ActivePatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesByIncomeAccount" (
    "id" SERIAL NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "patientId" TEXT,
    "data" JSONB NOT NULL,
    "firstCapturedAt" BIGINT NOT NULL,
    "lastCapturedAt" BIGINT NOT NULL,
    "lastIngestionId" INTEGER NOT NULL,

    CONSTRAINT "SalesByIncomeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT,
    "patientName" TEXT,
    "normalizedPhone" TEXT NOT NULL,
    "displayPhone" TEXT,
    "location" TEXT,
    "phScore" DOUBLE PRECISION,
    "tags" JSONB,
    "lastMessageAt" BIGINT NOT NULL,
    "lastMessageSnippet" TEXT,
    "lastOutboundStatus" TEXT,
    "lastOutboundAt" BIGINT,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "threadId" INTEGER NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT,
    "sentAt" BIGINT NOT NULL,
    "normalizedPhone" TEXT,
    "ringcentralId" TEXT,
    "patientId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingestion_sourceKey_key" ON "Ingestion"("sourceKey");

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

-- AddForeignKey
ALTER TABLE "ReportRow" ADD CONSTRAINT "ReportRow_ingestionId_fkey" FOREIGN KEY ("ingestionId") REFERENCES "Ingestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRecall" ADD CONSTRAINT "PatientRecall_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivePatient" ADD CONSTRAINT "ActivePatient_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesByIncomeAccount" ADD CONSTRAINT "SalesByIncomeAccount_lastIngestionId_fkey" FOREIGN KEY ("lastIngestionId") REFERENCES "Ingestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
