BEGIN;

-- CreateEnum
CREATE TYPE "OpsTaskKind" AS ENUM ('LODGEMENT', 'TAX_REGISTRATION');

-- CreateEnum
CREATE TYPE "OpsTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'ACTION_REQUIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "OpsTask" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "OpsTaskKind" NOT NULL,
    "status" "OpsTaskStatus" NOT NULL DEFAULT 'OPEN',
    "jurisdiction" "Jurisdiction" NOT NULL,
    "authority" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filingId" TEXT,
    "payload" JSONB NOT NULL,
    "assigneeId" TEXT,
    "externalReference" TEXT,
    "resultNumber" TEXT,
    "resultDate" TIMESTAMP(3),
    "message" TEXT,
    "documents" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OpsTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpsTask_reference_key" ON "OpsTask"("reference");

-- CreateIndex
CREATE INDEX "OpsTask_kind_status_createdAt_idx" ON "OpsTask"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OpsTask_companyId_idx" ON "OpsTask"("companyId");

COMMIT;
