BEGIN;

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'SIGNED', 'DECLINED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "FilingStatus" ADD VALUE 'AWAITING_SIGNATURES';

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "roles" "OfficerRole"[],
    "documentType" "DocumentType" NOT NULL DEFAULT 'CONSENT_TO_ACT',
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "signedName" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT,
    "signedUserAgent" TEXT,
    "declinedReason" TEXT,
    "signedDocumentId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_tokenHash_key" ON "SignatureRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "SignatureRequest_filingId_idx" ON "SignatureRequest"("filingId");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
