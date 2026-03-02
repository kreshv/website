const express = require("express");
const { z } = require("zod");

const router = express.Router();

const intentSchema = z.object({
  query: z.string().trim().min(2).max(600),
});

const copilotSchema = z.object({
  question: z.string().trim().min(2).max(2000),
  mode: z.enum(["saved_compare", "listing_qa", "results_qa", "compare_qa", "tour_assistant"]).optional(),
  listings: z.array(z.any()).min(1).max(24),
});

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_INTENT_MODEL = process.env.OPENAI_INTENT_MODEL || "gpt-5-nano";
const DEFAULT_COPILOT_MODEL = process.env.OPENAI_COPILOT_MODEL || "gpt-5-mini";

function hasOpenAiKey() {
  return Boolean((process.env.OPENAI_API_KEY || "").trim());
}

function extractOutputText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload.output)) {
    const out = [];
    payload.output.forEach((item) => {
      if (!item || !Array.isArray(item.content)) return;
      item.content.forEach((chunk) => {
        const text = chunk && typeof chunk.text === "string" ? chunk.text : "";
        if (text.trim()) out.push(text.trim());
      });
    });
    if (out.length) return out.join("\n");
  }

  if (Array.isArray(payload.choices) && payload.choices[0] && payload.choices[0].message) {
    const content = payload.choices[0].message.content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }

  return "";
}

async function callOpenAi({ model, instructions, input, maxOutputTokens = 800 }) {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: instructions }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: input }],
        },
      ],
      max_output_tokens: maxOutputTokens,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const text = extractOutputText(payload);
    const message =
      (payload && payload.error && payload.error.message) ||
      text ||
      `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  return extractOutputText(payload);
}

function safeJsonFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_nestedError) {
      return null;
    }
  }
}

function normalizeStringList(values, limit = 12) {
  if (!Array.isArray(values)) return [];
  const out = [];
  values.forEach((value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    if (out.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
    out.push(clean);
  });
  return out.slice(0, limit);
}

function normalizeNumberList(values, limit = 5) {
  if (!Array.isArray(values)) return [];
  const out = [];
  values.forEach((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return;
    const normalized = String(Math.floor(numeric));
    if (out.includes(normalized)) return;
    out.push(normalized);
  });
  return out.slice(0, limit);
}

function normalizePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "";
  return String(Math.floor(numeric));
}

function normalizeIntentPayload(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const filters = source.filters && typeof source.filters === "object" ? source.filters : source;

  return {
    minPrice: normalizePrice(filters.minPrice),
    maxPrice: normalizePrice(filters.maxPrice),
    boroughs: normalizeStringList(filters.boroughs, 2),
    beds: normalizeNumberList(filters.beds, 2),
    baths: normalizeNumberList(filters.baths, 2),
    neighborhoods: normalizeStringList(filters.neighborhoods, 8),
    features: normalizeStringList(filters.features, 12),
    amenities: normalizeStringList(filters.amenities, 12),
    subway: normalizeStringList(filters.subway, 8),
    searchQuery:
      typeof source.searchQuery === "string" && source.searchQuery.trim()
        ? source.searchQuery.trim()
        : "",
    summary:
      typeof source.summary === "string" && source.summary.trim() ? source.summary.trim() : "",
  };
}

function compactListing(listing) {
  return {
    id: listing.id,
    title: listing.title || "",
    address: listing.address || "",
    borough: listing.borough || "",
    neighborhood: listing.neighborhood || "",
    price: listing.price,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft || null,
    floorLevel: listing.floorLevel || null,
    fees: listing.fees || null,
    commuteNotes: listing.commuteNotes || "",
    unitFeatures: Array.isArray(listing.unitFeatures) ? listing.unitFeatures.slice(0, 20) : [],
    buildingFeatures: Array.isArray(listing.buildingFeatures) ? listing.buildingFeatures.slice(0, 20) : [],
    subwayLines: Array.isArray(listing.subwayLines) ? listing.subwayLines.slice(0, 20) : [],
    imageUrl: listing.imageUrl || "",
    floorplanImageUrl: listing.floorplanImageUrl || listing.floorPlanImageUrl || "",
    mapImageUrl: listing.mapImageUrl || "",
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function normalizeIsoDateTime(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const parsed = new Date(clean);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString();
}

function normalizeTourBookingPayload(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const name = String(source.name || source.clientName || "").trim().slice(0, 120);
  const email = String(source.email || source.clientEmail || "")
    .trim()
    .slice(0, 160);
  const phone = String(source.phone || source.clientPhone || "")
    .trim()
    .slice(0, 50);
  const timezone = String(source.timezone || "").trim().slice(0, 80);
  const notes = String(source.notes || "").trim().slice(0, 1400);
  const startAt = normalizeIsoDateTime(source.startAt);
  const endAt = normalizeIsoDateTime(source.endAt);
  const durationRaw = Number(source.durationMinutes);
  const durationMinutes = Number.isFinite(durationRaw)
    ? clampNumber(Math.round(durationRaw), 20, 240)
    : 45;

  let ready = Boolean(source.ready);
  if (!startAt || !name || (!email && !phone)) {
    ready = false;
  }

  return {
    ready,
    name,
    email,
    phone,
    startAt,
    endAt,
    durationMinutes,
    timezone,
    notes,
  };
}

router.post("/intent-filters", async (req, res) => {
  if (!hasOpenAiKey()) {
    return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });
  }

  const parsed = intentSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  const instructions = [
    "You convert NYC apartment search text into strict filter JSON.",
    "Output JSON only. No markdown.",
    "Do not invent facts.",
    "Schema:",
    "{",
    '  "filters": {',
    '    "minPrice": number|null,',
    '    "maxPrice": number|null,',
    '    "boroughs": string[],',
    '    "beds": number[],',
    '    "baths": number[],',
    '    "neighborhoods": string[],',
    '    "features": string[],',
    '    "amenities": string[],',
    '    "subway": string[]',
    "  },",
    '  "searchQuery": string,',
    '  "summary": string',
    "}",
    "Only include concrete values from user intent.",
    "If unknown, use null/empty arrays.",
  ].join("\n");

  try {
    const rawText = await callOpenAi({
      model: DEFAULT_INTENT_MODEL,
      instructions,
      input: parsed.data.query,
      maxOutputTokens: 500,
    });

    const parsedJson = safeJsonFromText(rawText);
    if (!parsedJson) {
      return res.status(502).json({ error: "Model returned invalid JSON" });
    }

    const intent = normalizeIntentPayload(parsedJson);
    return res.json({
      model: DEFAULT_INTENT_MODEL,
      intent,
    });
  } catch (error) {
    return res.status(502).json({ error: String(error && error.message ? error.message : error) });
  }
});

router.post("/copilot", async (req, res) => {
  if (!hasOpenAiKey()) {
    return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });
  }

  const parsed = copilotSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  const listings = parsed.data.listings.map(compactListing);
  const mode = parsed.data.mode || "saved_compare";

  if (mode === "tour_assistant") {
    const instructions = [
      "You are a real-estate tour scheduling copilot.",
      "Use ONLY the provided listing JSON and user message.",
      "Never invent listing facts.",
      "Your output MUST be strict JSON and valid.",
      "Schema:",
      "{",
      '  "reply": string,',
      '  "tourBooking": {',
      '    "ready": boolean,',
      '    "name": string,',
      '    "email": string,',
      '    "phone": string,',
      '    "startAt": string,',
      '    "endAt": string,',
      '    "durationMinutes": number,',
      '    "timezone": string,',
      '    "notes": string',
      "  }",
      "}",
      "Set tourBooking.ready=true only when user clearly wants to schedule and provided:",
      "- name",
      "- at least one contact method (email or phone)",
      "- a clear date+time",
      "If anything is missing, set ready=false and ask only for missing details.",
      "Use ISO-8601 for startAt/endAt.",
      "Keep reply concise and practical.",
    ].join("\n");

    const input = [
      `Mode: ${mode}`,
      `Now (UTC): ${new Date().toISOString()}`,
      `Question: ${parsed.data.question}`,
      "Listings JSON:",
      JSON.stringify(listings, null, 2),
    ].join("\n\n");

    try {
      const raw = await callOpenAi({
        model: DEFAULT_COPILOT_MODEL,
        instructions,
        input,
        maxOutputTokens: 900,
      });
      const parsedJson = safeJsonFromText(raw);
      if (!parsedJson || typeof parsedJson !== "object") {
        return res.json({
          model: DEFAULT_COPILOT_MODEL,
          answer: raw || "I could not parse the scheduling response. Please rephrase.",
          tourBooking: normalizeTourBookingPayload({ ready: false }),
        });
      }

      const answer =
        typeof parsedJson.reply === "string" && parsedJson.reply.trim()
          ? parsedJson.reply.trim()
          : "Share your name, email or phone, and preferred date/time to schedule this tour.";
      const tourBooking = normalizeTourBookingPayload(
        parsedJson.tourBooking || parsedJson.booking || parsedJson
      );

      return res.json({
        model: DEFAULT_COPILOT_MODEL,
        answer,
        tourBooking,
      });
    } catch (error) {
      return res.status(502).json({ error: String(error && error.message ? error.message : error) });
    }
  }

  const instructions = [
    "You are a real-estate decision copilot.",
    "Use ONLY the provided listings JSON.",
    "Never invent missing values. If not provided, say 'not available'.",
    "Answer with concise plain text.",
    "Include concrete comparisons for price, beds/baths, neighborhood, transit, and amenities when available.",
    "When useful, end with a short recommendation and why.",
  ].join("\n");

  const input = [
    `Mode: ${mode}`,
    `Question: ${parsed.data.question}`,
    "Listings JSON:",
    JSON.stringify(listings, null, 2),
  ].join("\n\n");

  try {
    const answer = await callOpenAi({
      model: DEFAULT_COPILOT_MODEL,
      instructions,
      input,
      maxOutputTokens: 900,
    });

    return res.json({
      model: DEFAULT_COPILOT_MODEL,
      answer: answer || "I could not produce an answer from the provided listings.",
    });
  } catch (error) {
    return res.status(502).json({ error: String(error && error.message ? error.message : error) });
  }
});

module.exports = router;
