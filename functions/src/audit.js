const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");

function getAuditCollection() {
  return process.env.AUDIT_COLLECTION || "support_audit_logs";
}

function getAuditDb() {
  return getFirestore();
}

function stripUndefinedDeep(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined);
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      continue;
    }
    const next = stripUndefinedDeep(child);
    if (next !== undefined) {
      out[key] = next;
    }
  }
  return out;
}

function formatTimestamp(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return String(value);
}

async function logAuditEvent({ module, action, actor, target, status, metadata }) {
  const doc = {
    ...stripUndefinedDeep({
      module,
      action,
      actor,
      target,
      status,
      metadata: metadata || null,
    }),
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await getAuditDb().collection(getAuditCollection()).add(doc);
  } catch (error) {
    logger.warn("Audit log skipped", { module, action, status, message: error.message });
  }
}

async function fetchAuditLogs({ limit = 30 } = {}) {
  const snapshot = await getAuditDb()
    .collection(getAuditCollection())
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      module: data.module || null,
      action: data.action || null,
      actor: data.actor || null,
      target: data.target || null,
      status: data.status || null,
      metadata: data.metadata || null,
      createdAt: formatTimestamp(data.createdAt),
    };
  });
}

module.exports = {
  logAuditEvent,
  fetchAuditLogs,
};
