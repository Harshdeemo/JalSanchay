const test = require("node:test");
const assert = require("node:assert");
const { parse } = require("../voice.js");

test("English: roof, people, city, material", () => {
  const r = parse("Roof 120 square meters, 4 people, Delhi, concrete");
  assert.strictEqual(r.fields.roofArea, 120);
  assert.strictEqual(r.fields.dwellers, 4);
  assert.strictEqual(r.fields.roofType, "concrete");
  assert.strictEqual(r.cityId, "delhi");
});

test("Hindi with Devanagari digits and square feet", () => {
  const r = parse("छत १००० वर्ग फीट, ४ लोग, जयपुर");
  assert.strictEqual(r.fields.roofArea, 92.9);
  assert.strictEqual(r.fields.dwellers, 4);
  assert.strictEqual(r.cityId, "jaipur");
});

test("open ground is told apart from roof area", () => {
  const r = parse("roof 150 square meters and open ground 20 square meters");
  assert.strictEqual(r.fields.roofArea, 150);
  assert.strictEqual(r.fields.openSpace, 20);
});

test("soil and roof type words", () => {
  const r = parse("clay soil with a metal sheet roof");
  assert.strictEqual(r.fields.soil, "clayey");
  assert.strictEqual(r.fields.roofType, "metal");
});

test("unrelated speech fills nothing", () => {
  const r = parse("what is the weather like");
  assert.deepStrictEqual(r.fields, {});
  assert.strictEqual(r.cityId, null);
});
