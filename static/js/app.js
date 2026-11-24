document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = document.getElementById('searchInput').value.trim();
      const resultDiv = document.getElementById('searchResult');
      resultDiv.innerHTML = '<p style="color:#94a3b8;">Inatafuta mzigo...</p>';

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!data.success) {
          resultDiv.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
          return;
        }

        if (data.matched_code) {
          sessionStorage.setItem(`code_${data.cargo_name}`, data.matched_code);
        }

        const startText = data.initial_point
          ? `Mwanzo: GPS (${Number(data.initial_point.lat).toFixed(4)}, ${Number(data.initial_point.lng).toFixed(4)})`
          : `Mwanzo: Unasubiri Agent 1 atie tick`;

        const roleBadge = data.matched_role
          ? `<span class="badge-pill" style="margin:0 0 0 8px;">Imepatikana kwa Code: ${data.matched_role}</span>`
          : '';

        resultDiv.innerHTML = `
          <div class="card" style="text-align:left; border-color: rgba(16,185,129,0.5);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                  <span class="code-pill">${data.cargo_name}</span>
                  ${roleBadge}
                </div>
                <p style="margin-top:8px; font-weight:600;">Unapoelekea: ${data.destination}</p>
                <small style="color:#94a3b8;">${startText} &bull; Ilisajiliwa: ${data.created_at}</small>
              </div>
              <a href="/cargo/${encodeURIComponent(data.cargo_name)}" class="btn btn-success">
                ${data.matched_code ? '🚀 Fungua Moja Kwa Moja' : '🔐 Fungua kwa Code'}
              </a>
            </div>
          </div>
        `;
      } catch (err) {
        resultDiv.innerHTML = `<div class="alert alert-danger">Hitilafu ya mtandao. Jaribu tena.</div>`;
      }
    });
  }

  const agentsContainer = document.getElementById('agentsContainer');
  const addAgentBtn = document.getElementById('addAgentBtn');
  const registerForm = document.getElementById('registerForm');

  if (agentsContainer && addAgentBtn && registerForm) {
    let agentCount = 0;

    function addAgentRow() {
      agentCount++;
      const row = document.createElement('div');
      row.className = 'agent-card agent-row';
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <strong class="agent-step-label">Agent #${agentCount}</strong>
          ${agentCount > 1 ? '<button type="button" class="btn btn-danger btn-sm remove-agent">Ondoa</button>' : ''}
        </div>
        <div class="form-group" style="margin:0;">
          <label>Jina la Agent *</label>
          <input type="text" class="form-control ag-name" placeholder="Mf. Juma Hassan" required />
        </div>
      `;
      agentsContainer.appendChild(row);

      const removeBtn = row.querySelector('.remove-agent');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          row.remove();
          renumberAgents();
        });
      }
    }

    function renumberAgents() {
      const rows = agentsContainer.querySelectorAll('.agent-row');
      agentCount = rows.length;
      rows.forEach((r, idx) => {
        r.querySelector('.agent-step-label').textContent = `Agent #${idx + 1}`;
      });
    }

    addAgentRow();
    addAgentRow();
    addAgentBtn.addEventListener('click', addAgentRow);

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errDiv = document.getElementById('registerError');
      errDiv.innerHTML = '';

      const agents = [];
      agentsContainer.querySelectorAll('.agent-row').forEach((row) => {
        agents.push({
          name: row.querySelector('.ag-name').value.trim(),
        });
      });

      const payload = {
        cargo_name: document.getElementById('cargoName').value.trim(),
        registered_by: document.getElementById('registeredBy').value,
        owner_name: document.getElementById('ownerName').value.trim(),
        destination: document.getElementById('destination').value.trim(),
        agents,
      };

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!data.success) {
          errDiv.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
          return;
        }

        document.getElementById('registerCard').style.display = 'none';
        document.getElementById('codesResultCard').style.display = 'block';
        document.getElementById('goToCargoBtn').href = `/cargo/${encodeURIComponent(data.cargo_name)}`;

        let html = `
          <div class="agent-card">
            <p><strong>Jina la Mzigo:</strong> <span class="code-pill">${data.cargo_name}</span></p>
            <p style="margin-top:6px;"><strong>Unapoelekea:</strong> ${payload.destination}</p>
            <p style="margin-top:8px;"><strong>👑 Code ya Owner:</strong> <span class="code-pill" style="color:#6ee7b7;">${data.owner_code}</span></p>
          </div>
          <h4 style="margin: 14px 0 10px;">Code za Ma-Agent:</h4>
        `;

        data.agents.forEach((ag) => {
          html += `
            <div class="agent-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <strong>Agent ${ag.step}: ${ag.name}</strong>
              <span class="code-pill">${ag.code}</span>
            </div>
          `;
        });

        document.getElementById('codesOutput').innerHTML = html;
      } catch (err) {
        errDiv.innerHTML = `<div class="alert alert-danger">Imeshindwa kuwasiliana na server.</div>`;
      }
    });
  }
});
