const { aiService } = require("./AIService");
const reportQueries = require("./report/reportQueries");
const {
  toKeyedObject,
  buildDailyActivity,
  detectKnowledgeGaps,
  buildOverview,
  buildDiagnostics
} = require("./report/reportAnalytics");

class ReportService {
  async generateInsightsNarrative(business, fullReport) {
    const prompt = `Analyze these conversation analytics for ${business.name} from the last month and provide 5 actionable owner insights.
Include:
1. What visitors ask most and what that reveals about their needs
2. Main objections slowing conversion
3. Missing website content based on unanswered questions
4. Typical visitor profile inferred from intents/questions
5. Three concrete actions for this week to improve conversion
Be direct, specific, and practical. Use examples from real questions.
Data: ${JSON.stringify(fullReport)}`;

    return aiService.generateInsights(prompt, business);
  }

  async generateReport(businessId, periodDays = 30) {
    const days = Math.max(1, Math.min(365, Number(periodDays) || 30));
    const business = reportQueries.getBusiness(businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    const raw = reportQueries.loadReportData(businessId, days);
    const overview = buildOverview(raw.overviewRaw);
    const intents = toKeyedObject(raw.intentsRows, {
      info: 0,
      price: 0,
      contact: 0,
      complaint: 0,
      objection: 0
    });
    const sentiment = toKeyedObject(raw.sentimentRows, {
      positive: 0,
      neutral: 0,
      negative: 0
    });
    const dailyActivity = buildDailyActivity(days, raw.dailySessions, raw.dailyMessages);
    const languages = toKeyedObject(raw.languagesRows, { en: 0, es: 0 });
    const channelsClicked = toKeyedObject(raw.channelsRows, {
      whatsapp: 0,
      email: 0,
      phone: 0
    });

    const report = {
      period: {
        start: new Date(Date.now() - days * 86400000).toISOString(),
        end: new Date().toISOString(),
        days
      },
      overview,
      intents,
      sentiment,
      top_pages: raw.topPages,
      top_questions: raw.topQuestions,
      knowledge_gaps: [...new Set([...raw.knowledgeGaps, ...detectKnowledgeGaps(raw.messages)])].slice(0, 10),
      leads: raw.leads,
      daily_activity: dailyActivity,
      languages,
      channels_clicked: channelsClicked,
      diagnostics: buildDiagnostics(raw.messages, raw.leads, raw.topQuestions),
      ai_insights: ""
    };

    report.ai_insights = await this.generateInsightsNarrative(business, report);
    reportQueries.saveReport(businessId, report);
    return report;
  }

  trackKnowledgeUsage(chunkIds = []) {
    if (!Array.isArray(chunkIds) || !chunkIds.length) {
      return;
    }
    reportQueries.trackKnowledgeUsage(chunkIds);
  }
}

module.exports = new ReportService();
