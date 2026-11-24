
"use strict";

// ==========================================
// MAKYAMA CARGO TRACKER - AUTHENTICATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    // --------------------------------------
    // USER LOGIN
    // --------------------------------------

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener("submit", async event => {
            event.preventDefault();

            const message = document.getElementById("loginMessage");
            const code = document.getElementById("accessCode").value.trim();

            message.textContent = "Verifying your access code...";

            try {
                // The current backend requires both cargo ID and code.
                const cargoId = prompt("Enter your Cargo ID:");

                if (!cargoId || !cargoId.trim()) {
                    message.textContent = "Cargo ID is required.";
                    return;
                }

                const response = await fetch("/api/cargo/access", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        cargo_id: cargoId.trim(),
                        code: code
                    })
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Login failed.");
                }

                window.location.href = "/dashboard";

            } catch (error) {
                message.textContent = error.message;
            }
        });
    }

    // --------------------------------------
    // CARGO REGISTRATION
    // --------------------------------------

    const registerForm = document.getElementById("registerForm");

    if (registerForm) {
        registerForm.addEventListener("submit", async event => {
            event.preventDefault();

            const message = document.getElementById("registerMessage");
            const submitButton = registerForm.querySelector(
                'button[type="submit"]'
            );

            const agentInputs = document.querySelectorAll(".agent-name");

            const agents = Array.from(agentInputs)
                .map(input => input.value.trim())
                .filter(Boolean)
                .map(name => ({ name }));

            const payload = {
                cargo_name: document.getElementById("cargoName").value.trim(),
                owner_name: document.getElementById("ownerName").value.trim(),
                destination: document.getElementById("destination").value.trim(),
                registrar_role: document.getElementById("registrarRole").value,
                registrar_name: document.getElementById("registrarName").value.trim(),
                agents: agents
            };

            if (!payload.cargo_name ||
                !payload.owner_name ||
                !payload.destination ||
                !payload.registrar_name) {
                message.textContent = "Please complete all required fields.";
                return;
            }

            if (!agents.length) {
                message.textContent = "Add at least one transportation agent.";
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = "Registering Cargo...";
            message.textContent = "Please wait...";

            try {
                const response = await fetch("/api/cargo/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Registration failed.");
                }

                // Hide the form and show the newly issued credentials.
                registerForm.replaceChildren();

                const heading = document.createElement("h2");
                heading.textContent = "Cargo Registered Successfully";

                const description = document.createElement("p");
                description.textContent =
                    "Save these access codes securely. Give each code only to its intended user.";

                const cargoId = document.createElement("p");
                cargoId.textContent = "Cargo ID: " + result.cargo_id;

                const ownerCode = document.createElement("p");
                ownerCode.textContent = "Owner Access Code: " + result.owner_code;

                const agentHeading = document.createElement("h3");
                agentHeading.textContent = "Agent Access Codes";

                const agentList = document.createElement("ul");

                (result.agent_codes || []).forEach(agent => {
                    const item = document.createElement("li");

                    item.textContent =
                        agent.name + " (" + agent.agent_id + "): " + agent.code;

                    agentList.appendChild(item);
                });

                const note = document.createElement("p");
                note.textContent =
                    "Keep these codes private. They cannot be recovered in plain text after this screen is closed.";

                const copyButton = document.createElement("button");
                copyButton.type = "button";
                copyButton.textContent = "Copy Registration Details";

                const details = [
                    "MAKYAMA CARGO TRACKER",
                    "Cargo: " + payload.cargo_name,
                    "Cargo ID: " + result.cargo_id,
                    "Owner Code: " + result.owner_code,
                    ...(result.agent_codes || []).map(agent =>
                        agent.name + " - " + agent.code
                    )
                ].join("\n");

                copyButton.addEventListener("click", async () => {
                    try {
                        await navigator.clipboard.writeText(details);
                        copyButton.textContent = "Copied Successfully";
                    } catch {
                        copyButton.textContent = "Copy unavailable";
                    }
                });

                const loginLink = document.createElement("a");
                loginLink.href = "/login";
                loginLink.textContent = "Go to Cargo Login";
                loginLink.className = "primary-button";

                registerForm.append(
                    heading,
                    description,
                    cargoId,
                    ownerCode,
                    agentHeading,
                    agentList,
                    note,
                    copyButton,
                    loginLink
                );

            } catch (error) {
                message.textContent = error.message;
                submitButton.disabled = false;
                submitButton.textContent = "Register Cargo";
            }
        });
    }

});
