const axios = require("axios");

function buildSystemPrompt(business, knowledgeContext, webContext, pageContext = {}) {
  // Build contact availability info (but don't show inline)
  const availableContacts = [];
  if (business.contact_phone) availableContacts.push("phone");
  if (business.contact_email) availableContacts.push("email");
  if (business.contact_whatsapp) availableContacts.push("WhatsApp");
  if (business.contact_telegram) availableContacts.push("Telegram");
  if (business.contact_calendly) availableContacts.push("appointment scheduling");
  const contactHint = availableContacts.length > 0
    ? `The business has ${availableContacts.join(", ")} available.`
    : "Contact options are limited.";

  let prompt = `You are ${business.consultant_name}, ${business.consultant_role} at ${business.name}.
Your sole purpose is to help visitors find exactly what they need and guide them
naturally toward taking action with the business.

━ ABOUT THIS BUSINESS:
${business.description || "No additional description provided."}

━ CONTACT AVAILABILITY:
${contactHint}
CRITICAL: Contact buttons will appear automatically at the END of your message when appropriate.
NEVER include phone numbers, emails, or contact details inline in your text.
NEVER write things like "📞 Call us at...", "✉️ Email us at...", etc.
Just say "Would you like to get in touch?" or "Feel free to contact us" — the buttons handle the rest.

━ YOUR CORE RULES (follow these always, no exceptions):
1. NEVER invent specific data about this business: prices, policies, availability,
   or anything not explicitly in the context below. If unsure → say you'll verify
   and suggest they reach out directly (buttons will appear automatically).
2. ALWAYS be the expert: give real value in every response, not just promotional talk.
   A visitor who learns something useful trusts the business more.
3. LANGUAGE: Detect the user's language from their first message and respond
   in that exact language throughout the conversation. Never switch.
4. FORMAT: Use simple HTML only: <b>bold</b>, <br> for line breaks, <ul><li> for lists.
   Never use markdown asterisks. Keep responses under 200 words.
5. CONTACT CTA: Include a natural (non-pushy) invitation to connect once per 3 responses,
   or when the user asks about pricing, availability, or next steps.
   DO NOT include contact details — just say "let me know if you'd like to connect" or similar.
6. LEAD CAPTURE (non-invasive): Never ask for email or phone in your first message.
   Only suggest sharing contact when there is clear value (e.g. "I can send you the pricing PDF by email if you'd like — just type your email here" or "If you leave your number we can have someone call you to schedule the demo").
   Never pressure: say "optional", "if you'd like", "when you're ready". If the visitor types their email or phone in the chat, we will capture it automatically; do not ask for it again. One soft suggestion per conversation is enough.
7. TONE: ${
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
    this.geminiKey = process.env.GEMINI_API_KEY || "";
  }

  resolveProviderAndModel(business = {}) {
    const provider = business.ai_provider || "openai";
    let model = business.ai_model || this.defaultModel;
    
    // Set smart defaults per provider
    if (provider === "gemini" && !business.ai_model) {
      model = "gemini-1.5-flash";
    } else if (provider === "anthropic" && !business.ai_model) {
      model = "claude-3-5-sonnet-latest";
    }
    
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
      } else if (provider === "gemini") {
        reply = await this.completeWithGemini(systemPrompt, history, userMessage, model, businessKey);
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

  async completeWithGemini(systemPrompt, history, userMessage, model, businessKey = "") {
    const key = businessKey || this.geminiKey;
    if (!key) {
      return "I can assist you right away. Could you share a little more context so I can guide you accurately?";
    }

    // Gemini combines system + user messages into a conversational format
    const contents = [];
    
    // Add system prompt as first user message if exists
    if (systemPrompt) {
      contents.push({
        role: "user",
        parts: [{ text: `[System Instructions]\n${systemPrompt}\n\n[User Query]\nHi, I need your assistance.` }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood. I'm ready to assist you following those guidelines. How can I help you today?" }]
      });
    }
    
    // Add conversation history
    for (const item of history) {
      contents.push({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      });
    }
    
    // Add current user message
    contents.push({
      role: "user",
      parts: [{ text: userMessage }]
    });

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 350,
          topP: 0.95,
          topK: 40
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
        ]
      },
      {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
