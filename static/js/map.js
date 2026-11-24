class MakyamaGlobalMap {
  constructor(elementId) {
    this.elementId = elementId;
    this.map = null;
    this.markersLayer = null;
    this.lineLayer = null;
  }

  init() {
    const el = document.getElementById(this.elementId);
    if (!el) return;

    if (!this.map) {
      // Kituo cha awali: Zanzibar / Afrika Mashariki (Global zoomable)
      this.map = L.map(this.elementId).setView([-6.1659, 39.2026], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap | MAKYAMA TRACKER'
      }).addTo(this.map);

      this.markersLayer = L.layerGroup().addTo(this.map);
      this.lineLayer = L.layerGroup().addTo(this.map);
    }

    setTimeout(() => this.map.invalidateSize(), 200);
  }

  renderCargoPoints(cargosList) {
    this.init();
    if (!this.map) return;

    this.markersLayer.clearLayers();
    this.lineLayer.clearLayers();

    const allBounds = [];

    cargosList.forEach((cargo) => {
      const routeCoords = [];

      (cargo.agents || []).forEach((ag) => {
        const tickLabels = [
          { key: 'arrived', label: '1. Amefika Eneo' },
          { key: 'received', label: '2. Amepokea Mzigo' },
          { key: 'dispatched', label: '3. Ametoa Mzigo' }
        ];

        tickLabels.forEach((item) => {
          const t = ag.ticks && ag.ticks[item.key];
          if (t && t.done && t.lat != null && t.lng != null) {
            const latlng = [t.lat, t.lng];
            routeCoords.push(latlng);
            allBounds.push(latlng);

            const marker = L.marker(latlng).addTo(this.markersLayer);
            marker.bindPopup(`
              <div style="color:#0f172a; font-family:sans-serif; min-width:190px;">
                <strong>📦 ${cargo.cargo_name}</strong><br/>
                <b>Agent ${ag.step_order}:</b> ${ag.agent_name}<br/>
                <b>Hatua:</b> ${item.label}<br/>
                <b>Kituo:</b> ${ag.location_point}<br/>
                <b>Muda:</b> ${t.time}<br/>
                <small>GPS: ${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}</small>
              </div>
            `);
          }
        });
      });

      if (routeCoords.length > 1) {
        L.polyline(routeCoords, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(this.lineLayer);
      }
    });

    if (allBounds.length > 0) {
      this.map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 14 });
    }
  }
}

window.MakyamaGlobalMap = MakyamaGlobalMap;
