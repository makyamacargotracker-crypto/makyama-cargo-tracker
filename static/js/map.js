class MakyamaGlobalMap {
  constructor(elementId) {
    this.elementId = elementId;
    this.map = null;
    this.markersLayer = null;
    this.lineLayer = null;
    this.geoCache = {};
  }

  init() {
    const el = document.getElementById(this.elementId);
    if (!el) return;

    if (!this.map) {
      this.map = L.map(this.elementId).setView([-6.1659, 39.2026], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap | MAKYAMA TRACKER'
      }).addTo(this.map);

      this.markersLayer = L.layerGroup().addTo(this.map);
      this.lineLayer = L.layerGroup().addTo(this.map);
    }

    setTimeout(() => this.map.invalidateSize(), 200);
  }

  normalizeFullPlace(placeName) {
    const raw = (placeName || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    // Hakikisha jina kamili lina ufafanuzi wa nchi/eneo likiwa limeandikwa kifupi
    if (!lower.includes('tanzania') && !lower.includes('zanzibar')) {
      return `${raw}, Zanzibar, Tanzania`;
    }
    return raw;
  }

  async resolvePlace(placeName) {
    const formatted = this.normalizeFullPlace(placeName);
    const key = formatted.toLowerCase();
    if (!key) return null;
    if (this.geoCache[key]) return this.geoCache[key];

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(formatted)}`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        this.geoCache[key] = coords;
        return coords;
      }
    } catch (e) {
      // Ikiwa huduma ya ramani haikupatikana muda huo
    }
    return null;
  }

  async renderCargoPoints(cargosList) {
    this.init();
    if (!this.map) return;

    this.markersLayer.clearLayers();
    this.lineLayer.clearLayers();

    const allBounds = [];

    for (const cargo of cargosList) {
      const routeCoords = [];

      if (cargo.initial_point && cargo.initial_point.place) {
        const initCoords = await this.resolvePlace(cargo.initial_point.place);
        if (initCoords) {
          allBounds.push(initCoords);
          L.circleMarker(initCoords, {
            radius: 8,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.9
          })
            .addTo(this.markersLayer)
            .bindPopup(`
              <div style="color:#0f172a; font-family:sans-serif;">
                <strong>🚀 Mwanzo (Initial Point)</strong><br/>
                <b>Mzigo:</b> ${cargo.cargo_name}<br/>
                <b>Eneo Kamili:</b> ${cargo.initial_point.place}<br/>
                <b>Agent 1:</b> ${cargo.initial_point.agent_name || '-'}<br/>
                <b>Muda:</b> ${cargo.initial_point.time}
              </div>
            `);
        }
      }

      for (const ag of (cargo.agents || [])) {
        const tickLabels = [
          { key: 'received', label: '1. Amepokea Mzigo' },
          { key: 'dispatched', label: '2. Ametoa / Kukabidhi Mzigo' }
        ];

        for (const item of tickLabels) {
          const t = ag.ticks && ag.ticks[item.key];
          if (t && t.done && t.place) {
            const coords = await this.resolvePlace(t.place);
            if (coords) {
              routeCoords.push(coords);
              allBounds.push(coords);

              const marker = L.marker(coords).addTo(this.markersLayer);
              marker.bindPopup(`
                <div style="color:#0f172a; font-family:sans-serif; min-width:200px;">
                  <strong>📦 ${cargo.cargo_name}</strong><br/>
                  <b>Agent ${ag.step_order}:</b> ${ag.agent_name}<br/>
                  <b>Hatua:</b> ${item.label}<br/>
                  <b>Eneo Kamili:</b> ${t.place}<br/>
                  <b>Muda:</b> ${t.time}
                </div>
              `);
            }
          }
        }
      }

      if (routeCoords.length > 1) {
        L.polyline(routeCoords, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(this.lineLayer);
      }
    }

    if (allBounds.length > 0) {
      this.map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 13 });
    }
  }
}

window.MakyamaGlobalMap = MakyamaGlobalMap;
