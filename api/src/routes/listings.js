const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");

const router = express.Router();

const petsPolicyEnum = z
  .enum(["ALLOWED", "NOT_ALLOWED", "CATS_ONLY", "DOGS_ONLY", "CASE_BY_CASE"])
  .optional();

const subwayLinesByBorough = {
  Manhattan: ["1", "2", "3", "4", "5", "6", "7", "A", "B", "C", "D", "E", "F", "G", "J", "L", "M", "N", "Q", "R", "S", "W", "Z"],
  Brooklyn: ["2", "3", "4", "5", "A", "B", "C", "D", "F", "G", "J", "L", "M", "N", "Q", "R", "S", "Z"],
  Queens: ["7", "E", "F", "G", "J", "M", "N", "R", "W", "Z"],
  Bronx: ["1", "2", "4", "5", "6", "B", "D"],
  "Staten Island": ["SI", "SIR"],
};

const querySchema = z.object({
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  minBeds: z.coerce.number().int().min(0).optional(),
  minBaths: z.coerce.number().int().min(0).optional(),
  borough: z.string().trim().min(1).optional(),
  boroughs: z.string().trim().min(1).optional(),
  neighborhoods: z.string().trim().min(1).optional(),
  features: z.string().trim().min(1).optional(),
  subway: z.string().trim().min(1).optional(),
  petsPolicy: petsPolicyEnum,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

function csvToList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sortLineCodes(values) {
  return [...values].sort((a, b) => {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) return Number(a) - Number(b);
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b);
  });
}

router.get("/filters", async (_req, res) => {
  try {
    const [boroughRows, neighborhoodRows, amenityRows, unitFeatureRows, subwayRows] = await Promise.all([
      prisma.borough.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      prisma.neighborhood.findMany({
        select: { name: true, borough: { select: { name: true } } },
        orderBy: [{ borough: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.feature.findMany({
        where: { featureType: "BUILDING" },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.feature.findMany({
        where: { featureType: "UNIT" },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.subwayLine.findMany({
        select: { lineCode: true },
        orderBy: { lineCode: "asc" },
      }),
    ]);

    const neighborhoodsByBorough = {};
    neighborhoodRows.forEach((row) => {
      const boroughName = row.borough.name;
      if (!neighborhoodsByBorough[boroughName]) neighborhoodsByBorough[boroughName] = [];
      neighborhoodsByBorough[boroughName].push(row.name);
    });

    const subwayLineSet = new Set(
      subwayRows.map((row) => String(row.lineCode || "").trim().toUpperCase()).filter(Boolean)
    );
    Object.values(subwayLinesByBorough).forEach((lines) => {
      lines.forEach((line) => subwayLineSet.add(line));
    });

    return res.json({
      boroughs: boroughRows.map((row) => row.name),
      neighborhoodsByBorough,
      unitFeatures: unitFeatureRows.map((row) => row.name),
      amenities: amenityRows.map((row) => row.name),
      subwayLines: sortLineCodes([...subwayLineSet]),
      subwayLinesByBorough,
    });
  } catch (error) {
    console.error("GET /api/listings/filters failed", error);
    return res.status(500).json({ error: "Failed to fetch listing filters" });
  }
});

router.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params", details: parsed.error.issues });
  }

  const {
    minPrice,
    maxPrice,
    minBeds,
    minBaths,
    borough,
    boroughs,
    neighborhoods,
    features,
    subway,
    petsPolicy,
    page,
    limit,
  } =
    parsed.data;

  const boroughList = csvToList(boroughs);
  const neighborhoodList = csvToList(neighborhoods);
  const featureList = csvToList(features);
  const subwayList = csvToList(subway);

  const where = {
    isActive: true,
    ...(typeof minPrice === "number" || typeof maxPrice === "number"
      ? {
          price: {
            ...(typeof minPrice === "number" ? { gte: minPrice } : {}),
            ...(typeof maxPrice === "number" ? { lte: maxPrice } : {}),
          },
        }
      : {}),
    ...(typeof minBeds === "number"
      ? {
          beds: {
            gte: minBeds,
          },
        }
      : {}),
    ...(typeof minBaths === "number"
      ? {
          baths: {
            gte: minBaths,
          },
        }
      : {}),
    ...((borough || boroughList.length)
      ? {
          borough: {
            name: boroughList.length
              ? {
                  in: boroughList,
                  mode: "insensitive",
                }
              : {
                  equals: borough,
                  mode: "insensitive",
                },
          },
        }
      : {}),
    ...(neighborhoodList.length
      ? {
          neighborhood: {
            name: {
              in: neighborhoodList,
              mode: "insensitive",
            },
          },
        }
      : {}),
    ...(petsPolicy ? { petsPolicy } : {}),
    ...(featureList.length
      ? {
          AND: featureList.map((featureName) => ({
            featureLinks: {
              some: {
                feature: {
                  name: {
                    equals: featureName,
                    mode: "insensitive",
                  },
                },
              },
            },
          })),
        }
      : {}),
    ...(subwayList.length
      ? {
          subwayLinks: {
            some: {
              subwayLine: {
                lineCode: {
                  in: subwayList,
                },
              },
            },
          },
        }
      : {}),
  };

  try {
    const [total, listings] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        orderBy: [{ price: "asc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          borough: true,
          neighborhood: true,
          featureLinks: {
            include: {
              feature: true,
            },
          },
          subwayLinks: {
            include: {
              subwayLine: true,
            },
          },
        },
      }),
    ]);

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      data: listings.map((listing) => ({
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
      })),
    });
  } catch (error) {
    console.error("GET /api/listings failed", error);
    return res.status(500).json({ error: "Failed to fetch listings" });
  }
});

module.exports = router;
