const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const db = require("../db/database");

class MemoryService {
  constructor() {
    this.getSessionStmt = db.prepare(`
      SELECT * FROM sessions
      WHERE id = ? AND business_id = ?
      LIMIT 1
    `);

    this.createSessionStmt = db.prepare(`
      INSERT INTO sessions (
        id, business_id, fingerprint, ip_hash, country, language, started_at, last_active
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    this.touchSessionStmt = db.prepare(`
      UPDATE sessions
      SET last_active = datetime('now'),
          total_messages = total_messages + 1
      WHERE id = ?
    `);

    this.insertMessageStmt = db.prepare(`
      INSERT INTO messages (
        session_id, business_id, role, content, page_url, page_title, intent, sentiment, used_rag, used_web, response_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.historyStmt = db.prepare(`
      SELECT role, content
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT 12
    `);

    this.markLeadStmt = db.prepare(`
      UPDATE sessions
      SET is_lead = 1,
          lead_name = COALESCE(?, lead_name),
          lead_email = COALESCE(?, lead_email),
          lead_phone = COALESCE(?, lead_phone),
          lead_channel = COALESCE(?, lead_channel),
          last_active = datetime('now')
      WHERE id = ?
    `);
  }

  hashIP(ip = "") {
    if (!ip) {
      return "";
    }
    return crypto.createHash("sha256").update(ip).digest("hex");
  }

  isSessionFresh(lastActive) {
    if (!lastActive) {
      return false;
    }
    const last = new Date(`${lastActive}Z`).getTime();
    if (!Number.isFinite(last)) {
      return false;
    }
    const ageMs = Date.now() - last;
    return ageMs < 24 * 60 * 60 * 1000;
  }

  getOrCreateSession({
    businessId,
    sessionId = "",
    fingerprint = "",
    ip = "",
    country = "",
    language = "en"
  }) {
    const existing = sessionId
      ? this.getSessionStmt.get(sessionId, businessId)
      : null;

    if (existing && this.isSessionFresh(existing.last_active)) {
      this.touchSessionStmt.run(existing.id);
      return this.getSessionStmt.get(existing.id, businessId);
    }

    const newId = uuidv4();
    this.createSessionStmt.run(
      newId,
      businessId,
      fingerprint || null,
      this.hashIP(ip) || null,
      country || null,
      language || "en"
    );
    this.touchSessionStmt.run(newId);
    return this.getSessionStmt.get(newId, businessId);
  }

  getRecentHistory(sessionId) {
    return this.historyStmt.all(sessionId);
  }

  saveMessage({
    sessionId,
    businessId,
    role,
    content,
    pageUrl = "",
    pageTitle = "",
    intent = "info",
    sentiment = "neutral",
    usedRag = 0,
    usedWeb = 0,
    responseMs = 0
  }) {
    this.insertMessageStmt.run(
      sessionId,
      businessId,
      role,
      content,
      pageUrl || null,
      pageTitle || null,
      intent || "info",
      sentiment || "neutral",
      usedRag ? 1 : 0,
      usedWeb ? 1 : 0,
      Number(responseMs) || 0
    );
  }

  saveConversationPair({
    sessionId,
    businessId,
    userMessage,
    assistantMessage,
    context = {},
    intent = "info",
    sentiment = "neutral",
    usedRag = false,
    usedWeb = false,
    responseMs = 0
  }) {
    const trx = db.transaction(() => {
      this.saveMessage({
        sessionId,
        businessId,
        role: "user",
        content: userMessage,
        pageUrl: context.url,
        pageTitle: context.title,
        intent,
        sentiment
      });

      this.saveMessage({
        sessionId,
        businessId,
        role: "assistant",
        content: assistantMessage,
        pageUrl: context.url,
        pageTitle: context.title,
        intent,
        sentiment,
        usedRag,
        usedWeb,
        responseMs
      });
    });

    trx();
  }

  markSessionAsLead(sessionId, lead = {}) {
    this.markLeadStmt.run(
      lead.name || null,
      lead.email || null,
      lead.phone || null,
      lead.channel || null,
      sessionId
    );
  }
}

module.exports = new MemoryService();
