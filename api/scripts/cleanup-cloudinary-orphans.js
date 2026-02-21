#!/usr/bin/env node

require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");
const cloudinary = require("cloudinary").v2;

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const folder = process.env.CLOUDINARY_FOLDER || "listings";

function extractCloudinaryPublicId(inputUrl) {
  if (!inputUrl) return null;
  try {
    const parsed = new URL(inputUrl);
    if (!parsed.hostname.endsWith("cloudinary.com")) return null;

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = pathParts.indexOf("upload");
    if (uploadIndex === -1 || uploadIndex + 1 >= pathParts.length) return null;

    const candidateParts = pathParts.slice(uploadIndex + 1);
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

async function getReferencedPublicIds() {
  const rows = await prisma.listing.findMany({
    select: {
      imagePublicId: true,
      floorplanImagePublicId: true,
      mapImagePublicId: true,
      imageUrl: true,
      floorplanImageUrl: true,
      mapImageUrl: true,
    },
  });

  const referenced = new Set();
  for (const row of rows) {
    const candidates = [
      row.imagePublicId,
      row.floorplanImagePublicId,
      row.mapImagePublicId,
      extractCloudinaryPublicId(row.imageUrl),
      extractCloudinaryPublicId(row.floorplanImageUrl),
      extractCloudinaryPublicId(row.mapImageUrl),
    ];
    for (const value of candidates) {
      if (value) referenced.add(value);
    }
  }

  return referenced;
}

async function listFolderAssets(prefix) {
  const assets = [];
  let nextCursor;

  do {
    const page = await cloudinary.api.resources({
      type: "upload",
      prefix: `${prefix}/`,
      max_results: 500,
      next_cursor: nextCursor,
    });
    if (Array.isArray(page.resources)) {
      assets.push(...page.resources.map((resource) => resource.public_id).filter(Boolean));
    }
    nextCursor = page.next_cursor;
  } while (nextCursor);

  return assets;
}

async function deletePublicIds(publicIds) {
  const chunkSize = 100;
  let deletedCount = 0;

  for (let i = 0; i < publicIds.length; i += chunkSize) {
    const chunk = publicIds.slice(i, i + chunkSize);
    const result = await cloudinary.api.delete_resources(chunk, { resource_type: "image", type: "upload" });
    deletedCount += Object.keys(result.deleted || {}).length;
  }

  return deletedCount;
}

async function main() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Missing Cloudinary credentials in environment (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).");
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

  const [referenced, folderAssets] = await Promise.all([
    getReferencedPublicIds(),
    listFolderAssets(folder),
  ]);

  const orphaned = folderAssets.filter((id) => !referenced.has(id));

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    folder,
    referencedCount: referenced.size,
    cloudinaryFolderAssetCount: folderAssets.length,
    orphanedCount: orphaned.length,
    orphanedSample: orphaned.slice(0, 25),
  }, null, 2));

  if (!APPLY || orphaned.length === 0) return;

  const deleted = await deletePublicIds(orphaned);
  console.log(JSON.stringify({ deleted }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
