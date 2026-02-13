require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("../db/database");

const { widgetCors, staticAssetHeaders } = require("../middleware/cors");
const { chatRateLimiter } = require("../middleware/rateLimit");
const { extractToken } = require("../middleware/auth");
const notifyService = require("../services/NotifyService");
const reportService = require("../services/ReportService");

const authRoutes = require("../routes/auth");
const businessRoutes = require("../routes/business");
const crawlRoutes = require("../routes/crawl");
const reportRoutes = require("../routes/report");
const chatRoutes = require("../routes/chat");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Trust first proxy (Railway, Render, etc.) so express-rate-limit reads the
// real client IP from X-Forwarded-For instead of throwing
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(widgetCors);
app.use(staticAssetHeaders);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "novu-advisor",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/crawl", crawlRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/chat", chatRateLimiter, chatRoutes);

const widgetDir = path.join(process.cwd(), "widget");
const dashboardDir = path.join(process.cwd(), "dashboard");

app.use(
  "/widget",
  express.static(widgetDir, {
    extensions: ["js", "css"],
    etag: true,
    maxAge: "1h",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
  })
);

// Dashboard: only login (index /) and setup.html are public; other HTML requires valid JWT (cookie or header)
const dashboardPublicPaths = ["/", "/index.html", "/setup.html"];
function dashboardAuthGuard(req, res, next) {
  const p = req.path === "" || req.path === "/" ? "/" : req.path;
  const isHtmlPage = p.endsWith(".html") || p === "/";
  if (!isHtmlPage) return next();

  const isPublic = dashboardPublicPaths.some((pub) => p === pub || p.endsWith(pub));
  if (isPublic) return next();

  const token = extractToken(req);
  const secret = process.env.JWT_SECRET || "";
  if (!token || !secret) return res.redirect(302, "/dashboard/");
  try {
    jwt.verify(token, secret);
    return next();
  } catch (_) {
    return res.redirect(302, "/dashboard/");
  }
}

app.use("/dashboard", dashboardAuthGuard, express.static(dashboardDir, {
  extensions: ["html", "js", "css"],
  etag: true
}));

app.get("/", (req, res) => {
  res.json({
    name: "Novu Advisor",
    status: "running",
    dashboard: "/dashboard/setup.html",
    docs: "README.md"
  });
});

app.use("/api", (req, res) => {
  res.status(404).json({
    error: true,
    message: "Endpoint not found."
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  return res.status(500).json({
    error: true,
    message: "Internal server error."
  });
});

notifyService.startWeeklyDigestScheduler(reportService);

app.listen(PORT, () => {
  console.log(`[Novu Advisor] Server running on port ${PORT}`);
});
