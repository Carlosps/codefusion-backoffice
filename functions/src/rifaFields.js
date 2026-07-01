const { HttpError } = require("./errors");

const DEFAULT_ALLOWED_RIFA_UPDATE_FIELDS = [
  "email",
  "name",
  "description",
  "pixKey",
  "pixType",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIX_TYPES = [0, 1, 2, 3, 4, 5];

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

function normalizeText(value, fieldLabel, options = {}) {
  if (typeof value !== "string") {
    throw new HttpError(400, `Informe ${fieldLabel}.`);
  }

  const normalized = value.trim();
  const maxLength = options.maxLength || 500;
  if (!options.allowEmpty && !normalized) {
    throw new HttpError(400, `Informe ${fieldLabel}.`);
  }
  if (normalized.length > maxLength) {
    throw new HttpError(400, `${fieldLabel} ultrapassa o limite permitido.`);
  }

  return normalized;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function inferPixType(value) {
  const text = String(value || "").trim();
  const digits = onlyDigits(text);

  if (!text) {
    return 0;
  }
  if (EMAIL_RE.test(text.toLowerCase())) {
    return 3;
  }
  if (digits.length === 14) {
    return 2;
  }
  if (/^\+?[\d\s().-]{10,24}$/.test(text) && digits.length >= 10 && digits.length <= 13 && /[()+\s]/.test(text)) {
    return 4;
  }
  if (digits.length === 11) {
    return 1;
  }

  return 5;
}

function validatePixType(value) {
  const normalized = typeof value === "number" ? value : Number(String(value || "").trim());
  if (!Number.isInteger(normalized) || !PIX_TYPES.includes(normalized)) {
    throw new HttpError(400, "Tipo de chave Pix inválido.");
  }
  return normalized;
}

function validatePixKey(value) {
  return normalizeText(value, "a chave Pix", { maxLength: 140 });
}

function assertPixKeyMatchesType(pixKey, pixType) {
  const inferred = inferPixType(pixKey);
  if (pixType !== 0 && pixType !== inferred) {
    throw new HttpError(400, "A chave Pix não corresponde ao tipo informado.", {
      inferredPixType: inferred,
      pixType,
    });
  }
}

function validateRifaFieldValue(field, value) {
  if (value === undefined) {
    throw new HttpError(400, "Não é permitido enviar valores indefinidos.");
  }

  if (field === "email") {
    return validateRifaEmail(value);
  }
  if (field === "name") {
    return normalizeText(value, "o nome da rifa", { maxLength: 120 });
  }
  if (field === "description") {
    return normalizeText(value, "a descrição da rifa", {
      allowEmpty: true,
      maxLength: 2000,
    });
  }
  if (field === "pixKey") {
    return validatePixKey(value);
  }
  if (field === "pixType") {
    return validatePixType(value);
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

  if (Object.prototype.hasOwnProperty.call(result, "pixKey")) {
    const pixType = result.pixType ?? inferPixType(result.pixKey);
    assertPixKeyMatchesType(result.pixKey, pixType);
    result.pixType = pixType;
  } else if (Object.prototype.hasOwnProperty.call(result, "pixType")) {
    throw new HttpError(400, "Informe a chave Pix para atualizar o tipo.");
  }

  return result;
}

module.exports = {
  DEFAULT_ALLOWED_RIFA_UPDATE_FIELDS,
  inferPixType,
  getAllowedRifaUpdateFields,
  validateRifaEmail,
  validateRifaUpdatePayload,
};
