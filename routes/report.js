const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db/database");
const reportService = require("../services/ReportService");
const { extractToken } = require("../middleware/auth");
const jwt = require("jsonwebtoken");

const router = express.Router();

const getBusinessAuthStmt = db.prepare(`
  SELECT id, admin_token
  FROM businesses
  WHERE id = ?
  LIMIT 1
`);

router.get("/", async (req, res) => {
  try {
    const businessId = String(req.query?.business_id || "").trim();
    const token = String(req.query?.token || "");
    const bearerToken = extractToken(req);
    const period = Math.max(1, Math.min(365, Number(req.query?.period || 30)));

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
          const report = await reportService.generateReport(businessId, period);
          return res.json(report);
        }
      } catch (error) {
        // Fall back to token validation below.
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
        message: "Invalid credentials for report."
      });
    }

    const isValid = await bcrypt.compare(token, business.admin_token);
    if (!isValid) {
      return res.status(401).json({
        error: true,
        message: "Invalid credentials for report."
      });
    }

    const report = await reportService.generateReport(businessId, period);
    return res.json(report);
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message || "Unable to generate report."
    });
  }
});

module.exports = router;
