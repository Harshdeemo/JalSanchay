// Satellite map with a simple click-to-draw polygon tool.
// Area and perimeter are measured with Turf.js (geodesic, so Earth's curvature is handled).
(function () {
  const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
  const ROOF_STYLE = { color: "#e08a2c", weight: 2, fillColor: "#e08a2c", fillOpacity: 0.3 };

  window.RoofMap = function (elId, { onChange, onPin, onMessage }) {
    const map = L.map(elId).setView([22.5, 79], 5);
    L.tileLayer(IMAGERY, {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    }).addTo(map);
    L.tileLayer(LABELS, { maxZoom: 20, maxNativeZoom: 19, opacity: 0.9 }).addTo(map);

    let drawing = false;
    let points = [];
    let markers = [];
    let preview = null;
    let polygon = null;
    let pin = null;

    const ui = { draw: null, finish: null, undo: null, clear: null };

    function refreshButtons() {
      if (ui.finish) ui.finish.disabled = !(drawing && points.length >= 3);
      if (ui.undo) ui.undo.disabled = !(drawing && points.length > 0);
      if (ui.clear) ui.clear.disabled = !(drawing || polygon);
      if (ui.draw) ui.draw.textContent = drawing ? "✏️ Drawing…" : polygon ? "✏️ Redraw roof" : "✏️ Draw roof";
    }

    function clearDrawingLayers() {
      markers.forEach((m) => map.removeLayer(m));
      markers = [];
      if (preview) map.removeLayer(preview);
      preview = null;
      points = [];
    }

    function startDrawing() {
      clear(true);
      drawing = true;
      map.getContainer().classList.add("drawing");
      refreshButtons();
      onMessage && onMessage("Click each corner of the roof. Click the first point or press “Finish shape” to close it.");
    }

    function addPoint(latlng) {
      points.push(latlng);
      const first = points.length === 1;
      const m = L.circleMarker(latlng, {
        radius: first ? 8 : 5,
        color: "#fff",
        weight: 2,
        fillColor: first ? "#e08a2c" : "#0f5f5a",
        fillOpacity: 1,
        bubblingMouseEvents: false,
      }).addTo(map);
      if (first) {
        m.on("click", () => {
          if (points.length >= 3) finish();
        });
      }
      markers.push(m);
      updatePreview();
      refreshButtons();
    }

    function updatePreview(cursor) {
      const path = cursor ? [...points, cursor] : points;
      if (!preview) {
        preview = L.polyline(path, { color: "#fff", weight: 2, dashArray: "6 6" }).addTo(map);
      } else {
        preview.setLatLngs(path);
      }
    }

    function undo() {
      if (!drawing || !points.length) return;
      points.pop();
      const m = markers.pop();
      if (m) map.removeLayer(m);
      updatePreview();
      refreshButtons();
    }

    function finish() {
      if (!drawing || points.length < 3) return;
      const latlngs = points.slice();
      clearDrawingLayers();
      drawing = false;
      map.getContainer().classList.remove("drawing");
      showPolygon(latlngs);
    }

    function measure(latlngs) {
      const ring = latlngs.map((p) => [p.lng, p.lat]);
      ring.push(ring[0]);
      const poly = turf.polygon([ring]);
      const area = turf.area(poly);
      const perimeter = turf.length(turf.polygonToLine(poly), { units: "kilometers" }) * 1000;
      const c = turf.centroid(poly).geometry.coordinates;
      const crossed = turf.kinks(poly).features.length > 0;
      return { area, perimeter, lat: c[1], lng: c[0], crossed };
    }

    function showPolygon(latlngs) {
      if (polygon) map.removeLayer(polygon);
      polygon = L.polygon(latlngs, ROOF_STYLE).addTo(map);
      const m = measure(latlngs);
      refreshButtons();
      onChange && onChange({ ...m, latlngs: latlngs.map((p) => [p.lat, p.lng]) });
    }

    function clear(silent) {
      clearDrawingLayers();
      if (polygon) map.removeLayer(polygon);
      polygon = null;
      drawing = false;
      map.getContainer().classList.remove("drawing");
      refreshButtons();
      if (!silent) onChange && onChange(null);
    }

    function setPin(lat, lng) {
      if (pin) map.removeLayer(pin);
      pin = L.circleMarker([lat, lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#e08a2c",
        fillOpacity: 1,
        bubblingMouseEvents: false,
      }).addTo(map);
    }

    function flyTo(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 19);
    }

    function loadPolygon(latlngs) {
      clear(true);
      const pts = latlngs.map((p) => L.latLng(p[0], p[1]));
      showPolygon(pts);
      map.fitBounds(polygon.getBounds(), { maxZoom: 20, padding: [30, 30] });
    }

    map.on("click", (e) => {
      if (drawing) {
        // Clicking near the first point closes the shape
        if (points.length >= 3) {
          const a = map.latLngToContainerPoint(points[0]);
          const b = map.latLngToContainerPoint(e.latlng);
          if (a.distanceTo(b) < 14) return finish();
        }
        addPoint(e.latlng);
      } else if (!polygon) {
        setPin(e.latlng.lat, e.latlng.lng);
        onPin && onPin(e.latlng.lat, e.latlng.lng);
      }
    });

    map.on("mousemove", (e) => {
      if (drawing && points.length) updatePreview(e.latlng);
    });

    function bind(buttons) {
      Object.assign(ui, buttons);
      ui.draw && ui.draw.addEventListener("click", startDrawing);
      ui.finish && ui.finish.addEventListener("click", finish);
      ui.undo && ui.undo.addEventListener("click", undo);
      ui.clear && ui.clear.addEventListener("click", () => clear(false));
      refreshButtons();
    }

    window.addEventListener("beforeprint", () => map.invalidateSize());
    window.addEventListener("afterprint", () => map.invalidateSize());

    return { bind, flyTo, setPin, loadPolygon, clear, invalidate: () => map.invalidateSize() };
  };
})();
