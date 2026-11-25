import os
import json
import random
import string
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import firebase_admin
from firebase_admin import credentials, db as rtdb

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'makyama-secret-key-2026')

DEFAULT_DB_URL = "https://makyama-cargo-tracker-default-rtdb.firebaseio.com/"

# ================= FIREBASE REALTIME DB INIT =================
def init_rtdb():
    database_url = os.environ.get('FIREBASE_DB_URL', DEFAULT_DB_URL)

    if not firebase_admin._apps:
        creds_json = os.environ.get('FIREBASE_CREDENTIALS_JSON')
        creds_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'firebase-credentials.json')

        if creds_json:
            cred = credentials.Certificate(json.loads(creds_json))
        elif os.path.exists(creds_path):
            cred = credentials.Certificate(creds_path)
        else:
            raise RuntimeError(
                "Hakuna Firebase credentials! Weka FIREBASE_CREDENTIALS_JSON au weka firebase-credentials.json."
            )

        firebase_admin.initialize_app(cred, {
            'databaseURL': database_url
        })

    return rtdb.reference('shipments')

shipments_ref = init_rtdb()

# Saa ya Afrika Mashariki (EAT - UTC+3)
EAT = timezone(timedelta(hours=3))

def get_eat_now():
    return datetime.now(EAT).strftime("%Y-%m-%d %H:%M:%S")

def generate_code(prefix):
    chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"{prefix}-{chars}"

def empty_ticks():
    return {
        "received": {"done": False, "time": None, "place": None, "lat": None, "lng": None},
        "dispatched": {"done": False, "time": None, "place": None, "lat": None, "lng": None},
    }

def agent_completed(ag):
    ticks = ag.get('ticks') or {}
    return (
        bool((ticks.get('received') or {}).get('done')) and
        bool((ticks.get('dispatched') or {}).get('done'))
    )

def serialize_agent(ag, include_code=True):
    ticks = ag.get("ticks") or {}
    data = {
        "id": ag.get("id"),
        "step_order": ag.get("step_order"),
        "agent_name": ag.get("agent_name"),
        "is_completed": agent_completed(ag),
        "ticks": {
            "received": ticks.get("received") or {"done": False, "time": None, "place": None, "lat": None, "lng": None},
            "dispatched": ticks.get("dispatched") or {"done": False, "time": None, "place": None, "lat": None, "lng": None},
        }
    }
    if include_code:
        data["agent_code"] = ag.get("agent_code")
    return data

def normalize_agents_list(raw_agents):
    if not raw_agents:
        return []
    if isinstance(raw_agents, dict):
        items = list(raw_agents.values())
    elif isinstance(raw_agents, list):
        items = [a for a in raw_agents if a is not None]
    else:
        items = []
    return sorted(items, key=lambda x: x.get("step_order", 0))

def get_all_shipments():
    raw = shipments_ref.get() or {}
    if not isinstance(raw, dict):
        return []
    result = []
    for key, val in raw.items():
        if isinstance(val, dict):
            item = dict(val)
            item["id"] = key
            item["agents"] = normalize_agents_list(item.get("agents"))
            result.append(item)
    return result

def get_cargo_by_name(cargo_name):
    clean_name = (cargo_name or "").strip().upper()
    if not clean_name:
        return None
    for item in get_all_shipments():
        if (item.get("cargo_name") or "").strip().upper() == clean_name:
            return item
    return None

def find_cargo_by_name_or_code(query):
    clean_q = (query or "").strip().upper()
    if not clean_q:
        return None, None

    for item in get_all_shipments():
        cargo_name = (item.get("cargo_name") or "").strip().upper()
        owner_code = (item.get("owner_code") or "").strip().upper()

        if cargo_name == clean_q:
            return item, None
        if owner_code == clean_q:
            return item, clean_q

        for ag in item.get("agents", []):
            ag_code = (ag.get("agent_code") or "").strip().upper()
            if ag_code == clean_q:
                return item, clean_q

    return None, None

# ================= ADMIN AUTH DECORATOR =================
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('is_admin'):
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

# ================= PAGE ROUTES =================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/cargo/<cargo_name>')
def cargo_page(cargo_name):
    return render_template('cargo.html', cargo_name=cargo_name.upper())

@app.route('/login', methods=['GET', 'POST'])
def login_page():
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        username = (data.get('username') or '').strip()
        password = (data.get('password') or '').strip()

        admin_user = os.environ.get('ADMIN_USERNAME', 'admin')
        admin_pass = os.environ.get('ADMIN_PASSWORD', 'makyama2026')

        if username == admin_user and password == admin_pass:
            session['is_admin'] = True
            return jsonify({"success": True, "redirect": "/admin"}) if request.is_json else redirect('/admin')
        return jsonify({"success": False, "message": "Username au Password sio sahihi!"}), 401
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('is_admin', None)
    return redirect(url_for('index'))

@app.route('/admin')
@admin_required
def admin_page():
    return render_template('admin.html')

# ================= API ENDPOINTS =================

# 1. Sajili Mzigo Mpya
@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    cargo_name = (data.get('cargo_name') or '').strip().upper()
    destination = (data.get('destination') or '').strip()
    registered_by = (data.get('registered_by') or 'OWNER').strip().upper()
    owner_name = (data.get('owner_name') or '').strip()
    agents_list = data.get('agents') or []

    if registered_by not in ('OWNER', 'AGENT_1'):
        registered_by = 'OWNER'

    if not cargo_name or not destination or not owner_name or not agents_list:
        return jsonify({"success": False, "message": "Jaza jina la mzigo, unapoelekea, jina la owner, na angalau agent mmoja."}), 400

    if get_cargo_by_name(cargo_name):
        return jsonify({"success": False, "message": "Jina hili la mzigo limeshatumika. Chagua jingine."}), 400

    owner_code = generate_code("OWN")
    agents_docs = []
    generated_agents = []

    for idx, ag in enumerate(agents_list, start=1):
        ag_name = (ag.get('name') or '').strip()
        if not ag_name:
            return jsonify({"success": False, "message": f"Jaza jina la Agent {idx}."}), 400

        ag_code = generate_code(f"AGT{idx}")
        ag_id = f"ag_{idx}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=6))}"

        agents_docs.append({
            "id": ag_id,
            "step_order": idx,
            "agent_name": ag_name,
            "agent_code": ag_code,
            "ticks": empty_ticks()
        })
        generated_agents.append({
            "step": idx,
            "name": ag_name,
            "code": ag_code
        })

    new_ref = shipments_ref.push()
    new_ref.set({
        "cargo_name": cargo_name,
        "destination": destination,
        "initial_point": None,
        "registered_by": registered_by,
        "owner_name": owner_name,
        "owner_code": owner_code,
        "created_at": get_eat_now(),
        "agents": agents_docs
    })

    return jsonify({
        "success": True,
        "cargo_name": cargo_name,
        "owner_code": owner_code,
        "agents": generated_agents
    })

# 2. Tafuta Mzigo kwa Jina au Code
@app.route('/api/search', methods=['GET'])
def api_search():
    query = (request.args.get('q') or '').strip().upper()
    cargo, matched_code = find_cargo_by_name_or_code(query)
    if not cargo:
        return jsonify({"success": False, "message": "Mzigo haujapatikana kwa jina au code uliyoingiza."}), 404

    matched_role = None
    if matched_code:
        if matched_code == (cargo.get("owner_code") or "").upper():
            matched_role = "OWNER"
        else:
            for ag in cargo.get("agents", []):
                if (ag.get("agent_code") or "").upper() == matched_code:
                    matched_role = f"AGENT_{ag.get('step_order')} ({ag.get('agent_name')})"
                    break

    return jsonify({
        "success": True,
        "cargo_name": cargo["cargo_name"],
        "destination": cargo.get("destination", ""),
        "initial_point": cargo.get("initial_point"),
        "created_at": cargo.get("created_at", ""),
        "matched_code": matched_code,
        "matched_role": matched_role
    })

# 3. Fungua Mzigo kwa Code
@app.route('/api/access', methods=['POST'])
def api_access():
    data = request.get_json() or {}
    cargo_name = (data.get('cargo_name') or '').strip().upper()
    code = (data.get('code') or '').strip().upper()

    cargo = get_cargo_by_name(cargo_name)
    if not cargo:
        return jsonify({"success": False, "message": "Mzigo haupo kwenye mfumo."}), 404

    agents = cargo["agents"]

    if code == (cargo.get("owner_code") or "").upper():
        return jsonify({
            "success": True,
            "role": "OWNER",
            "can_view_all": True,
            "can_manage_agents": True,
            "can_reset_codes": True,
            "cargo": {
                "cargo_name": cargo["cargo_name"],
                "destination": cargo.get("destination", ""),
                "initial_point": cargo.get("initial_point"),
                "registered_by": cargo.get("registered_by", "OWNER"),
                "owner_name": cargo.get("owner_name", ""),
                "created_at": cargo.get("created_at", ""),
                "agents": [serialize_agent(a, include_code=True) for a in agents]
            }
        })

    target_agent = next((a for a in agents if (a.get("agent_code") or "").upper() == code), None)
    if not target_agent:
        return jsonify({"success": False, "message": "Code uliyoingiza sio sahihi kwa mzigo huu!"}), 403

    step = target_agent.get("step_order", 1)
    is_agent_1_creator = (step == 1 and cargo.get("registered_by") == 'AGENT_1')

    prev_completed = True
    if step > 1:
        prev_agent = next((a for a in agents if a.get("step_order") == step - 1), None)
        if prev_agent and not agent_completed(prev_agent):
            prev_completed = False

    if is_agent_1_creator:
        visible_agents = [serialize_agent(a, include_code=True) for a in agents]
    else:
        visible_agents = [serialize_agent(target_agent, include_code=True)]

    return jsonify({
        "success": True,
        "role": f"AGENT_{step}",
        "current_agent_id": target_agent.get("id"),
        "can_view_all": is_agent_1_creator,
        "can_manage_agents": False,
        "can_reset_codes": is_agent_1_creator,
        "prev_agent_completed": prev_completed,
        "cargo": {
            "cargo_name": cargo["cargo_name"],
            "destination": cargo.get("destination", ""),
            "initial_point": cargo.get("initial_point"),
            "registered_by": cargo.get("registered_by", "OWNER"),
            "owner_name": cargo.get("owner_name", ""),
            "created_at": cargo.get("created_at", ""),
            "agents": visible_agents
        }
    })

# 4. Kutia Tick (GPS Inasoma Eneo Kiotomatiki -> Jina Kamili la Eneo)
@app.route('/api/tick', methods=['POST'])
def api_tick():
    data = request.get_json() or {}
    cargo_name = (data.get('cargo_name') or '').strip().upper()
    code = (data.get('code') or '').strip().upper()
    tick_type = (data.get('tick_type') or '').strip()
    place = (data.get('place') or '').strip()
    lat = data.get('lat')
    lng = data.get('lng')

    if lat is None or lng is None:
        return jsonify({"success": False, "message": "Lazima uwashe GPS Location ya simu yako ili mfumo usome eneo kiotomatiki!"}), 400

    try:
        lat_val = float(lat)
        lng_val = float(lng)
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "GPS haikusomwa vizuri, jaribu tena."}), 400

    if not place:
        place = "Eneo limethibitishwa kwa GPS"

    cargo = get_cargo_by_name(cargo_name)
    if not cargo:
        return jsonify({"success": False, "message": "Mzigo hatambuliki."}), 403

    agents = cargo["agents"]
    agent_idx = next((i for i, a in enumerate(agents) if (a.get("agent_code") or "").upper() == code), None)
    if agent_idx is None:
        return jsonify({"success": False, "message": "Code ya Agent haitambuliki."}), 403

    agent = agents[agent_idx]
    step = agent.get("step_order", 1)

    if step > 1:
        prev_agent = next((a for a in agents if a.get("step_order") == step - 1), None)
        if prev_agent and not agent_completed(prev_agent):
            return jsonify({
                "success": False,
                "message": f"Huwezi kutia tick! Subiri Agent {step - 1} amalize hatua zake zote."
            }), 403

    ticks = dict(agent.get("ticks") or empty_ticks())
    now_str = get_eat_now()

    if tick_type == 'received':
        ticks['received'] = {"done": True, "time": now_str, "place": place, "lat": lat_val, "lng": lng_val}
    elif tick_type == 'dispatched':
        if not (ticks.get('received') or {}).get('done'):
            return jsonify({"success": False, "message": "Tia tick ya 'Nimepokea Mzigo' kwanza!"}), 400
        ticks['dispatched'] = {"done": True, "time": now_str, "place": place, "lat": lat_val, "lng": lng_val}
    else:
        return jsonify({"success": False, "message": "Aina ya tick haipo."}), 400

    agent['ticks'] = ticks
    agents[agent_idx] = agent

    cargo_ref = shipments_ref.child(cargo["id"])
    cargo_ref.child("agents").set(agents)

    # Agent 1 anapoanza kusafirisha mzigo ndipo initial_point inahifadhiwa
    if step == 1 and not cargo.get("initial_point"):
        cargo_ref.child("initial_point").set({
            "place": place,
            "lat": lat_val,
            "lng": lng_val,
            "time": now_str,
            "agent_name": agent.get("agent_name")
        })

    return jsonify({"success": True, "message": f"Eneo limehifadhiwa: {place}", "time": now_str})

# 5. Ku-renew Code ya Agent (Owner na Agent 1 kama alisajili)
@app.route('/api/reset-code', methods=['POST'])
def api_reset_code():
    data = request.get_json() or {}
    cargo_name = (data.get('cargo_name') or '').strip().upper()
    requester_code = (data.get('requester_code') or '').strip().upper()
    target_agent_id = data.get('agent_id')

    cargo = get_cargo_by_name(cargo_name)
    if not cargo:
        return jsonify({"success": False, "message": "Mzigo haujapatikana."}), 404

    agents = cargo["agents"]
    target_idx = next((i for i, a in enumerate(agents) if a.get("id") == target_agent_id), None)
    if target_idx is None:
        return jsonify({"success": False, "message": "Agent hajapatikana."}), 404

    is_owner = (requester_code == (cargo.get("owner_code") or "").upper())
    agent_1 = next((a for a in agents if a.get("step_order") == 1), None)
    is_agent_1_creator = (
        agent_1 is not None and
        requester_code == (agent_1.get("agent_code") or "").upper() and
        cargo.get("registered_by") == 'AGENT_1'
    )

    if not (is_owner or is_agent_1_creator):
        return jsonify({"success": False, "message": "Ni Owner au Agent 1 (aliyesajili) pekee mwenye ruhusa ya ku-renew code."}), 403

    target_agent = agents[target_idx]
    new_code = generate_code(f"AGT{target_agent.get('step_order')}")
    target_agent["agent_code"] = new_code
    agents[target_idx] = target_agent

    shipments_ref.child(cargo["id"]).child("agents").set(agents)
    return jsonify({"success": True, "new_code": new_code, "agent_name": target_agent.get("agent_name")})

# 6. Owner Kuongeza, Kubadili au Kufuta Agent
@app.route('/api/manage-agent', methods=['POST'])
def api_manage_agent():
    data = request.get_json() or {}
    owner_code = (data.get('owner_code') or '').strip().upper()
    cargo_name = (data.get('cargo_name') or '').strip().upper()
    action = (data.get('action') or '').strip().upper()

    cargo = get_cargo_by_name(cargo_name)
    if not cargo or (cargo.get("owner_code") or "").upper() != owner_code:
        return jsonify({"success": False, "message": "Ni Owner pekee mwenye ruhusa hii!"}), 403

    agents = cargo["agents"]

    if action == 'ADD':
        ag_name = (data.get('agent_name') or '').strip()
        if not ag_name:
            return jsonify({"success": False, "message": "Jaza jina la agent mpya."}), 400

        next_step = len(agents) + 1
        new_code = generate_code(f"AGT{next_step}")
        ag_id = f"ag_{next_step}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=6))}"
        agents.append({
            "id": ag_id,
            "step_order": next_step,
            "agent_name": ag_name,
            "agent_code": new_code,
            "ticks": empty_ticks()
        })
        shipments_ref.child(cargo["id"]).child("agents").set(agents)
        return jsonify({"success": True, "new_code": new_code})

    elif action == 'EDIT':
        ag_id = data.get('agent_id')
        for ag in agents:
            if ag.get("id") == ag_id:
                if data.get('agent_name'):
                    ag["agent_name"] = data.get('agent_name').strip()
                shipments_ref.child(cargo["id"]).child("agents").set(agents)
                return jsonify({"success": True})

    elif action == 'DELETE':
        ag_id = data.get('agent_id')
        remaining = [ag for ag in agents if ag.get("id") != ag_id]
        for idx, r_ag in enumerate(remaining, start=1):
            r_ag["step_order"] = idx
        shipments_ref.child(cargo["id"]).child("agents").set(remaining)
        return jsonify({"success": True})

    return jsonify({"success": False, "message": "Kitendo hakijafanikiwa."}), 400

# 7. Admin Data API
@app.route('/api/admin/all-cargos', methods=['GET'])
@admin_required
def api_admin_all():
    all_items = get_all_shipments()
    all_items.reverse()
    result = []
    for c in all_items:
        result.append({
            "id": c.get("id"),
            "cargo_name": c.get("cargo_name"),
            "destination": c.get("destination", ""),
            "initial_point": c.get("initial_point"),
            "registered_by": c.get("registered_by", "OWNER"),
            "owner_name": c.get("owner_name", ""),
            "owner_code": c.get("owner_code", ""),
            "created_at": c.get("created_at", ""),
            "agents": [serialize_agent(a, include_code=True) for a in c.get("agents", [])]
        })
    return jsonify({"success": True, "cargos": result})

# 8. Admin Kufuta Mzigo
@app.route('/api/admin/delete-cargo/<cargo_id>', methods=['DELETE'])
@admin_required
def api_admin_delete_cargo(cargo_id):
    cargo_ref = shipments_ref.child(cargo_id)
    if not cargo_ref.get():
        return jsonify({"success": False, "message": "Mzigo haupo au umeshafutwa."}), 404
    cargo_ref.delete()
    return jsonify({"success": True, "message": "Mzigo umefutwa kikamilifu."})

if __name__ == '__main__':
    app.run(debug=True)
