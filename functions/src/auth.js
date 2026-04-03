const { getAuth } = require("firebase-admin/auth");

const { HttpError } = require("./errors");

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getAccessPolicy() {
  return {
    allowedEmails: parseList(process.env.SUPPORT_ALLOWED_EMAILS),
    allowedDomain: String(process.env.SUPPORT_ALLOWED_DOMAIN || "")
      .trim()
      .toLowerCase(),
  };
}

function parseBearerToken(header) {
  const value = String(header || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function assertActorAllowed(email) {
  const policy = getAccessPolicy();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!policy.allowedEmails.length && !policy.allowedDomain) {
    return;
  }

  const allowedByEmail = policy.allowedEmails.includes(normalizedEmail);
  const allowedByDomain =
    policy.allowedDomain && normalizedEmail.endsWith(`@${policy.allowedDomain}`);

  if (!allowedByEmail && !allowedByDomain) {
    throw new HttpError(403, "Sua conta nao tem acesso a este backoffice.");
  }
}

async function requireUser(req) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    throw new HttpError(401, "Sessao ausente ou expirada.");
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    assertActorAllowed(decoded.email);

    return {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, "Nao foi possivel validar sua sessao.");
  }
}

module.exports = {
  requireUser,
};

