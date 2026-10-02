BEGIN;

-- CreateEnum
CREATE TYPE "TemplateReviewStatus" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "templateFingerprint" TEXT,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateReviewed" BOOLEAN,
ADD COLUMN     "templateVersion" TEXT;

-- CreateTable
CREATE TABLE "TemplateReview" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "TemplateReviewStatus" NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerFirm" TEXT NOT NULL,
    "reviewerAdmission" TEXT NOT NULL,
    "adviceReference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateReview_templateId_fingerprint_idx" ON "TemplateReview"("templateId", "fingerprint");

COMMIT;
