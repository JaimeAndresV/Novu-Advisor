const STOPWORDS_EN = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could",
  "did", "do", "does", "for", "from", "had", "has", "have", "he", "her", "here",
  "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "just", "me",
  "more", "most", "my", "no", "not", "of", "on", "or", "our", "out", "she", "so",
  "some", "than", "that", "the", "their", "them", "there", "they", "this", "to",
  "up", "us", "was", "we", "were", "what", "when", "where", "which", "who", "why",
  "will", "with", "you", "your"
]);

const STOPWORDS_ES = new Set([
  "a", "al", "algo", "algunas", "algunos", "ante", "con", "como", "contra", "cual",
  "cuando", "de", "del", "desde", "donde", "dos", "el", "ella", "ellas", "ellos",
  "en", "entre", "era", "erais", "eran", "eres", "es", "esa", "esas", "ese", "eso",
  "esos", "esta", "estaba", "estado", "estamos", "estan", "estar", "este", "esto",
  "estos", "fue", "fueron", "ha", "han", "hasta", "hay", "la", "las", "le", "les",
  "lo", "los", "mas", "me", "mi", "mis", "mucho", "muy", "nada", "ni", "no", "nos",
  "nosotros", "o", "para", "pero", "por", "que", "quien", "se", "ser", "si", "sin",
  "sobre", "su", "sus", "te", "tenemos", "tener", "tu", "tus", "un", "una", "uno",
  "y", "ya", "yo"
]);

const DEFAULT_STOPWORDS = new Set([...STOPWORDS_EN, ...STOPWORDS_ES]);

function cleanText(input = "") {
  if (!input || typeof input !== "string") {
    return "";
  }

  return input
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function normalizeText(input = "") {
  return cleanText(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(input = "") {
  const normalized = normalizeText(input);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[^a-z0-9áéíóúüñ]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function chunkText(input = "", chunkSizeWords = 600, overlapWords = 100) {
  const text = cleanText(input);
  if (!text) {
    return [];
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const chunks = [];
  let start = 0;
  const safeChunkSize = Math.max(50, Number(chunkSizeWords) || 600);
  const safeOverlap = Math.min(
    Math.max(0, Number(overlapWords) || 100),
    safeChunkSize - 1
  );
  const step = safeChunkSize - safeOverlap;

  while (start < words.length) {
    const end = Math.min(start + safeChunkSize, words.length);
    const chunk = words.slice(start, end).join(" ").trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end >= words.length) {
      break;
    }
    start += step;
  }

  return chunks;
}

function extractKeywords(input = "", topK = 10, minLength = 3) {
  const tokens = tokenize(input);
  const counts = new Map();

  for (const token of tokens) {
    if (token.length < minLength) {
      continue;
    }
    if (DEFAULT_STOPWORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, topK))
    .map(([word]) => word);
}

function textSimilarity(textA = "", textB = "") {
  const a = new Set(extractKeywords(textA, 20, 2));
  const b = new Set(extractKeywords(textB, 20, 2));

  if (!a.size && !b.size) {
    return 0;
  }

  let intersection = 0;
  for (const term of a) {
    if (b.has(term)) {
      intersection += 1;
    }
  }

  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  cleanText,
  normalizeText,
  tokenize,
  chunkText,
  extractKeywords,
  textSimilarity,
  safeJsonParse
};
