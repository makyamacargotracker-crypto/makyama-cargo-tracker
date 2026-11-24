document.addEventListener('DOMContentLoaded', () => {
  const cargoName = window.CARGO_NAME;
  let currentCode = sessionStorage.getItem(`code_${cargoName}`) || '';

  const globalMap = new MakyamaGlobalMap('globalMap');

  const unlockSection = document.getElementById('unlockSection');
  const trackingWorkspace = document.getElementById('trackingWorkspace');
  const unlockForm = document.getElementById('unlockForm');
  const unlockError = document.getElementById('unlockError');
  const actionAlert = document.getElementById('actionAlert');

  function showAlert(msg, type = 'success') {
    actionAlert.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
    setTimeout(() => {
      actionAlert.innerHTML = '';
    }, 6000);
  }

  function formatFullLocationInput(rawValue) {
    const clean = (rawValue || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    const words = clean.split(' ').map((w) => {
      if (w.includes(',')) {
        return w.split(',').map((p) => p ? p.charAt(0).toUpperCase() + p.slice(1) : '').join(',');
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
    const formatted = words.join(' ');
    const lower = formatted.toLowerCase();
    if (!lower.includes('tanzania') && !lower.includes('zanzibar')) {
      return `${formatted}, Zanzibar, Tanzania`;
    }
    return formatted;
  }

  async function loadCargoWithCode(code) {
    unlockError.innerHTML = '';
    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargo_name: cargoName, code })
      });
      const data = await res.json();

      if (!data.success) {
        sessionStorage.removeItem(`code_${cargoName}`);
        unlockSection.style.display = 'block';
        trackingWorkspace.style.display = 'none';
        unlockError.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
        return;
      }

      currentCode = code.trim().toUpperCase();
      sessionStorage.setItem(`code_${cargoName}`, currentCode);

      unlockSection.style.display = 'none';
      trackingWorkspace.style.display = 'block';

      renderWorkspace(data);
    } catch (err) {
      unlockError.innerHTML = `<div class="alert alert-danger">Tatizo la mtandao. Jaribu tena.</div>`;
    }
  }

  function renderWorkspace(data) {
    const cargo = data.cargo;
    document.getElementById('cargoTitle').textContent = cargo.cargo_name;
    document.getElementById('roleBadge').textContent = `Nafasi Yako: ${data.role}`;

    const initialText = cargo.initial_point
      ? ` | Mwanzo (Initial): ${cargo.initial_point.place} (${cargo.initial_point.time})`
      : ' | Mwanzo (Initial): Agent 1 akianza kusafirisha atatia tick';

    document.getElementById('routeSubtitle').textContent =
      `Owner: ${cargo.owner_name} | Unapoelekea: ${cargo.destination} | Aliyesajili: ${cargo.registered_by}${initialText}`;

    document.getElementById('ownerManagePanel').style.display = data.can_manage_agents ? 'block' : 'none';

    globalMap.renderCargoPoints([cargo]);

    const timeline = document.getElementById('agentsTimeline');
    timeline.innerHTML = '';

    (cargo.agents || []).forEach((ag) => {
      const isMyAgentRow = (data.current_agent_id === ag.id);
      const canTickThisAgent = isMyAgentRow && (data.prev_agent_completed !== false);

      const card = document.createElement('div');
      card.className = `agent-card ${ag.is_completed ? 'completed' : ''} ${(!canTickThisAgent && data.role !== 'OWNER') ? 'locked' : ''}`;

      let adminControlsHtml = '';
      if (data.can_reset_codes || data.can_manage_agents) {
        adminControlsHtml += `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">`;
        if (ag.agent_code) {
          adminControlsHtml += `<span class="code-pill">Code: ${ag.agent_code}</span>`;
        }
        if (data.can_reset_codes) {
          adminControlsHtml += `<button type="button" class="btn btn-warning btn-sm btn-reset-code" data-id="${ag.id}">🔄 Renew Code</button>`;
        }
        if (data.can_manage_agents) {
          adminControlsHtml += `<button type="button" class="btn btn-outline btn-sm btn-edit-agent" data-id="${ag.id}" data-name="${ag.agent_name}">✏️ Badili Jina</button>`;
          adminControlsHtml += `<button type="button" class="btn btn-danger btn-sm btn-del-agent" data-id="${ag.id}">🗑️ Futa</button>`;
        }
        adminControlsHtml += `</div>`;
      }

      let lockWarning = '';
      if (isMyAgentRow && data.prev_agent_completed === false) {
        lockWarning = `<div class="alert alert-warning">⏳ Huwezi kutia tick sasa. Subiri Agent aliyekutangulia akamilishe hatua zake zote.</div>`;
      }

      const tRec = ag.ticks.received;
      const tDis = ag.ticks.dispatched;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div>
            <h3>Hatua #${ag.step_order}: ${ag.agent_name}</h3>
            ${adminControlsHtml}
          </div>
          <span class="badge-pill" style="margin:0; ${ag.is_completed ? 'border-color:#10b981; color:#6ee7b7;' : ''}">
            ${ag.is_completed ? '✅ Amekamilisha' : '⏳ Anaendelea'}
          </span>
        </div>

        ${lockWarning}

        <div class="grid-2" style="margin-top: 14px;">
          ${renderTickBox('received', '1. Nimepokea Mzigo', tRec, canTickThisAgent, true)}
          ${renderTickBox('dispatched', '2. Nimetoa / Kukabidhi Mzigo', tDis, canTickThisAgent, tRec.done)}
        </div>
      `;

      timeline.appendChild(card);
    });

    bindTimelineEvents();
  }

  function renderTickBox(type, title, tickData, canTick, prevStepDone) {
    if (tickData && tickData.done) {
      return `
        <div class="tick-box done">
          <div>
            <strong style="color:#6ee7b7;">☑️ ${title}</strong>
            <p style="font-size:0.86rem; color:#f8fafc; margin-top:6px;">📍 Eneo: <strong>${tickData.place}</strong></p>
            <p style="font-size:0.82rem; color:#cbd5e1; margin-top:4px;">🕒 Muda: ${tickData.time}</p>
          </div>
        </div>
      `;
    }

    const disabled = (!canTick || !prevStepDone) ? 'disabled' : '';
    return `
      <div class="tick-box">
        <div>
          <strong>⬜ ${title}</strong>
          <p style="font-size:0.82rem; color:#94a3b8; margin-top:4px;">Andika eneo kamili (mf. Kinuni, Zanzibar, Tanzania).</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm btn-do-tick" data-tick="${type}" ${disabled}>
          ✔️ Tia Tick Sasa
        </button>
      </div>
    `;
  }

  function bindTimelineEvents() {
    document.querySelectorAll('.btn-do-tick').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tickType = btn.getAttribute('data-tick');
        const rawPlace = prompt('Andika eneo kamili (mf. Kinuni, Zanzibar, Tanzania):');
        if (!rawPlace || !rawPlace.trim()) {
          showAlert('Lazima uandike jina la eneo ili kutia tick.', 'danger');
          return;
        }

        const fullPlace = formatFullLocationInput(rawPlace);

        btn.disabled = true;
        btn.textContent = 'Inahifadhi...';

        try {
          const res = await fetch('/api/tick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cargo_name: cargoName,
              code: currentCode,
              tick_type: tickType,
              place: fullPlace
            })
          });
          const data = await res.json();
          if (!data.success) {
            showAlert(data.message, 'danger');
            btn.disabled = false;
            btn.textContent = '✔️ Tia Tick Sasa';
            return;
          }
          showAlert(`✅ ${data.message} (${data.time})`, 'success');
          loadCargoWithCode(currentCode);
        } catch (e) {
          showAlert('Hitilafu ya kutuma tick.', 'danger');
          btn.disabled = false;
          btn.textContent = '✔️ Tia Tick Sasa';
        }
      });
    });

    document.querySelectorAll('.btn-reset-code').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const agentId = btn.getAttribute('data-id');
        if (!confirm('Una uhakika unataka ku-renew code ya agent huyu? Code ya zamani haitafanya kazi tena.')) return;

        const res = await fetch('/api/reset-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cargo_name: cargoName,
            requester_code: currentCode,
            agent_id: agentId
          })
        });
        const data = await res.json();
        if (data.success) {
          showAlert(`🔑 Code mpya ya ${data.agent_name || 'Agent'} imetolewa: ${data.new_code}`, 'success');
          loadCargoWithCode(currentCode);
        } else {
          showAlert(data.message, 'danger');
        }
      });
    });

    document.querySelectorAll('.btn-edit-agent').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const agentId = btn.getAttribute('data-id');
        const oldName = btn.getAttribute('data-name');
        const newName = prompt('Ingiza jina jipya la Agent:', oldName);
        if (!newName) return;

        const res = await fetch('/api/manage-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cargo_name: cargoName,
            owner_code: currentCode,
            action: 'EDIT',
            agent_id: agentId,
            agent_name: newName
          })
        });
        const data = await res.json();
        if (data.success) {
          showAlert('✅ Jina la Agent limebadilishwa.', 'success');
          loadCargoWithCode(currentCode);
        } else {
          showAlert(data.message, 'danger');
        }
      });
    });

    document.querySelectorAll('.btn-del-agent').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const agentId = btn.getAttribute('data-id');
        if (!confirm('Una uhakika unataka kumfuta Agent huyu kwenye mzigo huu?')) return;

        const res = await fetch('/api/manage-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cargo_name: cargoName,
            owner_code: currentCode,
            action: 'DELETE',
            agent_id: agentId
          })
        });
        const data = await res.json();
        if (data.success) {
          showAlert('🗑️ Agent amefutwa.', 'success');
          loadCargoWithCode(currentCode);
        } else {
          showAlert(data.message, 'danger');
        }
      });
    });
  }

  const addNewAgentForm = document.getElementById('addNewAgentForm');
  if (addNewAgentForm) {
    addNewAgentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const agentName = document.getElementById('newAgentName').value.trim();

      const res = await fetch('/api/manage-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo_name: cargoName,
          owner_code: currentCode,
          action: 'ADD',
          agent_name: agentName
        })
      });
      const data = await res.json();
      if (data.success) {
        addNewAgentForm.reset();
        showAlert(`✅ Agent mpya ameongezwa! Code yake ni: ${data.new_code}`, 'success');
        loadCargoWithCode(currentCode);
      } else {
        showAlert(data.message, 'danger');
      }
    });
  }

  if (unlockForm) {
    unlockForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('accessCodeInput').value.trim();
      loadCargoWithCode(code);
    });
  }

  document.getElementById('refreshCargoBtn')?.addEventListener('click', () => {
    if (currentCode) loadCargoWithCode(currentCode);
  });

  document.getElementById('lockAgainBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem(`code_${cargoName}`);
    location.reload();
  });

  if (currentCode) {
    loadCargoWithCode(currentCode);
  }
});
