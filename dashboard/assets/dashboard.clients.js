(() => {
  "use strict";

  const core = window.NovuDashboard || {};
  const state = core.state || {};
  const setState = core.setState || (() => {});
  const api = core.api || (async () => ({}));
  const fmtDate = core.fmtDate || ((v) => String(v || ""));

  if (!location.pathname.toLowerCase().endsWith("clients.html")) {
    return;
  }

  const table = document.querySelector("#clients_rows");
  const masterInput = document.querySelector("#clients_master_key");
  const apiInput = document.querySelector("#clients_api_url");
  const loadBtn = document.querySelector("#clients_load_btn");

  if (!table || !masterInput || !loadBtn || !apiInput) {
    return;
  }

  apiInput.value = state.apiUrl || location.origin;
  masterInput.value = state.masterKey || "";

  async function masterLoginForBusiness(businessId, masterKey) {
    const response = await api("/api/auth/master-login", {
      method: "POST",
      body: JSON.stringify({
        business_id: businessId,
        master_key: masterKey
      })
    });
    return response.token;
  }

  function renderRows(items, masterKey) {
    if (!items.length) {
      table.innerHTML = `<tr><td colspan="7" class="db-subtitle">No businesses found.</td></tr>`;
      return;
    }

    table.innerHTML = items.map((b) => `
      <tr>
        <td><b>${b.name}</b><br><span class="db-subtitle db-mono" style="font-size:11px;">${b.id}</span></td>
        <td>${b.industry || "-"}</td>
        <td>${b.website_url || "-"}</td>
        <td>${b.plan || "free"}</td>
        <td>${fmtDate(b.created_at)}</td>
        <td>${fmtDate(b.updated_at)}</td>
        <td><button class="db-btn db-btn-dark" data-open="${b.id}">Open Client</button></td>
      </tr>
    `).join("");

    table.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const businessId = btn.getAttribute("data-open");
          const jwt = await masterLoginForBusiness(businessId, masterKey);
          setState({
            businessId,
            masterKey,
            adminPassword: "",
            jwt
          });
          location.href = "./advisor.html";
        } catch (error) {
          alert(error.message || "Unable to open selected client.");
        }
      });
    });
  }

  async function loadClients() {
    try {
      const apiUrl = apiInput.value.trim() || location.origin;
      const masterKey = masterInput.value.trim();
      setState({ apiUrl, masterKey });
      const data = await api(`/api/business?master_key=${encodeURIComponent(masterKey)}`);
      renderRows(data.businesses || [], masterKey);
    } catch (error) {
      alert(error.message || "Unable to load clients.");
    }
  }

  loadBtn.addEventListener("click", loadClients);
  if (state.masterKey) {
    loadClients();
  }
})();
