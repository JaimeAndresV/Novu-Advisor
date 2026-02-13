(() => {
  "use strict";

  if (!location.pathname.toLowerCase().endsWith("advisor.html")) {
    return;
  }

  const $ = (s) => document.querySelector(s);
  const core = window.NovuDashboard || {};
  const state = core.state || {};
  const api = core.api || (async () => ({}));
  const ensureJwt = core.ensureJwt || (async () => "");
  const fmtDate = core.fmtDate || ((v) => String(v || ""));

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function collectProfilePayload() {
    const get = (id) => (document.getElementById(id)?.value || "").trim();
    return {
      name: get("adv_name"),
      industry: get("adv_industry"),
      description: get("adv_description"),
      website_url: get("adv_website_url"),
      language: get("adv_language"),
      consultant_name: get("adv_consultant_name"),
      consultant_role: get("adv_consultant_role"),
      primary_color: get("adv_primary_color"),
      accent_color: get("adv_accent_color"),
      contact_phone: get("adv_contact_phone"),
      contact_email: get("adv_contact_email"),
      contact_whatsapp: get("adv_contact_whatsapp"),
      contact_telegram: get("adv_contact_telegram"),
      contact_calendly: get("adv_contact_calendly"),
      contact_form_url: get("adv_contact_form_url")
    };
  }

  // ── Build snippet for this client ──
  function buildSnippet(businessId, apiUrl) {
    return '<script src="' + apiUrl + '/widget/widget.js" data-business-id="' + businessId + '" data-api-url="' + apiUrl + '"></' + 'script>';
  }

  // ── Update widget preview ──
  function updatePreview() {
    const style = $("#widget_style")?.value || "circle";
    const color = $("#adv_primary_color")?.value || "#1a3a5c";
    const name = $("#adv_consultant_name")?.value || "Chat with us";
    const greeting = $("#widget_greeting")?.value || "Hi! How can I help you?";
    const btn = $("#preview_btn");
    const container = $("#widget_preview");
    if (!btn || !container) return;

    btn.style.background = color;

    if (style === "circle") {
      btn.style.width = "64px";
      btn.style.height = "64px";
      btn.style.borderRadius = "999px";
      btn.style.padding = "0";
      btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H8l-4 4V5z" stroke="currentColor" stroke-width="1.8"/></svg><span style="position:absolute;width:13px;height:13px;border-radius:999px;right:4px;bottom:6px;background:#10b981;"></span>';
    } else if (style === "pill") {
      btn.style.width = "auto";
      btn.style.height = "64px";
      btn.style.borderRadius = "999px";
      btn.style.padding = "0 20px 0 16px";
      btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H8l-4 4V5z" stroke="currentColor" stroke-width="1.8"/></svg><span style="font-size:14px;font-weight:600;margin-left:10px;white-space:nowrap;">' + (name || "Chat with us") + '</span><span style="position:absolute;width:13px;height:13px;border-radius:999px;right:8px;bottom:6px;background:#10b981;"></span>';
    } else if (style === "bar") {
      btn.style.width = "360px";
      btn.style.height = "52px";
      btn.style.borderRadius = "0";
      btn.style.padding = "0 24px";
      btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H8l-4 4V5z" stroke="currentColor" stroke-width="1.8"/></svg><span style="font-size:14px;font-weight:600;margin-left:10px;white-space:nowrap;">' + (greeting || "Need help? Chat with us!") + '</span><span style="width:13px;height:13px;border-radius:999px;background:#10b981;margin-left:auto;"></span>';
    }
  }

  function applyBusinessToForm(business) {
    const map = {
      adv_name: business.name || "",
      adv_industry: business.industry || "other",
      adv_description: business.description || "",
      adv_website_url: business.website_url || "",
      adv_language: business.language || "en",
      adv_consultant_name: business.consultant_name || "Advisor",
      adv_consultant_role: business.consultant_role || "Business Consultant",
      adv_primary_color: business.primary_color || "#1a3a5c",
      adv_accent_color: business.accent_color || "#c8a84b",
      adv_contact_phone: business.contact_phone || "",
      adv_contact_email: business.contact_email || "",
      adv_contact_whatsapp: business.contact_whatsapp || "",
      adv_contact_telegram: business.contact_telegram || "",
      adv_contact_calendly: business.contact_calendly || "",
      adv_contact_form_url: business.contact_form_url || "",
      custom_instructions: business.system_prompt || "",
      ai_provider: business.ai_provider || "openai",
      ai_model: business.ai_model || "gpt-4o-mini",
      widget_style: business.widget_style || "circle",
      widget_position: business.widget_position || "bottom-right",
      widget_greeting: business.widget_greeting || ""
    };

    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });

    const keyInput = document.getElementById("provider_key");
    if (keyInput) {
      keyInput.value = "";
      keyInput.placeholder = business.has_ai_api_key
        ? "Saved key present. Enter new key only to replace."
        : "sk-...";
    }

    setText("active_client_name", business.name || "-");
    setText("active_client_id", business.id || "-");
    setText("active_client_url", business.website_url || "-");

    // Update snippet
    const snippetEl = $("#install_snippet");
    if (snippetEl) {
      const apiUrl = state.apiUrl || location.origin;
      snippetEl.textContent = buildSnippet(business.id, apiUrl);
    }

    updatePreview();
  }

  async function initAdvisor() {
    if (!state.businessId) {
      setText("crawl_status", "No client selected. Open one from Clients page.");
      return;
    }

    try {
      await ensureJwt();
    } catch (error) {
      setText("crawl_status", "Login required for selected client.");
      return;
    }

    const status = document.getElementById("crawl_status");
    const chunks = document.getElementById("chunks_list");

    const loadBusiness = async () => {
      const business = await api(`/api/business/${encodeURIComponent(state.businessId)}`);
      applyBusinessToForm(business);
      return business;
    };

    const loadChunks = async () => {
      const data = await api(`/api/business/${encodeURIComponent(state.businessId)}/chunks`);
      chunks.innerHTML = (data.chunks || []).map((c) => `<div class="db-card"><b>${c.title || "Knowledge"}</b><p>${(c.content || "").slice(0, 220)}...</p><button class="db-btn db-btn-outline" data-del="${c.id}">Delete</button></div>`).join("");
      chunks.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        await api(`/api/business/${state.businessId}/chunks/${b.dataset.del}`, { method: "DELETE" });
        loadChunks();
      }));
    };

    // Crawl
    $("#crawl_btn")?.addEventListener("click", async () => {
      status.textContent = "Indexing website...";
      try {
        const out = await api("/api/crawl", {
          method: "POST",
          body: JSON.stringify({ business_id: state.businessId, token: state.adminPassword || "" })
        });
        status.textContent = `✅ ${out.pages_crawled} pages indexed · ${out.chunks_saved} chunks (${fmtDate(out.indexed_at)})`;
        loadChunks();
      } catch (error) {
        status.textContent = error.message || "Indexing failed.";
      }
    });

    // Manual chunk
    $("#manual_chunk_form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await api(`/api/business/${state.businessId}/chunks`, {
        method: "POST",
        body: JSON.stringify({
          title: $("#chunk_title").value.trim(),
          content: $("#chunk_content").value.trim()
        })
      });
      $("#chunk_title").value = "";
      $("#chunk_content").value = "";
      loadChunks();
    });

    // Save AI settings
    $("#save_settings_btn")?.addEventListener("click", async () => {
      try {
        const payload = {
          system_prompt: $("#custom_instructions").value.trim(),
          ai_provider: $("#ai_provider").value,
          ai_model: $("#ai_model").value
        };
        const newKey = $("#provider_key").value.trim();
        if (newKey) payload.ai_api_key = newKey;
        await api(`/api/business/${state.businessId}`, { method: "PUT", body: JSON.stringify(payload) });
        $("#provider_key").value = "";
        const updated = await loadBusiness();
        status.textContent = updated.has_ai_api_key
          ? "✅ Advisor settings saved. AI key is stored."
          : "✅ Advisor settings saved.";
      } catch (error) {
        status.textContent = error.message || "Unable to save settings.";
      }
    });

    // Save client profile
    $("#save_profile_btn")?.addEventListener("click", async () => {
      try {
        await api(`/api/business/${state.businessId}`, {
          method: "PUT",
          body: JSON.stringify(collectProfilePayload())
        });
        const updated = await loadBusiness();
        status.textContent = `✅ Client profile saved for ${updated.name}.`;
      } catch (error) {
        status.textContent = error.message || "Unable to save client profile.";
      }
    });

    // Save widget settings
    $("#save_widget_btn")?.addEventListener("click", async () => {
      try {
        await api(`/api/business/${state.businessId}`, {
          method: "PUT",
          body: JSON.stringify({
            widget_style: $("#widget_style").value,
            widget_position: $("#widget_position").value,
            widget_greeting: $("#widget_greeting").value.trim()
          })
        });
        const updated = await loadBusiness();
        status.textContent = `✅ Widget settings saved.`;
      } catch (error) {
        status.textContent = error.message || "Unable to save widget settings.";
      }
    });

    // Copy snippet
    $("#copy_snippet_btn")?.addEventListener("click", () => {
      const text = $("#install_snippet")?.textContent || "";
      navigator.clipboard.writeText(text).then(() => {
        const btn = $("#copy_snippet_btn");
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 2000);
      });
    });

    // Live preview updates
    ["widget_style", "widget_position"].forEach((id) => {
      $("#" + id)?.addEventListener("change", updatePreview);
    });
    ["widget_greeting", "adv_consultant_name", "adv_primary_color"].forEach((id) => {
      const el = $("#" + id);
      if (el) {
        el.addEventListener("input", updatePreview);
        el.addEventListener("change", updatePreview);
      }
    });

    await loadBusiness();
    await loadChunks();
  }

  initAdvisor();
})();
