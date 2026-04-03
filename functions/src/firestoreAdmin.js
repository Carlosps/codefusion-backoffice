const { HttpError } = require("./errors");

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFirestoreAdminConfig() {
  return {
    targetProjectId: process.env.TARGET_FIRESTORE_PROJECT_ID || "",
    usersCollection: process.env.FIRESTORE_USERS_COLLECTION || "users",
    creditField: process.env.FIRESTORE_CREDIT_FIELD || "credits",
    allowedUpdateFields: parseCsv(process.env.FIRESTORE_ALLOWED_UPDATE_FIELDS),
    allowNegativeCredits: parseBoolean(process.env.FIRESTORE_ALLOW_NEGATIVE_CREDITS, false),
    maxCreditDelta: Number(process.env.FIRESTORE_MAX_CREDIT_DELTA || 100000),
  };
}

function validateAmount(value) {
  const amount = Number(value);
  const config = getFirestoreAdminConfig();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "O valor precisa ser numerico e maior que zero.");
  }

  if (amount > config.maxCreditDelta) {
    throw new HttpError(400, "O valor ultrapassa o limite permitido.");
  }

  return amount;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateFieldPath(fieldName) {
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(fieldName)) {
    throw new HttpError(400, `Campo invalido: ${fieldName}`);
  }
}

function validateFieldValue(value) {
  if (value === undefined) {
    throw new HttpError(400, "Nao e permitido enviar valores indefinidos.");
  }

  if (typeof value === "function") {
    throw new HttpError(400, "Tipo de valor nao suportado.");
  }

  return value;
}

function validateUpdatePayload(updates) {
  if (!isPlainObject(updates) || Object.keys(updates).length === 0) {
    throw new HttpError(400, "Envie ao menos um campo em updates.");
  }

  const config = getFirestoreAdminConfig();
  const result = {};

  for (const [field, value] of Object.entries(updates)) {
    validateFieldPath(field);

    if (!config.allowedUpdateFields.includes(field)) {
      throw new HttpError(400, `Campo nao permitido para edicao: ${field}`);
    }

    result[field] = validateFieldValue(value);
  }

  return result;
}

function sanitizeAuditPayload(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const clean = {};

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && value.length > 300) {
      clean[key] = `${value.slice(0, 300)}...`;
      continue;
    }

    clean[key] = value;
  }

  return clean;
}

module.exports = {
  getFirestoreAdminConfig,
  sanitizeAuditPayload,
  validateAmount,
  validateUpdatePayload,
};
