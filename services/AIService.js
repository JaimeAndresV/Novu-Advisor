const axios = require("axios");

function buildSystemPrompt(business, knowledgeContext, webContext, pageContext = {}) {
  let prompt = `You are ${business.consultant_name}, ${business.consultant_role} at ${business.name}.
Your sole purpose is to help visitors find exactly what they need and guide them
naturally toward taking action with the business.

━ ABOUT THIS BUSINESS:
${business.description || "No additional description provided."}

━ CONTACT OPTIONS (use these when relevant, never force them):`;

  if (business.contact_phone) {
    prompt += `\n  📞 Phone: ${business.contact_phone}`;
  }
  if (business.contact_email) {
    prompt += `\n  ✉️  Email: ${business.contact_email}`;
  }
  if (business.contact_whatsapp) {
    prompt += `\n  💬 WhatsApp: ${business.contact_whatsapp}`;
  }
  if (business.contact_telegram) {
    prompt += `\n  ✈️  Telegram: ${business.contact_telegram}`;
  }
  if (business.contact_calendly) {
    prompt += `\n  📅 Schedule: ${business.contact_calendly}`;
  }

  prompt += `

━ YOUR CORE RULES (follow these always, no exceptions):
1. NEVER invent specific data about this business: prices, policies, availability,
   or anything not explicitly in the context below. If unsure → say you'll verify
   and invite them to contact the business directly.
2. ALWAYS be the expert: give real value in every response, not just promotional talk.
   A visitor who learns something useful trusts the business more.
3. LANGUAGE: Detect the user's language from their first message and respond
   in that exact language throughout the conversation. Never switch.
4. FORMAT: Use simple HTML only: <b>bold</b>, <br> for line breaks, <ul><li> for lists.
   Never use markdown asterisks. Keep responses under 200 words.
5. CONTACT CTA: Include a natural (non-pushy) contact invitation once per 3 responses,
   or when the user asks about pricing, availability, or next steps.
6. TONE: ${
    business.industry === "legal"
      ? "Formal and precise"
      : business.industry === "dental" || business.industry === "medical"
        ? "Warm and reassuring"
        : business.industry === "ecommerce"
          ? "Friendly and efficient"
          : "Professional, warm, and direct"
  }

━ WHERE THE USER IS NOW:
Page: ${pageContext.title || "Unknown page"}
URL: ${pageContext.url || "Unknown URL"}
${pageContext.description ? `About this page: ${pageContext.description}` : ""}`;

  if (knowledgeContext) {
    prompt += `

━ RELEVANT INFORMATION FROM THE WEBSITE (use this to answer — this is ground truth):
${knowledgeContext}`;
  }

  if (webContext) {
    prompt += `

━ GENERAL MARKET INFORMATION (clearly tell user this is general industry info,
  not specific to this business):
${webContext}`;
  }

  if (business.system_prompt) {
    prompt += `

━ SPECIAL INSTRUCTIONS FOR THIS BUSINESS:
${business.system_prompt}`;
  }

  return prompt;
}

class AIService {
  constructor() {
    this.defaultModel = process.env.DEFAULT_AI_MODEL || "gpt-4o-mini";
    this.openAiKey = process.env.OPENAI_API_KEY || "";
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  }

  resolveProviderAndModel(business = {}) {
    const provider = business.ai_provider || "openai";
    const model = business.ai_model || this.defaultModel;
    const businessKey = String(business.ai_api_key || "").trim();
    return { provider, model, businessKey };
  }

  async complete(systemPrompt, history = [], userMessage = "", business = {}) {
    const { provider, model, businessKey } = this.resolveProviderAndModel(business);
    const start = Date.now();

    try {
      let reply = "";
      if (provider === "anthropic") {
        reply = await this.completeWithAnthropic(systemPrompt, history, userMessage, model, businessKey);
      } else {
        reply = await this.completeWithOpenAI(systemPrompt, history, userMessage, model, businessKey);
      }

      return {
        text: (reply || "").trim(),
        responseMs: Date.now() - start,
        provider,
        model
      };
    } catch (error) {
      return {
        text: "I can help with that. To give you the most accurate answer, please share a bit more detail and I can guide you to the best next step.",
        responseMs: Date.now() - start,
        provider,
        model
      };
    }
  }

  async completeWithOpenAI(systemPrompt, history, userMessage, model, businessKey = "") {
    const key = businessKey || this.openAiKey;
    if (!key) {
      return "I can assist you right away. Could you share a little more context so I can guide you accurately?";
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content
      })),
      { role: "user", content: userMessage }
    ];

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages,
        temperature: 0.4,
        max_tokens: 350
      },
      {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data?.choices?.[0]?.message?.content || "";
  }

  async completeWithAnthropic(systemPrompt, history, userMessage, model, businessKey = "") {
    const key = businessKey || this.anthropicKey;
    if (!key) {
      return "I can assist you right away. Could you share a little more context so I can guide you accurately?";
    }

    const messages = [
      ...history.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: [{ type: "text", text: item.content }]
      })),
      { role: "user", content: [{ type: "text", text: userMessage }] }
    ];

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: model || "claude-3-5-sonnet-latest",
        system: systemPrompt,
        max_tokens: 350,
        temperature: 0.4,
        messages
      },
      {
        timeout: 30000,
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );

    const first = response.data?.content?.[0];
    return first?.text || "";
  }

  async generateInsights(prompt, business = {}) {
    const completion = await this.complete(
      "You are a senior business intelligence analyst. Be concise, specific, and action-oriented.",
      [],
      prompt,
      business
    );

    return completion.text;
  }
}

const aiService = new AIService();

module.exports = {
  aiService,
  buildSystemPrompt,
  AIService
};
