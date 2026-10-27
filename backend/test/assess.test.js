const test = require("node:test");
const assert = require("node:assert");
const { assess, sizePit, ValidationError } = require("../lib/assess");

const climate = { place: "Test", rainfallMm: 800, dryDays: 200, rainyDays: 40, monthlyMm: null, source: "manual", sourceNote: "" };
const base = { roofArea: 100, roofType: "concrete", dwellers: 4, openSpace: 20, soil: "sandy" };

test("harvest volume follows rain x area x runoff x efficiency", () => {
  const r = assess(base, climate);
  assert.strictEqual(r.harvest.annualLitres, Math.round(800 * 100 * 0.85 * 0.9));
});

test("open permeable ground adds a recharge pit", () => {
  const r = assess(base, climate);
  assert.ok(r.system.pit);
  assert.ok(r.system.pit.depthM >= 1.5 && r.system.pit.depthM <= 3.5);
  assert.ok(r.boq.items.some((i) => i.item.startsWith("Pit")));
});

test("clayey soil or tiny open space gives a tank only", () => {
  assert.strictEqual(assess({ ...base, soil: "clayey" }, climate).system.pit, null);
  assert.strictEqual(assess({ ...base, openSpace: 2 }, climate).system.pit, null);
});

test("BOQ total covers every line plus labour", () => {
  const r = assess(base, climate);
  const sum = r.boq.items.reduce((s, i) => s + i.amount, 0);
  assert.strictEqual(r.boq.subtotal, sum);
  assert.ok(Math.abs(r.boq.total - (sum + r.boq.labour)) <= 250);
  assert.strictEqual(r.cost.installInr, r.boq.total);
});

test("monthly chart uses real monthly rainfall when given", () => {
  const monthlyMm = [0, 0, 0, 0, 0, 0, 400, 400, 0, 0, 0, 0];
  const r = assess(base, { ...climate, monthlyMm });
  assert.strictEqual(r.monthly[6].litres, r.monthly[7].litres);
  assert.strictEqual(r.monthly[0].litres, 0);
});

test("rejects bad input", () => {
  assert.throws(() => assess({ ...base, roofArea: -4 }, climate), ValidationError);
  assert.throws(() => assess({ ...base, roofType: "glass" }, climate), ValidationError);
  assert.throws(() => assess(base, null), ValidationError);
});

test("sizePit returns null without space", () => {
  assert.strictEqual(sizePit({ roofArea: 100, runoff: 0.85, soil: "loamy", openSpace: 3 }), null);
});
