(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const page = (location.pathname.split("/").pop() || "").toLowerCase();
  const core = window.NovuDashboard || {};
  const state = core.state || {};
  const setState = core.setState || (() => {});
  const api = core.api || (async () => ({}));
  const ensureJwt = core.ensureJwt || (async () => "");
  const fmtDate = core.fmtDate || ((v) => String(v || ""));

  function initLogin() {
    const form = $("#login-form");
    if (!form) return;
    if ($("#api_url")) $("#api_url").value = state.apiUrl || location.origin;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const business_id = $("#business_id").value.trim();
      const password = $("#password").value;
      const api_url = ($("#api_url") && $("#api_url").value.trim()) || location.origin;
      setState({ apiUrl: api_url, businessId: business_id, adminPassword: password, jwt: "" });
      try {
        await ensureJwt();
        location.href = "./report.html";
      } catch (err) {
        alert(err.message || "Login failed.");
      }
    });
  }

  function initSetup() {
    const form = $("#setup-form");
    if (!form) return;
    if ($("#setup_api_url")) $("#setup_api_url").value = state.apiUrl || location.origin;
    if ($("#master_key")) $("#master_key").value = state.masterKey || "";
    if ($("#master_key_2")) $("#master_key_2").value = state.masterKey || "";
    const steps = [...document.querySelectorAll(".db-step")];
    let current = 1;
    const show = (n) => {
      current = Math.max(1, Math.min(3, n));
      document.querySelectorAll("[data-step]").forEach((el) => (el.style.display = Number(el.dataset.step) === current ? "" : "none"));
      steps.forEach((s, i) => s.classList.toggle("db-current", i + 1 === current));
    };
    show(1);
    document.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", () => show(current + 1)));
    document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => show(current - 1)));

    const bindPreview = () => {
      const name = ($("#consultant_name") || {}).value || "Alex";
      const role = ($("#consultant_role") || {}).value || "Business Advisor";
      const primary = ($("#primary_color") || {}).value || "#1a3a5c";
      const accent = ($("#accent_color") || {}).value || "#c8a84b";
      const title = $("#pv-name"), sub = $("#pv-role"), head = $("#pv-head"), send = $("#pv-send");
      if (title) title.textContent = name;
      if (sub) sub.textContent = role;
      if (head) head.style.background = primary;
      if (send) send.style.background = accent;
    };
    ["consultant_name", "consultant_role", "primary_color", "accent_color"].forEach((id) => {
      const el = $("#" + id);
      if (el) el.addEventListener("input", bindPreview);
    });
    bindPreview();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const apiUrl = ($("#setup_api_url") || {}).value?.trim() || state.apiUrl || location.origin;
        const masterKey =
          ($("#master_key_2") || {}).value?.trim() ||
          ($("#master_key") || {}).value?.trim() ||
          state.masterKey;
        setState({ apiUrl, masterKey });
        const payload = {
          name: $("#name").value.trim(),
          industry: $("#industry").value,
          description: $("#description").value.trim(),
          language: $("#language").value,
          website_url: $("#website_url").value.trim(),
          consultant_name: $("#consultant_name").value.trim(),
          consultant_role: $("#consultant_role").value.trim(),
          primary_color: $("#primary_color").value,
          accent_color: $("#accent_color").value,
          contact_phone: ($("#contact_phone") || {}).value || "",
          contact_email: ($("#contact_email") || {}).value || "",
          contact_whatsapp: ($("#contact_whatsapp") || {}).value || "",
          contact_telegram: ($("#contact_telegram") || {}).value || "",
          contact_calendly: ($("#contact_calendly") || {}).value || "",
          contact_form_url: ($("#contact_form_url") || {}).value || ""
        };
        const headers = {};
        if (masterKey) headers["x-admin-master-key"] = masterKey;
        const created = await api("/api/business", { method: "POST", headers, body: JSON.stringify(payload) });
        setState({ businessId: created.id, adminPassword: created.admin_password, jwt: "" });
        const closeScriptTag = "</" + "script>";
        const snippet = `<link rel="stylesheet" href="${state.apiUrl}/widget/widget.css">\n<script src="${state.apiUrl}/widget/widget.js" data-business-id="${created.id}" data-api-url="${state.apiUrl}" data-position="bottom-right">${closeScriptTag}`;
        if ($("#install_snippet")) $("#install_snippet").value = snippet;
        if ($("#setup_success")) $("#setup_success").style.display = "";
        if ($("#saved_business_id")) $("#saved_business_id").textContent = created.id || "-";
        if ($("#saved_admin_password")) $("#saved_admin_password").textContent = created.admin_password || "-";
        show(3);
      } catch (err) {
        const msg = String(err.message || "Unable to create business.");
        if (msg.toLowerCase().includes("invalid master key")) {
          alert("Invalid master key. Enter the same ADMIN_MASTER_KEY value configured in your server .env file.");
        } else {
          alert(msg);
        }
      }
    });
  }

  async function initReport() {
    if (page !== "report.html") return;
    
    if (!state.businessId) {
      alert("No client selected. Please select a client first.");
      location.href = "./clients.html";
      return;
    }

    // Load client info
    try {
      const biz = await api(`/api/business/${state.businessId}`);
      if ($("#active_client_name")) $("#active_client_name").textContent = biz.name || "—";
      if ($("#active_client_id")) $("#active_client_id").textContent = biz.id || "—";
      if ($("#active_client_url")) $("#active_client_url").textContent = biz.website_url || "—";
    } catch (err) {
      console.error("Failed to load client info:", err);
    }

    try {
      const qp = new URLSearchParams({
        business_id: state.businessId || "",
        period: "30"
      });
      if (state.adminPassword) qp.set("token", state.adminPassword);
      const report = await api(`/api/report?${qp.toString()}`);
      const k = report.overview || {};
      if ($("#kpi_total")) $("#kpi_total").textContent = k.total_sessions || 0;
      if ($("#kpi_leads")) $("#kpi_leads").textContent = k.leads_captured || 0;
      if ($("#kpi_conv")) $("#kpi_conv").textContent = k.conversion_rate || "0.0%";
      if ($("#kpi_avg")) $("#kpi_avg").textContent = k.avg_messages_per_session || 0;
      if ($("#top_questions")) $("#top_questions").innerHTML = (report.top_questions || []).map((q) => `<li>${q}</li>`).join("");
      if ($("#knowledge_gaps")) $("#knowledge_gaps").innerHTML = (report.knowledge_gaps || []).map((q) => `<li>${q}</li>`).join("");
      if ($("#ai_insights")) $("#ai_insights").innerHTML = (report.ai_insights || "").replace(/\n/g, "<br>");
      if ($("#leads_rows")) $("#leads_rows").innerHTML = (report.leads || []).map((l) => `<tr><td>${l.name}</td><td>${l.email}</td><td>${l.phone}</td><td>${l.channel}</td><td>${l.page}</td><td>${fmtDate(l.created_at)}</td></tr>`).join("");
      if ($("#activity_bars")) {
        const max = Math.max(1, ...(report.daily_activity || []).map((d) => d.sessions || 0));
        $("#activity_bars").innerHTML = (report.daily_activity || []).map((d) => `<div class="db-bar" style="height:${Math.max(8, Math.round(((d.sessions || 0) / max) * 100))}%"><span>${d.sessions || 0}</span></div>`).join("");
      }
    } catch (err) {
      alert(err.message || "Unable to load report.");
    }
  }

  initLogin();
  initSetup();
  initReport();
})();
