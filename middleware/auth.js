const jwt = require("jsonwebtoken");

function extractToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  if (req.cookies && req.cookies.nv_jwt) {
    return String(req.cookies.nv_jwt).trim();
  }

  if (req.query && req.query.token) {
    return String(req.query.token);
  }

  if (req.body && req.body.token) {
    return String(req.body.token);
  }

  return "";
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      error: true,
      message: "Missing authentication token."
    });
  }

  try {
    const secret = process.env.JWT_SECRET || "";
    const payload = jwt.verify(token, secret);
    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({
      error: true,
      message: "Invalid or expired token."
    });
  }
}

module.exports = {
  requireAuth,
  extractToken
};
