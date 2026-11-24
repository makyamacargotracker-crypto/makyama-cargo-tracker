
"use strict";

// ==========================================
// MAKYAMA CARGO TRACKER - MAIN JAVASCRIPT
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    // MOBILE NAVIGATION
    const menuToggle = document.getElementById("menuToggle");
    const navLinks = document.getElementById("navLinks");

    if (menuToggle && navLinks) {
        menuToggle.addEventListener("click", () => {
            navLinks.classList.toggle("open");
            menuToggle.textContent =
                navLinks.classList.contains("open") ? "✕" : "☰";
        });

        navLinks.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                navLinks.classList.remove("open");
                menuToggle.textContent = "☰";
            });
        });
    }

    // CARGO SEARCH
    const trackingForm = document.getElementById("trackingForm");
    const searchInput = document.getElementById("cargoSearch");
    const searchMessage = document.getElementById("searchMessage");
    const searchResults = document.getElementById("searchResults");

    if (trackingForm) {
        trackingForm.addEventListener("submit", async event => {
            event.preventDefault();

            const cargoName = searchInput.value.trim();

            if (cargoName.length < 2) {
                showMessage("Please enter at least two characters.");
                return;
            }

            searchResults.replaceChildren();
            showMessage("Searching for your cargo...");

            try {
                const response = await fetch(
                    `/api/cargo/search?name=${encodeURIComponent(cargoName)}`
                );

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(
                        result.message || "Cargo search failed."
                    );
                }

                if (!result.results || result.results.length === 0) {
                    showMessage("No matching cargo was found.");
                    return;
                }

                showMessage(
                    `${result.results.length} matching cargo record(s) found.`
                );

                result.results.forEach(cargo => {
                    createCargoResult(cargo);
                });

            } catch (error) {
                showMessage(error.message || "Unable to connect to the server.");
            }
        });
    }

    function showMessage(message) {
        if (searchMessage) {
            searchMessage.textContent = message;
        }
    }

    function createCargoResult(cargo) {
        const card = document.createElement("article");
        card.className = "search-result";

        const information = document.createElement("div");

        const title = document.createElement("h3");
        title.textContent = cargo.cargo_name || "Unnamed cargo";

        const destination = document.createElement("p");
        destination.textContent =
            `Final destination: ${cargo.destination || "Not specified"}`;

        information.append(title, destination);

        const status = document.createElement("div");
        status.className = "result-status";
        status.textContent = formatStatus(cargo.status);

        card.append(information, status);

        searchResults.appendChild(card);
    }

    function formatStatus(status) {
        const statuses = {
            registered: "Registered",
            in_transit: "In Transit",
            delivered: "Delivered"
        };

        return statuses[status] || "Status unavailable";
    }

});
