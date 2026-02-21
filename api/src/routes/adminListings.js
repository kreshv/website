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
  floorplanImageUrl: z.string().trim().min(1).optional(),
  mapImageUrl: z.string().trim().min(1).optional(),
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

const updateListingSchema = createListingSchema;

const statusUpdateSchema = z.object({
  isActive: z.boolean(),
});

const manageQuerySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

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
    floorplanImageUrl: listing.floorplanImageUrl,
    mapImageUrl: listing.mapImageUrl,
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

function extractCloudinaryPublicId(inputUrl) {
  if (!inputUrl) return null;

  try {
    const parsed = new URL(inputUrl);
    if (!parsed.hostname.endsWith("cloudinary.com")) return null;

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = pathParts.indexOf("upload");
    if (uploadIndex === -1 || uploadIndex + 1 >= pathParts.length) return null;

    const candidateParts = pathParts.slice(uploadIndex + 1);
    // Strip transformation segments and optional version segment (v1234567).
    const versionIndex = candidateParts.findIndex((segment) => /^v\d+$/.test(segment));
    const publicIdParts = versionIndex >= 0 ? candidateParts.slice(versionIndex + 1) : candidateParts;
    if (!publicIdParts.length) return null;

    const last = publicIdParts[publicIdParts.length - 1];
    publicIdParts[publicIdParts.length - 1] = last.replace(/\.[a-z0-9]+$/i, "");
    const publicId = decodeURIComponent(publicIdParts.join("/")).trim();
    return publicId || null;
  } catch {
    return null;
  }
}

async function resolveImageAsset(inputUrl) {
  if (!inputUrl) return { url: null, publicId: null, uploaded: false };
  const trimmed = inputUrl.trim();
  if (!trimmed) return { url: null, publicId: null, uploaded: false };

  // If client sent a data URL, upload it to Cloudinary and store the hosted URL + public id.
  if (trimmed.startsWith("data:")) {
    if (!hasCloudinaryConfig) {
      throw new Error("Cloudinary is not configured; cannot upload image data.");
    }
    const uploadResult = await cloudinary.uploader.upload(trimmed, {
      folder: process.env.CLOUDINARY_FOLDER || "listings",
      resource_type: "image",
    });
    return {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id || extractCloudinaryPublicId(uploadResult.secure_url),
      uploaded: true,
    };
  }

  return {
    url: trimmed,
    publicId: extractCloudinaryPublicId(trimmed),
    uploaded: false,
  };
}

async function deleteCloudinaryAsset(publicId) {
  if (!publicId || !hasCloudinaryConfig) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (error) {
    console.error("Cloudinary asset delete failed", { publicId, error });
  }
}

async function cleanupCloudinaryAssets(publicIds) {
  const unique = [...new Set(publicIds.filter(Boolean))];
  await Promise.all(unique.map((id) => deleteCloudinaryAsset(id)));
}

function requireAdmin(req, res) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: "ADMIN_SECRET is not configured on the server." });
    return false;
  }

  const suppliedKey = req.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== adminSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

async function resolveBoroughAndNeighborhood(prismaClient, boroughName, neighborhoodName) {
  let borough = await prismaClient.borough.findFirst({
    where: { name: { equals: boroughName, mode: "insensitive" } },
  });
  if (!borough) borough = await prismaClient.borough.create({ data: { name: boroughName } });

  let neighborhood = await prismaClient.neighborhood.findFirst({
    where: {
      boroughId: borough.id,
      name: { equals: neighborhoodName, mode: "insensitive" },
    },
  });
  if (!neighborhood) {
    neighborhood = await prismaClient.neighborhood.create({
      data: { name: neighborhoodName, boroughId: borough.id },
    });
  }

  return { borough, neighborhood };
}

async function syncListingFeatures(prismaClient, listingId, unitFeatures, buildingFeatures) {
  const unitFeatureIds = await Promise.all(
    unitFeatures.map(async (name) => {
      const feature = await prismaClient.feature.upsert({
        where: { featureType_name: { featureType: "UNIT", name } },
        update: {},
        create: { featureType: "UNIT", name },
      });
      return feature.id;
    }),
  );

  const buildingFeatureIds = await Promise.all(
    buildingFeatures.map(async (name) => {
      const feature = await prismaClient.feature.upsert({
        where: { featureType_name: { featureType: "BUILDING", name } },
        update: {},
        create: { featureType: "BUILDING", name },
      });
      return feature.id;
    }),
  );

  const allFeatureIds = [...new Set([...unitFeatureIds, ...buildingFeatureIds])];
  await prismaClient.listingFeature.deleteMany({ where: { listingId } });
  if (allFeatureIds.length) {
    await prismaClient.listingFeature.createMany({
      data: allFeatureIds.map((featureId) => ({ listingId, featureId })),
      skipDuplicates: true,
    });
  }
}

async function syncListingSubwayLines(prismaClient, listingId, subwayLines) {
  const subwayLineIds = await Promise.all(
    subwayLines.map(async (lineCode) => {
      const line = await prismaClient.subwayLine.upsert({
        where: { lineCode },
        update: {},
        create: { lineCode },
      });
      return line.id;
    }),
  );

  const dedupedSubwayLineIds = [...new Set(subwayLineIds)];
  await prismaClient.listingSubwayLine.deleteMany({ where: { listingId } });
  if (dedupedSubwayLineIds.length) {
    await prismaClient.listingSubwayLine.createMany({
      data: dedupedSubwayLineIds.map((subwayLineId) => ({
        listingId,
        subwayLineId,
      })),
      skipDuplicates: true,
    });
  }
}

router.get("/", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = manageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params", details: parsed.error.issues });
  }

  const { q, limit } = parsed.data;
  const search = (q || "").trim();
  const terms = search ? search.split(/\s+/).filter(Boolean).slice(0, 6) : [];
  const numericQuery = Number(search);
  const isNumericQuery = Number.isInteger(numericQuery) && numericQuery > 0;

  try {
    const rows = await prisma.listing.findMany({
      where: search
        ? {
            OR: [
              { address: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
              { neighborhood: { name: { contains: search, mode: "insensitive" } } },
              { borough: { name: { contains: search, mode: "insensitive" } } },
              ...(isNumericQuery ? [{ id: numericQuery }] : []),
              ...terms.flatMap((term) => [
                { address: { contains: term, mode: "insensitive" } },
                { title: { contains: term, mode: "insensitive" } },
                { neighborhood: { name: { contains: term, mode: "insensitive" } } },
                { borough: { name: { contains: term, mode: "insensitive" } } },
              ]),
            ],
          }
        : undefined,
      include: {
        borough: true,
        neighborhood: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    return res.json({
      data: rows.map((listing) => ({
        id: listing.id,
        title: listing.title,
        address: listing.address,
        price: listing.price,
        isActive: listing.isActive,
        borough: listing.borough.name,
        neighborhood: listing.neighborhood.name,
        updatedAt: listing.updatedAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/listings failed", error);
    return res.status(500).json({ error: "Failed to fetch admin listings" });
  }
});

router.get("/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ error: "Invalid listing id" });
  }

  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        borough: true,
        neighborhood: true,
        featureLinks: { include: { feature: true } },
        subwayLinks: { include: { subwayLine: true } },
      },
    });
    if (!listing) return res.status(404).json({ error: "Not found" });
    return res.json({ data: mapListingResponse(listing), isActive: listing.isActive });
  } catch (error) {
    console.error("GET /api/admin/listings/:id failed", error);
    return res.status(500).json({ error: "Failed to fetch listing" });
  }
});

router.post("/", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const payload = parsed.data;
  let imageAsset = { url: null, publicId: null, uploaded: false };
  let floorplanAsset = { url: null, publicId: null, uploaded: false };
  let mapAsset = { url: null, publicId: null, uploaded: false };
  try {
    imageAsset = await resolveImageAsset(payload.imageUrl);
    floorplanAsset = await resolveImageAsset(payload.floorplanImageUrl);
    mapAsset = await resolveImageAsset(payload.mapImageUrl);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Image upload failed." });
  }

  const unitFeatures = normalizeList(payload.unitFeatures);
  const buildingFeatures = normalizeList(payload.buildingFeatures);
  const subwayLines = normalizeList(payload.subwayLines).map((line) => line.toUpperCase());

  try {
    const { borough, neighborhood } = await resolveBoroughAndNeighborhood(
      prisma,
      payload.borough,
      payload.neighborhood,
    );

    const listing = await prisma.listing.create({
      data: {
        title: payload.title,
        address: payload.address ?? null,
        imageUrl: imageAsset.url,
        imagePublicId: imageAsset.publicId,
        floorplanImageUrl: floorplanAsset.url,
        floorplanImagePublicId: floorplanAsset.publicId,
        mapImageUrl: mapAsset.url,
        mapImagePublicId: mapAsset.publicId,
        price: payload.price,
        beds: payload.beds ?? null,
        baths: payload.baths ?? null,
        boroughId: borough.id,
        neighborhoodId: neighborhood.id,
        petsPolicy: payload.petsPolicy,
        isActive: payload.isActive,
      },
    });

    await syncListingFeatures(prisma, listing.id, unitFeatures, buildingFeatures);
    await syncListingSubwayLines(prisma, listing.id, subwayLines);

    const createdListing = await prisma.listing.findUnique({
      where: { id: listing.id },
      include: {
        borough: true,
        neighborhood: true,
        featureLinks: { include: { feature: true } },
        subwayLinks: { include: { subwayLine: true } },
      },
    });

    if (!createdListing) {
      throw new Error("Listing create readback returned empty result");
    }

    return res.status(201).json({ data: mapListingResponse(createdListing) });
  } catch (error) {
    await cleanupCloudinaryAssets([
      imageAsset.uploaded ? imageAsset.publicId : null,
      floorplanAsset.uploaded ? floorplanAsset.publicId : null,
      mapAsset.uploaded ? mapAsset.publicId : null,
    ]);
    console.error("POST /api/admin/listings failed", error);
    return res.status(500).json({ error: "Failed to create listing" });
  }
});

router.patch("/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ error: "Invalid listing id" });
  }

  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const payload = parsed.data;
  let imageAsset = { url: null, publicId: null, uploaded: false };
  let floorplanAsset = { url: null, publicId: null, uploaded: false };
  let mapAsset = { url: null, publicId: null, uploaded: false };
  try {
    imageAsset = await resolveImageAsset(payload.imageUrl);
    floorplanAsset = await resolveImageAsset(payload.floorplanImageUrl);
    mapAsset = await resolveImageAsset(payload.mapImageUrl);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Image upload failed." });
  }

  const unitFeatures = normalizeList(payload.unitFeatures);
  const buildingFeatures = normalizeList(payload.buildingFeatures);
  const subwayLines = normalizeList(payload.subwayLines).map((line) => line.toUpperCase());

  try {
    const existing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        imageUrl: true,
        imagePublicId: true,
        floorplanImageUrl: true,
        floorplanImagePublicId: true,
        mapImageUrl: true,
        mapImagePublicId: true,
      },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const { borough, neighborhood } = await resolveBoroughAndNeighborhood(
      prisma,
      payload.borough,
      payload.neighborhood,
    );

    await prisma.listing.update({
      where: { id: listingId },
      data: {
        title: payload.title,
        address: payload.address ?? null,
        imageUrl: imageAsset.url,
        imagePublicId: imageAsset.publicId,
        floorplanImageUrl: floorplanAsset.url,
        floorplanImagePublicId: floorplanAsset.publicId,
        mapImageUrl: mapAsset.url,
        mapImagePublicId: mapAsset.publicId,
        price: payload.price,
        beds: payload.beds ?? null,
        baths: payload.baths ?? null,
        boroughId: borough.id,
        neighborhoodId: neighborhood.id,
        petsPolicy: payload.petsPolicy,
        isActive: payload.isActive,
      },
    });

    await syncListingFeatures(prisma, listingId, unitFeatures, buildingFeatures);
    await syncListingSubwayLines(prisma, listingId, subwayLines);

    const oldAssetIds = [
      existing.imagePublicId || extractCloudinaryPublicId(existing.imageUrl),
      existing.floorplanImagePublicId || extractCloudinaryPublicId(existing.floorplanImageUrl),
      existing.mapImagePublicId || extractCloudinaryPublicId(existing.mapImageUrl),
    ].filter(Boolean);
    const newAssetIds = [
      imageAsset.publicId || extractCloudinaryPublicId(imageAsset.url),
      floorplanAsset.publicId || extractCloudinaryPublicId(floorplanAsset.url),
      mapAsset.publicId || extractCloudinaryPublicId(mapAsset.url),
    ].filter(Boolean);
    const replacedAssetIds = oldAssetIds.filter((id) => !newAssetIds.includes(id));
    await cleanupCloudinaryAssets(replacedAssetIds);

    const updatedListing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        borough: true,
        neighborhood: true,
        featureLinks: { include: { feature: true } },
        subwayLinks: { include: { subwayLine: true } },
      },
    });
    if (!updatedListing) return res.status(404).json({ error: "Not found" });

    return res.json({ data: mapListingResponse(updatedListing) });
  } catch (error) {
    await cleanupCloudinaryAssets([
      imageAsset.uploaded ? imageAsset.publicId : null,
      floorplanAsset.uploaded ? floorplanAsset.publicId : null,
      mapAsset.uploaded ? mapAsset.publicId : null,
    ]);
    console.error("PATCH /api/admin/listings/:id failed", error);
    return res.status(500).json({ error: "Failed to update listing" });
  }
});

router.delete("/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ error: "Invalid listing id" });
  }

  try {
    const existing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        imageUrl: true,
        imagePublicId: true,
        floorplanImageUrl: true,
        floorplanImagePublicId: true,
        mapImageUrl: true,
        mapImagePublicId: true,
      },
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    await prisma.listing.delete({ where: { id: listingId } });
    await cleanupCloudinaryAssets([
      existing.imagePublicId || extractCloudinaryPublicId(existing.imageUrl),
      existing.floorplanImagePublicId || extractCloudinaryPublicId(existing.floorplanImageUrl),
      existing.mapImagePublicId || extractCloudinaryPublicId(existing.mapImageUrl),
    ]);
    return res.json({ deleted: 1, id: listingId });
  } catch (error) {
    console.error("DELETE /api/admin/listings/:id failed", error);
    return res.status(500).json({ error: "Failed to delete listing" });
  }
});

router.patch("/:id/status", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ error: "Invalid listing id" });
  }

  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  try {
    const updated = await prisma.listing.update({
      where: { id: listingId },
      data: { isActive: parsed.data.isActive },
      include: { borough: true, neighborhood: true, featureLinks: { include: { feature: true } }, subwayLinks: { include: { subwayLine: true } } },
    });
    return res.json({ data: mapListingResponse(updated) });
  } catch (error) {
    if (error && error.code === "P2025") {
      return res.status(404).json({ error: "Not found" });
    }
    console.error("PATCH /api/admin/listings/:id/status failed", error);
    return res.status(500).json({ error: "Failed to update listing status" });
  }
});

module.exports = router;
