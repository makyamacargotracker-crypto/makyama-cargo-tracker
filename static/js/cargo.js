
"use strict";

// =============================================
// MAKYAMA CARGO TRACKER
// CARGO OPERATIONS AND GPS
// =============================================

document.addEventListener("DOMContentLoaded", () => {

    const $ = id => document.getElementById(id);

    const elements = {
        welcome: $("userWelcome"),
        name: $("cargoName"),
        destination: $("cargoDestination"),
        status: $("cargoStatus"),
        description: $("actionDescription"),
        message: $("actionMessage"),
        start: $("startButton"),
        handover: $("handoverButton"),
        receive: $("receiveButton"),
        ownerReceive: $("ownerReceiveButton"),
        history: $("eventList"),
        agents: $("agentManagement"),
        addAgent: $("addAgentButton"),
        agentName: $("newAgentName"),
        agentMessage: $("agentMessage"),
        codeSection: $("issuedCodeSection"),
        issuedCode: $("issuedCode"),
        logout: $("logoutButton")
    };

    let cargo = null;
    let user = null;
    let map = null;
    let locationMarker = null;

    // -----------------------------------------
    // INITIALIZE MAP
    // -----------------------------------------

    function initializeMap() {
        const mapElement = $("dashboardMap");

        if (!mapElement || typeof L === "undefined") return;

        map = L.map(mapElement).setView([0, 0], 2);

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap"
            }
        ).addTo(map);

        setTimeout(() => map.invalidateSize(), 300);
    }

    // -----------------------------------------
    // SERVER REQUEST
    // -----------------------------------------

    async function api(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Request failed.");
        }

        return result;
    }

    // -----------------------------------------
    // LOAD USER AND CARGO
    // -----------------------------------------

    async function loadDashboard() {
        try {
            const result = await api("/api/cargo/me");

            cargo = result.cargo;
            user = result.user;

            if (!cargo || !user) {
                throw new Error("Cargo or user information is unavailable.");
            }

            renderDashboard();
            await loadHistory();

        } catch (error) {
            if (elements.message) {
                elements.message.textContent = error.message;
            }
        }
    }

    // -----------------------------------------
    // DISPLAY CARGO INFORMATION
    // -----------------------------------------

    function renderDashboard() {
        elements.welcome.textContent =
            `Welcome, ${user.name} | Role: ${user.role}`;

        elements.name.textContent = cargo.cargo_name;
        elements.destination.textContent = cargo.destination;
        elements.status.textContent = formatStatus(cargo.status);

        const permissions = cargo.permissions || {};

        elements.start.disabled = !permissions.can_start;
        elements.handover.disabled = !permissions.can_handover;
        elements.receive.disabled = !permissions.can_receive;
        elements.ownerReceive.disabled = !permissions.can_confirm_delivery;

        elements.start.style.display =
            permissions.can_start ? "inline-block" : "none";

        elements.handover.style.display =
            permissions.can_handover ? "inline-block" : "none";

        elements.receive.style.display =
            permissions.can_receive ? "inline-block" : "none";

        elements.ownerReceive.style.display =
            permissions.can_confirm_delivery ? "inline-block" : "none";

        elements.description.textContent =
            permissions.action_description ||
            "Your available transportation actions are shown above.";

        elements.agents.style.display =
            permissions.can_manage_agents ? "block" : "none";

        displayLocations(cargo.visible_locations || []);
    }

    function formatStatus(status) {
        const statuses = {
            registered: "Registered",
            in_transit: "In Transit",
            delivered: "Delivered",
            completed: "Completed"
        };

        return statuses[status] || status || "Unknown";
    }

    // -----------------------------------------
    // GPS LOCATION
    // -----------------------------------------

    function getGPSLocation() {
        return new Promise((resolve, reject) => {

            if (!navigator.geolocation) {
                reject(new Error("GPS is not supported by this device."));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                position => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                error => {
                    reject(new Error(
                        error.code === 1
                            ? "Please allow location access."
                            : "Unable to obtain GPS location."
                    ));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0
                }
            );
        });
    }

    // -----------------------------------------
    // PERFORM TRANSPORT ACTION
    // -----------------------------------------

    async function performAction(action) {

        const buttons = [
            elements.start,
            elements.handover,
            elements.receive,
            elements.ownerReceive
        ];

        try {
            elements.message.textContent = "Obtaining GPS location...";

            buttons.forEach(button => button.disabled = true);

            const location = await getGPSLocation();

            elements.message.textContent =
                "Submitting verified location and action...";

            const result = await api("/api/cargo/action", {
                method: "POST",
                body: JSON.stringify({
                    action: action,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy
                })
            });

            elements.message.textContent =
                result.message || "Action recorded successfully.";

            await loadDashboard();

        } catch (error) {
            elements.message.textContent = error.message;
            await loadDashboard();
        }
    }

    elements.start.addEventListener("click", () => {
        performAction("start");
    });

    elements.handover.addEventListener("click", () => {
        performAction("handover");
    });

    elements.receive.addEventListener("click", () => {
        performAction("receive");
    });

    elements.ownerReceive.addEventListener("click", () => {
        const confirmed = confirm(
            "Are you sure you have received your cargo?"
        );

        if (confirmed) {
            performAction("owner_confirm");
        }
    });

    // -----------------------------------------
    // JOURNEY HISTORY
    // -----------------------------------------

    async function loadHistory() {
        const result = await api("/api/cargo/history");

        elements.history.replaceChildren();

        if (!result.events || result.events.length === 0) {
            elements.history.textContent = "No journey events recorded.";
            return;
        }

        result.events.forEach(event => {

            const item = document.createElement("article");
            item.className = "event-item";

            const title = document.createElement("strong");
            title.textContent = event.description || event.action;

            const details = document.createElement("small");

            const date = event.timestamp
                ? new Date(event.timestamp).toLocaleString()
                : "Date unavailable";

            details.textContent =
                `${event.agent_name || "System"} | ${date}`;

            item.append(title, details);
            elements.history.appendChild(item);

            if (
                map &&
                Number.isFinite(Number(event.latitude)) &&
                Number.isFinite(Number(event.longitude))
            ) {
                const marker = L.marker([
                    Number(event.latitude),
                    Number(event.longitude)
                ]).addTo(map);

                marker.bindPopup(
                    `${event.description || event.action} - ${date}`
                );
            }
        });
    }

    // -----------------------------------------
    // DISPLAY PERMITTED LOCATIONS
    // -----------------------------------------

    function displayLocations(locations) {
        if (!map) return;

        if (locationMarker) {
            map.removeLayer(locationMarker);
            locationMarker = null;
        }

        locations.forEach(location => {
            const lat = Number(location.latitude);
            const lng = Number(location.longitude);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const marker = L.circleMarker([lat, lng], {
                radius: 8,
                color: "#36d5e9",
                fillOpacity: 0.9
            }).addTo(map);

            marker.bindPopup(
                location.label || "Recorded cargo location"
            );

            locationMarker = marker;
        });

        if (locationMarker) {
            map.setView(locationMarker.getLatLng(), 8);
        }
    }

    // -----------------------------------------
    // ADD NEW AGENT
    // -----------------------------------------

    elements.addAgent.addEventListener("click", async () => {

        const name = elements.agentName.value.trim();

        if (!name) {
            elements.agentMessage.textContent =
                "Enter the agent's name.";
            return;
        }

        try {
            const result = await api("/api/cargo/agents", {
                method: "POST",
                body: JSON.stringify({ name })
            });

            elements.agentMessage.textContent =
                "Agent added successfully. Access code: " + result.code;

            elements.agentName.value = "";

            elements.codeSection.style.display = "block";
            elements.issuedCode.textContent =
                "New agent code: " + result.code;

            await loadDashboard();

        } catch (error) {
            elements.agentMessage.textContent = error.message;
        }
    });

    // -----------------------------------------
    // LOGOUT
    // -----------------------------------------

    elements.logout.addEventListener("click", async () => {
        try {
            await api("/api/logout", { method: "POST" });
        } finally {
            window.location.href = "/login";
        }
    });

    // START
    initializeMap();
    loadDashboard();

});
