const db = require("../../db/database");

class ReportQueries {
  constructor() {
    this.businessStmt = db.prepare(`
      SELECT *
      FROM businesses
      WHERE id = ?
      LIMIT 1
    `);

    this.overviewStmt = db.prepare(`
      SELECT
        COUNT(DISTINCT s.id) AS total_sessions,
        COALESCE(SUM(s.total_messages), 0) AS total_messages,
        SUM(CASE WHEN s.is_lead = 1 THEN 1 ELSE 0 END) AS leads_captured
      FROM sessions s
      WHERE s.business_id = ?
        AND datetime(s.started_at) >= datetime('now', '-' || ? || ' days')
    `);

    this.intentsStmt = db.prepare(`
      SELECT intent, COUNT(*) AS total
      FROM messages
      WHERE business_id = ?
        AND role = 'user'
        AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY intent
    `);

    this.sentimentStmt = db.prepare(`
      SELECT sentiment, COUNT(*) AS total
      FROM messages
      WHERE business_id = ?
        AND role = 'user'
        AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY sentiment
    `);

    this.topPagesStmt = db.prepare(`
      SELECT
        COALESCE(page_url, 'unknown') AS url,
        COALESCE(page_title, 'Untitled') AS title,
        COUNT(DISTINCT session_id) AS sessions
      FROM messages
      WHERE business_id = ?
        AND role = 'user'
        AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY page_url, page_title
      ORDER BY sessions DESC
      LIMIT 10
    `);

    this.topQuestionsStmt = db.prepare(`
      SELECT content
      FROM messages
      WHERE business_id = ?
        AND role = 'user'
        AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY content
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);

    this.gapsStmt = db.prepare(`
      SELECT m.content
      FROM messages m
      WHERE m.business_id = ?
        AND m.role = 'assistant'
        AND m.used_rag = 0
        AND m.intent != 'greeting'
        AND datetime(m.created_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY m.content
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);

    this.leadsStmt = db.prepare(`
      SELECT
        session_id,
        COALESCE(name, '-') AS name,
        COALESCE(email, '-') AS email,
        COALESCE(phone, '-') AS phone,
        COALESCE(channel_chosen, '-') AS channel,
        COALESCE(page_url, '-') AS page,
        created_at
      FROM leads
      WHERE business_id = ?
        AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
      ORDER BY created_at DESC
      LIMIT 100
    `);

    this.dailySessionsStmt = db.prepare(`
      SELECT substr(started_at, 1, 10) AS date, COUNT(*) AS sessions
      FROM sessions
      WHERE business_id = ?
        AND datetime(started_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY substr(started_at, 1, 10)
    `);

    this.dailyMessagesStmt = db.prepare(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS messages
      FROM messages
      WHERE business_id = ?
        AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY substr(created_at, 1, 10)
    `);

    this.languagesStmt = db.prepare(`
      SELECT language, COUNT(*) AS total
      FROM sessions
      WHERE business_id = ?
        AND datetime(started_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY language
    `);

    this.channelClicksStmt = db.prepare(`
      SELECT lower(channel_chosen) AS channel, COUNT(*) AS total
      FROM leads
      WHERE business_id = ?
        AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
      GROUP BY lower(channel_chosen)
    `);

    this.messagesForInsightsStmt = db.prepare(`
      SELECT m.session_id, m.role, m.content, m.intent, m.sentiment, m.page_url, m.created_at, m.used_rag
      FROM messages m
      WHERE m.business_id = ?
        AND datetime(m.created_at) >= datetime('now', '-' || ? || ' days')
      ORDER BY m.created_at ASC
    `);

    this.saveReportStmt = db.prepare(`
      INSERT INTO weekly_reports (
        business_id, period_start, period_end, report_json, ai_insights, created_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    this.updateChunkUsageStmt = db.prepare(`
      UPDATE knowledge_chunks
      SET times_used = times_used + 1
      WHERE id = ?
    `);
  }

  getBusiness(businessId) {
    return this.businessStmt.get(businessId);
  }

  loadReportData(businessId, days) {
    return {
      overviewRaw: this.overviewStmt.get(businessId, days) || {
        total_sessions: 0,
        total_messages: 0,
        leads_captured: 0
      },
      intentsRows: this.intentsStmt.all(businessId, days),
      sentimentRows: this.sentimentStmt.all(businessId, days),
      topPages: this.topPagesStmt.all(businessId, days),
      topQuestions: this.topQuestionsStmt.all(businessId, days).map((row) => row.content),
      knowledgeGaps: this.gapsStmt.all(businessId, days).map((row) => row.content),
      leads: this.leadsStmt.all(businessId, days),
      dailySessions: this.dailySessionsStmt.all(businessId, days),
      dailyMessages: this.dailyMessagesStmt.all(businessId, days),
      languagesRows: this.languagesStmt.all(businessId, days),
      channelsRows: this.channelClicksStmt.all(businessId, days),
      messages: this.messagesForInsightsStmt.all(businessId, days)
    };
  }

  saveReport(businessId, report) {
    this.saveReportStmt.run(
      businessId,
      report.period.start,
      report.period.end,
      JSON.stringify(report),
      report.ai_insights
    );
  }

  trackKnowledgeUsage(chunkIds = []) {
    const trx = db.transaction(() => {
      for (const id of chunkIds) {
        this.updateChunkUsageStmt.run(id);
      }
    });
    trx();
  }
}

module.exports = new ReportQueries();
