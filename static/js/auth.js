
"use strict";

document.addEventListener("DOMContentLoaded", () => {

    // =====================================
    // LOGIN
    // =====================================

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener("submit", async event => {
            event.preventDefault();

            const message = document.getElementById("loginMessage");
            const button = document.getElementById("loginButton");

            const cargoId = document.getElementById("cargoId").value.trim();
            const code = document.getElementById("accessCode").value.trim();

            if (!cargoId || !code) {
                message.textContent = "Cargo ID and Access Code are required.";
                return;
            }

            button.disabled = true;
            button.textContent = "Verifying...";

            message.textContent = "Checking your credentials...";

            try {
                const response = await fetch("/api/cargo/access", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        cargo_id: cargoId,
                        code: code
                    })
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Login failed.");
                }

                message.style.color = "#38d996";
                message.textContent = "Login successful. Redirecting...";

                window.location.href = "/dashboard";

            } catch (error) {
                message.style.color = "#ff9b9b";
                message.textContent = error.message;

                button.disabled = false;
                button.textContent = "Continue Securely";
            }
        });
    }

    // =====================================
    // CARGO REGISTRATION
    // =====================================

    const registerForm = document.getElementById("registerForm");

    if (registerForm) {
        registerForm.addEventListener("submit", async event => {
            event.preventDefault();

            const message = document.getElementById("registerMessage");
            const button = registerForm.querySelector('button[type="submit"]');

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

            if (
                !payload.cargo_name ||
                !payload.owner_name ||
                !payload.destination ||
                !payload.registrar_name
            ) {
                message.textContent = "Please complete all required fields.";
                return;
            }

            if (!agents.length) {
                message.textContent = "Add at least one transportation agent.";
                return;
            }

            button.disabled = true;
            button.textContent = "Registering Cargo...";
            message.textContent = "Please wait...";

            try {
                const response = await fetch("/api/cargo/register", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Registration failed.");
                }

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
                button.disabled = false;
                button.textContent = "Register Cargo";
            }
        });
    }

});
