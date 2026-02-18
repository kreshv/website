const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");

const router = express.Router();

const petsPolicyEnum = z
  .enum(["ALLOWED", "NOT_ALLOWED", "CATS_ONLY", "DOGS_ONLY", "CASE_BY_CASE"])
  .optional();

const querySchema = z.object({
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  borough: z.string().trim().min(1).optional(),
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

router.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params", details: parsed.error.issues });
  }

  const { minPrice, maxPrice, borough, neighborhoods, features, subway, petsPolicy, page, limit } =
    parsed.data;

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
    ...(borough
      ? {
          borough: {
            name: {
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
