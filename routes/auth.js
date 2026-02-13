const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db/database");

const router = express.Router();

const businessAuthStmt = db.prepare(`
  SELECT id, name, admin_token
  FROM businesses
  WHERE id = ?
  LIMIT 1
`);

const businessExistsStmt = db.prepare(`
  SELECT id, name
  FROM businesses
  WHERE id = ?
  LIMIT 1
`);

function buildTokenPayload(business) {
  return {
    business_id: business.id,
    business_name: business.name
  };
}

function signBusinessToken(business) {
  const secret = process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("Server authentication is not configured.");
  }
  return jwt.sign(buildTokenPayload(business), secret, { expiresIn: "7d" });
}

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  res.cookie("nv_jwt", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge,
    path: "/"
  });
}

function clearAuthCookie(res) {
  res.cookie("nv_jwt", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/"
  });
}

router.post("/login", async (req, res) => {
  try {
    const businessId = String(req.body?.business_id || "").trim();
    const password = String(req.body?.password || "");

    if (!businessId || !password) {
      return res.status(400).json({
        error: true,
        message: "business_id and password are required."
      });
    }

    const business = businessAuthStmt.get(businessId);
    if (!business || !business.admin_token) {
      return res.status(401).json({
        error: true,
        message: "Invalid credentials."
      });
    }

    const isValid = await bcrypt.compare(password, business.admin_token);
    if (!isValid) {
      return res.status(401).json({
        error: true,
        message: "Invalid credentials."
      });
    }

    const token = signBusinessToken(business);
    setAuthCookie(res, token);
    return res.json({ token });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Unable to complete login at the moment."
    });
  }
});

router.post("/master-login", (req, res) => {
  try {
    const businessId = String(req.body?.business_id || "").trim();
    const masterKey = String(
      req.headers["x-admin-master-key"] ||
      req.body?.master_key ||
      req.query?.master_key ||
      ""
    ).trim();
    const configuredMaster = String(process.env.ADMIN_MASTER_KEY || "").trim();

    if (!businessId || !masterKey) {
      return res.status(400).json({ error: true, message: "business_id and master_key are required." });
    }
    if (!configuredMaster || masterKey !== configuredMaster) {
      return res.status(403).json({ error: true, message: "Invalid master key." });
    }

    const business = businessExistsStmt.get(businessId);
    if (!business) {
      return res.status(404).json({ error: true, message: "Business not found." });
    }

    const token = signBusinessToken(business);
    setAuthCookie(res, token);
    return res.json({ token });
  } catch (error) {
    return res.status(500).json({ error: true, message: error.message || "Unable to complete master login." });
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true, message: "Logged out." });
});

module.exports = router;
