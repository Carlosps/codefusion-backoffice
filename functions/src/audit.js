const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function getAuditCollection() {
  return process.env.AUDIT_COLLECTION || "support_audit_logs";
}

function getAuditDb() {
  return getFirestore();
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
  await getAuditDb().collection(getAuditCollection()).add({
    module,
    action,
    actor,
    target,
    status,
    metadata: metadata || null,
    createdAt: FieldValue.serverTimestamp(),
  });
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
