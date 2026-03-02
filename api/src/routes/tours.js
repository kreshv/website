const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");

const router = express.Router();

const tourStatusEnum = z.enum(["PENDING", "CONFIRMED", "CANCELLED"]);

const createTourSchema = z.object({
  listingId: z.number().int().positive().nullable().optional(),
  listingTitle: z.string().max(200).optional().nullable(),
  listingAddress: z.string().max(240).optional().nullable(),
  clientName: z.string().max(120),
  clientEmail: z.string().max(160).optional().nullable(),
  clientPhone: z.string().max(50).optional().nullable(),
  startAt: z.string().max(80),
  endAt: z.string().max(80).optional().nullable(),
  durationMinutes: z.number().int().min(20).max(240).optional(),
  timezone: z.string().max(80).optional().nullable(),
  notes: z.string().max(1400).optional().nullable(),
  source: z.string().max(50).optional().nullable(),
  status: tourStatusEnum.optional(),
});

const listToursSchema = z.object({
  from: z.string().max(80).optional(),
  to: z.string().max(80).optional(),
  status: tourStatusEnum.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(250),
});

const updateStatusSchema = z.object({
  status: tourStatusEnum,
});

function getAgentCalendarToken() {
  return String(process.env.AGENT_CALENDAR_TOKEN || "").trim();
}

function extractRequestToken(req) {
  const headerToken = trimText(req.get("x-agent-token"), 220);
  const queryToken = trimText(req.query && req.query.token, 220);
  return headerToken || queryToken;
}

function ensureAgentAccess(req, res) {
  const configuredToken = getAgentCalendarToken();
  if (!configuredToken) {
    res.status(503).json({ error: "AGENT_CALENDAR_TOKEN is not configured on server." });
    return false;
  }
  const providedToken = extractRequestToken(req);
  if (!providedToken || providedToken !== configuredToken) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function trimText(value, maxLen) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean.slice(0, maxLen);
}

function normalizeEmail(value) {
  const clean = trimText(value, 160).toLowerCase();
  if (!clean) return "";
  return clean;
}

function isEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseDate(value) {
  const clean = String(value || "").trim();
  if (!clean) return null;
  const date = new Date(clean);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function toIso(date) {
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function serializeTour(row) {
  const listing = row && row.listing ? row.listing : null;
  return {
    id: row.id,
    listingId: row.listingId,
    listingTitle: row.listingTitle || (listing && listing.title) || "",
    listingAddress: row.listingAddress || (listing && (listing.address || listing.title)) || "",
    clientName: row.clientName,
    clientEmail: row.clientEmail || "",
    clientPhone: row.clientPhone || "",
    startAt: toIso(row.startAt),
    endAt: toIso(row.endAt),
    timezone: row.timezone || "",
    status: row.status,
    source: row.source || "",
    notes: row.notes || "",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildIcsFromTours(tours) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yokeair//Tours//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Yokeair Tours",
  ];

  tours.forEach((tour) => {
    const address = tour.listingAddress || tour.listingTitle || "Apartment Tour";
    const summary = `Tour - ${address}`;
    const description = [
      `Client: ${tour.clientName || ""}`,
      `Email: ${tour.clientEmail || ""}`,
      `Phone: ${tour.clientPhone || ""}`,
      `Source: ${tour.source || ""}`,
      `Status: ${tour.status || ""}`,
      "",
      `${tour.notes || ""}`,
    ]
      .join("\n")
      .trim();

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:tour-${tour.id}@yokeair`);
    lines.push(`DTSTAMP:${icsDate(new Date())}`);
    lines.push(`DTSTART:${icsDate(tour.startAt)}`);
    lines.push(`DTEND:${icsDate(tour.endAt)}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (address) lines.push(`LOCATION:${escapeIcsText(address)}`);
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    if (tour.status === "CANCELLED") lines.push("STATUS:CANCELLED");
    else lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

router.post("/", async (req, res) => {
  const parsed = createTourSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  const input = parsed.data;
  const listingId = Number.isFinite(Number(input.listingId)) ? Number(input.listingId) : null;
  const clientName = trimText(input.clientName, 120);
  const clientEmail = normalizeEmail(input.clientEmail);
  const clientPhone = trimText(input.clientPhone, 50);
  const timezone = trimText(input.timezone, 80) || "America/New_York";
  const source = trimText(input.source, 50) || "copilot";
  const notes = trimText(input.notes, 1400);
  const startAt = parseDate(input.startAt);
  const endAtFromInput = parseDate(input.endAt);
  const durationMinutes = Number.isFinite(Number(input.durationMinutes))
    ? Math.max(20, Math.min(240, Math.round(Number(input.durationMinutes))))
    : 45;

  if (!clientName) return res.status(400).json({ error: "clientName is required" });
  if (!clientEmail && !clientPhone) {
    return res.status(400).json({ error: "Provide at least one contact: clientEmail or clientPhone" });
  }
  if (clientEmail && !isEmail(clientEmail)) {
    return res.status(400).json({ error: "clientEmail is invalid" });
  }
  if (!startAt) return res.status(400).json({ error: "startAt must be a valid date/time" });

  let listing = null;
  if (listingId) {
    listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, address: true },
    });
  }

  const listingTitle = trimText(input.listingTitle, 200) || (listing && listing.title) || "Apartment listing";
  const listingAddress =
    trimText(input.listingAddress, 240) ||
    (listing && (listing.address || listing.title)) ||
    listingTitle;

  let endAt = endAtFromInput;
  if (!endAt || endAt <= startAt) {
    endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  }

  try {
    const created = await prisma.tourRequest.create({
      data: {
        listingId: listingId || null,
        listingTitle,
        listingAddress,
        clientName,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        startAt,
        endAt,
        timezone,
        notes: notes || null,
        source,
        status: input.status || "PENDING",
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            address: true,
          },
        },
      },
    });

    return res.status(201).json({
      tour: serializeTour(created),
      calendarUrl: "/api/tours/calendar.ics",
    });
  } catch (error) {
    console.error("POST /api/tours failed", error);
    return res.status(500).json({ error: "Failed to create tour request" });
  }
});

router.get("/", async (req, res) => {
  if (!ensureAgentAccess(req, res)) return;
  const parsed = listToursSchema.safeParse(req.query || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params", details: parsed.error.issues });
  }

  const fromDate = parseDate(parsed.data.from);
  const toDate = parseDate(parsed.data.to);
  const where = {
    ...(fromDate || toDate
      ? {
          startAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
  };

  try {
    const rows = await prisma.tourRequest.findMany({
      where,
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            address: true,
          },
        },
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: parsed.data.limit,
    });

    return res.json({
      count: rows.length,
      tours: rows.map((row) => serializeTour(row)),
      calendarUrl: "/api/tours/calendar.ics",
    });
  } catch (error) {
    console.error("GET /api/tours failed", error);
    return res.status(500).json({ error: "Failed to fetch tours" });
  }
});

router.get("/calendar.ics", async (req, res) => {
  if (!ensureAgentAccess(req, res)) return;
  try {
    const rows = await prisma.tourRequest.findMany({
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 1500,
    });

    const body = buildIcsFromTours(rows);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="tour-calendar.ics"');
    return res.status(200).send(body);
  } catch (error) {
    console.error("GET /api/tours/calendar.ics failed", error);
    return res.status(500).json({ error: "Failed to build calendar" });
  }
});

router.patch("/:id/status", async (req, res) => {
  if (!ensureAgentAccess(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

  const parsed = updateStatusSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  try {
    const updated = await prisma.tourRequest.update({
      where: { id },
      data: { status: parsed.data.status },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            address: true,
          },
        },
      },
    });

    return res.json({ tour: serializeTour(updated) });
  } catch (error) {
    console.error("PATCH /api/tours/:id/status failed", error);
    return res.status(500).json({ error: "Failed to update tour status" });
  }
});

module.exports = router;
