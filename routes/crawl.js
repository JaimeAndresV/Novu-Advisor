const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db/database");
const crawlerService = require("../services/CrawlerService");
const { extractToken } = require("../middleware/auth");
const jwt = require("jsonwebtoken");

const router = express.Router();

const getBusinessAuthStmt = db.prepare(`
  SELECT id, admin_token
  FROM businesses
  WHERE id = ?
  LIMIT 1
`);

router.post("/", async (req, res) => {
  try {
    const businessId = String(req.body?.business_id || "").trim();
    const token = String(req.body?.token || "");
    const bearerToken = extractToken(req);
    const maxPages = Number(req.body?.max_pages || 25);

    if (!businessId) {
      return res.status(400).json({
        error: true,
        message: "business_id is required."
      });
    }

    if (bearerToken) {
      try {
        const payload = jwt.verify(bearerToken, process.env.JWT_SECRET || "");
        if (payload?.business_id === businessId) {
          const result = await crawlerService.crawlBusinessWebsite(businessId, maxPages);
          return res.json(result);
        }
      } catch (error) {
        // Fall back to token validation.
      }
    }

    if (!token) {
      return res.status(400).json({
        error: true,
        message: "token is required when Authorization is not provided."
      });
    }

    const business = getBusinessAuthStmt.get(businessId);
    if (!business || !business.admin_token) {
      return res.status(401).json({
        error: true,
        message: "Invalid credentials for crawl."
      });
    }

    const isValid = await bcrypt.compare(token, business.admin_token);
    if (!isValid) {
      return res.status(401).json({
        error: true,
        message: "Invalid credentials for crawl."
      });
    }

    const result = await crawlerService.crawlBusinessWebsite(businessId, maxPages);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message || "Unable to crawl website."
    });
  }
});

module.exports = router;
