-- CreateEnum
CREATE TYPE "TourRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TourRequest" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER,
    "listingTitle" TEXT NOT NULL,
    "listingAddress" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "notes" TEXT,
    "source" TEXT,
    "status" "TourRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TourRequest_startAt_idx" ON "TourRequest"("startAt");

-- CreateIndex
CREATE INDEX "TourRequest_status_idx" ON "TourRequest"("status");

-- CreateIndex
CREATE INDEX "TourRequest_listingId_idx" ON "TourRequest"("listingId");

-- AddForeignKey
ALTER TABLE "TourRequest" ADD CONSTRAINT "TourRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
