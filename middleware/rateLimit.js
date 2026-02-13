const rateLimit = require("express-rate-limit");

const chatRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    message: "Rate limit exceeded. Please try again later."
  }
});

module.exports = {
  chatRateLimiter
};
