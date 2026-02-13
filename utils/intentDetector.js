const { extractKeywords, normalizeText } = require("./textUtils");

const INTENT_PATTERNS = {
  contact: [
    "contact",
    "call",
    "phone",
    "email",
    "whatsapp",
    "telegram",
    "schedule",
    "appointment",
    "book",
    "talk to",
    "speak with",
    "contactar",
    "llamar",
    "telefono",
    "correo",
    "agendar",
    "cita"
  ],
  price: [
    "price",
    "pricing",
    "cost",
    "quote",
    "budget",
    "fee",
    "tariff",
    "discount",
    "how much",
    "precio",
    "cuanto cuesta",
    "cotizacion",
    "presupuesto",
    "tarifa",
    "oferta",
    "promocion"
  ],
  complaint: [
    "bad",
    "terrible",
    "problem",
    "issue",
    "slow",
    "broken",
    "scam",
    "unhappy",
    "complaint",
    "queja",
    "malo",
    "problema",
    "error",
    "lento",
    "molesto",
    "insatisfecho"
  ],
  objection: [
    "not sure",
    "doubt",
    "worried",
    "expensive",
    "too much",
    "maybe later",
    "not convinced",
    "risk",
    "objecion",
    "duda",
    "caro",
    "riesgo",
    "no me convence",
    "mas adelante"
  ]
};

const POSITIVE_WORDS = [
  "great",
  "perfect",
  "excellent",
  "love",
  "thanks",
  "helpful",
  "genial",
  "perfecto",
  "excelente",
  "gracias",
  "util",
  "me encanta"
];

const NEGATIVE_WORDS = [
  "bad",
  "awful",
  "terrible",
  "angry",
  "frustrated",
  "hate",
  "malo",
  "horrible",
  "terrible",
  "enojado",
  "frustrado",
  "odio"
];

const WEB_SEARCH_TRIGGERS = [
  "market price",
  "current price",
  "latest",
  "today",
  "this year",
  "trend",
  "trends",
  "competitor",
  "competition",
  "law",
  "regulation",
  "legal changes",
  "cuanto vale",
  "precio de mercado",
  "actualmente",
  "hoy",
  "este ano",
  "tendencia",
  "tendencias",
  "competencia",
  "competidor",
  "ley",
  "regulacion",
  "normativa"
];

function containsAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function detectIntent(normalizedMessage) {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (containsAny(normalizedMessage, patterns)) {
      return intent;
    }
  }

  return "info";
}

function detectSentiment(normalizedMessage) {
  const hasPositive = containsAny(normalizedMessage, POSITIVE_WORDS);
  const hasNegative = containsAny(normalizedMessage, NEGATIVE_WORDS);

  if (hasPositive && !hasNegative) {
    return "positive";
  }
  if (hasNegative && !hasPositive) {
    return "negative";
  }
  return "neutral";
}

function detectWebNeed(normalizedMessage) {
  return containsAny(normalizedMessage, WEB_SEARCH_TRIGGERS);
}

function intentDetector(message = "") {
  const normalized = normalizeText(String(message || ""));
  const intent = detectIntent(normalized);
  const sentiment = detectSentiment(normalized);
  const needs_web_search = detectWebNeed(normalized);
  const keywords = extractKeywords(message, 10, 3);

  return {
    intent,
    sentiment,
    needs_web_search,
    keywords
  };
}

module.exports = intentDetector;
