// Planning-level unit rates in INR. These are rough placeholders, NOT live market prices.
// Replace them with quotes from your local suppliers for a real estimate.
module.exports = {
  gutterPerM: 180,          // PVC gutter, per metre
  downpipePerM: 220,        // 90 mm PVC down-pipe, per metre
  downpipeHeightM: 3,       // assumed pipe length per down-pipe
  roofPerDownpipe: 50,      // one down-pipe per this many m² of roof
  connectPipeM: 10,         // 110 mm pipe from roof to tank, metres
  connectPipePerM: 150,
  firstFlushEach: 1800,     // first-flush diverter, per down-pipe
  filterSmall: 6000,        // dual-media filter up to 120 L/min
  filterMedium: 12000,      // dual-media filter up to 300 L/min
  tankHdpePerL: 9,          // HDPE tank, per litre (up to 10,000 L)
  tankRccPerL: 12,          // RCC / ferrocement tank, per litre
  excavationPerM3: 250,
  brickLiningPerM2: 900,
  fillPerM3: 1800,          // boulders + gravel + sand
  pitCoverSlab: 3000,
  overflowPipeM: 6,
  overflowPipePerM: 150,
  labourShare: 0.15,        // labour, bends, clamps, valves as a share of materials
};
