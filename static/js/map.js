
"use strict";

// ==========================================
// MAKYAMA CARGO TRACKER - GLOBAL MAP
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const mapElement = document.getElementById("globalMap");

    if (!mapElement || typeof L === "undefined") {
        return;
    }

    // WORLD MAP INITIALIZATION
    const map = L.map("globalMap", {
        center: [15, 10],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18,
        worldCopyJump: true
    });

    // OPENSTREETMAP TILE LAYER
    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }
    ).addTo(map);

    // MAP LAYERS
    const cargoMarkers = L.layerGroup().addTo(map);
    const routeLines = L.layerGroup().addTo(map);

    // PUBLIC API FOR AUTHORIZED DASHBOARD
    window.MakyamaMap = {

        addCargoLocation: function(location, label, color = "#2589ff") {

            const latitude = Number(location.latitude);
            const longitude = Number(location.longitude);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude) ||
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {
                return null;
            }

            const marker = L.circleMarker(
                [latitude, longitude],
                {
                    radius: 8,
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.9,
                    weight: 2
                }
            );

            marker.bindPopup(
                document.createTextNode(label || "Cargo location")
            );

            marker.addTo(cargoMarkers);

            return marker;
        },

        addRoute: function(points) {

            if (!Array.isArray(points) || points.length < 2) {
                return null;
            }

            const validPoints = points.filter(point => {
                const lat = Number(point.latitude);
                const lng = Number(point.longitude);

                return (
                    Number.isFinite(lat) &&
                    Number.isFinite(lng) &&
                    lat >= -90 &&
                    lat <= 90 &&
                    lng >= -180 &&
                    lng <= 180
                );
            }).map(point => [
                Number(point.latitude),
                Number(point.longitude)
            ]);

            if (validPoints.length < 2) {
                return null;
            }

            return L.polyline(validPoints, {
                color: "#2589ff",
                weight: 3,
                opacity: 0.8,
                dashArray: "8, 8"
            }).addTo(routeLines);
        },

        clearCargoLocations: function() {
            cargoMarkers.clearLayers();
            routeLines.clearLayers();
        },

        focus: function(latitude, longitude, zoom = 8) {
            map.setView([latitude, longitude], zoom);
        }

    };

    // INITIAL WORLD VIEW
    map.setView([15, 10], 2);

    // FIX MOBILE MAP DISPLAY
    setTimeout(() => {
        map.invalidateSize();
    }, 300);

});
