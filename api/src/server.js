const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

const listingsRouter = require("./routes/listings");
const adminListingsRouter = require("./routes/adminListings");

const envFile = process.env.USE_LOCAL_ENV === "1" ? ".env.local" : ".env";
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

const app = express();
const port = Number(process.env.PORT || 5050);
const corsOrigin = process.env.CORS_ORIGIN;
const defaultAllowedOrigins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "null",
]);
const configuredOrigins = new Set(
  (corsOrigin || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const allowedOrigins = new Set([...configuredOrigins, ...defaultAllowedOrigins]);

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients may not send an Origin header.
      if (!origin) return callback(null, true);
      if (!allowedOrigins.size || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/listings", listingsRouter);
app.use("/api/admin/listings", adminListingsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
