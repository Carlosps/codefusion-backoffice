const { HttpError } = require("./errors");

const DEFAULT_ALLOWED_RIFA_UPDATE_FIELDS = ["email"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedRifaUpdateFields() {
  const configured = parseCsv(process.env.RIFA_ALLOWED_UPDATE_FIELDS);
  return configured.length ? configured : DEFAULT_ALLOWED_RIFA_UPDATE_FIELDS;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateFieldPath(fieldName) {
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(fieldName)) {
    throw new HttpError(400, `Campo inválido: ${fieldName}`);
  }
}

function validateRifaEmail(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "Informe um e-mail válido.");
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    throw new HttpError(400, "Informe um e-mail válido.");
  }

  return normalized;
}

function validateRifaFieldValue(field, value) {
  if (value === undefined) {
    throw new HttpError(400, "Não é permitido enviar valores indefinidos.");
  }

  if (field === "email") {
    return validateRifaEmail(value);
  }

  return value;
}

function validateRifaUpdatePayload(updates) {
  if (!isPlainObject(updates) || Object.keys(updates).length === 0) {
    throw new HttpError(400, "Envie ao menos um campo em updates.");
  }

  const allowedFields = getAllowedRifaUpdateFields();
  const result = {};

  for (const [field, value] of Object.entries(updates)) {
    validateFieldPath(field);

    if (!allowedFields.includes(field)) {
      throw new HttpError(400, `Campo não permitido para edição: ${field}`);
    }

    result[field] = validateRifaFieldValue(field, value);
  }

  return result;
}

module.exports = {
  DEFAULT_ALLOWED_RIFA_UPDATE_FIELDS,
  getAllowedRifaUpdateFields,
  validateRifaEmail,
  validateRifaUpdatePayload,
};
