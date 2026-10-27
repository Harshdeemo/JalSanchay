const test = require("node:test");
const assert = require("node:assert");
const { resolveClimate, summarise } = require("../lib/weather");

// 10 fake years: 4 mm of rain every 4th day, dry in between
function fakeDaily(startYear, years) {
  const time = [];
  const precip = [];
  for (let y = startYear; y < startYear + years; y++) {
    const d = new Date(Date.UTC(y, 0, 1));
    while (d.getUTCFullYear() === y) {
      time.push(d.toISOString().slice(0, 10));
      precip.push(time.length % 4 === 0 ? 4 : 0);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return { time, precipitation_sum: precip };
}

test("summarise computes yearly rainfall, rainy days and dry spell", () => {
  const { time, precipitation_sum } = fakeDaily(2016, 10);
  const s = summarise(time, precipitation_sum);
  assert.ok(Math.abs(s.rainfallMm - 365) < 15);
  assert.ok(Math.abs(s.rainyDays - 91) < 5);
  assert.strictEqual(s.dryDays, 3);
  assert.strictEqual(s.monthlyMm.length, 12);
});

test("live lookup is used when the service answers", async () => {
  const daily = fakeDaily(2016, 10);
  const fetchImpl = async () => ({ ok: true, json: async () => ({ daily }) });
  const c = await resolveClimate({ lat: 11.11, lon: 22.22 }, { fetchImpl, now: new Date("2026-10-27") });
  assert.strictEqual(c.source, "open-meteo");
  assert.ok(c.rainfallMm > 300);
});

test("falls back to nearest city when the service fails", async () => {
  const fetchImpl = async () => {
    throw new Error("offline");
  };
  const c = await resolveClimate({ lat: 28.7, lon: 77.1 }, { fetchImpl });
  assert.strictEqual(c.source, "city-table");
  assert.match(c.place, /Delhi/);
});

test("manual rainfall wins, and missing location is an error", async () => {
  const c = await resolveClimate({ rainfallMm: 900 });
  assert.strictEqual(c.source, "manual");
  await assert.rejects(() => resolveClimate({}), /Pin a location/);
  await assert.rejects(() => resolveClimate({ rainfallMm: 5 }), /between 50 and 12000/);
});
