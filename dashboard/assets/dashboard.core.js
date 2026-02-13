(() => {
  "use strict";

  const state = {
    apiUrl: localStorage.getItem("nv_api_url") || location.origin,
    businessId: localStorage.getItem("nv_business_id") || "",
    adminPassword: localStorage.getItem("nv_admin_password") || "",
    masterKey: localStorage.getItem("nv_master_key") || "",
    jwt: localStorage.getItem("nv_jwt") || ""
  };

  function setState(patch) {
    Object.assign(state, patch);
    localStorage.setItem("nv_api_url", state.apiUrl);
    localStorage.setItem("nv_business_id", state.businessId);
    localStorage.setItem("nv_admin_password", state.adminPassword);
    localStorage.setItem("nv_master_key", state.masterKey);
    localStorage.setItem("nv_jwt", state.jwt);
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (state.jwt) headers.Authorization = `Bearer ${state.jwt}`;
    const res = await fetch(state.apiUrl.replace(/\/$/, "") + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.message || "Request failed");
    return data;
  }

  async function ensureJwt() {
    if (state.jwt) return state.jwt;
    if (!state.businessId || !state.adminPassword) throw new Error("Missing business credentials.");
    const login = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ business_id: state.businessId, password: state.adminPassword })
    });
    setState({ jwt: login.token || "" });
    return state.jwt;
  }

  function fmtDate(v) {
    try {
      return new Date(v).toLocaleString();
    } catch (_) {
      return String(v || "");
    }
  }

  window.NovuDashboard = {
    state,
    setState,
    api,
    ensureJwt,
    fmtDate
  };
})();
