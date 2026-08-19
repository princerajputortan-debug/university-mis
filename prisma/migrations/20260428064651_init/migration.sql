-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER'
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch" TEXT NOT NULL,
    "paymentOption" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "semFee" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "ConsolidatedPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "sourceName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RazorpayPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JodoPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EarlyPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OfflinePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BankPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PropelldPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OthersPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME,
    "transactionId" TEXT NOT NULL,
    "enrollmentNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "mode" TEXT,
    "batch" TEXT,
    "discountedCourseFee" REAL,
    "firstEmi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdmissionForm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doa" DATETIME,
    "enrollmentNo" TEXT NOT NULL,
    "paymentOption" TEXT,
    "batch" TEXT,
    "type" TEXT,
    "status" TEXT,
    "program" TEXT,
    "team" TEXT,
    "bifurcation" TEXT,
    "location" TEXT,
    "totalFeeWithDiscount" REAL,
    "currentSem" INTEGER,
    "feeAsPerStructure" REAL,
    "scholarship" REAL,
    "semFeeAfterDisc" REAL,
    "totalFee" REAL,
    "recdFee" REAL,
    "pendingFee" REAL,
    "category" TEXT,
    "modeOfPayment" TEXT,
    "nationality" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_batch_paymentOption_program_key" ON "FeeStructure"("batch", "paymentOption", "program");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidatedPayment_transactionId_key" ON "ConsolidatedPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RazorpayPayment_transactionId_key" ON "RazorpayPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "JodoPayment_transactionId_key" ON "JodoPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayment_transactionId_key" ON "EarlyPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflinePayment_transactionId_key" ON "OfflinePayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BankPayment_transactionId_key" ON "BankPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PropelldPayment_transactionId_key" ON "PropelldPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "OthersPayment_transactionId_key" ON "OthersPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionForm_enrollmentNo_key" ON "AdmissionForm"("enrollmentNo");
