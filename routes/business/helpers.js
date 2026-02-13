const crypto = require("crypto");

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

function withHttpProtocol(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  return `https://${raw}`;
}

function toPhoneHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

function toMailtoHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^mailto:/i.test(raw) ? raw : `mailto:${raw}`;
}

function toWhatsAppHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const phone = raw.replace(/[^\d]/g, "");
  if (phone) return `https://wa.me/${phone}`;
  return `https://wa.me/?text=${encodeURIComponent(raw)}`;
}

function toTelegramHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const username = raw.replace(/^@+/, "");
  return username ? `https://t.me/${username}` : "";
}

function sanitizeBusinessForClient(business) {
  if (!business) {
    return null;
  }

  const channels = [];
  const phoneHref = toPhoneHref(business.contact_phone);
  const emailHref = toMailtoHref(business.contact_email);
  const whatsappHref = toWhatsAppHref(business.contact_whatsapp);
  const telegramHref = toTelegramHref(business.contact_telegram);
  const calendlyHref = withHttpProtocol(business.contact_calendly);
  const formHref = withHttpProtocol(business.contact_form_url);

  if (phoneHref) {
    channels.push({ label: "Call Us", icon: "📞", url: phoneHref });
  }
  if (emailHref) {
    channels.push({ label: "Email", icon: "✉️", url: emailHref });
  }
  if (whatsappHref) {
    channels.push({ label: "WhatsApp", icon: "💬", url: whatsappHref });
  }
  if (telegramHref) {
    channels.push({ label: "Telegram", icon: "✈️", url: telegramHref });
  }
  if (calendlyHref) {
    channels.push({ label: "Schedule", icon: "📅", url: calendlyHref });
  }
  if (formHref) {
    channels.push({ label: "Contact Form", icon: "🌐", url: formHref });
  }

  return {
    id: business.id,
    name: business.name,
    industry: business.industry,
    description: business.description,
    website_url: business.website_url,
    language: business.language || "en",
    consultant_name: business.consultant_name || "Advisor",
    consultant_role: business.consultant_role || "Business Consultant",
    avatar_url: business.avatar_url || "",
    primary_color: business.primary_color || "#1a3a5c",
    accent_color: business.accent_color || "#c8a84b",
    ai_provider: business.ai_provider || "openai",
    ai_model: business.ai_model || "gpt-4o-mini",
    has_ai_api_key: Boolean((business.ai_api_key || "").trim()),
    system_prompt: business.system_prompt || "",
    contact_email: business.contact_email || "",
    contact_phone: business.contact_phone || "",
    contact_whatsapp: business.contact_whatsapp || "",
    contact_telegram: business.contact_telegram || "",
    contact_calendly: business.contact_calendly || "",
    contact_form_url: business.contact_form_url || "",
    widget_style: business.widget_style || "circle",
    widget_position: business.widget_position || "bottom-right",
    widget_greeting: business.widget_greeting || "",
    channels,
    created_at: business.created_at,
    updated_at: business.updated_at
  };
}

module.exports = {
  generateSecret,
  sanitizeBusinessForClient
};
