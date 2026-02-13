(function () {
  "use strict";

  var script = document.currentScript;
  var BIZ_ID = script && script.getAttribute("data-business-id");
  var API_URL = script && script.getAttribute("data-api-url");
  if (!BIZ_ID || !API_URL) return;

  var sessionId = localStorage.getItem("nv_sid_" + BIZ_ID) || "";
  var isOpen = false, isTyping = false, greeted = false, config = null;
  var root, shadow, els = {};
  var wPos, wStyle, useJsPosition = false;

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (m) { return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]; }); }
  function isRtlDoc() { return (document.documentElement.getAttribute("dir") || "").toLowerCase() === "rtl"; }
  function safeUrl(url) { try { var u = new URL(url, location.href); return /^https?:|^mailto:|^tel:/.test(u.protocol + "") ? u.toString() : "#"; } catch (_) { return "#"; } }

  function sanitizeHTML(html) {
    var allow = ["B", "BR", "UL", "LI", "A"];
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    (function walk(node) {
      [].slice.call(node.children).forEach(function (el) {
        if (allow.indexOf(el.tagName) === -1) {
          el.parentNode.replaceChild(doc.createTextNode(el.textContent || ""), el); return;
        }
        [].slice.call(el.attributes).forEach(function (a) {
          var n = a.name.toLowerCase();
          if (el.tagName === "A" && n === "href") {
            var href = safeUrl(a.value);
            if (href === "#") el.removeAttribute("href");
            else { el.setAttribute("href", href); el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer"); }
          } else if (el.tagName !== "A" || n !== "href") el.removeAttribute(a.name);
        });
        walk(el);
      });
    })(doc.body);
    return doc.body.innerHTML;
  }

  function loadConfig() {
    return fetch(API_URL + "/api/business/" + encodeURIComponent(BIZ_ID))
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.error) throw 0; return d; })
      .catch(function () {
        return { id: BIZ_ID, name: "Business", consultant_name: "Advisor", consultant_role: "Business Consultant", primary_color: "#1a3a5c", accent_color: "#c8a84b", avatar_url: "", channels: [], widget_style: "circle", widget_position: "bottom-right", widget_greeting: "" };
      });
  }

  // ── Rendering helpers ──
  function renderBotMessage(html) {
    var w = document.createElement("div"); w.className = "nv-msg nv-msg-bot";
    w.innerHTML = sanitizeHTML(html); els.body.appendChild(w); els.body.scrollTop = els.body.scrollHeight;
  }
  function renderUserMessage(text) {
    var w = document.createElement("div"); w.className = "nv-msg nv-msg-user"; w.innerHTML = esc(text);
    els.body.appendChild(w); els.body.scrollTop = els.body.scrollHeight;
  }
  function renderTypingIndicator() {
    var w = document.createElement("div"); w.className = "nv-msg nv-msg-bot"; w.id = "nv-typing";
    w.innerHTML = '<span class="nv-typing"><span></span><span></span><span></span></span>';
    els.body.appendChild(w); els.body.scrollTop = els.body.scrollHeight;
  }
  function removeTypingIndicator() { var t = els.body.querySelector("#nv-typing"); if (t) t.remove(); }
  function renderChannelButtons(channels) {
    var list = Array.isArray(channels) ? channels : [];
    if (!list.length) return;
    var box = document.createElement("div"); box.className = "nv-channels";
    list.forEach(function (ch) {
      var a = document.createElement("a"); a.className = "nv-channel"; a.href = safeUrl(ch.url || "#"); a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = (ch.icon || "") + " " + (ch.label || "Contact"); box.appendChild(a);
    });
    els.body.appendChild(box); els.body.scrollTop = els.body.scrollHeight;
  }
  function disableInput() { els.input.disabled = true; els.send.disabled = true; }
  function enableInput() { els.input.disabled = false; els.send.disabled = false; els.input.focus(); }

  // ── Chat ──
  function sendMessage(text) {
    if (!text || isTyping) return;
    isTyping = true; renderUserMessage(text); renderTypingIndicator(); disableInput();
    var payload = {
      business_id: BIZ_ID, session_id: sessionId, message: text,
      context: { url: location.href, title: document.title, description: (document.querySelector('meta[name="description"]') || {}).content || "", h1: (document.querySelector("h1") || {}).innerText || "" }
    };
    fetch(API_URL + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.session_id) { sessionId = d.session_id; localStorage.setItem("nv_sid_" + BIZ_ID, sessionId); }
        removeTypingIndicator(); renderBotMessage(d.reply || "I can help with that.");
        if (d.show_channels && d.channels && d.channels.length) renderChannelButtons(d.channels);
        isTyping = false; enableInput();
      })
      .catch(function () {
        removeTypingIndicator();
        renderBotMessage("I'm having a brief technical issue. Please try again in a moment.");
        renderChannelButtons(config.channels || []);
        isTyping = false; enableInput();
      });
  }

  // ── Panel open/close ──
  function openPanel() {
    isOpen = true; root.classList.add("nv-open");
    if (!greeted) {
      greeted = true;
      setTimeout(function () {
        var g = config.widget_greeting || ("Hi! I'm <b>" + esc(config.consultant_name || "Advisor") + "</b>, " + esc(config.consultant_role || "Consultant") + " at " + esc(config.name || "our business") + ". How can I help you today? 👋");
        renderBotMessage(g);
      }, 800);
    }
    if (useJsPosition) jsPosition();
    setTimeout(function () { els.input.focus(); }, 160);
  }
  function closePanel() {
    isOpen = false; root.classList.remove("nv-open");
    if (useJsPosition) jsPosition();
  }

  function bindEvents() {
    els.toggle.addEventListener("click", openPanel);
    els.close.addEventListener("click", closePanel);
    els.send.addEventListener("click", function () { var t = els.input.value.trim(); if (t) { els.input.value = ""; sendMessage(t); } });
    els.input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); var t = els.input.value.trim(); if (t) { els.input.value = ""; sendMessage(t); } } });
  }

  // ── POSITIONING ──
  // Stage 1: Apply position:fixed via inline style
  function applyFixedCSS() {
    var gap = wStyle === "bar" ? 0 : 24;
    var s = "position:fixed;z-index:2147483000;bottom:" + gap + "px;";
    if (wStyle === "bar") {
      s += "left:0;right:0;width:100%;";
    } else if (wPos === "bottom-left") {
      s += "left:24px;right:auto;";
    } else {
      s += "right:24px;left:auto;";
    }
    s += "top:auto;display:block;margin:0;padding:0;border:none;background:none;font-size:16px;line-height:normal;box-sizing:border-box;overflow:visible;";
    root.style.cssText = s;
  }

  // Stage 2: JS-based absolute positioning (fallback)
  function jsPosition() {
    if (!root) return;
    var gap = wStyle === "bar" ? 0 : 24;
    var h = root.offsetHeight || 64;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var vpH = window.innerHeight;
    root.style.position = "absolute";
    root.style.top = (scrollY + vpH - h - gap) + "px";
    root.style.bottom = "auto";
    if (wStyle === "bar") {
      root.style.left = "0";
      root.style.right = "0";
      root.style.width = "100%";
    } else if (wPos === "bottom-left") {
      root.style.left = "24px";
      root.style.right = "auto";
    } else {
      root.style.right = "24px";
      root.style.left = "auto";
    }
  }

  // Stage 3: Verify and pick strategy
  function verifyAndFix() {
    var rect = root.getBoundingClientRect();
    var vpH = window.innerHeight;
    var gap = wStyle === "bar" ? 0 : 24;
    var expectedBottom = vpH - gap;
    var actualBottom = rect.bottom;

    // If the element is NOT near the bottom of the viewport, fixed is broken
    if (Math.abs(actualBottom - expectedBottom) > 80) {
      useJsPosition = true;
      jsPosition();
      window.addEventListener("scroll", jsPosition, { passive: true });
      window.addEventListener("resize", jsPosition, { passive: true });
    }
  }

  // ── Toggle HTML ──
  function buildToggle(style, name, greeting) {
    var ico = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H8l-4 4V5z" stroke="currentColor" stroke-width="1.8"/></svg>';
    var dot = '<span class="nv-online-dot"></span>';
    if (style === "pill") return '<button class="nv-toggle nv-toggle-pill" type="button" aria-label="Open chat">' + ico + '<span class="nv-toggle-label">' + esc(name || "Chat with us") + '</span>' + dot + '</button>';
    if (style === "bar") return '<button class="nv-toggle nv-toggle-bar" type="button" aria-label="Open chat">' + ico + '<span class="nv-toggle-label">' + esc(greeting || "Need help? Chat with us!") + '</span>' + dot + '</button>';
    return '<button class="nv-toggle" type="button" aria-label="Open chat">' + ico + dot + '</button>';
  }

  // ── INIT ──
  function init() {
    loadConfig().then(function (cfg) {
      config = cfg;
      wPos = config.widget_position || "bottom-right";
      wStyle = config.widget_style || "circle";

      root = document.createElement("div");
      root.className = "nv-root" + (wPos === "bottom-left" ? " nv-left" : "") + (isRtlDoc() ? " nv-rtl" : "");

      // Stage 1: try position:fixed
      applyFixedCSS();

      shadow = root.attachShadow({ mode: "open" });

      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = API_URL.replace(/\/$/, "") + "/widget/widget.css?v=" + Date.now();

      var styleEl = document.createElement("style");
      styleEl.textContent = ":host{--nv-primary:" + (config.primary_color || "#1a3a5c") + ";--nv-accent:" + (config.accent_color || "#c8a84b") + ";}";

      var avatar = config.avatar_url
        ? '<img class="nv-avatar" src="' + esc(config.avatar_url) + '" alt="">'
        : '<div class="nv-avatar nv-avatar-default" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" fill="currentColor"/></svg></div>';
      var tip = config.widget_greeting || "👋 Hi! Any questions I can help with?";

      var html = document.createElement("div");
      html.innerHTML =
        buildToggle(wStyle, config.consultant_name, tip) +
        '<section class="nv-panel" aria-live="polite"><header class="nv-header">' + avatar +
        '<div><div class="nv-name">' + esc(config.consultant_name || "Advisor") + '</div><div class="nv-role">' + esc(config.consultant_role || "Consultant") + '</div><div class="nv-status">● Online</div></div>' +
        '<button class="nv-close" type="button" aria-label="Close">×</button></header>' +
        '<div class="nv-body"></div><footer class="nv-footer"><div class="nv-input-row"><input class="nv-input" type="text" placeholder="Type your message..." maxlength="800"><button class="nv-send" type="button" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 11.5L20 4l-5.5 16-2.5-6L3 11.5z" stroke="currentColor" stroke-width="1.8"/></svg></button></div><div class="nv-powered">Powered by <a href="https://novuadvisor.com" target="_blank" rel="noopener noreferrer">Novu</a></div></footer></section>';

      shadow.appendChild(link);
      shadow.appendChild(styleEl);
      shadow.appendChild(html);
      document.body.appendChild(root);

      els.toggle = shadow.querySelector(".nv-toggle");
      els.panel = shadow.querySelector(".nv-panel");
      els.close = shadow.querySelector(".nv-close");
      els.body = shadow.querySelector(".nv-body");
      els.input = shadow.querySelector(".nv-input");
      els.send = shadow.querySelector(".nv-send");
      if (!els.toggle) return;

      bindEvents();

      // Give the browser a frame to render, then verify position
      setTimeout(function () {
        root.classList.add("nv-visible");

        // Stage 2: verify fixed actually worked
        requestAnimationFrame(function () {
          setTimeout(function () {
            verifyAndFix();
          }, 50);
        });
      }, 150);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
