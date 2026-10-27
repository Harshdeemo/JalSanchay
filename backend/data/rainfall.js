// Approximate long-term annual rainfall (mm) and typical longest dry spell (days)
// for some Indian cities. Used only as a FALLBACK when the live weather lookup
// is unavailable. Rounded planning values, NOT official data.
const CITIES = [
  { id: "ahmedabad", name: "Ahmedabad", lat: 23.03, lon: 72.58, rainfallMm: 800, dryDays: 240 },
  { id: "bengaluru", name: "Bengaluru", lat: 12.97, lon: 77.59, rainfallMm: 970, dryDays: 120 },
  { id: "bhopal", name: "Bhopal", lat: 23.26, lon: 77.41, rainfallMm: 1150, dryDays: 210 },
  { id: "chandigarh", name: "Chandigarh / Mohali", lat: 30.73, lon: 76.78, rainfallMm: 1100, dryDays: 200 },
  { id: "chennai", name: "Chennai", lat: 13.08, lon: 80.27, rainfallMm: 1400, dryDays: 180 },
  { id: "delhi", name: "Delhi", lat: 28.61, lon: 77.21, rainfallMm: 790, dryDays: 240 },
  { id: "guwahati", name: "Guwahati", lat: 26.14, lon: 91.74, rainfallMm: 1700, dryDays: 90 },
  { id: "hyderabad", name: "Hyderabad", lat: 17.39, lon: 78.49, rainfallMm: 800, dryDays: 210 },
  { id: "jaipur", name: "Jaipur", lat: 26.91, lon: 75.79, rainfallMm: 650, dryDays: 260 },
  { id: "kochi", name: "Kochi", lat: 9.93, lon: 76.27, rainfallMm: 3000, dryDays: 100 },
  { id: "kolkata", name: "Kolkata", lat: 22.57, lon: 88.36, rainfallMm: 1760, dryDays: 150 },
  { id: "lucknow", name: "Lucknow", lat: 26.85, lon: 80.95, rainfallMm: 1010, dryDays: 230 },
  { id: "ludhiana", name: "Ludhiana", lat: 30.9, lon: 75.86, rainfallMm: 700, dryDays: 230 },
  { id: "mumbai", name: "Mumbai", lat: 19.08, lon: 72.88, rainfallMm: 2400, dryDays: 210 },
  { id: "patna", name: "Patna", lat: 25.59, lon: 85.14, rainfallMm: 1100, dryDays: 200 },
  { id: "pune", name: "Pune", lat: 18.52, lon: 73.86, rainfallMm: 720, dryDays: 220 },
];

module.exports = { CITIES };
