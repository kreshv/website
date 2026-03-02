const express = require("express");
const { z } = require("zod");

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
  .refine((payload) => payload.event || (Array.isArray(payload.events) && payload.events.length > 0), {
    message: "event or events is required",
  });

const MAX_EVENT_BUFFER = 5000;
const analyticsEvents = [];

function appendEvent(event) {
  analyticsEvents.push(event);
  if (analyticsEvents.length > MAX_EVENT_BUFFER) {
    analyticsEvents.splice(0, analyticsEvents.length - MAX_EVENT_BUFFER);
  }
}

function bySession() {
  const sessions = new Map();
  analyticsEvents.forEach((event) => {
    const sessionId = event.sessionId || "anon";
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, new Set());
    }
    sessions.get(sessionId).add(event.name);
  });
  return sessions;
}

router.post("/", (req, res) => {
  const parsed = ingestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid analytics payload", details: parsed.error.issues });
  }

  const incoming = [];
  if (parsed.data.event) incoming.push(parsed.data.event);
  if (Array.isArray(parsed.data.events)) incoming.push(...parsed.data.events);

  const nowIso = new Date().toISOString();
  incoming.forEach((event) => {
    appendEvent({
      name: event.name,
      ts: event.ts || nowIso,
      receivedAt: nowIso,
      sessionId: event.sessionId || "",
      props: event.props || {},
    });
  });

  return res.status(202).json({ ok: true, accepted: incoming.length, buffered: analyticsEvents.length });
});

router.get("/", (_req, res) => {
  const counts = {};
  analyticsEvents.forEach((event) => {
    counts[event.name] = (counts[event.name] || 0) + 1;
  });

  return res.json({
    total: analyticsEvents.length,
    uniqueEvents: Object.keys(counts).length,
    counts,
  });
});

router.get("/funnels", (_req, res) => {
  const sessions = bySession();
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
    searchSubmittedSessions > 0 ? Number((searchToListingSessions / searchSubmittedSessions).toFixed(4)) : 0;
  const listingTo3dRate =
    listingOpenedSessions > 0 ? Number((listingTo3dSessions / listingOpenedSessions).toFixed(4)) : 0;
  const listingToActionRate =
    listingOpenedSessions > 0 ? Number((listingToActionSessions / listingOpenedSessions).toFixed(4)) : 0;

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
});

module.exports = router;
