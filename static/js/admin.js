
"use strict";

// =============================================
// MAKYAMA CARGO TRACKER
// ADMIN CONTROL CENTER
// =============================================

document.addEventListener("DOMContentLoaded", () => {

    const $ = id => document.getElementById(id);

    const loginSection = $("adminLoginSection");
    const dashboard = $("adminDashboard");

    const loginForm = $("adminLoginForm");
    const loginMessage = $("adminLoginMessage");
    const adminMessage = $("adminMessage");

    const cargoTable = $("cargoTableBody");
    const searchInput = $("adminSearch");

    let cargoRecords = [];

    // -----------------------------------------
    // API REQUEST
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
            throw new Error(result.message || "Server request failed.");
        }

        return result;
    }

    // -----------------------------------------
    // ADMIN LOGIN
    // -----------------------------------------

    loginForm.addEventListener("submit", async event => {

        event.preventDefault();

        const username = $("adminUsername").value.trim();
        const password = $("adminPassword").value;

        loginMessage.textContent = "Authenticating administrator...";

        try {

            await api("/api/admin/login", {
                method: "POST",
                body: JSON.stringify({
                    username,
                    password
                })
            });

            $("adminPassword").value = "";

            loginSection.classList.add("admin-hidden");
            dashboard.classList.remove("admin-hidden");

            await loadAdminDashboard();

        } catch (error) {
            loginMessage.textContent = error.message;
        }
    });

    // -----------------------------------------
    // LOAD STATISTICS
    // -----------------------------------------

    async function loadStatistics() {

        const result = await api("/api/admin/stats");

        $("totalCargo").textContent = result.total_cargo ?? 0;
        $("transitCargo").textContent = result.in_transit ?? 0;
        $("deliveredCargo").textContent = result.delivered ?? 0;
        $("registeredCargo").textContent = result.registered ?? 0;
    }

    // -----------------------------------------
    // LOAD ALL CARGO
    // -----------------------------------------

    async function loadCargo() {

        cargoTable.replaceChildren();

        const result = await api("/api/admin/cargo");

        cargoRecords = result.cargo || [];

        renderCargo(cargoRecords);
    }

    // -----------------------------------------
    // DISPLAY CARGO TABLE
    // -----------------------------------------

    function renderCargo(records) {

        cargoTable.replaceChildren();

        if (!records.length) {

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 6;
            cell.textContent = "No cargo records found.";

            row.appendChild(cell);
            cargoTable.appendChild(row);

            return;
        }

        records.forEach(cargo => {

            const row = document.createElement("tr");

            const values = [
                cargo.cargo_name,
                cargo.cargo_id,
                cargo.destination,
                cargo.status,
                cargo.agent_count ?? 0
            ];

            values.forEach(value => {

                const cell = document.createElement("td");
                cell.textContent = value ?? "N/A";

                row.appendChild(cell);
            });

            const actions = document.createElement("td");

            const viewButton = document.createElement("button");
            viewButton.className = "view-btn";
            viewButton.textContent = "View";

            viewButton.addEventListener("click", () => {
                viewCargo(cargo.cargo_id);
            });

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-btn";
            deleteButton.textContent = "Delete";

            deleteButton.style.marginLeft = "7px";

            deleteButton.addEventListener("click", () => {
                deleteCargo(cargo.cargo_id, cargo.cargo_name);
            });

            actions.append(viewButton, deleteButton);
            row.appendChild(actions);

            cargoTable.appendChild(row);
        });
    }

    // -----------------------------------------
    // SEARCH CARGO
    // -----------------------------------------

    searchInput.addEventListener("input", () => {

        const query = searchInput.value.trim().toLowerCase();

        const filtered = cargoRecords.filter(cargo => {

            const name = String(cargo.cargo_name || "").toLowerCase();
            const id = String(cargo.cargo_id || "").toLowerCase();
            const destination = String(cargo.destination || "").toLowerCase();

            return (
                name.includes(query) ||
                id.includes(query) ||
                destination.includes(query)
            );
        });

        renderCargo(filtered);
    });

    // -----------------------------------------
    // VIEW CARGO DETAILS
    // -----------------------------------------

    async function viewCargo(cargoId) {

        const panel = $("cargoDetails");

        panel.replaceChildren();

        const loading = document.createElement("p");
        loading.textContent = "Loading cargo information...";

        panel.appendChild(loading);

        try {

            const result = await api(
                `/api/admin/cargo/${encodeURIComponent(cargoId)}`
            );

            const title = document.createElement("h3");
            title.textContent = result.cargo.cargo_name;

            const details = document.createElement("pre");

            details.textContent = JSON.stringify({
                cargo_id: result.cargo.cargo_id,
                owner_name: result.cargo.owner_name,
                destination: result.cargo.destination,
                status: result.cargo.status,
                agents: result.cargo.agents,
                journey_history: result.history
            }, null, 2);

            panel.replaceChildren(title, details);

        } catch (error) {

            panel.replaceChildren();

            const message = document.createElement("p");
            message.textContent = error.message;

            panel.appendChild(message);
        }
    }

    // -----------------------------------------
    // PERMANENT CARGO DELETION
    // -----------------------------------------

    async function deleteCargo(cargoId, cargoName) {

        const confirmed = confirm(
            `WARNING: You are about to permanently delete "${cargoName}".\n\n` +
            "This includes its cargo record, agent records, GPS locations, " +
            "handover events and journey history.\n\n" +
            "This action cannot be undone. Continue?"
        );

        if (!confirmed) return;

        const secondConfirmation = prompt(
            `Type DELETE to permanently remove ${cargoName}:`
        );

        if (secondConfirmation !== "DELETE") {
            adminMessage.textContent = "Deletion cancelled.";
            return;
        }

        adminMessage.textContent = "Permanently deleting cargo...";

        try {

            await api(
                `/api/admin/cargo/${encodeURIComponent(cargoId)}`,
                {
                    method: "DELETE",
                    body: JSON.stringify({
                        confirmation: "DELETE"
                    })
                }
            );

            adminMessage.textContent =
                "Cargo and associated records deleted successfully.";

            $("cargoDetails").textContent = "No cargo selected.";

            await loadAdminDashboard();

        } catch (error) {

            adminMessage.textContent = error.message;
        }
    }

    // -----------------------------------------
    // REFRESH
    // -----------------------------------------

    $("refreshCargo").addEventListener("click", async () => {

        adminMessage.textContent = "Refreshing records...";

        try {
            await loadAdminDashboard();

            adminMessage.textContent = "Records refreshed.";
        } catch (error) {
            adminMessage.textContent = error.message;
        }
    });

    // -----------------------------------------
    // LOGOUT
    // -----------------------------------------

    $("adminLogout").addEventListener("click", async () => {

        try {
            await api("/api/admin/logout", {
                method: "POST"
            });
        } finally {
            window.location.href = "/";
        }
    });

    // -----------------------------------------
    // INITIALIZE
    // -----------------------------------------

    async function loadAdminDashboard() {

        await loadStatistics();
        await loadCargo();
    }

});
