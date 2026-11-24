document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('adminUsername').value.trim();
      const password = document.getElementById('adminPassword').value.trim();
      const errDiv = document.getElementById('loginError');

      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = data.redirect || '/admin';
      } else {
        errDiv.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
      }
    });
  }

  const adminList = document.getElementById('adminCargosList');
  if (adminList) {
    const adminMap = new MakyamaGlobalMap('adminGlobalMap');
    let allCargos = [];

    async function fetchAdminCargos() {
      const res = await fetch('/api/admin/all-cargos');
      const data = await res.json();
      if (!data.success) return;

      allCargos = data.cargos || [];
      adminMap.renderCargoPoints(allCargos);

      let totalAgents = 0;
      let completedCargos = 0;
      allCargos.forEach((c) => {
        totalAgents += (c.agents || []).length;
        if (c.agents && c.agents.length > 0 && c.agents.every((a) => a.is_completed)) {
          completedCargos++;
        }
      });

      document.getElementById('statTotalCargos').textContent = allCargos.length;
      document.getElementById('statTotalAgents').textContent = totalAgents;
      document.getElementById('statCompletedCargos').textContent = completedCargos;

      renderAdminList(allCargos);
    }

    function renderAdminList(list) {
      if (list.length === 0) {
        adminList.innerHTML = `<p style="color:#94a3b8;">Hakuna mizigo iliyosajiliwa bado.</p>`;
        return;
      }

      adminList.innerHTML = list.map((c) => {
        const agentsRows = (c.agents || []).map((a) => `
          <tr>
            <td>#${a.step_order}</td>
            <td>${a.agent_name}</td>
            <td><span class="code-pill">${a.agent_code}</span></td>
            <td>${a.ticks.arrived.done ? '✅ ' + a.ticks.arrived.time : '⏳'}</td>
            <td>${a.ticks.received.done ? '✅ ' + a.ticks.received.time : '⏳'}</td>
            <td>${a.ticks.dispatched.done ? '✅ ' + a.ticks.dispatched.time : '⏳'}</td>
          </tr>
        `).join('');

        const initInfo = c.initial_point
          ? ` | Mwanzo: ${c.initial_point.time} (${Number(c.initial_point.lat).toFixed(4)}, ${Number(c.initial_point.lng).toFixed(4)})`
          : ' | Mwanzo: Bado';

        return `
          <div class="agent-card" style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
              <div>
                <h3>📦 ${c.cargo_name}</h3>
                <p style="color:#94a3b8; font-size:0.88rem;">
                  Owner: <strong>${c.owner_name}</strong> | Code ya Owner: <span class="code-pill" style="color:#6ee7b7;">${c.owner_code}</span> |
                  Unapoelekea: <strong>${c.destination}</strong> (${c.registered_by})${initInfo}
                </p>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <a href="/cargo/${encodeURIComponent(c.cargo_name)}" class="btn btn-outline btn-sm">Fungua Mzigo ➔</a>
                <button type="button" class="btn btn-danger btn-sm btn-delete-cargo" data-id="${c.id}" data-name="${c.cargo_name}">🗑️ Futa Mzigo</button>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hatua</th>
                    <th>Agent</th>
                    <th>Code</th>
                    <th>Amefika</th>
                    <th>Amepokea</th>
                    <th>Ametoa</th>
                  </tr>
                </thead>
                <tbody>${agentsRows}</tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');

      document.querySelectorAll('.btn-delete-cargo').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const cargoId = btn.getAttribute('data-id');
          const cName = btn.getAttribute('data-name');
          if (!confirm(`Una uhakika unataka kufuta kabisa mzigo "${cName}"?`)) return;

          const res = await fetch(`/api/admin/delete-cargo/${encodeURIComponent(cargoId)}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (data.success) {
            fetchAdminCargos();
          } else {
            alert(data.message || 'Imeshindwa kufuta mzigo.');
          }
        });
      });
    }

    document.getElementById('adminFilterInput')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toUpperCase();
      const filtered = allCargos.filter((c) => {
        const matchCargo = (c.cargo_name || '').toUpperCase().includes(q);
        const matchOwner = (c.owner_name || '').toUpperCase().includes(q);
        const matchOwnerCode = (c.owner_code || '').toUpperCase().includes(q);
        const matchAgentCode = (c.agents || []).some((a) => (a.agent_code || '').toUpperCase().includes(q));
        return matchCargo || matchOwner || matchOwnerCode || matchAgentCode;
      });
      renderAdminList(filtered);
    });

    fetchAdminCargos();
  }
});
