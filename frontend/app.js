const API = (window.JALSANCHAY_API || "").replace(/\/$/, "");
const STORE_KEY = "jalsanchay.reports";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("form"), error: $("error"), submit: $("submit"),
  roofArea: $("roofArea"), roofType: $("roofType"), dwellers: $("dwellers"),
  openSpace: $("openSpace"), soil: $("soil"), tankerRate: $("tankerRate"), rainfallMm: $("rainfallMm"),
  areaReadout: $("areaReadout"), mapHint: $("mapHint"),
  searchBox: $("searchBox"), searchBtn: $("searchBtn"), locateBtn: $("locateBtn"),
  results: $("results"), report: $("report"), savedList: $("savedList"),
};
$("year").textContent = new Date().getFullYear();

const state = {
  lat: null, lon: null, placeName: "",
  polyArea: null, perimeter: null, latlngs: null,
  cities: [], lastReport: null,
};

const fmt = (n) => Number(n).toLocaleString("en-IN");
const inr = (n) => "₹" + fmt(n);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const showError = (m) => { els.error.textContent = m || ""; };

/* ---------- Map ---------- */
const roofMap = RoofMap("map", {
  onChange(shape) {
    if (!shape) {
      state.polyArea = state.perimeter = state.latlngs = null;
      els.areaReadout.textContent = "";
      return;
    }
    state.polyArea = shape.area;
    state.perimeter = shape.perimeter;
    state.latlngs = shape.latlngs;
    state.lat = shape.lat;
    state.lon = shape.lng;
    els.roofArea.value = Math.round(shape.area * 10) / 10;
    const sqft = Math.round(shape.area * 10.7639);
    els.areaReadout.innerHTML =
      `Roof area: <b>${fmt(Math.round(shape.area * 10) / 10)} m²</b> (${fmt(sqft)} sq ft)` +
      (shape.crossed ? ` <span class="warn">The edges cross each other. Clear and redraw for a correct area.</span>` : "");
  },
  onPin(lat, lon) {
    state.lat = lat;
    state.lon = lon;
    state.placeName = "";
    els.mapHint.textContent = "Location pinned. Now draw your roof, or enter the area by hand.";
  },
  onMessage(msg) { els.mapHint.textContent = msg; },
});
roofMap.bind({ draw: $("drawBtn"), finish: $("finishBtn"), undo: $("undoBtn"), clear: $("clearBtn") });

// Typing a different area by hand means the drawn perimeter no longer applies
els.roofArea.addEventListener("input", () => {
  if (state.polyArea !== null && Math.abs(Number(els.roofArea.value) - state.polyArea) > 0.5) {
    state.perimeter = null;
  }
});

async function searchPlace() {
  const q = els.searchBox.value.trim();
  if (!q) return;
  els.searchBtn.disabled = true;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    if (!data.length) throw new Error("not found");
    const { lat, lon, display_name } = data[0];
    gotoPlace(Number(lat), Number(lon), display_name);
  } catch {
    els.mapHint.textContent = "Could not find that place. Try a nearby landmark or a city name.";
  } finally {
    els.searchBtn.disabled = false;
  }
}
els.searchBtn.addEventListener("click", searchPlace);
els.searchBox.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchPlace(); } });

function gotoPlace(lat, lon, name, zoom = 19) {
  state.lat = lat;
  state.lon = lon;
  state.placeName = name || "";
  roofMap.flyTo(lat, lon, zoom);
  roofMap.setPin(lat, lon);
  els.mapHint.textContent = "Zoom in until you can see your roof, then press “Draw roof”.";
}

els.locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) { els.mapHint.textContent = "Your browser cannot share its location."; return; }
  els.mapHint.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(
    (pos) => gotoPlace(pos.coords.latitude, pos.coords.longitude, "My location"),
    () => { els.mapHint.textContent = "Could not get your location. Allow location access or search for your address."; },
    { enableHighAccuracy: true, timeout: 12000 }
  );
});

/* ---------- Cities (for voice) ---------- */
fetch(`${API}/api/cities`).then((r) => r.json()).then((c) => { state.cities = c; }).catch(() => {});

/* ---------- Voice ---------- */
Voice.createAssistant({
  button: $("micBtn"), label: $("micLabel"), langSelect: $("voiceLang"), status: $("voiceStatus"),
  onResult({ fields, cityId }) {
    const map = { roofArea: els.roofArea, roofType: els.roofType, dwellers: els.dwellers, openSpace: els.openSpace, soil: els.soil };
    for (const [k, v] of Object.entries(fields)) if (map[k]) map[k].value = v;
    if (fields.roofArea !== undefined) state.perimeter = null;
    const city = state.cities.find((c) => c.id === cityId);
    if (city) gotoPlace(city.lat, city.lon, city.name, 13);
  },
});

/* ---------- Calculate ---------- */
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");

  const roofArea = Number(els.roofArea.value);
  if (!roofArea || roofArea < 5) return showError("Draw your roof on the map or enter its area (at least 5 m²).");
  const manualRain = els.rainfallMm.value.trim();
  if (!manualRain && (state.lat === null || state.lon === null)) {
    return showError("Search for your address and pin your roof on the map, or enter a yearly rainfall under “No map?”.");
  }

  const body = {
    roofArea,
    roofType: els.roofType.value,
    dwellers: Number(els.dwellers.value),
    openSpace: Number(els.openSpace.value || 0),
    soil: els.soil.value,
    tankerRate: Number(els.tankerRate.value || 0),
  };
  if (state.perimeter) body.perimeter = Math.round(state.perimeter * 10) / 10;
  if (manualRain) body.rainfallMm = Number(manualRain);
  else { body.lat = state.lat; body.lon = state.lon; }

  els.submit.disabled = true;
  els.submit.textContent = "Calculating…";
  try {
    const res = await fetch(`${API}/api/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    state.lastReport = { result: json, place: state.placeName, polygon: state.latlngs, lat: state.lat, lon: state.lon };
    renderReport(state.lastReport);
    els.results.hidden = false;
    setTimeout(() => {
      els.results.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  } catch (err) {
    showError(err.message === "Failed to fetch" ? "Cannot reach the server. Check that the backend is running and config.js points to it." : err.message);
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = "Calculate my plan";
  }
});

/* ---------- Report ---------- */
function renderReport({ result: r, place }) {
  const max = Math.max(...r.monthly.map((m) => m.litres), 1);
  const bars = r.monthly
    .map((m) => `<div class="bar" style="height:${Math.max((m.litres / max) * 100, 2)}%" title="${m.month}: ${fmt(m.litres)} L"></div>`)
    .join("");
  const labels = r.monthly.map((m) => `<span>${m.month[0]}</span>`).join("");
  const sys = r.system;
  const pit = sys.pit;
  const payback = r.cost.paybackYears ? `${r.cost.paybackYears} years` : "n/a";
  const where = place ? esc(place.split(",").slice(0, 3).join(",")) : esc(r.climate.place);
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const boqRows = r.boq.items
    .map((i) => `<tr><td>${esc(i.item)}<small>${esc(i.spec)}</small></td><td class="num-col">${fmt(i.qty)} ${esc(i.unit)}</td><td class="num-col">${inr(i.rate)}</td><td class="num-col">${inr(i.amount)}</td></tr>`)
    .join("");

  els.report.innerHTML = `
    <div class="report-head">
      <div>
        <h2>Your rainwater plan</h2>
        <p class="muted">${where} · ${today}</p>
      </div>
      <div class="report-actions no-print">
        <button type="button" class="btn small" id="pdfBtn">⬇ Download PDF</button>
        <button type="button" class="btn small ghost" id="saveBtn">Save report</button>
      </div>
    </div>

    <span class="badge ${r.verdict.level}">${r.verdict.label}</span>
    <p class="big">${fmt(r.harvest.annualLitres)} <small>litres of rainwater per year</small></p>
    <p>That covers about <b>${r.demand.coveragePercent}%</b> of your household's yearly water use.</p>

    <div class="metrics">
      <div class="metric"><b>${fmt(sys.tank.litres)} L</b><span>Recommended tank (${esc(sys.tank.kind)})</span></div>
      <div class="metric"><b>${pit ? `${pit.sideM} × ${pit.sideM} × ${pit.depthM} m` : "Not suitable"}</b><span>Recharge pit (width × length × depth)</span></div>
      <div class="metric"><b>${inr(r.cost.installInr)}</b><span>Estimated total cost</span></div>
      <div class="metric"><b>${inr(r.cost.annualSavingInr)}</b><span>Yearly saving · payback ${payback}</span></div>
    </div>

    <div class="chain">
      <div><b>Roof</b><span>${fmt(r.input.roofArea)} m²</span></div><i>→</i>
      <div><b>Filter</b><span>${fmt(r.harvest.peakFlowLpm)} L/min peak</span></div><i>→</i>
      <div><b>Tank</b><span>${fmt(sys.tank.litres)} L</span></div><i>→</i>
      <div><b>Recharge pit</b><span>${pit ? "Overflow soaks in" : "Overflow to drain"}</span></div>
    </div>
    <p>${esc(sys.why)}</p>
    ${pit && !pit.fitsOpenSpace ? `<p class="warn">The pit footprint (${pit.footprintM2} m²) is large for your open ground. Consider two smaller pits or a recharge trench.</p>` : ""}

    <h3>Rainfall used</h3>
    <p>${fmt(r.climate.rainfallMm)} mm per year${r.climate.rainyDays ? `, about ${r.climate.rainyDays} rainy days` : ""}, longest dry spell about ${r.climate.dryDays} days.
    <span class="muted">${esc(r.climate.sourceNote)}.</span></p>

    <h3>Typical monthly harvest</h3>
    <div class="bars">${bars}</div>
    <div class="bar-labels">${labels}</div>

    <h3>Bill of quantities (BOQ)</h3>
    <div class="table-wrap">
      <table class="boq">
        <thead><tr><th>Item</th><th class="num-col">Qty</th><th class="num-col">Rate</th><th class="num-col">Amount</th></tr></thead>
        <tbody>${boqRows}</tbody>
        <tfoot>
          <tr><td colspan="3">Materials subtotal</td><td class="num-col">${inr(r.boq.subtotal)}</td></tr>
          <tr><td colspan="3">Labour, bends, clamps and valves</td><td class="num-col">${inr(r.boq.labour)}</td></tr>
          <tr class="total"><td colspan="3">Estimated total</td><td class="num-col">${inr(r.cost.installInr)}</td></tr>
        </tfoot>
      </table>
    </div>

    <h3>Next steps</h3>
    <ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <p class="note">${esc(r.disclaimer)}</p>
  `;

  $("pdfBtn").addEventListener("click", () => {
    roofMap.invalidate();
    window.print();
  });
  $("saveBtn").addEventListener("click", saveReport);
}

/* ---------- Saved reports (this device only) ---------- */
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function writeSaved(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 20))); return true; } catch { return false; }
}

function saveReport() {
  if (!state.lastReport) return;
  const r = state.lastReport;
  const entry = {
    id: String(Date.now()),
    savedAt: new Date().toISOString(),
    label: (r.place ? r.place.split(",").slice(0, 2).join(",") : r.result.climate.place) || "Saved plan",
    report: r,
  };
  const ok = writeSaved([entry, ...loadSaved()]);
  $("saveBtn").textContent = ok ? "Saved ✓" : "Could not save";
  renderSaved();
}

function renderSaved() {
  const list = loadSaved();
  if (!list.length) {
    els.savedList.innerHTML = `<p class="muted">No saved reports yet. Calculate a plan and press “Save report”.</p>`;
    return;
  }
  els.savedList.innerHTML = list
    .map((s) => `
      <div class="saved-row">
        <div><b>${esc(s.label)}</b><span class="muted">${new Date(s.savedAt).toLocaleDateString("en-IN")} · ${fmt(s.report.result.harvest.annualLitres)} L/year · ${inr(s.report.result.cost.installInr)}</span></div>
        <div>
          <button type="button" class="btn small ghost" data-open="${s.id}">Open</button>
          <button type="button" class="btn small ghost" data-del="${s.id}">Delete</button>
        </div>
      </div>`)
    .join("");
}

els.savedList.addEventListener("click", (e) => {
  const open = e.target.dataset.open;
  const del = e.target.dataset.del;
  const list = loadSaved();
  if (del) { writeSaved(list.filter((s) => s.id !== del)); renderSaved(); }
  if (open) {
    const s = list.find((x) => x.id === open);
    if (!s) return;
    state.lastReport = s.report;
    openPlannerModal();
    if (s.report.polygon) roofMap.loadPolygon(s.report.polygon);
    else if (s.report.lat !== null) gotoPlace(s.report.lat, s.report.lon, s.report.place || "", 16);
    renderReport(s.report);
    els.results.hidden = false;
    setTimeout(() => {
      els.results.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  }
});
renderSaved();

/* ---------- Planner Modal Controller ---------- */
const modalEls = {
  backdrop: $("plannerModal"),
  closeBtn: $("closePlannerBtn"),
  body: $("plannerModalBody"),
};

function openPlannerModal() {
  if (!modalEls.backdrop) return;
  modalEls.backdrop.classList.add("open");
  modalEls.backdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  // Invalidate Leaflet map size once visible so tiles and drawing render crisply
  setTimeout(() => {
    if (roofMap && typeof roofMap.invalidate === "function") {
      roofMap.invalidate();
    }
  }, 160);
}

function closePlannerModal() {
  if (!modalEls.backdrop) return;
  modalEls.backdrop.classList.remove("open");
  modalEls.backdrop.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

if (modalEls.closeBtn) {
  modalEls.closeBtn.addEventListener("click", closePlannerModal);
}

if (modalEls.backdrop) {
  modalEls.backdrop.addEventListener("click", (e) => {
    if (e.target === modalEls.backdrop) {
      closePlannerModal();
    }
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalEls.backdrop && modalEls.backdrop.classList.contains("open")) {
    closePlannerModal();
  }
});

// Wire up all "Get Started" and "Planner" triggers
document.querySelectorAll('.hero-get-started, a[href="#planner"]').forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openPlannerModal();
  });
});

// If URL has #planner on initial load, open the modal
if (window.location.hash === "#planner") {
  openPlannerModal();
}
