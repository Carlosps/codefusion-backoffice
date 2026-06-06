const { HttpError } = require("./errors");
const { validateRifaEmail } = require("./rifaFields");

const DEFAULT_RIFA_EMAIL_LOOKUP_LIMIT = 25;
const RIFA_EMAIL_LOOKUP_FIELDS = ["emailNormalized", "email"];

function getRifaEmailLookupLimit() {
  const parsed = Number(process.env.RIFA_EMAIL_LOOKUP_LIMIT || DEFAULT_RIFA_EMAIL_LOOKUP_LIMIT);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_RIFA_EMAIL_LOOKUP_LIMIT;
  }
  return Math.min(parsed, 100);
}

function normalizeRifaCorrelationEmail(value) {
  return validateRifaEmail(value);
}

function getRifaEmailLookupValues(value) {
  const original = String(value || "").trim();
  const normalized = normalizeRifaCorrelationEmail(original);
  return Array.from(new Set([normalized, original].filter(Boolean)));
}

function getRifaEmailLookupQueries(value) {
  const original = String(value || "").trim();
  const normalized = normalizeRifaCorrelationEmail(original);
  return [
    { field: "emailNormalized", value: normalized },
    ...getRifaEmailLookupValues(original).map((emailValue) => ({
      field: "email",
      value: emailValue,
    })),
  ];
}

function getRifaIdFromSnapshot(docSnap, target, data = null) {
  if (target?.matchField && data && data[target.matchField]) {
    return String(data[target.matchField]);
  }
  return docSnap?.id || "";
}

function getEmailFromMatches(matches) {
  const emails = [];
  for (const match of Array.isArray(matches) ? matches : []) {
    const raw = match?.data?.email;
    if (typeof raw !== "string" || !raw.trim()) {
      continue;
    }
    try {
      emails.push(normalizeRifaCorrelationEmail(raw));
    } catch (error) {
      // Dados antigos podem ter e-mail inválido; ignoramos para não quebrar a consulta por ID.
    }
  }
  return emails[0] || null;
}

function serializeRelatedRifa(target, docSnap, serializeFirestoreValue) {
  const rawData = docSnap.data() || {};
  const data = serializeFirestoreValue(rawData);
  return {
    appKey: target.appKey,
    label: target.label,
    projectId: target.projectId,
    collection: target.collection,
    firestoreDocumentId: docSnap.id,
    rifaId: getRifaIdFromSnapshot(docSnap, target, rawData),
    data,
  };
}

function dedupeRelatedRifas(matches) {
  const seen = new Set();
  const result = [];
  for (const match of matches) {
    const key = `${match.appKey}:${match.firestoreDocumentId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(match);
  }
  return result;
}

function summarizeCountsByApp(matches, targets = []) {
  const labels = new Map(targets.map((target) => [target.appKey, target.label]));
  const counts = new Map();

  for (const match of matches) {
    const current = counts.get(match.appKey) || {
      appKey: match.appKey,
      label: match.label || labels.get(match.appKey) || match.appKey,
      count: 0,
    };
    current.count += 1;
    counts.set(match.appKey, current);
  }

  return Array.from(counts.values());
}

function buildEmptyEmailCorrelation(email, partialErrors = []) {
  return {
    email: email || null,
    status: email ? "single" : "unknown",
    total: 0,
    countsByApp: [],
    partialErrors,
    matches: [],
  };
}

function classifyRifaCorrelation(total, email) {
  if (!email) {
    return "unknown";
  }
  return total > 1 ? "recurring" : "single";
}

async function findRifasByEmail({
  email,
  targets,
  getDb,
  serializeFirestoreValue,
  isPermissionError,
  serializeTarget,
  seedMatches = [],
  limit = getRifaEmailLookupLimit(),
}) {
  const normalizedEmail = normalizeRifaCorrelationEmail(email);
  const emailQueries = getRifaEmailLookupQueries(email);
  const related = [...(Array.isArray(seedMatches) ? seedMatches : [])];
  const partialErrors = [];

  for (const target of targets) {
    try {
      const db = getDb(target);
      const collectionRef = db.collection(target.collection);
      for (const { field, value } of emailQueries) {
        const qs = await collectionRef.where(field, "==", value).limit(limit).get();

        for (const docSnap of qs.docs || []) {
          related.push(serializeRelatedRifa(target, docSnap, serializeFirestoreValue));
        }
      }
    } catch (error) {
      if (isPermissionError(error)) {
        partialErrors.push({
          ...serializeTarget(target),
          status: 403,
          code: error?.code || error?.status,
          message: "Sem permissão para ler rifas neste projeto.",
        });
        continue;
      }
      throw error;
    }
  }

  const matches = dedupeRelatedRifas(related);
  return {
    email: normalizedEmail,
    status: classifyRifaCorrelation(matches.length, normalizedEmail),
    total: matches.length,
    countsByApp: summarizeCountsByApp(matches, targets),
    partialErrors,
    matches,
  };
}

async function buildRifaEmailCorrelationFromMatches(options) {
  const email = getEmailFromMatches(options.matches);
  if (!email) {
    return buildEmptyEmailCorrelation(null);
  }
  return findRifasByEmail({ ...options, email, seedMatches: options.matches });
}

function assertEmailCorrelationHasResults(correlation) {
  if (!correlation?.matches?.length) {
    if (correlation?.partialErrors?.length) {
      throw new HttpError(403, "Não foi possível consultar rifas em todos os projetos.", {
        email: correlation?.email || null,
        partialErrors: correlation.partialErrors,
      });
    }

    throw new HttpError(404, "Nenhuma rifa encontrada para este e-mail.", {
      email: correlation?.email || null,
    });
  }
}

module.exports = {
  DEFAULT_RIFA_EMAIL_LOOKUP_LIMIT,
  RIFA_EMAIL_LOOKUP_FIELDS,
  getRifaEmailLookupLimit,
  normalizeRifaCorrelationEmail,
  getRifaEmailLookupValues,
  getRifaEmailLookupQueries,
  getEmailFromMatches,
  dedupeRelatedRifas,
  summarizeCountsByApp,
  classifyRifaCorrelation,
  findRifasByEmail,
  buildRifaEmailCorrelationFromMatches,
  assertEmailCorrelationHasResults,
};
