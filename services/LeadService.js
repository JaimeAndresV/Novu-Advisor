const db = require("../db/database");
const memoryService = require("./MemoryService");
const { cleanText, normalizeText } = require("../utils/textUtils");

class LeadService {
  constructor() {
    this.insertLeadStmt = db.prepare(`
      INSERT INTO leads (
        business_id, session_id, name, email, phone, channel_chosen, intent_at_capture, page_url, message, notified, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `);

    this.getRecentLeadStmt = db.prepare(`
      SELECT id, name, email, phone, created_at
      FROM leads
      WHERE business_id = ? AND session_id = ?
      ORDER BY id DESC
      LIMIT 1
    `);

    this.markNotifiedStmt = db.prepare(`
      UPDATE leads
      SET notified = 1
      WHERE id = ?
    `);
  }

  extractEmail(message = "") {
    const match = String(message).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0].toLowerCase() : "";
  }

  extractPhone(message = "") {
    const match = String(message).match(/(\+?\d[\d\s().-]{7,}\d)/);
    if (!match) {
      return "";
    }
    return match[0].replace(/\s+/g, " ").trim();
  }

  extractName(message = "") {
    const text = cleanText(message);
    if (!text) {
      return "";
    }

    const patterns = [
      /(?:my name is|i am|i'm|soy|me llamo)\s+([a-zA-ZÀ-ÿ' -]{2,50})/i,
      /(?:name[:\s]+)([a-zA-ZÀ-ÿ' -]{2,50})/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return cleanText(match[1]).split(" ").slice(0, 3).join(" ");
      }
    }

    return "";
  }

  detectChannel(message = "") {
    const n = normalizeText(message);
    if (!n) {
      return "";
    }

    if (n.includes("whatsapp")) {
      return "whatsapp";
    }
    if (n.includes("telegram")) {
      return "telegram";
    }
    if (n.includes("call") || n.includes("phone") || n.includes("llamar") || n.includes("telefono")) {
      return "phone";
    }
    if (n.includes("email") || n.includes("correo")) {
      return "email";
    }
    if (n.includes("calendly") || n.includes("schedule") || n.includes("agendar") || n.includes("cita")) {
      return "calendly";
    }

    return "";
  }

  extract(message = "") {
    const email = this.extractEmail(message);
    const phone = this.extractPhone(message);
    const name = this.extractName(message);
    const channel = this.detectChannel(message);
    const hasLeadData = Boolean(email || phone || name);

    return {
      hasLeadData,
      name,
      email,
      phone,
      channel
    };
  }

  saveLead({
    businessId,
    sessionId,
    lead,
    intent = "info",
    pageUrl = "",
    message = ""
  }) {
    if (!lead || !lead.hasLeadData) {
      return null;
    }

    const recent = this.getRecentLeadStmt.get(businessId, sessionId);
    if (
      recent &&
      ((lead.email && recent.email === lead.email) ||
        (lead.phone && recent.phone === lead.phone))
    ) {
      return {
        id: recent.id,
        duplicated: true,
        ...lead
      };
    }

    const result = this.insertLeadStmt.run(
      businessId,
      sessionId,
      lead.name || null,
      lead.email || null,
      lead.phone || null,
      lead.channel || null,
      intent || "info",
      pageUrl || null,
      cleanText(message || "")
    );

    memoryService.markSessionAsLead(sessionId, lead);

    return {
      id: result.lastInsertRowid,
      duplicated: false,
      ...lead
    };
  }

  markLeadNotified(leadId) {
    this.markNotifiedStmt.run(leadId);
  }
}

module.exports = new LeadService();
