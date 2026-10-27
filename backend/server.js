const express = require("express");
const cors = require("cors");
const { CITIES } = require("./data/rainfall");
const { assess, ValidationError } = require("./lib/assess");
const { resolveClimate } = require("./lib/weather");

const app = express();
const PORT = process.env.PORT || 4000;

// Comma-separated list of allowed frontend origins, e.g. https://jalsanchay.vercel.app
const allowed = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: allowed.includes("*") ? true : allowed }));
app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "jalsanchay-api" });
});

app.get("/api/cities", (_req, res) => {
  res.json(CITIES);
});

// Rainfall lookup for a coordinate (handy for debugging the weather service)
app.get("/api/climate", async (req, res, next) => {
  try {
    res.json(await resolveClimate({ lat: req.query.lat, lon: req.query.lon }));
  } catch (err) {
    next(err);
  }
});

app.post("/api/assess", async (req, res, next) => {
  try {
    const body = req.body || {};
    const climate = await resolveClimate(body);
    res.json(assess(body, climate));
  } catch (err) {
    next(err);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`JalSanchay API running on http://localhost:${PORT}`));
}

module.exports = app;
