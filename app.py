
import os
import json
import secrets
import hashlib
import hmac
import logging
from datetime import datetime, timezone, timedelta
from functools import wraps

import firebase_admin
from firebase_admin import credentials, db

from flask import (
    Flask, request, jsonify, render_template,
    session, redirect, url_for
)

# =====================================================
# MAKYAMA CARGO TRACKER
# Backend foundation
# =====================================================

app = Flask(__name__)

app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY", ""),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=os.environ.get("RENDER") is not None,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    MAX_CONTENT_LENGTH=2 * 1024 * 1024
)

logging.basicConfig(level=logging.INFO)

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

firebase_ready = False


# =====================================================
# FIREBASE INITIALIZATION
# =====================================================

try:
    service_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    database_url = os.environ.get("FIREBASE_DATABASE_URL")

    if service_json and database_url:
        service_account = json.loads(service_json)

        if not firebase_admin._apps:
            credential = credentials.Certificate(service_account)

            firebase_admin.initialize_app(
                credential,
                {"databaseURL": database_url}
            )

        firebase_ready = True
        app.logger.info("Firebase connected.")

    else:
        app.logger.warning("Firebase configuration missing.")

except Exception:
    app.logger.exception("Firebase initialization failed.")


def ref(path):
    if not firebase_ready:
        raise RuntimeError("Firebase is not connected.")

    return db.reference(path)


# =====================================================
# COMMON HELPERS
# =====================================================

def now_utc():
    return datetime.now(timezone.utc).isoformat()


def generate_code():
    return secrets.token_urlsafe(12)


def hash_code(code):
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def verify_code(code, stored_hash):
    if not code or not stored_hash:
        return False

    return hmac.compare_digest(
        hash_code(code),
        stored_hash
    )


def response_error(message, status=400):
    return jsonify({
        "success": False,
        "message": message
    }), status


def get_json():
    return request.get_json(silent=True) or {}


def admin_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if session.get("role") != "admin":
            return response_error("Admin authorization required.", 401)

        return function(*args, **kwargs)

    return wrapper


def user_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if session.get("role") not in ("owner", "agent"):
            return response_error("Login required.", 401)

        return function(*args, **kwargs)

    return wrapper


def get_cargo(cargo_id):
    return ref(f"cargos/{cargo_id}").get()


def save_event(cargo_id, actor, action, location):
    event = {
        "actor_id": actor.get("actor_id"),
        "actor_name": actor.get("actor_name"),
        "actor_role": actor.get("role"),
        "action": action,
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "accuracy": location.get("accuracy"),
        "recorded_at": now_utc()
    }

    ref(f"cargos/{cargo_id}/events").push(event)

    return event


# =====================================================
# WEB PAGES
# =====================================================

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/login")
def login_page():
    return render_template("login.html")


@app.route("/register")
def register_page():
    return render_template("register.html")


@app.route("/dashboard")
def dashboard_page():
    if not session.get("role"):
        return redirect(url_for("login_page"))

    return render_template("dashboard.html")


@app.route("/admin")
def admin_page():
    if session.get("role") != "admin":
        return render_template("admin.html")

    return render_template("admin.html")


# =====================================================
# SYSTEM HEALTH
# =====================================================

@app.route("/health")
def health():
    return jsonify({
        "system": "MAKYAMA CARGO TRACKER",
        "server": "online",
        "firebase": "connected" if firebase_ready else "disconnected"
    })


# =====================================================
# ADMIN LOGIN
# =====================================================

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = get_json()

    username = str(data.get("username", ""))
    password = str(data.get("password", ""))

    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        return response_error("Admin credentials not configured.", 503)

    username_ok = hmac.compare_digest(
        username.encode(),
        ADMIN_USERNAME.encode()
    )

    password_ok = hmac.compare_digest(
        password.encode(),
        ADMIN_PASSWORD.encode()
    )

    if not (username_ok and password_ok):
        return response_error("Invalid login credentials.", 401)

    session.clear()
    session.permanent = True
    session["role"] = "admin"

    return jsonify({
        "success": True,
        "message": "Admin login successful."
    })


# =====================================================
# OWNER / AGENT LOGIN
# =====================================================

@app.route("/api/cargo/access", methods=["POST"])
def cargo_access():
    data = get_json()

    cargo_id = str(data.get("cargo_id", "")).strip()
    code = str(data.get("code", "")).strip()

    if not cargo_id or not code:
        return response_error("Cargo ID and access code required.")

    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    if verify_code(code, cargo.get("owner_code_hash")):
        session.clear()
        session.permanent = True
        session["role"] = "owner"
        session["cargo_id"] = cargo_id
        session["actor_id"] = "owner"
        session["actor_name"] = cargo.get("owner_name", "Owner")

        return jsonify({
            "success": True,
            "role": "owner"
        })

    agents = cargo.get("agents", {})

    for agent_id, agent in agents.items():
        if verify_code(code, agent.get("code_hash")):
            session.clear()
            session.permanent = True
            session["role"] = "agent"
            session["cargo_id"] = cargo_id
            session["actor_id"] = agent_id
            session["actor_name"] = agent.get("name")

            return jsonify({
                "success": True,
                "role": "agent",
                "agent_name": agent.get("name")
            })

    return response_error("Invalid access code.", 401)


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()

    return jsonify({"success": True})


# =====================================================
# CARGO REGISTRATION
# =====================================================

@app.route("/api/cargo/register", methods=["POST"])
def register_cargo():
    data = get_json()

    cargo_name = str(data.get("cargo_name", "")).strip()
    destination = str(data.get("destination", "")).strip()
    owner_name = str(data.get("owner_name", "")).strip()
    registrar_role = str(data.get("registrar_role", "")).strip()
    registrar_name = str(data.get("registrar_name", "")).strip()

    if not all([
        cargo_name,
        destination,
        owner_name,
        registrar_role,
        registrar_name
    ]):
        return response_error("Please complete all required fields.")

    if registrar_role not in ("owner", "agent1"):
        return response_error("Invalid registrar role.")

    agents_input = data.get("agents", [])

    if not isinstance(agents_input, list):
        return response_error("Invalid agents list.")

    if len(agents_input) > 50:
        return response_error("Maximum 50 agents allowed.")

    cargo_id = secrets.token_urlsafe(12)
    owner_code = generate_code()

    agents = {}
    issued_codes = []

    for index, item in enumerate(agents_input):
        if not isinstance(item, dict):
            continue

        name = str(item.get("name", "")).strip()

        if not name:
            continue

        agent_id = f"agent_{index + 1}"
        code = generate_code()

        agents[agent_id] = {
            "name": name,
            "sequence": index + 1,
            "code_hash": hash_code(code),
            "status": "waiting"
        }

        issued_codes.append({
            "agent_id": agent_id,
            "name": name,
            "code": code
        })

    cargo = {
        "cargo_id": cargo_id,
        "cargo_name": cargo_name,
        "destination": destination,
        "owner_name": owner_name,
        "owner_code_hash": hash_code(owner_code),
        "registrar_role": registrar_role,
        "registrar_name": registrar_name,
        "agents": agents,
        "status": "registered",
        "started": False,
        "current_agent_index": 0,
        "pending_receiver": None,
        "owner_received": False,
        "created_at": now_utc(),
        "events": {}
    }

    ref(f"cargos/{cargo_id}").set(cargo)

    return jsonify({
        "success": True,
        "cargo_id": cargo_id,
        "owner_code": owner_code,
        "agent_codes": issued_codes,
        "message": "Cargo registered successfully. Save all access codes securely."
    }), 201


# =====================================================
# PUBLIC CARGO SEARCH
# =====================================================

@app.route("/api/cargo/search")
def search_cargo():
    name = request.args.get("name", "").strip().lower()

    if len(name) < 2:
        return response_error("Enter at least two characters.")

    try:
        cargos = ref("cargos").get() or {}
        results = []

        for cargo_id, cargo in cargos.items():
            if name in cargo.get("cargo_name", "").lower():
                results.append({
                    "cargo_id": cargo_id,
                    "cargo_name": cargo.get("cargo_name"),
                    "destination": cargo.get("destination"),
                    "status": cargo.get("status")
                })

        return jsonify({
            "success": True,
            "results": results[:30]
        })

    except Exception:
        app.logger.exception("Cargo search failed")
        return response_error("Search unavailable.", 503)


# =====================================================
# CARGO INFORMATION
# =====================================================

@app.route("/api/cargo/current")
@user_required
def current_cargo():
    cargo_id = session.get("cargo_id")
    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    role = session.get("role")
    actor_id = session.get("actor_id")

    if role == "owner":
        return jsonify({
            "success": True,
            "cargo": cargo
        })

    agent = cargo.get("agents", {}).get(actor_id)

    if not agent:
        return response_error("Agent access is no longer valid.", 403)

    # Agents receive only their own assignment and event records.
    own_events = {
        event_id: event
        for event_id, event in cargo.get("events", {}).items()
        if event.get("actor_id") == actor_id
    }

    return jsonify({
        "success": True,
        "cargo": {
            "cargo_id": cargo_id,
            "cargo_name": cargo.get("cargo_name"),
            "destination": cargo.get("destination"),
            "status": cargo.get("status"),
            "my_assignment": agent,
            "my_events": own_events
        }
    })


# =====================================================
# START TRANSPORTATION
# =====================================================

@app.route("/api/cargo/start", methods=["POST"])
@user_required
def start_transportation():
    cargo_id = session.get("cargo_id")
    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    if cargo.get("started"):
        return response_error("Transportation has already started.")

    if session.get("role") != "agent":
        return response_error("Only the first assigned agent can start.")

    actor_id = session.get("actor_id")
    agents = cargo.get("agents", {})
    agent_ids = list(agents.keys())

    if not agent_ids or actor_id != agent_ids[0]:
        return response_error("Only Agent 1 can start transportation.", 403)

    data = get_json()
    location = data.get("location", {})

    if not isinstance(location, dict):
        return response_error("Location is required.")

    try:
        latitude = float(location["latitude"])
        longitude = float(location["longitude"])

        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError()

    except (KeyError, TypeError, ValueError):
        return response_error("Valid GPS coordinates are required.")

    actor = {
        "actor_id": actor_id,
        "actor_name": session.get("actor_name"),
        "role": "agent"
    }

    event = save_event(
        cargo_id,
        actor,
        "START_TRANSPORTATION",
        location
    )

    ref(f"cargos/{cargo_id}").update({
        "started": True,
        "status": "in_transit",
        "current_agent_index": 0,
        "starting_location": {
            "latitude": latitude,
            "longitude": longitude,
            "recorded_at": event["recorded_at"]
        }
    })

    return jsonify({
        "success": True,
        "message": "Transportation started.",
        "event": event
    })


# =====================================================
# HANDOVER AND RECEIVING
# =====================================================

@app.route("/api/cargo/handover", methods=["POST"])
@user_required
def cargo_handover():
    cargo_id = session.get("cargo_id")
    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    if not cargo.get("started"):
        return response_error("Transportation has not started.")

    actor_id = session.get("actor_id")
    agents = cargo.get("agents", {})
    agent_ids = list(agents.keys())

    if actor_id not in agent_ids:
        return response_error("Invalid agent.", 403)

    current_index = cargo.get("current_agent_index", 0)

    if agent_ids[current_index] != actor_id:
        return response_error("It is not your turn to hand over.", 403)

    if cargo.get("pending_receiver"):
        return response_error("Previous handover has not been received.")

    if current_index + 1 >= len(agent_ids):
        return response_error("No next agent assigned.")

    data = get_json()
    location = data.get("location", {})

    try:
        latitude = float(location["latitude"])
        longitude = float(location["longitude"])

        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError()

    except (KeyError, TypeError, ValueError):
        return response_error("Valid GPS coordinates required.")

    next_agent_id = agent_ids[current_index + 1]

    actor = {
        "actor_id": actor_id,
        "actor_name": session.get("actor_name"),
        "role": "agent"
    }

    event = save_event(
        cargo_id,
        actor,
        "HANDOVER_OUT",
        location
    )

    ref(f"cargos/{cargo_id}").update({
        "pending_receiver": next_agent_id
    })

    return jsonify({
        "success": True,
        "message": "Handover recorded. Waiting for next agent.",
        "next_agent": agents[next_agent_id].get("name"),
        "event": event
    })


@app.route("/api/cargo/receive", methods=["POST"])
@user_required
def cargo_receive():
    cargo_id = session.get("cargo_id")
    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    actor_id = session.get("actor_id")

    if session.get("role") != "agent":
        return response_error("Only an assigned agent can receive.", 403)

    if cargo.get("pending_receiver") != actor_id:
        return response_error("You are not the expected receiver.", 403)

    data = get_json()
    location = data.get("location", {})

    try:
        latitude = float(location["latitude"])
        longitude = float(location["longitude"])

        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError()

    except (KeyError, TypeError, ValueError):
        return response_error("Valid GPS coordinates required.")

    actor = {
        "actor_id": actor_id,
        "actor_name": session.get("actor_name"),
        "role": "agent"
    }

    event = save_event(
        cargo_id,
        actor,
        "RECEIVED_CARGO",
        location
    )

    agents = cargo.get("agents", {})
    agent_ids = list(agents.keys())
    next_index = agent_ids.index(actor_id)

    ref(f"cargos/{cargo_id}").update({
        "pending_receiver": None,
        "current_agent_index": next_index
    })

    return jsonify({
        "success": True,
        "message": "Cargo received successfully.",
        "event": event
    })


# =====================================================
# OWNER CONFIRMS FINAL RECEIPT
# =====================================================

@app.route("/api/cargo/owner-receive", methods=["POST"])
@user_required
def owner_receive():
    if session.get("role") != "owner":
        return response_error("Only the owner can confirm final receipt.", 403)

    cargo_id = session.get("cargo_id")
    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    if not cargo.get("started"):
        return response_error("Transportation has not started.")

    if cargo.get("pending_receiver"):
        return response_error("A handover is still pending.")

    data = get_json()
    location = data.get("location", {})

    try:
        latitude = float(location["latitude"])
        longitude = float(location["longitude"])

        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError()

    except (KeyError, TypeError, ValueError):
        return response_error("Valid GPS coordinates required.")

    actor = {
        "actor_id": "owner",
        "actor_name": cargo.get("owner_name"),
        "role": "owner"
    }

    event = save_event(
        cargo_id,
        actor,
        "OWNER_CONFIRMED_RECEIPT",
        location
    )

    ref(f"cargos/{cargo_id}").update({
        "owner_received": True,
        "status": "delivered",
        "owner_received_at": event["recorded_at"],
        "deletion_due_at": (
            datetime.now(timezone.utc) + timedelta(days=7)
        ).isoformat()
    })

    return jsonify({
        "success": True,
        "message": "Final receipt confirmed. Record scheduled for deletion after 7 days."
    })


# =====================================================
# OWNER / REGISTRAR AGENT MANAGEMENT
# =====================================================

@app.route("/api/cargo/agents/add", methods=["POST"])
@user_required
def add_agent():
    cargo_id = session.get("cargo_id")
    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    role = session.get("role")
    actor_id = session.get("actor_id")

    authorized = (
        role == "owner" or
        (
            role == "agent" and
            cargo.get("registrar_role") == "agent1" and
            actor_id == "agent_1"
        )
    )

    if not authorized:
        return response_error("You cannot manage agents.", 403)

    data = get_json()
    name = str(data.get("name", "")).strip()

    if not name:
        return response_error("Agent name required.")

    agents = cargo.get("agents", {})
    new_index = len(agents) + 1

    agent_id = f"agent_{new_index}"
    code = generate_code()

    ref(f"cargos/{cargo_id}/agents/{agent_id}").set({
        "name": name,
        "sequence": new_index,
        "code_hash": hash_code(code),
        "status": "waiting"
    })

    return jsonify({
        "success": True,
        "agent_id": agent_id,
        "agent_code": code
    }), 201


# =====================================================
# ADMIN: VIEW ALL CARGOS
# =====================================================

@app.route("/api/admin/cargos")
@admin_required
def admin_cargos():
    try:
        cargos = ref("cargos").get() or {}

        safe_cargos = {}

        for cargo_id, cargo in cargos.items():
            cargo.pop("owner_code_hash", None)

            for agent in cargo.get("agents", {}).values():
                agent.pop("code_hash", None)

            safe_cargos[cargo_id] = cargo

        return jsonify({
            "success": True,
            "cargos": safe_cargos
        })

    except Exception:
        app.logger.exception("Admin cargo retrieval failed")
        return response_error("Unable to retrieve cargo records.", 503)


# =====================================================
# ADMIN: PERMANENT CARGO DELETION
# =====================================================

@app.route("/api/admin/cargo/<cargo_id>/delete", methods=["DELETE"])
@admin_required
def admin_delete_cargo(cargo_id):
    cargo = get_cargo(cargo_id)

    if not cargo:
        return response_error("Cargo not found.", 404)

    # Permanently deletes cargo, agents, GPS and event history.
    ref(f"cargos/{cargo_id}").delete()

    return jsonify({
        "success": True,
        "message": "Cargo and all associated records permanently deleted."
    })


# =====================================================
# ADMIN LOGOUT
# =====================================================

@app.route("/api/admin/logout", methods=["POST"])
@admin_required
def admin_logout():
    session.clear()
    return jsonify({"success": True})


# =====================================================
# AUTOMATIC DELETION
# =====================================================

def delete_expired_cargos():
    """
    Called by a scheduled backend job.
    Deletes cargo records seven days after owner receipt.
    """

    if not firebase_ready:
        return

    cargos = ref("cargos").get() or {}
    current_time = datetime.now(timezone.utc)

    for cargo_id, cargo in cargos.items():
        due = cargo.get("deletion_due_at")

        if not cargo.get("owner_received") or not due:
            continue

        try:
            deletion_time = datetime.fromisoformat(
                due.replace("Z", "+00:00")
            )

            if current_time >= deletion_time:
                ref(f"cargos/{cargo_id}").delete()

        except (ValueError, TypeError):
            app.logger.warning(
                "Invalid deletion date for cargo %s", cargo_id
            )


# =====================================================
# APPLICATION ENTRY
# =====================================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
