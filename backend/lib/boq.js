const R = require("../data/rates");

const r1 = (n) => Math.round(n * 10) / 10;

// Builds an itemised Bill of Quantities from the sized system.
function buildBoq({ roofArea, perimeter, peakFlowLpm, tankLitres, pit }) {
  const items = [];
  const add = (item, spec, qty, unit, rate) =>
    items.push({ item, spec, qty: r1(qty), unit, rate: Math.round(rate), amount: Math.round(qty * rate) });

  const gutterM = Math.max(3, Math.ceil(perimeter * 0.5));
  const downpipes = Math.max(1, Math.ceil(roofArea / R.roofPerDownpipe));

  add("Roof gutter", "PVC, along drainage edges", gutterM, "m", R.gutterPerM);
  add("Down-pipe", `90 mm PVC, ${downpipes} run(s) x ${R.downpipeHeightM} m`, downpipes * R.downpipeHeightM, "m", R.downpipePerM);
  add("First-flush diverter", "Discards the first dirty runoff", downpipes, "no.", R.firstFlushEach);

  if (peakFlowLpm <= 120) {
    add("Dual-media filter", "Sand + charcoal, up to 120 L/min", 1, "no.", R.filterSmall);
  } else {
    const units = Math.ceil(peakFlowLpm / 300);
    add("Dual-media filter", "Sand + charcoal, 300 L/min each", units, "no.", R.filterMedium);
  }

  add("Connecting pipe", "110 mm PVC to tank", R.connectPipeM, "m", R.connectPipePerM);

  const tankKind = tankLitres <= 10000 ? "HDPE" : "RCC / ferrocement";
  const tankRate = tankLitres <= 10000 ? R.tankHdpePerL : R.tankRccPerL;
  add(`Storage tank (${tankKind})`, `${tankLitres.toLocaleString("en-IN")} L with overflow`, 1, "no.", tankLitres * tankRate);

  if (pit) {
    const { sideM, depthM } = pit;
    const dig = (sideM + 0.4) ** 2 * depthM;
    add("Pit excavation", `${sideM} x ${sideM} m, ${depthM} m deep`, dig, "m³", R.excavationPerM3);
    add("Brick lining", "Perforated brick wall", 4 * sideM * depthM, "m²", R.brickLiningPerM2);
    add("Boulders, gravel and sand fill", "Graded filter media", sideM * sideM * depthM, "m³", R.fillPerM3);
    add("Pit cover slab", "With inspection opening", 1, "no.", R.pitCoverSlab);
    add("Tank overflow pipe to pit", "110 mm PVC", R.overflowPipeM, "m", R.overflowPipePerM);
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const labour = Math.round(subtotal * R.labourShare);
  const total = Math.round((subtotal + labour) / 500) * 500;

  return { items, subtotal, labour, total, tankKind };
}

module.exports = { buildBoq };
