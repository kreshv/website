-- CreateEnum
CREATE TYPE "FeatureType" AS ENUM ('UNIT', 'BUILDING');

-- CreateEnum
CREATE TYPE "PetsPolicy" AS ENUM ('ALLOWED', 'NOT_ALLOWED', 'CATS_ONLY', 'DOGS_ONLY', 'CASE_BY_CASE');

-- CreateTable
CREATE TABLE "Borough" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Borough_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Neighborhood" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "boroughId" INTEGER NOT NULL,

    CONSTRAINT "Neighborhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT,
    "price" INTEGER NOT NULL,
    "beds" DECIMAL(3,1),
    "baths" DECIMAL(3,1),
    "boroughId" INTEGER NOT NULL,
    "neighborhoodId" INTEGER NOT NULL,
    "petsPolicy" "PetsPolicy" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "featureType" "FeatureType" NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingFeature" (
    "listingId" INTEGER NOT NULL,
    "featureId" INTEGER NOT NULL,

    CONSTRAINT "ListingFeature_pkey" PRIMARY KEY ("listingId","featureId")
);

-- CreateTable
CREATE TABLE "SubwayLine" (
    "id" SERIAL NOT NULL,
    "lineCode" TEXT NOT NULL,

    CONSTRAINT "SubwayLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSubwayLine" (
    "listingId" INTEGER NOT NULL,
    "subwayLineId" INTEGER NOT NULL,

    CONSTRAINT "ListingSubwayLine_pkey" PRIMARY KEY ("listingId","subwayLineId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Borough_name_key" ON "Borough"("name");

-- CreateIndex
CREATE INDEX "Neighborhood_boroughId_idx" ON "Neighborhood"("boroughId");

-- CreateIndex
CREATE UNIQUE INDEX "Neighborhood_boroughId_name_key" ON "Neighborhood"("boroughId", "name");

-- CreateIndex
CREATE INDEX "Listing_price_idx" ON "Listing"("price");

-- CreateIndex
CREATE INDEX "Listing_boroughId_idx" ON "Listing"("boroughId");

-- CreateIndex
CREATE INDEX "Listing_neighborhoodId_idx" ON "Listing"("neighborhoodId");

-- CreateIndex
CREATE INDEX "Listing_petsPolicy_idx" ON "Listing"("petsPolicy");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_featureType_name_key" ON "Feature"("featureType", "name");

-- CreateIndex
CREATE INDEX "ListingFeature_featureId_idx" ON "ListingFeature"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "SubwayLine_lineCode_key" ON "SubwayLine"("lineCode");

-- CreateIndex
CREATE INDEX "ListingSubwayLine_subwayLineId_idx" ON "ListingSubwayLine"("subwayLineId");

-- AddForeignKey
ALTER TABLE "Neighborhood" ADD CONSTRAINT "Neighborhood_boroughId_fkey" FOREIGN KEY ("boroughId") REFERENCES "Borough"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_boroughId_fkey" FOREIGN KEY ("boroughId") REFERENCES "Borough"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFeature" ADD CONSTRAINT "ListingFeature_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFeature" ADD CONSTRAINT "ListingFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSubwayLine" ADD CONSTRAINT "ListingSubwayLine_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSubwayLine" ADD CONSTRAINT "ListingSubwayLine_subwayLineId_fkey" FOREIGN KEY ("subwayLineId") REFERENCES "SubwayLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
