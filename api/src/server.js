const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const listingsRouter = require("./routes/listings");
const adminListingsRouter = require("./routes/adminListings");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5050);
const corsOrigin = process.env.CORS_ORIGIN;

app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(",").map((item) => item.trim()) : true,
  }),
);
app.use(express.json());

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
