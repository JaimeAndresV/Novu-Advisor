const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const db = require("../db/database");
const intentDetector = require("../utils/intentDetector");
const memoryService = require("../services/MemoryService");
const knowledgeService = require("../services/KnowledgeService");
const leadService = require("../services/LeadService");
const notifyService = require("../services/NotifyService");
const reportService = require("../services/ReportService");
const { aiService, buildSystemPrompt } = require("../services/AIService");

const router = express.Router();

const getBusinessStmt = db.prepare(`
  SELECT *
  FROM businesses
  WHERE id = ?
  LIMIT 1
`);

function buildChannels(business) {
  const channels = [];
  if (business.contact_phone) {
    channels.push({ label: "Call Us", icon: "📞", url: `tel:${business.contact_phone}` });
  }
  if (business.contact_email) {
    channels.push({ label: "Email", icon: "✉️", url: `mailto:${business.contact_email}` });
  }
  if (business.contact_whatsapp) {
    channels.push({ label: "WhatsApp", icon: "💬", url: business.contact_whatsapp });
  }
  if (business.contact_telegram) {
    channels.push({ label: "Telegram", icon: "✈️", url: business.contact_telegram });
  }
  if (business.contact_calendly) {
    channels.push({ label: "Schedule", icon: "📅", url: business.contact_calendly });
  }
  if (business.contact_form_url) {
    channels.push({ label: "Contact Form", icon: "🌐", url: business.contact_form_url });
  }
  return channels;
}

function buildFingerprint(req) {
  const ua = String(req.headers["user-agent"] || "");
  const lang = String(req.headers["accept-language"] || "");
  return crypto.createHash("sha256").update(`${ua}|${lang}`).digest("hex");
}

async function runWebSearch(query) {
  const apiKey = process.env.SERPER_API_KEY || "";
  if (!apiKey) {
    return "";
  }

  const response = await axios.post(
    "https://google.serper.dev/search",
    { q: query, num: 3 },
    {
      timeout: 6000,
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      }
    }
  );

  const organic = response.data?.organic || [];
  return organic
    .slice(0, 3)
    .map((item, idx) => {
      const title = item.title || "Source";
      const snippet = item.snippet || "";
      const link = item.link || "";
      return `(${idx + 1}) ${title}\n${snippet}\nSource: ${link}`;
    })
    .join("\n\n");
}

router.post("/", async (req, res) => {
  try {
    const businessId = String(req.body?.business_id || "").trim();
    const message = String(req.body?.message || "").trim();
    const sessionIdInput = String(req.body?.session_id || "").trim();
    const context = req.body?.context || {};

    if (!businessId || !message) {
      return res.status(400).json({
        error: true,
        message: "business_id and message are required."
      });
    }

    // Step 1: Session handling.
    const session = memoryService.getOrCreateSession({
      businessId,
      sessionId: sessionIdInput,
      fingerprint: buildFingerprint(req),
      ip: String(req.ip || ""),
      country: String(req.headers["x-country"] || ""),
      language: String(req.headers["accept-language"] || "en").split(",")[0]
    });

    // Step 2: Load business.
    const business = getBusinessStmt.get(businessId);
    if (!business) {
      return res.status(404).json({
        error: true,
        message: "Business not found."
      });
    }

    // Step 3: Conversation history (max 12).
    const history = memoryService.getRecentHistory(session.id);

    // Step 4: Knowledge search (RAG).
    const ragResults = knowledgeService.search(message, businessId, 3);
    const knowledgeContext = knowledgeService.formatForPrompt(ragResults);

    // Step 5: Intent detection.
    const intentData = intentDetector(message);

    // Step 6: Optional web search.
    let webContext = "";
    let usedWeb = false;
    if (intentData.needs_web_search && process.env.SERPER_API_KEY) {
      try {
        webContext = await runWebSearch(message);
        usedWeb = Boolean(webContext);
      } catch (error) {
        webContext = "";
      }
    }

    // Step 7: Build system prompt.
    const pageContext = {
      url: String(context.url || ""),
      title: String(context.title || ""),
      description: String(context.description || ""),
      h1: String(context.h1 || "")
    };
    const systemPrompt = buildSystemPrompt(business, knowledgeContext, webContext, pageContext);

    // Step 8: AI completion.
    const completion = await aiService.complete(systemPrompt, history, message, business);
    const reply = completion.text || "I can help with that. Could you share a bit more detail?";

    // Step 9: Lead detection.
    let savedLead = null;
    try {
      const lead = leadService.extract(message);
      if (lead.hasLeadData) {
        savedLead = leadService.saveLead({
          businessId,
          sessionId: session.id,
          lead,
          intent: intentData.intent,
          pageUrl: pageContext.url,
          message
        });

        if (savedLead && !savedLead.duplicated) {
          notifyService.sendLeadNotification(business, {
            ...savedLead,
            session_id: session.id,
            page_url: pageContext.url
          }).catch((err) => {
            console.error("[chat] Lead notification failed:", err?.message || err);
          });
        }
      }
    } catch (error) {
      // Lead extraction must not break chat.
    }

    // Step 10: Decide whether to show contact channels.
    const lowerReply = reply.toLowerCase();
    const showChannels =
      intentData.intent === "contact" ||
      intentData.intent === "price" ||
      Number(session.total_messages || 0) >= 6 ||
      lowerReply.includes("contact us") ||
      lowerReply.includes("schedule");
    const channels = showChannels ? buildChannels(business) : [];

    // Step 11: Update chunk usage metrics.
    reportService.trackKnowledgeUsage(ragResults.map((item) => item.id));

    // Step 12: Save both messages and respond.
    memoryService.saveConversationPair({
      sessionId: session.id,
      businessId,
      userMessage: message,
      assistantMessage: reply,
      context: pageContext,
      intent: intentData.intent,
      sentiment: intentData.sentiment,
      usedRag: ragResults.length > 0,
      usedWeb,
      responseMs: completion.responseMs || 0
    });

    return res.json({
      session_id: session.id,
      reply,
      show_channels: showChannels,
      channels,
      intent: intentData.intent
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Unable to process chat request."
    });
  }
});

module.exports = router;
