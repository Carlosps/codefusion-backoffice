const { HttpError } = require("./errors");

const buckets = new Map();

function getWindowMs() {
  return Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60000);
}

function assertRateLimit(key, options = {}) {
  const now = Date.now();
  const windowMs = options.windowMs || getWindowMs();
  const max = options.max || Number(process.env.API_RATE_LIMIT_MAX_REQUESTS || 60);

  const entries = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (entries.length >= max) {
    throw new HttpError(429, "Muitas requisicoes em pouco tempo. Aguarde um instante.");
  }

  entries.push(now);
  buckets.set(key, entries);
}

module.exports = {
  assertRateLimit,
};

