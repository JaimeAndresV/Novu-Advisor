const { extractKeywords } = require("../../utils/textUtils");

function toKeyedObject(rows, defaults) {
  const result = { ...defaults };
  for (const row of rows) {
    result[row.intent || row.sentiment || row.language || row.channel] = row.total;
  }
  return result;
}

function buildDailyActivity(days, sessionsRows, messagesRows) {
  const map = new Map();

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    map.set(date, { date, sessions: 0, messages: 0 });
  }

  for (const row of sessionsRows) {
    if (map.has(row.date)) {
      map.get(row.date).sessions = Number(row.sessions || 0);
    }
  }

  for (const row of messagesRows) {
    if (map.has(row.date)) {
      map.get(row.date).messages = Number(row.messages || 0);
    }
  }

  return [...map.values()];
}

function detectFrictionMoments(messages) {
  const bySession = new Map();
  for (const msg of messages) {
    if (!bySession.has(msg.session_id)) {
      bySession.set(msg.session_id, []);
    }
    bySession.get(msg.session_id).push(msg);
  }

  const friction = [];
  for (const convo of bySession.values()) {
    if (convo.length < 2) {
      continue;
    }
    const last = convo[convo.length - 1];
    if (last.role === "assistant") {
      friction.push(last.content.slice(0, 180));
    }
  }

  return friction.slice(0, 10);
}

function detectKnowledgeGaps(messages) {
  return messages
    .filter((m) => m.role === "assistant" && Number(m.used_rag) === 0 && m.intent !== "greeting")
    .map((m) => m.content)
    .slice(0, 10);
}

function bestPerformingPages(messages, leads) {
  const leadSessions = new Set(leads.map((l) => l.session_id).filter(Boolean));
  const pageMap = new Map();

  for (const msg of messages) {
    if (msg.role !== "user" || !msg.page_url) {
      continue;
    }

    if (!pageMap.has(msg.page_url)) {
      pageMap.set(msg.page_url, {
        page: msg.page_url,
        sessions: new Set(),
        leads: new Set()
      });
    }

    const record = pageMap.get(msg.page_url);
    record.sessions.add(msg.session_id);
    if (leadSessions.has(msg.session_id)) {
      record.leads.add(msg.session_id);
    }
  }

  return [...pageMap.values()]
    .map((item) => ({
      page: item.page,
      sessions: item.sessions.size,
      leads: item.leads.size,
      conversion: item.sessions.size
        ? `${((item.leads.size / item.sessions.size) * 100).toFixed(1)}%`
        : "0.0%"
    }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 5);
}

function buildOverview(overviewRaw) {
  const totalSessions = Number(overviewRaw.total_sessions || 0);
  const totalMessages = Number(overviewRaw.total_messages || 0);
  const leadsCaptured = Number(overviewRaw.leads_captured || 0);

  return {
    total_sessions: totalSessions,
    total_messages: totalMessages,
    leads_captured: leadsCaptured,
    conversion_rate: totalSessions ? `${((leadsCaptured / totalSessions) * 100).toFixed(1)}%` : "0.0%",
    avg_messages_per_session: totalSessions ? Number((totalMessages / totalSessions).toFixed(1)) : 0,
    returning_users: 0
  };
}

function buildDiagnostics(messages, leads, topQuestions) {
  return {
    topic_frequency: extractKeywords(topQuestions.join(" "), 20, 3),
    friction_moments: detectFrictionMoments(messages),
    best_performing_pages: bestPerformingPages(messages, leads)
  };
}

module.exports = {
  toKeyedObject,
  buildDailyActivity,
  detectKnowledgeGaps,
  buildOverview,
  buildDiagnostics
};
