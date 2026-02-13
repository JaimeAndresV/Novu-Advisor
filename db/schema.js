function createSchema(db) {
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      description TEXT,
      website_url TEXT,
      language TEXT DEFAULT 'en',
      consultant_name TEXT DEFAULT 'Advisor',
      consultant_role TEXT DEFAULT 'Business Consultant',
      avatar_url TEXT,
      primary_color TEXT DEFAULT '#1a3a5c',
      accent_color TEXT DEFAULT '#c8a84b',
      contact_email TEXT,
      contact_phone TEXT,
      contact_whatsapp TEXT,
      contact_telegram TEXT,
      contact_calendly TEXT,
      contact_form_url TEXT,
      system_prompt TEXT,
      ai_provider TEXT DEFAULT 'openai',
      ai_model TEXT DEFAULT 'gpt-4o-mini',
      plan TEXT DEFAULT 'free',
      api_key TEXT,
      admin_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      fingerprint TEXT,
      ip_hash TEXT,
      country TEXT,
      language TEXT DEFAULT 'en',
      started_at TEXT DEFAULT (datetime('now')),
      last_active TEXT DEFAULT (datetime('now')),
      is_lead INTEGER DEFAULT 0,
      lead_name TEXT,
      lead_email TEXT,
      lead_phone TEXT,
      lead_channel TEXT,
      total_messages INTEGER DEFAULT 0,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      page_url TEXT,
      page_title TEXT,
      intent TEXT DEFAULT 'info',
      sentiment TEXT DEFAULT 'neutral',
      used_rag INTEGER DEFAULT 0,
      used_web INTEGER DEFAULT 0,
      response_ms INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL,
      source_url TEXT,
      title TEXT,
      content TEXT NOT NULL,
      keywords TEXT,
      relevance_score REAL DEFAULT 1.0,
      times_used INTEGER DEFAULT 0,
      last_crawled TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      channel_chosen TEXT,
      intent_at_capture TEXT,
      page_url TEXT,
      message TEXT,
      notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weekly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      report_json TEXT,
      ai_insights TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_business_id ON sessions(business_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_knowledge_business_id ON knowledge_chunks(business_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_keywords ON knowledge_chunks(keywords);
    CREATE INDEX IF NOT EXISTS idx_leads_business_id ON leads(business_id);
    CREATE INDEX IF NOT EXISTS idx_reports_business_id ON weekly_reports(business_id);
  `);

  ensureColumn(db, "businesses", "ai_api_key", "TEXT");
  ensureColumn(db, "businesses", "widget_style", "TEXT DEFAULT 'circle'");
  ensureColumn(db, "businesses", "widget_position", "TEXT DEFAULT 'bottom-right'");
  ensureColumn(db, "businesses", "widget_greeting", "TEXT");
}

function ensureColumn(db, tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((c) => c.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

module.exports = {
  createSchema
};
