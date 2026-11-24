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

      // Alama ya mwanzo (Initial Point) ikiwa tayari Agent 1 ametia tick
      if (cargo.initial_point && cargo.initial_point.lat != null && cargo.initial_point.lng != null) {
        const initLatLng = [cargo.initial_point.lat, cargo.initial_point.lng];
        allBounds.push(initLatLng);
        L.circleMarker(initLatLng, { radius: 8, color: '#10b981', fillColor: '#10b981', fillOpacity: 0.9 })
          .addTo(this.markersLayer)
          .bindPopup(`
            <div style="color:#0f172a; font-family:sans-serif;">
              <strong>🚀 Mwanzo wa Safari (Initial)</strong><br/>
              <b>Mzigo:</b> ${cargo.cargo_name}<br/>
              <b>Agent 1:</b> ${cargo.initial_point.agent_name || '-'}<br/>
              <b>Muda:</b> ${cargo.initial_point.time}
            </div>
          `);
      }

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
