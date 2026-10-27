const { buildBoq } = require("./boq");

// Share of rain that actually runs off each roof type
const RUNOFF = {
  concrete: 0.85,
  tile: 0.75,
  metal: 0.9,
  asbestos: 0.8,
  thatch: 0.5,
};

const FILTER_EFFICIENCY = 0.9;      // losses in first flush + filter
const LPCD = 135;                   // litres per person per day (urban planning figure)
const NON_POTABLE_SHARE = 0.4;      // flushing, washing, gardening
const MAX_AREA = 100000;
const TANK_DAYS = 15;               // days of non-drinking demand the tank should hold
const PEAK_INTENSITY_MM_H = 75;     // used to size filters
const DESIGN_STORM_MM = 25;         // 30 minutes at 50 mm/h, used to size the recharge pit
const GRAVEL_VOID = 0.35;           // share of a filled pit that can hold water
const SOIL_FACTOR = { sandy: 0.8, loamy: 1.0, clayey: 1.0 };
const DEFAULT_SHARES = [0.01, 0.01, 0.01, 0.02, 0.03, 0.1, 0.27, 0.28, 0.17, 0.06, 0.03, 0.01];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

class ValidationError extends Error {}

function num(value, name, { min, max }) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${name} must be a number`);
  if (n < min || n > max) throw new ValidationError(`${name} must be between ${min} and ${max}`);
  return n;
}

const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

function validate(input = {}) {
  const roofArea = num(input.roofArea, "roofArea", { min: 5, max: MAX_AREA });
  const dwellers = num(input.dwellers, "dwellers", { min: 1, max: 500 });
  const openSpace = num(input.openSpace ?? 0, "openSpace", { min: 0, max: MAX_AREA });
  const tankerRate = num(input.tankerRate ?? 80, "tankerRate", { min: 0, max: 2000 });
  const perimeter =
    input.perimeter === undefined || input.perimeter === null || input.perimeter === ""
      ? 4 * Math.sqrt(roofArea)
      : num(input.perimeter, "perimeter", { min: 4, max: 50000 });

  if (!RUNOFF[input.roofType]) {
    throw new ValidationError(`roofType must be one of: ${Object.keys(RUNOFF).join(", ")}`);
  }
  const soil = ["sandy", "loamy", "clayey"].includes(input.soil) ? input.soil : "loamy";

  return { roofArea, perimeter, dwellers, openSpace, tankerRate, soil, roofType: input.roofType };
}

function verdictFor(coverage) {
  if (coverage >= 0.5) return { level: "excellent", label: "Excellent potential" };
  if (coverage >= 0.25) return { level: "good", label: "Good potential" };
  if (coverage >= 0.1) return { level: "moderate", label: "Moderate potential" };
  return { level: "low", label: "Limited potential" };
}

// Recharge pit: holds the runoff of a design storm in a gravel-filled pit.
function sizePit({ roofArea, runoff, soil, openSpace }) {
  if (openSpace < 4 || soil === "clayey") return null;

  const waterM3 = roofArea * runoff * (DESIGN_STORM_MM / 1000) * SOIL_FACTOR[soil];
  const physicalM3 = Math.max(waterM3 / GRAVEL_VOID, 1.5);

  let side = 1.2;
  let depth = physicalM3 / (side * side);
  if (depth > 3) {
    depth = 3;
    side = Math.sqrt(physicalM3 / depth);
  }
  if (depth < 1.5) depth = 1.5;

  side = round(side, 1);
  depth = round(depth, 1);
  const footprint = round(side * side, 1);

  return {
    sideM: side,
    depthM: depth,
    footprintM2: footprint,
    designStormMm: DESIGN_STORM_MM,
    holdsLitres: Math.round(side * side * depth * GRAVEL_VOID * 1000),
    fitsOpenSpace: footprint <= openSpace * 0.6,
  };
}

// input: validated request body. climate: from lib/weather.js resolveClimate().
function assess(rawInput, climate) {
  const p = validate(rawInput);
  if (!climate || !Number.isFinite(climate.rainfallMm)) {
    throw new ValidationError("Rainfall data is required");
  }

  const runoff = RUNOFF[p.roofType];
  const annualLitres = climate.rainfallMm * p.roofArea * runoff * FILTER_EFFICIENCY;

  const dailyNonPotable = p.dwellers * LPCD * NON_POTABLE_SHARE;
  const annualDemand = p.dwellers * LPCD * 365;
  const coverage = annualLitres / annualDemand;

  // Tank holds about TANK_DAYS of non-drinking demand, but never more than a third of the yearly harvest
  const tankByDemand = dailyNonPotable * Math.min(climate.dryDays, TANK_DAYS);
  const tankCap = annualLitres / 3;
  let tankLitres = Math.round(Math.min(tankByDemand, tankCap) / 500) * 500;
  tankLitres = Math.min(Math.max(tankLitres, 1000), 50000);

  const peakFlowLpm = Math.round((p.roofArea * runoff * PEAK_INTENSITY_MM_H) / 60);
  const pit = sizePit({ roofArea: p.roofArea, runoff, soil: p.soil, openSpace: p.openSpace });

  const boq = buildBoq({
    roofArea: p.roofArea,
    perimeter: p.perimeter,
    peakFlowLpm,
    tankLitres,
    pit,
  });

  let why;
  if (pit) {
    why = `Roof water goes through a filter into a ${tankLitres.toLocaleString("en-IN")} L tank. When the tank is full, the overflow soaks into a recharge pit so the yard does not flood and the groundwater is topped up.`;
  } else if (p.soil === "clayey") {
    why = `Clayey soil drains slowly, so a recharge pit would not work well. A ${tankLitres.toLocaleString("en-IN")} L tank with an overflow to a drain is the practical choice.`;
  } else {
    why = `There is little open ground for a pit, so a ${tankLitres.toLocaleString("en-IN")} L tank with an overflow to a drain is the practical choice.`;
  }

  // Cash saving counts only water you would otherwise buy
  const usableLitres = Math.min(annualLitres, dailyNonPotable * 365);
  const annualSaving = Math.round((usableLitres / 1000) * p.tankerRate);
  const paybackYears = annualSaving > 0 ? round(boq.total / annualSaving, 1) : null;

  const monthlySum = climate.monthlyMm ? climate.monthlyMm.reduce((a, b) => a + b, 0) : 0;
  const shares = monthlySum > 0 ? climate.monthlyMm.map((m) => m / monthlySum) : DEFAULT_SHARES;
  const monthly = MONTHS.map((m, i) => ({ month: m, litres: Math.round(annualLitres * shares[i]) }));

  const steps = [
    "Clean the roof and fit gutters and down-pipes that lead to one collection point.",
    "Install the first-flush diverter and filter before water enters storage.",
    `Place the ${tankLitres.toLocaleString("en-IN")} L tank on firm ground with an overflow pipe.`,
    pit
      ? `Dig the recharge pit (${pit.sideM} x ${pit.sideM} m, ${pit.depthM} m deep), line it with perforated brick and fill with boulders, gravel and sand.`
      : "Direct the overflow to a storm drain or garden, away from the building foundation.",
    "Check local rules or subsidies; many municipalities encourage harvesting.",
  ];

  return {
    input: { ...p, perimeter: round(p.perimeter, 1) },
    climate: {
      place: climate.place,
      rainfallMm: climate.rainfallMm,
      rainyDays: climate.rainyDays ?? null,
      dryDays: climate.dryDays,
      source: climate.source,
      sourceNote: climate.sourceNote,
    },
    harvest: {
      annualLitres: Math.round(annualLitres),
      runoffCoefficient: runoff,
      efficiency: FILTER_EFFICIENCY,
      peakFlowLpm,
    },
    demand: {
      annualLitres: Math.round(annualDemand),
      dailyNonPotableLitres: Math.round(dailyNonPotable),
      coveragePercent: round(coverage * 100, 1),
    },
    verdict: verdictFor(coverage),
    system: {
      title: pit ? "Storage tank + recharge pit" : "Storage tank",
      why,
      tank: { litres: tankLitres, kind: boq.tankKind },
      pit,
    },
    boq: { items: boq.items, subtotal: boq.subtotal, labour: boq.labour, total: boq.total },
    cost: { installInr: boq.total, annualSavingInr: annualSaving, paybackYears },
    monthly,
    steps,
    disclaimer:
      "Planning-level estimate based on historical averages and generic rates. Confirm sizes and prices with a qualified engineer and local suppliers before building.",
  };
}

module.exports = { assess, validate, sizePit, ValidationError, RUNOFF };
