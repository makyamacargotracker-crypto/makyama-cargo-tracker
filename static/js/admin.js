document.addEventListener('DOMContentLoaded', async () => {
  // 1. ADMIN LOGIN
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

  // 2. ADMIN DASHBOARD DATA
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

      // Takwimu
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
            <td>${a.location_point}</td>
            <td><span class="code-pill">${a.agent_code}</span></td>
            <td>${a.ticks.arrived.done ? '✅ ' + a.ticks.arrived.time : '⏳'}</td>
            <td>${a.ticks.received.done ? '✅ ' + a.ticks.received.time : '⏳'}</td>
            <td>${a.ticks.dispatched.done ? '✅ ' + a.ticks.dispatched.time : '⏳'}</td>
          </tr>
        `).join('');

        return `
          <div class="agent-card" style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
              <div>
                <h3>📦 ${c.cargo_name}</h3>
                <p style="color:#94a3b8; font-size:0.88rem;">
                  Owner: <strong>${c.owner_name}</strong> | Code ya Owner: <span class="code-pill" style="color:#6ee7b7;">${c.owner_code}</span> |
                  Njia: ${c.origin} ➔ ${c.destination} (${c.registered_by})
                </p>
              </div>
              <a href="/cargo/${encodeURIComponent(c.cargo_name)}" class="btn btn-outline btn-sm">Fungua Mzigo ➔</a>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hatua</th>
                    <th>Agent</th>
                    <th>Kituo</th>
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
    }

    document.getElementById('adminFilterInput')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toUpperCase();
      const filtered = allCargos.filter((c) => c.cargo_name.includes(q) || c.owner_name.toUpperCase().includes(q));
      renderAdminList(filtered);
    });

    fetchAdminCargos();
  }
});
