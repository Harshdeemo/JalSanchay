const { CITIES } = require("../data/rainfall");
const { ValidationError } = require("./assess");

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const cache = new Map();

// Bad input is reported to the client as HTTP 400
const ClimateInputError = ValidationError;

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function nearestCity(lat, lon) {
  let best = null;
  for (const c of CITIES) {
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (!best || d < best.km) best = { city: c, km: d };
  }
  return best;
}

// Turns daily precipitation into the yearly figures the sizing engine needs.
function summarise(times, precip) {
  const years = new Set();
  const monthly = Array(12).fill(0);
  let total = 0;
  let rainyDays = 0;
  const longestDry = new Map(); // year -> longest dry streak
  let streak = 0;
  let streakYear = null;

  for (let i = 0; i < times.length; i++) {
    const year = times[i].slice(0, 4);
    const month = Number(times[i].slice(5, 7)) - 1;
    const p = Number(precip[i]) || 0;
    years.add(year);
    total += p;
    monthly[month] += p;
    if (p >= 1) rainyDays++;

    if (year !== streakYear) {
      streakYear = year;
      streak = 0;
    }
    if (p < 1) {
      streak++;
      longestDry.set(year, Math.max(longestDry.get(year) || 0, streak));
    } else {
      streak = 0;
    }
  }

  const n = years.size;
  if (n < 3) throw new Error("Not enough weather data");

  const dry = [...longestDry.values()].sort((a, b) => a - b);
  const median = dry[Math.floor(dry.length / 2)] || 0;

  return {
    rainfallMm: Math.round(total / n),
    rainyDays: Math.round(rainyDays / n),
    dryDays: median,
    monthlyMm: monthly.map((m) => Math.round((m / n) * 10) / 10),
    years: n,
  };
}

async function fetchClimate(lat, lon, { fetchImpl = fetch, now = new Date() } = {}) {
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  if (cache.has(key)) return cache.get(key);

  const endYear = now.getUTCFullYear() - 1;
  const startYear = endYear - 9;
  const url =
    `${ARCHIVE_URL}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=precipitation_sum&timezone=UTC`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
    const json = await res.json();
    const daily = json && json.daily;
    if (!daily || !Array.isArray(daily.time) || !Array.isArray(daily.precipitation_sum)) {
      throw new Error("Unexpected weather response");
    }
    const s = summarise(daily.time, daily.precipitation_sum);
    const out = {
      ...s,
      source: "open-meteo",
      sourceNote: `Open-Meteo historical average, ${startYear}–${endYear}, at your pinned location`,
    };
    cache.set(key, out);
    return out;
  } finally {
    clearTimeout(timer);
  }
}

function checkCoord(value, name, min, max) {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(n) || n < min || n > max) {
    return null;
  }
  return n;
}

// Decides where rainfall figures come from: manual entry, live weather, or the city table.
async function resolveClimate(body = {}, opts = {}) {
  if (body.rainfallMm !== undefined && body.rainfallMm !== null && body.rainfallMm !== "") {
    const mm = Number(body.rainfallMm);
    if (!Number.isFinite(mm) || mm < 50 || mm > 12000) {
      throw new ClimateInputError("rainfallMm must be between 50 and 12000");
    }
    const dry = Number(body.dryDays ?? 200);
    return {
      place: "Entered rainfall",
      rainfallMm: mm,
      dryDays: Number.isFinite(dry) ? Math.min(Math.max(dry, 0), 365) : 200,
      rainyDays: null,
      monthlyMm: null,
      source: "manual",
      sourceNote: "Rainfall figure you entered",
    };
  }

  const lat = checkCoord(body.lat, "lat", -90, 90);
  const lon = checkCoord(body.lon, "lon", -180, 180);

  if (lat !== null && lon !== null) {
    try {
      const c = await fetchClimate(lat, lon, opts);
      return { place: "Your location", ...c };
    } catch (err) {
      const { city, km } = nearestCity(lat, lon);
      return {
        place: `Near ${city.name}`,
        rainfallMm: city.rainfallMm,
        dryDays: city.dryDays,
        rainyDays: null,
        monthlyMm: null,
        source: "city-table",
        sourceNote: `Live weather was unavailable, so a rounded average for ${city.name} (${Math.round(km)} km away) was used`,
      };
    }
  }

  if (body.cityId) {
    const city = CITIES.find((c) => c.id === body.cityId);
    if (!city) throw new ClimateInputError("Unknown cityId");
    return {
      place: city.name,
      rainfallMm: city.rainfallMm,
      dryDays: city.dryDays,
      rainyDays: null,
      monthlyMm: null,
      source: "city-table",
      sourceNote: `Rounded average rainfall for ${city.name}`,
    };
  }

  throw new ClimateInputError("Pin a location on the map (lat, lon) or enter a rainfall figure");
}

module.exports = { fetchClimate, resolveClimate, summarise, nearestCity, ClimateInputError };
