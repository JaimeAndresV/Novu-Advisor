const cors = require("cors");

const widgetCors = cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400
});

function staticAssetHeaders(req, res, next) {
  if (req.path.endsWith(".js") || req.path.endsWith(".css")) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  next();
}

module.exports = {
  widgetCors,
  staticAssetHeaders
};
