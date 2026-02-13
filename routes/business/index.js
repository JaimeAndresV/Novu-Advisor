const express = require("express");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const db = require("../../db/database");
const { requireAuth } = require("../../middleware/auth");
const chunksRouter = require("./chunks");
const conversationsRouter = require("./conversations");
const { generateSecret, sanitizeBusinessForClient } = require("./helpers");

const router = express.Router();

const getBusinessStmt = db.prepare(`
  SELECT *
  FROM businesses
  WHERE id = ?
  LIMIT 1
`);

const createBusinessStmt = db.prepare(`
  INSERT INTO businesses (
    id, name, industry, description, website_url, language, consultant_name, consultant_role,
    avatar_url, primary_color, accent_color, contact_email, contact_phone, contact_whatsapp,
    contact_telegram, contact_calendly, contact_form_url, system_prompt, ai_provider, ai_model,
    ai_api_key, plan, api_key, admin_token, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
  )
`);

const updateBusinessStmt = db.prepare(`
  UPDATE businesses
  SET
    name = COALESCE(@name, name),
    industry = COALESCE(@industry, industry),
    description = COALESCE(@description, description),
    website_url = COALESCE(@website_url, website_url),
    language = COALESCE(@language, language),
    consultant_name = COALESCE(@consultant_name, consultant_name),
    consultant_role = COALESCE(@consultant_role, consultant_role),
    avatar_url = COALESCE(@avatar_url, avatar_url),
    primary_color = COALESCE(@primary_color, primary_color),
    accent_color = COALESCE(@accent_color, accent_color),
    contact_email = COALESCE(@contact_email, contact_email),
    contact_phone = COALESCE(@contact_phone, contact_phone),
    contact_whatsapp = COALESCE(@contact_whatsapp, contact_whatsapp),
    contact_telegram = COALESCE(@contact_telegram, contact_telegram),
    contact_calendly = COALESCE(@contact_calendly, contact_calendly),
    contact_form_url = COALESCE(@contact_form_url, contact_form_url),
    system_prompt = COALESCE(@system_prompt, system_prompt),
    ai_provider = COALESCE(@ai_provider, ai_provider),
    ai_model = COALESCE(@ai_model, ai_model),
    ai_api_key = COALESCE(@ai_api_key, ai_api_key),
    plan = COALESCE(@plan, plan),
    widget_style = COALESCE(@widget_style, widget_style),
    widget_position = COALESCE(@widget_position, widget_position),
    widget_greeting = COALESCE(@widget_greeting, widget_greeting),
    updated_at = datetime('now')
  WHERE id = @id
`);

function buildUpdateParams(id, body = {}) {
  const fields = [
    "name",
    "industry",
    "description",
    "website_url",
    "language",
    "consultant_name",
    "consultant_role",
    "avatar_url",
    "primary_color",
    "accent_color",
    "contact_email",
    "contact_phone",
    "contact_whatsapp",
    "contact_telegram",
    "contact_calendly",
    "contact_form_url",
    "system_prompt",
    "ai_provider",
    "ai_model",
    "ai_api_key",
    "plan",
    "widget_style",
    "widget_position",
    "widget_greeting"
  ];

  const params = { id };
  for (const field of fields) {
    params[field] = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : null;
  }
  return params;
}

router.post("/", async (req, res) => {
  try {
    const masterKey = String(req.headers["x-admin-master-key"] || req.body?.master_key || "").trim();
    const configuredMaster = String(process.env.ADMIN_MASTER_KEY || "").trim();
    if (configuredMaster && masterKey !== configuredMaster) {
      return res.status(403).json({ error: true, message: "Invalid master key." });
    }

    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: true, message: "Business name is required." });
    }

    const businessId = uuidv4();
    const adminPassword = String(req.body?.admin_password || generateSecret(12));
    const adminTokenHash = await bcrypt.hash(adminPassword, 10);
    const apiKey = generateSecret(20);

    createBusinessStmt.run(
      businessId,
      name,
      req.body?.industry || null,
      req.body?.description || null,
      req.body?.website_url || null,
      req.body?.language || "en",
      req.body?.consultant_name || "Alex",
      req.body?.consultant_role || "Business Advisor",
      req.body?.avatar_url || null,
      req.body?.primary_color || "#1a3a5c",
      req.body?.accent_color || "#c8a84b",
      req.body?.contact_email || null,
      req.body?.contact_phone || null,
      req.body?.contact_whatsapp || null,
      req.body?.contact_telegram || null,
      req.body?.contact_calendly || null,
      req.body?.contact_form_url || null,
      req.body?.system_prompt || null,
      req.body?.ai_provider || "openai",
      req.body?.ai_model || "gpt-4o-mini",
      req.body?.ai_api_key || null,
      req.body?.plan || "free",
      apiKey,
      adminTokenHash
    );

    const created = getBusinessStmt.get(businessId);
    return res.status(201).json({
      ...sanitizeBusinessForClient(created),
      api_key: apiKey,
      admin_password: adminPassword
    });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to create business." });
  }
});

router.get("/", (req, res) => {
  try {
    const masterKey = String(req.headers["x-admin-master-key"] || req.query?.master_key || "").trim();
    const configuredMaster = String(process.env.ADMIN_MASTER_KEY || "").trim();
    if (!configuredMaster || masterKey !== configuredMaster) {
      return res.status(403).json({ error: true, message: "Invalid master key." });
    }

    const rows = db.prepare(`
      SELECT id, name, industry, website_url, plan, created_at, updated_at
      FROM businesses
      ORDER BY created_at DESC
      LIMIT 1000
    `).all();

    return res.json({ businesses: rows });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to list businesses." });
  }
});

router.get("/:id", (req, res) => {
  try {
    const business = getBusinessStmt.get(req.params.id);
    if (!business) {
      return res.status(404).json({ error: true, message: "Business not found." });
    }
    return res.json(sanitizeBusinessForClient(business));
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to load business." });
  }
});

router.put("/:id", requireAuth, (req, res) => {
  try {
    if (req.auth?.business_id !== req.params.id) {
      return res.status(403).json({
        error: true,
        message: "You do not have permission to update this business."
      });
    }

    const result = updateBusinessStmt.run(buildUpdateParams(req.params.id, req.body));
    if (!result.changes) {
      return res.status(404).json({ error: true, message: "Business not found." });
    }

    const business = getBusinessStmt.get(req.params.id);
    return res.json(sanitizeBusinessForClient(business));
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to update business." });
  }
});

router.use("/:id/chunks", chunksRouter);
router.use("/:id/conversations", conversationsRouter);

module.exports = router;
