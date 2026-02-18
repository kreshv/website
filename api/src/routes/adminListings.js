const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const cloudinary = require("cloudinary").v2;

const router = express.Router();

const petsPolicyEnum = z.enum(["ALLOWED", "NOT_ALLOWED", "CATS_ONLY", "DOGS_ONLY", "CASE_BY_CASE"]);

const createListingSchema = z.object({
  title: z.string().trim().min(1),
  address: z.string().trim().min(1).optional(),
  imageUrl: z.string().trim().min(1).optional(),
  price: z.coerce.number().int().min(0),
  beds: z.coerce.number().min(0).max(20).nullable().optional(),
  baths: z.coerce.number().min(0).max(20).nullable().optional(),
  borough: z.string().trim().min(1),
  neighborhood: z.string().trim().min(1),
  petsPolicy: petsPolicyEnum.default("CASE_BY_CASE"),
  isActive: z.boolean().default(true),
  unitFeatures: z.array(z.string().trim().min(1)).default([]),
  buildingFeatures: z.array(z.string().trim().min(1)).default([]),
  subwayLines: z.array(z.string().trim().min(1)).default([]),
});

const demoTitles = [
  "Bright 1BR near Jefferson L",
  "Ridgewood 2BR with natural light",
  "Williamsburg 1BR with gym access",
  "Astoria studio with balcony",
  "Chelsea 1BR full-service building",
  "Riverdale 2BR with parking",
  "Greenpoint 1BR with rooftop lounge",
  "Long Island City studio corner unit",
  "Upper West Side 2BR classic",
  "Astoria 1BR with terrace",
  "Park Slope 2BR near Prospect Park",
  "Murray Hill 1BR renovated",
];

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function normalizeList(values) {
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function mapListingResponse(listing) {
  return {
    id: listing.id,
    title: listing.title,
    address: listing.address,
    imageUrl: listing.imageUrl,
    price: listing.price,
    beds: listing.beds ? Number(listing.beds) : null,
    baths: listing.baths ? Number(listing.baths) : null,
    borough: listing.borough.name,
    neighborhood: listing.neighborhood.name,
    petsPolicy: listing.petsPolicy,
    unitFeatures: listing.featureLinks
      .filter((f) => f.feature.featureType === "UNIT")
      .map((f) => f.feature.name),
    buildingFeatures: listing.featureLinks
      .filter((f) => f.feature.featureType === "BUILDING")
      .map((f) => f.feature.name),
    subwayLines: listing.subwayLinks.map((s) => s.subwayLine.lineCode),
  };
}

async function resolveImageUrl(inputImageUrl) {
  if (!inputImageUrl) return null;
  const trimmed = inputImageUrl.trim();
  if (!trimmed) return null;

  // If client sent a data URL, upload it to Cloudinary and store the hosted URL.
  if (trimmed.startsWith("data:")) {
    if (!hasCloudinaryConfig) {
      throw new Error("Cloudinary is not configured; cannot upload image data.");
    }
    const uploadResult = await cloudinary.uploader.upload(trimmed, {
      folder: process.env.CLOUDINARY_FOLDER || "listings",
      resource_type: "image",
    });
    return uploadResult.secure_url;
  }

  return trimmed;
}

router.post("/", async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({ error: "ADMIN_SECRET is not configured on the server." });
  }

  const suppliedKey = req.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== adminSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const payload = parsed.data;
  let resolvedImageUrl = null;
  try {
    resolvedImageUrl = await resolveImageUrl(payload.imageUrl);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Image upload failed." });
  }

  const unitFeatures = normalizeList(payload.unitFeatures);
  const buildingFeatures = normalizeList(payload.buildingFeatures);
  const subwayLines = normalizeList(payload.subwayLines).map((line) => line.toUpperCase());

  try {
    const createdListing = await prisma.$transaction(async (tx) => {
      let borough = await tx.borough.findFirst({
        where: { name: { equals: payload.borough, mode: "insensitive" } },
      });
      if (!borough) borough = await tx.borough.create({ data: { name: payload.borough } });

      let neighborhood = await tx.neighborhood.findFirst({
        where: {
          boroughId: borough.id,
          name: { equals: payload.neighborhood, mode: "insensitive" },
        },
      });
      if (!neighborhood) {
        neighborhood = await tx.neighborhood.create({
          data: { name: payload.neighborhood, boroughId: borough.id },
        });
      }

      const listing = await tx.listing.create({
        data: {
          title: payload.title,
          address: payload.address ?? null,
          imageUrl: resolvedImageUrl,
          price: payload.price,
          beds: payload.beds ?? null,
          baths: payload.baths ?? null,
          boroughId: borough.id,
          neighborhoodId: neighborhood.id,
          petsPolicy: payload.petsPolicy,
          isActive: payload.isActive,
        },
      });

      for (const name of unitFeatures) {
        const feature = await tx.feature.upsert({
          where: { featureType_name: { featureType: "UNIT", name } },
          update: {},
          create: { featureType: "UNIT", name },
        });
        await tx.listingFeature.create({
          data: { listingId: listing.id, featureId: feature.id },
        });
      }

      for (const name of buildingFeatures) {
        const feature = await tx.feature.upsert({
          where: { featureType_name: { featureType: "BUILDING", name } },
          update: {},
          create: { featureType: "BUILDING", name },
        });
        await tx.listingFeature.create({
          data: { listingId: listing.id, featureId: feature.id },
        });
      }

      for (const lineCode of subwayLines) {
        const line = await tx.subwayLine.upsert({
          where: { lineCode },
          update: {},
          create: { lineCode },
        });
        await tx.listingSubwayLine.create({
          data: { listingId: listing.id, subwayLineId: line.id },
        });
      }

      return tx.listing.findUnique({
        where: { id: listing.id },
        include: {
          borough: true,
          neighborhood: true,
          featureLinks: { include: { feature: true } },
          subwayLinks: { include: { subwayLine: true } },
        },
      });
    });

    if (!createdListing) {
      throw new Error("Listing create transaction returned empty result");
    }

    return res.status(201).json({ data: mapListingResponse(createdListing) });
  } catch (error) {
    console.error("POST /api/admin/listings failed", error);
    return res.status(500).json({ error: "Failed to create listing" });
  }
});

router.delete("/demo", async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({ error: "ADMIN_SECRET is not configured on the server." });
  }

  const suppliedKey = req.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== adminSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const deleted = await prisma.listing.deleteMany({
      where: { title: { in: demoTitles } },
    });
    return res.json({ deleted: deleted.count });
  } catch (error) {
    console.error("DELETE /api/admin/listings/demo failed", error);
    return res.status(500).json({ error: "Failed to delete demo listings" });
  }
});

module.exports = router;
