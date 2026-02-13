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
    return this.fetchText(url, "text/html,application/xhtml+xml");
  }

  async fetchText(url, acceptHeader = "text/plain,*/*") {
    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 3,
      headers: {
        "User-Agent": "NovuAdvisorBot/1.0",
        Accept: acceptHeader
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

  decodeXmlEntities(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .trim();
  }

  parseSitemapXml(xmlText) {
    const text = String(xmlText || "");
    const locs = [];
    const locRegex = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
    let match;
    while ((match = locRegex.exec(text)) !== null) {
      const value = this.decodeXmlEntities(match[1]);
      if (value) {
        locs.push(value);
      }
    }
    return locs;
  }

  extractSitemapsFromRobots(robotsText) {
    const lines = String(robotsText || "").split(/\r?\n/);
    const output = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const parts = trimmed.split(":");
      if (parts.length < 2) {
        continue;
      }
      const key = parts[0].trim().toLowerCase();
      if (key !== "sitemap") {
        continue;
      }
      const url = parts.slice(1).join(":").trim();
      if (url) {
        output.push(url);
      }
    }
    return output;
  }

  async discoverSitemapUrls(startUrl, maxSitemapFiles = 25) {
    const start = new URL(startUrl);
    const origin = `${start.protocol}//${start.host}`;
    const rootHost = start.host;

    const candidateSitemaps = new Set([
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/sitemap-index.xml`,
      `${origin}/wp-sitemap.xml`,
      `${origin}/sitemap/sitemap.xml`
    ]);

    // Discover extra sitemap locations from robots.txt when available.
    try {
      const robotsText = await this.fetchText(`${origin}/robots.txt`, "text/plain,*/*");
      const robotsSitemaps = this.extractSitemapsFromRobots(robotsText);
      for (const s of robotsSitemaps) {
        candidateSitemaps.add(s);
      }
    } catch (_) {
      // Continue if robots.txt is missing or blocked.
    }

    const sitemapQueue = [...candidateSitemaps];
    const visitedSitemaps = new Set();
    const discoveredPageUrls = new Set();

    while (sitemapQueue.length > 0 && visitedSitemaps.size < maxSitemapFiles) {
      const sitemapUrl = this.normalizeUrl(sitemapQueue.shift(), origin);
      if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) {
        continue;
      }
      visitedSitemaps.add(sitemapUrl);

      try {
        const xmlText = await this.fetchText(sitemapUrl, "application/xml,text/xml;q=0.9,*/*;q=0.8");
        const locs = this.parseSitemapXml(xmlText);

        for (const loc of locs) {
          const normalized = this.normalizeUrl(loc, origin);
          if (!normalized || !this.isInternalUrl(normalized, rootHost)) {
            continue;
          }
          if (/\.xml(\?|$)/i.test(normalized)) {
            if (!visitedSitemaps.has(normalized)) {
              sitemapQueue.push(normalized);
            }
          } else {
            discoveredPageUrls.add(normalized);
          }
        }
      } catch (_) {
        // Keep crawling; many sites expose some invalid sitemap links.
      }
    }

    return [...discoveredPageUrls];
  }

  extractContent(html, pageUrl) {
    const $ = cheerio.load(html);

    const rootHost = new URL(pageUrl).host;
    const internalLinks = new Set();

    // Extract links BEFORE removing layout nodes (nav/header/footer often contain key pages like pricing).
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const normalized = this.normalizeUrl(href, pageUrl);
      if (!normalized) return;
      if (this.isInternalUrl(normalized, rootHost)) {
        internalLinks.add(normalized);
      }
    });

    const structuredBlocks = [];
    $("script[type='application/ld+json']").each((_, el) => {
      const raw = $(el).html() || "";
      const parsedTexts = this.extractPricingFromJsonLd(raw);
      for (const text of parsedTexts) {
        if (text) structuredBlocks.push(text);
      }
    });

    $("script, style, noscript, iframe, svg, canvas").remove();
    $("nav, header, footer, aside, .cookie-banner, #menu, .ad, .ads, .advertisement").remove();

    const title = cleanText($("title").first().text());
    const description = cleanText($("meta[name='description']").attr("content") || "");

    const blocks = [];
    const seen = new Set();
    const contentSelectors = [
      "h1", "h2", "h3", "h4", "p", "li", "dt", "dd",
      "table tr", "table td", "table th",
      "[class*='price']", "[id*='price']",
      "[class*='plan']", "[id*='plan']",
      "[class*='pricing']", "[id*='pricing']",
      "section[class*='price']", "section[id*='price']"
    ].join(", ");

    $(contentSelectors).each((_, el) => {
      const text = cleanText($(el).text());
      if (!text || seen.has(text)) {
        return;
      }
      // Keep short lines when they look like pricing info (e.g. "$99/mo", "Desde $29", "Plan Pro").
      if (text.length > 20 || this.looksLikePricing(text)) {
        seen.add(text);
        blocks.push(text);
      }
    });

    const combined = cleanText([title, description, ...structuredBlocks, ...blocks].join("\n"));

    return {
      title: title || pageUrl,
      description,
      content: combined,
      links: [...internalLinks]
    };
  }

  looksLikePricing(text) {
    const t = String(text || "");
    if (!t) return false;
    const pricePattern = /(\$|€|£|¥|usd|eur|mxn|cop|ars|pen|s\/|precio|price|plan|paquete|mensual|monthly|anual|yearly|\/mo|\/mes)/i;
    const numberPattern = /\d{1,4}([.,]\d{1,2})?/;
    return pricePattern.test(t) && numberPattern.test(t);
  }

  extractPricingFromJsonLd(rawJson) {
    const output = [];
    if (!rawJson) return output;

    let data;
    try {
      data = JSON.parse(rawJson);
    } catch (_) {
      return output;
    }

    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== "object") return;

      const name = cleanText(node.name || node.title || "");
      const offers = node.offers;
      if (offers) {
        const offerList = Array.isArray(offers) ? offers : [offers];
        for (const offer of offerList) {
          if (!offer || typeof offer !== "object") continue;
          const price = cleanText(String(offer.price || ""));
          const currency = cleanText(String(offer.priceCurrency || ""));
          const availability = cleanText(String(offer.availability || ""));
          const priceText = [name, "Price:", price, currency, availability]
            .filter(Boolean)
            .join(" ");
          if (this.looksLikePricing(priceText)) {
            output.push(priceText);
          }
        }
      }

      for (const value of Object.values(node)) {
        visit(value);
      }
    };

    visit(data);
    return output.slice(0, 30);
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
    const queue = [];
    const allChunks = [];
    const max = Math.max(1, Math.min(100, Number(maxPages) || 25));
    let pagesCrawled = 0;

    // Prefer sitemap-discovered URLs first for broader, more reliable indexing.
    let sitemapUrls = [];
    try {
      sitemapUrls = await this.discoverSitemapUrls(normalizedStart, Math.max(10, max));
    } catch (_) {
      sitemapUrls = [];
    }
    if (sitemapUrls.length) {
      for (const url of sitemapUrls.slice(0, max * 2)) {
        queue.push(url);
      }
    }
    if (!queue.includes(normalizedStart)) {
      queue.unshift(normalizedStart);
    }

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
            // Prioritize URLs likely to contain pricing/plans.
            if (/(price|pricing|plan|plans|paquete|paquetes|precio|precios|tarifa|tarifas|membership|suscripcion|suscripción)/i.test(link)) {
              queue.unshift(link);
            } else {
              queue.push(link);
            }
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
      sitemap_urls_discovered: sitemapUrls.length,
      indexed_at: new Date().toISOString()
    };
  }
}

module.exports = new CrawlerService();
