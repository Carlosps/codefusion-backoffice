const { HttpError } = require("./errors");

const API_RESOURCES = new Set([
  "health",
  "auth",
  "revenuecat",
  "firestore",
  "audit",
  "rifa",
]);

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function sendError(res, error) {
  const status = error.status || 500;
  const message =
    status >= 500
      ? "Nao foi possivel concluir a operacao agora. Tente novamente."
      : error.message || "Requisicao invalida.";

  sendJson(res, status, {
    ok: false,
    error: {
      message,
      details: error.details || null,
    },
  });
}

function splitPath(value) {
  return String(value || "/")
    .split(/[?#]/, 1)[0]
    .split("/")
    .filter(Boolean);
}

function normalizeApiSegments(segments) {
  const resourceIndex = segments.findIndex((segment) => API_RESOURCES.has(segment));
  if (resourceIndex >= 0) {
    return segments.slice(resourceIndex);
  }

  return segments;
}

function getPathSegments(req) {
  const pathCandidates = [req.path, req.url, req.originalUrl];

  for (const candidate of pathCandidates) {
    const segments = normalizeApiSegments(splitPath(candidate));
    if (segments.length) {
      return segments;
    }
  }

  return [];
}

async function readJsonBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return {};
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const raw = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new HttpError(400, "JSON invalido.");
  }
}

module.exports = {
  sendJson,
  sendError,
  getPathSegments,
  readJsonBody,
};
