const express = require("express");
const db = require("../../db/database");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router({ mergeParams: true });

function buildSessionQuery({ businessId, date, intent, lead, language, q }) {
  const where = ["s.business_id = ?"];
  const params = [businessId];

  if (date) {
    where.push("substr(s.started_at, 1, 10) = ?");
    params.push(date);
  }
  if (lead === "0" || lead === "1") {
    where.push("s.is_lead = ?");
    params.push(Number(lead));
  }
  if (language) {
    where.push("s.language = ?");
    params.push(language);
  }
  if (q) {
    where.push(
      "EXISTS (SELECT 1 FROM messages mx WHERE mx.session_id = s.id AND mx.role = 'user' AND lower(mx.content) LIKE ?)"
    );
    params.push(`%${String(q).toLowerCase()}%`);
  }
  if (intent) {
    where.push(
      "EXISTS (SELECT 1 FROM messages mi WHERE mi.session_id = s.id AND mi.role = 'user' AND mi.intent = ?)"
    );
    params.push(intent);
  }

  const sql = `
    SELECT s.id, s.started_at, s.last_active, s.total_messages, s.is_lead, s.language
    FROM sessions s
    WHERE ${where.join(" AND ")}
    ORDER BY s.started_at DESC
    LIMIT 100
  `;

  return { sql, params };
}

router.get("/", requireAuth, (req, res) => {
  try {
    if (req.auth?.business_id !== req.params.id) {
      return res.status(403).json({ error: true, message: "Forbidden." });
    }

    const { date = "", intent = "", lead = "", language = "", q = "" } = req.query || {};
    const { sql, params } = buildSessionQuery({
      businessId: req.params.id,
      date: String(date),
      intent: String(intent),
      lead: String(lead),
      language: String(language),
      q: String(q)
    });

    const sessions = db.prepare(sql).all(...params);
    const topIntentStmt = db.prepare(`
      SELECT intent, COUNT(*) AS total
      FROM messages
      WHERE session_id = ? AND role = 'user'
      GROUP BY intent
      ORDER BY total DESC
      LIMIT 1
    `);

    const output = sessions.map((s) => {
      const topIntent = topIntentStmt.get(s.id)?.intent || "info";
      const started = new Date(`${s.started_at}Z`).getTime();
      const last = new Date(`${s.last_active}Z`).getTime();
      const durationMin = Number.isFinite(started) && Number.isFinite(last)
        ? Math.max(1, Math.round((last - started) / 60000))
        : 1;

      return {
        id: s.id,
        date: s.started_at,
        duration: `${durationMin} min`,
        messages: Number(s.total_messages || 0),
        top_intent: topIntent,
        lead: Number(s.is_lead) === 1,
        language: s.language || "en"
      };
    });

    return res.json({ sessions: output });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to load conversations." });
  }
});

router.get("/:sessionId/messages", requireAuth, (req, res) => {
  try {
    if (req.auth?.business_id !== req.params.id) {
      return res.status(403).json({ error: true, message: "Forbidden." });
    }

    const rows = db.prepare(`
      SELECT role, content, created_at
      FROM messages
      WHERE business_id = ? AND session_id = ?
      ORDER BY id ASC
      LIMIT 300
    `).all(req.params.id, req.params.sessionId);

    return res.json({ messages: rows });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to load conversation messages." });
  }
});

module.exports = router;
