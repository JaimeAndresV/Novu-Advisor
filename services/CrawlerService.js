const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../db/database");
const { cleanText, chunkText, extractKeywords } = require("../utils/textUtils");

class CrawlerService {
  constructor() {
    this.getBusinessStmt = db.prepare(`
      SELECT id, website_url
      FROM businesses
      WHERE id = ?
      LIMIT 1
    `);

    this.deleteChunksStmt = db.prepare(`
      DELETE FROM knowledge_chunks
      WHERE business_id = ?
    `);

    this.insertChunkStmt = db.prepare(`
      INSERT INTO knowledge_chunks (
        business_id, source_url, title, content, keywords, relevance_score, times_used, last_crawled
      ) VALUES (?, ?, ?, ?, ?, 1.0, 0, datetime('now'))
    `);
  }

  async fetchPage(url) {
    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 3,
      headers: {
        "User-Agent": "NovuAdvisorBot/1.0",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    return response.data;
  }

  normalizeUrl(rawUrl, baseUrl) {
    try {
      return new URL(rawUrl, baseUrl).toString().split("#")[0];
    } catch (error) {
      return "";
    }
  }

  isInternalUrl(url, rootHost) {
    try {
      const u = new URL(url);
      return u.host === rootHost && /^https?:$/i.test(u.protocol);
    } catch (error) {
      return false;
    }
  }

  extractContent(html, pageUrl) {
    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, svg, canvas").remove();
    $("nav, header, footer, aside, .cookie-banner, #menu, .ad, .ads, .advertisement").remove();

    const title = cleanText($("title").first().text());
    const description = cleanText($("meta[name='description']").attr("content") || "");

    const blocks = [];
    $("h1, h2, h3, h4, p, li, dt, dd").each((_, el) => {
      const text = cleanText($(el).text());
      if (text && text.length > 20) {
        blocks.push(text);
      }
    });

    const combined = cleanText([title, description, ...blocks].join("\n"));
    const internalLinks = new Set();
    const rootHost = new URL(pageUrl).host;

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) {
        return;
      }
      const normalized = this.normalizeUrl(href, pageUrl);
      if (!normalized) {
        return;
      }
      if (this.isInternalUrl(normalized, rootHost)) {
        internalLinks.add(normalized);
      }
    });

    return {
      title: title || pageUrl,
      description,
      content: combined,
      links: [...internalLinks]
    };
  }

  chunkPageContent(pageData) {
    const rawChunks = chunkText(pageData.content, 600, 100);
    return rawChunks.map((chunk) => ({
      source_url: pageData.url,
      title: pageData.title,
      content: chunk,
      keywords: JSON.stringify(extractKeywords(chunk, 10, 3))
    }));
  }

  saveChunks(businessId, chunks) {
    const trx = db.transaction(() => {
      this.deleteChunksStmt.run(businessId);
      for (const chunk of chunks) {
        this.insertChunkStmt.run(
          businessId,
          chunk.source_url,
          chunk.title,
          chunk.content,
          chunk.keywords
        );
      }
    });
    trx();
  }

  async crawlBusinessWebsite(businessId, maxPages = 25) {
    const business = this.getBusinessStmt.get(businessId);
    if (!business || !business.website_url) {
      throw new Error("Business not found or missing website URL.");
    }

    return this.crawl(businessId, business.website_url, maxPages);
  }

  async crawl(businessId, startUrl, maxPages = 25) {
    const normalizedStart = this.normalizeUrl(startUrl, startUrl);
    if (!normalizedStart) {
      throw new Error("Invalid start URL.");
    }

    const visited = new Set();
    const queue = [normalizedStart];
    const allChunks = [];
    const max = Math.max(1, Math.min(100, Number(maxPages) || 25));
    let pagesCrawled = 0;

    while (queue.length > 0 && pagesCrawled < max) {
      const currentUrl = queue.shift();
      if (!currentUrl || visited.has(currentUrl)) {
        continue;
      }
      visited.add(currentUrl);

      try {
        const html = await this.fetchPage(currentUrl);
        const parsed = this.extractContent(html, currentUrl);
        if (!parsed.content || parsed.content.length < 80) {
          continue;
        }

        const pageChunks = this.chunkPageContent({
          url: currentUrl,
          title: parsed.title,
          content: parsed.content
        });

        allChunks.push(...pageChunks);
        pagesCrawled += 1;

        for (const link of parsed.links) {
          if (!visited.has(link) && queue.length + visited.size < max * 3) {
            queue.push(link);
          }
        }
      } catch (error) {
        // Continue crawling even if one page fails.
      }
    }

    this.saveChunks(businessId, allChunks);

    return {
      pages_crawled: pagesCrawled,
      chunks_saved: allChunks.length,
      indexed_at: new Date().toISOString()
    };
  }
}

module.exports = new CrawlerService();
