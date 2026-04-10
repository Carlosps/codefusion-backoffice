const { HttpError } = require("./errors");

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const configured = parseAllowedOrigins(process.env.BACKOFFICE_ALLOWED_ORIGINS);
  if (configured.length) {
    return configured;
  }

  return [
    "https://backoffice-code-fusion.web.app",
    "https://backoffice-code-fusion.firebaseapp.com",
    "http://localhost:5002",
    "http://127.0.0.1:5002",
  ];
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) {
    return { origin: null, allowed: true };
  }

  const allowedOrigins = getAllowedOrigins();
  const allowed = allowedOrigins.includes(origin);
  if (!allowed) {
    return { origin, allowed: false };
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Requested-With",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,HEAD,OPTIONS");
  res.setHeader("Access-Control-Max-Age", "3600");

  return { origin, allowed: true };
}

function handleCorsPreflight(req, res) {
  const result = applyCors(req, res);
  if (!result.allowed) {
    throw new HttpError(403, "Origin não permitido.");
  }

  res.status(204).send("");
}

module.exports = {
  applyCors,
  handleCorsPreflight,
};

