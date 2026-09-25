-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('AU', 'US_DE', 'US_WY', 'UK');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('AU_PTY_LTD', 'US_LLC', 'US_C_CORP', 'UK_LTD');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACTIVE', 'REJECTED', 'DEREGISTERED');

-- CreateEnum
CREATE TYPE "FilingType" AS ENUM ('INCORPORATION', 'ANNUAL_REVIEW', 'TAX_ID_APPLICATION', 'OFFICER_CHANGE', 'ADDRESS_CHANGE');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('DRAFT', 'QUEUED', 'SUBMITTED', 'UNDER_REVIEW', 'REQUIRES_ACTION', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "OfficerRole" AS ENUM ('DIRECTOR', 'SECRETARY', 'MANAGER', 'PRESIDENT', 'TREASURER', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "ShareClass" AS ENUM ('ORDINARY', 'COMMON', 'PREFERRED', 'MEMBERSHIP_INTEREST');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CERTIFICATE_OF_INCORPORATION', 'CONSTITUTION', 'BYLAWS', 'OPERATING_AGREEMENT', 'ARTICLES_OF_ASSOCIATION', 'SHARE_CERTIFICATE', 'SHAREHOLDER_REGISTER', 'CONSENT_TO_ACT', 'REGISTRY_FILING', 'TAX_ID_CONFIRMATION');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('PAY_AS_YOU_GO', 'COMPLIANCE_ESSENTIALS', 'COMPLIANCE_PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ComplianceEventType" AS ENUM ('ANNUAL_REVIEW', 'ANNUAL_REPORT', 'FRANCHISE_TAX', 'CONFIRMATION_STATEMENT', 'REGISTERED_AGENT_RENEWAL', 'TAX_RETURN');

-- CreateEnum
CREATE TYPE "ComplianceEventStatus" AS ENUM ('UPCOMING', 'DUE_SOON', 'OVERDUE', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedName" TEXT NOT NULL,
    "legalName" TEXT,
    "registryNumber" TEXT,
    "taxId" TEXT,
    "incorporatedAt" TIMESTAMP(3),
    "registeredAddress" JSONB NOT NULL,
    "principalAddress" JSONB,
    "useRegisteredAgent" BOOLEAN NOT NULL DEFAULT false,
    "registeredAgentName" TEXT,
    "businessActivity" TEXT,
    "sicCodes" TEXT[],
    "financialYearEnd" TEXT,
    "jurisdictionData" JSONB,
    "formationPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Officer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roles" "OfficerRole"[],
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "placeOfBirth" TEXT,
    "nationality" TEXT,
    "residentialAddress" JSONB NOT NULL,
    "directorId" TEXT,
    "consentSignedAt" TIMESTAMP(3),
    "appointedAt" TIMESTAMP(3),
    "ceasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Officer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shareholder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "holderType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "address" JSONB NOT NULL,
    "shareClass" "ShareClass" NOT NULL,
    "shareCount" INTEGER NOT NULL,
    "pricePerShare" DECIMAL(18,6) NOT NULL,
    "ownershipPercent" DECIMAL(7,4) NOT NULL,
    "beneficiallyHeld" BOOLEAN NOT NULL DEFAULT true,
    "certificateNumber" INTEGER,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shareholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficialOwner" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "residentialAddress" JSONB NOT NULL,
    "ownershipPercent" DECIMAL(7,4) NOT NULL,
    "natureOfControl" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeneficialOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filing" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "FilingType" NOT NULL,
    "status" "FilingStatus" NOT NULL DEFAULT 'DRAFT',
    "jurisdiction" "Jurisdiction" NOT NULL,
    "registryReference" TEXT,
    "expedited" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "pollAttempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorField" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Filing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingEvent" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "status" "FilingStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filingId" TEXT,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "source" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filingId" TEXT,
    "currency" TEXT NOT NULL,
    "governmentFeeTotal" INTEGER NOT NULL,
    "serviceFeeTotal" INTEGER NOT NULL,
    "addOnTotal" INTEGER NOT NULL,
    "taxTotal" INTEGER NOT NULL,
    "grandTotal" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "paymentProvider" TEXT,
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "includesRegisteredAgent" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ComplianceEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ComplianceEventStatus" NOT NULL DEFAULT 'UPCOMING',
    "feeEstimate" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Company_ownerId_idx" ON "Company"("ownerId");

-- CreateIndex
CREATE INDEX "Company_jurisdiction_status_idx" ON "Company"("jurisdiction", "status");

-- CreateIndex
CREATE INDEX "Officer_companyId_idx" ON "Officer"("companyId");

-- CreateIndex
CREATE INDEX "Shareholder_companyId_idx" ON "Shareholder"("companyId");

-- CreateIndex
CREATE INDEX "BeneficialOwner_companyId_idx" ON "BeneficialOwner"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Filing_registryReference_key" ON "Filing"("registryReference");

-- CreateIndex
CREATE INDEX "Filing_companyId_idx" ON "Filing"("companyId");

-- CreateIndex
CREATE INDEX "Filing_status_idx" ON "Filing"("status");

-- CreateIndex
CREATE INDEX "FilingEvent_filingId_createdAt_idx" ON "FilingEvent"("filingId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_companyId_type_idx" ON "Document"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Order_filingId_key" ON "Order"("filingId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_externalId_key" ON "Subscription"("externalId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "ComplianceEvent_companyId_dueDate_idx" ON "ComplianceEvent"("companyId", "dueDate");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Officer" ADD CONSTRAINT "Officer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shareholder" ADD CONSTRAINT "Shareholder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficialOwner" ADD CONSTRAINT "BeneficialOwner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filing" ADD CONSTRAINT "Filing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvent" ADD CONSTRAINT "FilingEvent_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

