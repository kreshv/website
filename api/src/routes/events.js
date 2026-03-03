const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");

const router = express.Router();

const eventSchema = z.object({
  name: z.string().trim().min(1).max(80),
  ts: z.string().trim().optional(),
  sessionId: z.string().trim().max(120).optional(),
  props: z.record(z.string(), z.any()).optional(),
});

const ingestSchema = z
  .object({
    event: eventSchema.optional(),
    events: z.array(eventSchema).min(1).max(200).optional(),
  })
  .refine(
    (payload) =>
      payload.event || (Array.isArray(payload.events) && payload.events.length > 0),
    { message: "event or events is required" }
  );

// POST /api/events — fire-and-forget DB write, responds immediately
router.post("/", (req, res) => {
  const parsed = ingestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid analytics payload", details: parsed.error.issues });
  }

  const incoming = [];
  if (parsed.data.event) incoming.push(parsed.data.event);
  if (Array.isArray(parsed.data.events)) incoming.push(...parsed.data.events);

  const now = new Date();
  const rows = incoming.map((e) => ({
    name: e.name,
    sessionId: e.sessionId || "",
    ts: e.ts && !isNaN(new Date(e.ts).getTime()) ? new Date(e.ts) : now,
    props: e.props || {},
  }));

  // Non-blocking: respond immediately, persist in background
  void prisma.analyticsEvent.createMany({ data: rows }).catch((err) => {
    console.error("analytics createMany failed", err);
  });

  return res.status(202).json({ ok: true, accepted: incoming.length });
});

// GET /api/events — event counts by name
router.get("/", async (_req, res) => {
  try {
    const rows = await prisma.analyticsEvent.groupBy({
      by: ["name"],
      _count: { name: true },
      orderBy: { _count: { name: "desc" } },
    });

    const counts = {};
    let total = 0;
    for (const row of rows) {
      counts[row.name] = row._count.name;
      total += row._count.name;
    }

    return res.json({ total, uniqueEvents: rows.length, counts });
  } catch (err) {
    console.error("GET /api/events failed", err);
    return res.status(500).json({ error: "Failed to fetch event counts" });
  }
});

// GET /api/events/listings — per-listing click counts (most clicked first)
router.get("/listings", async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        props->>'listingId' AS "listingId",
        COUNT(*)::int        AS "clicks"
      FROM "AnalyticsEvent"
      WHERE name = 'listing_opened'
        AND props->>'listingId' IS NOT NULL
        AND props->>'listingId' != ''
      GROUP BY props->>'listingId'
      ORDER BY "clicks" DESC
    `;

    return res.json({ listings: rows });
  } catch (err) {
    console.error("GET /api/events/listings failed", err);
    return res.status(500).json({ error: "Failed to fetch listing click counts" });
  }
});

// GET /api/events/funnels — session-based conversion funnels
router.get("/funnels", async (_req, res) => {
  try {
    // Fetch all distinct (sessionId, name) pairs from DB
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT "sessionId", "name"
      FROM "AnalyticsEvent"
      WHERE "sessionId" != ''
    `;

    // Rebuild sessions map in Node — same logic as the previous in-memory version
    const sessions = new Map();
    for (const row of rows) {
      if (!sessions.has(row.sessionId)) sessions.set(row.sessionId, new Set());
      sessions.get(row.sessionId).add(row.name);
    }

    let searchSubmittedSessions = 0;
    let listingOpenedSessions = 0;
    let searchToListingSessions = 0;
    let listingTo3dSessions = 0;
    let listingToActionSessions = 0;

    sessions.forEach((names) => {
      const hasSearch = names.has("search_submitted");
      const hasListing = names.has("listing_opened");
      const has3d = names.has("3d_view_opened");
      const hasAction =
        names.has("save_added") ||
        names.has("contact_clicked") ||
        names.has("tour_request_clicked") ||
        names.has("tour_request_scheduled");

      if (hasSearch) searchSubmittedSessions += 1;
      if (hasListing) listingOpenedSessions += 1;
      if (hasSearch && hasListing) searchToListingSessions += 1;
      if (hasListing && has3d) listingTo3dSessions += 1;
      if (hasListing && hasAction) listingToActionSessions += 1;
    });

    const searchToListingRate =
      searchSubmittedSessions > 0
        ? Number((searchToListingSessions / searchSubmittedSessions).toFixed(4))
        : 0;
    const listingTo3dRate =
      listingOpenedSessions > 0
        ? Number((listingTo3dSessions / listingOpenedSessions).toFixed(4))
        : 0;
    const listingToActionRate =
      listingOpenedSessions > 0
        ? Number((listingToActionSessions / listingOpenedSessions).toFixed(4))
        : 0;

    return res.json({
      sessions: sessions.size,
      funnels: {
        search_to_listing: {
          from: searchSubmittedSessions,
          completed: searchToListingSessions,
          conversionRate: searchToListingRate,
        },
        listing_to_3d: {
          from: listingOpenedSessions,
          completed: listingTo3dSessions,
          conversionRate: listingTo3dRate,
        },
        listing_to_save_or_contact: {
          from: listingOpenedSessions,
          completed: listingToActionSessions,
          conversionRate: listingToActionRate,
        },
      },
    });
  } catch (err) {
    console.error("GET /api/events/funnels failed", err);
    return res.status(500).json({ error: "Failed to compute funnels" });
  }
});

module.exports = router;
