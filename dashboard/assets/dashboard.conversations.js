(() => {
  "use strict";

  if (!location.pathname.toLowerCase().endsWith("conversations.html")) {
    return;
  }

  const $ = (s) => document.querySelector(s);
  const core = window.NovuDashboard || {};
  const state = core.state || {};
  const api = core.api || (async () => ({}));
  const ensureJwt = core.ensureJwt || (async () => "");
  const fmtDate = core.fmtDate || ((v) => String(v || ""));

  async function initConversations() {
    try {
      await ensureJwt();
    } catch (e) {
      return;
    }

    if (!state.businessId) {
      alert("No client selected. Please select a client first.");
      location.href = "./clients.html";
      return;
    }

    // Load client info
    try {
      const biz = await api(`/api/business/${state.businessId}`);
      $("#active_client_name").textContent = biz.name || "—";
      $("#active_client_id").textContent = biz.id || "—";
      $("#active_client_url").textContent = biz.website_url || "—";
    } catch (err) {
      console.error("Failed to load client info:", err);
    }

    const rows = $("#conv_rows");
    const modal = $("#conv_modal");
    const chatLog = $("#conv_chat_log");
    if (!rows || !modal || !chatLog) {
      return;
    }

    const loadSessions = async () => {
      const qp = new URLSearchParams();
      if ($("#f_date")?.value) qp.set("date", $("#f_date").value);
      if ($("#f_intent")?.value) qp.set("intent", $("#f_intent").value);
      if ($("#f_lead")?.value !== "") qp.set("lead", $("#f_lead").value);
      if ($("#f_lang")?.value) qp.set("language", $("#f_lang").value);
      if ($("#search_messages")?.value.trim()) qp.set("q", $("#search_messages").value.trim());

      const data = await api(`/api/business/${state.businessId}/conversations?${qp.toString()}`);
      const sessions = data.sessions || [];
      rows.innerHTML = sessions.length
        ? sessions.map((s) => `
          <tr>
            <td>${fmtDate(s.date)}</td>
            <td>${s.duration}</td>
            <td>${s.messages}</td>
            <td>${s.top_intent}</td>
            <td>${s.lead ? "Yes" : "No"}</td>
            <td>${s.language}</td>
            <td><button class="db-btn db-btn-outline" data-view="${s.id}">View</button></td>
          </tr>`).join("")
        : `<tr><td colspan="7" class="db-subtitle">No conversations found.</td></tr>`;

      rows.querySelectorAll("[data-view]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const dataMsg = await api(`/api/business/${state.businessId}/conversations/${btn.dataset.view}/messages`);
          const msgs = dataMsg.messages || [];
          chatLog.innerHTML = msgs.length
            ? msgs.map((m) => `<div class="db-bubble ${m.role === "user" ? "db-bubble-user" : "db-bubble-bot"}">${m.content}</div>`).join("")
            : `<div class="db-bubble db-bubble-bot">No messages.</div>`;
          modal.classList.add("db-show");
        });
      });
    };

    ["f_date", "f_intent", "f_lead", "f_lang"].forEach((id) => $("#" + id)?.addEventListener("change", loadSessions));
    $("#search_messages")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loadSessions();
      }
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("db-show");
    });

    loadSessions();
  }

  initConversations();
})();
