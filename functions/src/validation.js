const { HttpError } = require("./errors");

function assertString(value, message, maxLength = 200) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, message);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new HttpError(400, message);
  }

  return normalized;
}

function validateAppUserId(value) {
  return assertString(value, "Informe um app_user_id valido.", 160);
}

function validateUserId(value) {
  return assertString(value, "Informe um userId valido.", 160);
}

function validateOptionalReason(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return assertString(value, "O motivo informado e invalido.", 500);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatePromotionalAccessPayload(body, nowMs = Date.now()) {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "Envie um payload JSON valido.");
  }

  const grantKind = assertString(body.grantKind, "Informe um tipo de concessao valido.", 20)
    .toLowerCase();

  if (!["weekly", "monthly", "annual", "until"].includes(grantKind)) {
    throw new HttpError(400, "Use grantKind weekly, monthly, annual ou until.");
  }

  if (grantKind !== "until" && body.expiresAt) {
    throw new HttpError(400, "expiresAt so pode ser enviado com grantKind until.");
  }

  if (grantKind !== "until") {
    return {
      grantKind,
      expiresAt: null,
    };
  }

  const rawExpiresAt = assertString(body.expiresAt, "Informe uma data final valida.", 80);
  const expiresAt = new Date(rawExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new HttpError(400, "Informe uma data final valida.");
  }

  if (expiresAt.getTime() <= nowMs) {
    throw new HttpError(400, "A data final precisa estar no futuro.");
  }

  return {
    grantKind,
    expiresAt: expiresAt.toISOString(),
  };
}

function validateAuditLimit(value) {
  const parsed = Number(value || 30);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new HttpError(400, "O limite de auditoria precisa estar entre 1 e 100.");
  }

  return parsed;
}

module.exports = {
  validateAppUserId,
  validateAuditLimit,
  validateOptionalReason,
  validatePromotionalAccessPayload,
  validateUserId,
};
