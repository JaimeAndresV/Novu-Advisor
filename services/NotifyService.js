const nodemailer = require("nodemailer");
const cron = require("node-cron");
const db = require("../db/database");

class NotifyService {
  constructor() {
    this.fromEmail = process.env.FROM_EMAIL || "noreply@example.com";
    this.baseUrl = process.env.BASE_URL || "http://localhost:3000";
    this.transporter = this.createTransporter();

    this.getLastMessagesStmt = db.prepare(`
      SELECT role, content, created_at
      FROM messages
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT 3
    `);

    this.getWeeklyBusinessesStmt = db.prepare(`
      SELECT id, name, contact_email
      FROM businesses
      WHERE contact_email IS NOT NULL AND contact_email != ''
    `);
  }

  createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  async sendMail(mailOptions) {
    if (!this.transporter) {
      console.log("[NotifyService] SMTP not configured. Email preview:", {
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      return { skipped: true };
    }

    return this.transporter.sendMail({
      from: this.fromEmail,
      ...mailOptions
    });
  }

  buildConversationHtml(sessionId) {
    const rows = this.getLastMessagesStmt.all(sessionId).reverse();
    if (!rows.length) {
      return "<p>No conversation messages available yet.</p>";
    }

    return rows
      .map((row) => {
        const role = row.role === "assistant" ? "Advisor" : "Visitor";
        const safeContent = String(row.content || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<p><b>${role}:</b> ${safeContent}</p>`;
      })
      .join("");
  }

  async sendLeadNotification(business, lead) {
    if (!business || !business.contact_email) {
      return { skipped: true, reason: "missing_business_email" };
    }

    const conversationHtml = this.buildConversationHtml(lead.session_id);
    const conversationUrl = `${this.baseUrl}/dashboard/conversations.html?business_id=${encodeURIComponent(business.id)}&session_id=${encodeURIComponent(lead.session_id)}`;

    const html = `
      <h2>New lead from your advisor</h2>
      <p><b>Business:</b> ${business.name}</p>
      <p><b>Name:</b> ${lead.name || "-"}</p>
      <p><b>Email:</b> ${lead.email || "-"}</p>
      <p><b>Phone:</b> ${lead.phone || "-"}</p>
      <p><b>Page:</b> ${lead.page_url || "-"}</p>
      <hr />
      <h3>Latest conversation messages</h3>
      ${conversationHtml}
      <p style="margin-top:16px;">
        <a href="${conversationUrl}" style="padding:10px 14px;background:#1a3a5c;color:#fff;text-decoration:none;border-radius:6px;">
          View Full Conversation
        </a>
      </p>
    `;

    return this.sendMail({
      to: business.contact_email,
      subject: `🔔 New lead from your advisor — ${business.name}`,
      html
    });
  }

  async sendWeeklyDigest(business, reportData = {}) {
    if (!business || !business.contact_email) {
      return { skipped: true, reason: "missing_business_email" };
    }

    const insights = String(reportData.ai_insights || "")
      .split("\n")
      .filter(Boolean)
      .slice(0, 3)
      .map((line) => `<li>${line}</li>`)
      .join("");

    const reportUrl = `${this.baseUrl}/dashboard/report.html?business_id=${encodeURIComponent(business.id)}`;
    const html = `
      <h2>Weekly Advisor Digest</h2>
      <p><b>${business.name}</b> weekly summary:</p>
      <ul>
        <li>Total conversations: ${reportData.overview?.total_sessions || 0}</li>
        <li>Leads captured: ${reportData.overview?.leads_captured || 0}</li>
        <li>Conversion rate: ${reportData.overview?.conversion_rate || "0%"}</li>
      </ul>
      <h3>Top insights</h3>
      <ul>${insights || "<li>No insights available yet.</li>"}</ul>
      <p>
        <a href="${reportUrl}" style="padding:10px 14px;background:#c8a84b;color:#111;text-decoration:none;border-radius:6px;">
          View Full Report
        </a>
      </p>
    `;

    return this.sendMail({
      to: business.contact_email,
      subject: `📊 Weekly digest — ${business.name}`,
      html
    });
  }

  startWeeklyDigestScheduler(reportService) {
    if (!reportService || typeof reportService.generateReport !== "function") {
      return;
    }

    // Every Monday at 09:00 server time.
    cron.schedule("0 9 * * 1", async () => {
      const businesses = this.getWeeklyBusinessesStmt.all();
      for (const business of businesses) {
        try {
          const report = await reportService.generateReport(business.id, 7);
          await this.sendWeeklyDigest(business, report);
        } catch (error) {
          console.error("[NotifyService] Weekly digest failed:", error.message);
        }
      }
    });
  }
}

module.exports = new NotifyService();
