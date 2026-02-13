const db = require("../db/database");
const {
  cleanText,
  extractKeywords,
  textSimilarity,
  safeJsonParse,
  normalizeText
} = require("../utils/textUtils");

class KnowledgeService {
  constructor() {
    this.selectByBusinessStmt = db.prepare(`
      SELECT id, source_url, title, content, keywords, relevance_score, times_used, last_crawled
      FROM knowledge_chunks
      WHERE business_id = ?
      ORDER BY last_crawled DESC
      LIMIT 500
    `);

    this.insertChunkStmt = db.prepare(`
      INSERT INTO knowledge_chunks (
        business_id, source_url, title, content, keywords, relevance_score, times_used, last_crawled
      ) VALUES (?, ?, ?, ?, ?, 1.0, 0, datetime('now'))
    `);

    this.deleteChunkStmt = db.prepare(`
      DELETE FROM knowledge_chunks
      WHERE id = ? AND business_id = ?
    `);

    this.listChunksStmt = db.prepare(`
      SELECT id, source_url, title, content, keywords, times_used, last_crawled
      FROM knowledge_chunks
      WHERE business_id = ?
      ORDER BY id DESC
      LIMIT ?
    `);
  }

  scoreChunk(chunk, query, queryKeywords) {
    const content = chunk.content || "";
    const title = chunk.title || "";
    const sourceKeywords = safeJsonParse(chunk.keywords, []) || [];
    const sourceSet = new Set(sourceKeywords.map((k) => normalizeText(String(k))));
    let keywordHits = 0;

    for (const keyword of queryKeywords) {
      if (sourceSet.has(normalizeText(keyword))) {
        keywordHits += 1;
      }
      if (normalizeText(title).includes(normalizeText(keyword))) {
        keywordHits += 0.5;
      }
    }

    const overlapScore = queryKeywords.length
      ? keywordHits / queryKeywords.length
      : 0;
    const similarityScore = textSimilarity(query, content);
    const base = Number(chunk.relevance_score) || 1;
    const pricingQuery = this.isPricingQuery(query);
    const pricingBonus = pricingQuery ? this.pricingSignalBonus(`${title}\n${content}`, sourceKeywords) : 0;
    const score = base + overlapScore * 1.5 + similarityScore * 2 + pricingBonus;

    return {
      ...chunk,
      score
    };
  }

  search(query, businessId, topK = 3) {
    const q = cleanText(query || "");
    if (!q) {
      return [];
    }

    const allChunks = this.selectByBusinessStmt.all(businessId);
    if (!allChunks.length) {
      return [];
    }

    const queryKeywords = extractKeywords(q, 12, 3);
    const isPricing = this.isPricingQuery(q);
    const scored = allChunks
      .map((chunk) => this.scoreChunk(chunk, q, queryKeywords))
      .filter((chunk) => chunk.score > (isPricing ? 0.95 : 1.05))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, Math.max(1, topK));
  }

  isPricingQuery(query) {
    return /(price|pricing|cost|costs|quote|budget|fees|plans?|package|packages?|precio|precios|costo|costos|cotizacion|cotización|plan(es)?|paquete(s)?|tarifa(s)?)/i.test(String(query || ""));
  }

  pricingSignalBonus(text, keywords = []) {
    const source = `${String(text || "")}\n${(keywords || []).join(" ")}`;
    let bonus = 0;
    if (/(\$|€|£|¥|usd|eur|mxn|cop|ars|pen|s\/)/i.test(source)) bonus += 0.6;
    if (/(\b\d{1,4}([.,]\d{1,2})?\b)/.test(source)) bonus += 0.35;
    if (/(mensual|anual|monthly|yearly|\/mo|\/mes|plan|paquete|pricing|precio|price)/i.test(source)) bonus += 0.45;
    return bonus;
  }

  formatForPrompt(results = []) {
    if (!results.length) {
      return "";
    }

    return results
      .map((item, idx) => {
        const content = cleanText(item.content || "").slice(0, 1400);
        return [
          `(${idx + 1}) Source: ${item.source_url || "manual_knowledge"}`,
          `Title: ${item.title || "Knowledge Base Entry"}`,
          `Content: ${content}`
        ].join("\n");
      })
      .join("\n\n");
  }

  addManualKnowledge({ businessId, title, content, sourceUrl = "manual://dashboard" }) {
    const cleanTitle = cleanText(title || "Manual Knowledge");
    const cleanContent = cleanText(content || "");
    if (!cleanContent) {
      throw new Error("Manual knowledge content is required.");
    }

    const keywords = JSON.stringify(extractKeywords(cleanContent, 10, 3));
    const result = this.insertChunkStmt.run(
      businessId,
      sourceUrl,
      cleanTitle,
      cleanContent,
      keywords
    );

    return {
      id: result.lastInsertRowid,
      title: cleanTitle,
      content: cleanContent
    };
  }

  listChunks(businessId, limit = 100) {
    return this.listChunksStmt.all(businessId, Math.max(1, Math.min(500, limit)));
  }

  deleteChunk(businessId, chunkId) {
    const result = this.deleteChunkStmt.run(chunkId, businessId);
    return result.changes > 0;
  }
}

module.exports = new KnowledgeService();
