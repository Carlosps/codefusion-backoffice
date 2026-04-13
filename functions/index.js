const { initializeApp } = require("firebase-admin/app");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

const { logAuditEvent, fetchAuditLogs } = require("./src/audit");
const { requireUser } = require("./src/auth");
const { HttpError } = require("./src/errors");
const {
  getFirestoreAdminConfig,
  sanitizeAuditPayload,
  validateAmount,
  validateUpdatePayload,
} = require("./src/firestoreAdmin");
const {
  sendJson,
  sendError,
  getPathSegments,
  readJsonBody,
} = require("./src/http");
const { applyCors, handleCorsPreflight } = require("./src/cors");
const { assertRateLimit } = require("./src/rateLimit");
const {
  listRevenueCatProjects,
  fetchRevenueCatSubscriber,
  buildCustomerHistory,
  buildCustomerSummary,
  findCustomersAcrossProjects,
  getPromotionalEntitlementId,
  grantRevenueCatPromotionalAccess,
} = require("./src/revenuecat");
const {
  getTargetFirestoreDb,
  getTargetFirestoreConfig,
  getRifaLookupConfig,
  getRifaLookupFirestoreDb,
  getRifaLockWriteConfig,
} = require("./src/targetFirestore");
const {
  validateAppUserId,
  validateAuditLimit,
  validatePromotionalAccessPayload,
  validateUserId,
  validateOptionalReason,
} = require("./src/validation");

initializeApp();

const REGION = "southamerica-east1";

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        return value.toDate().toISOString();
      } catch (error) {
        return null;
      }
    }

    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number" &&
      Object.keys(value).length <= 2
    ) {
      return { latitude: value.latitude, longitude: value.longitude };
    }

    if (typeof value.path === "string" && typeof value.id === "string") {
      return { path: value.path, id: value.id };
    }

    const output = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = serializeFirestoreValue(child);
    }
    return output;
  }

  return value;
}

function rethrowRifaFirestorePermissionError(error, kind = "write") {
  const code = error?.code || error?.status;
  if (code === 7 || code === "PERMISSION_DENIED" || String(code).includes("permission")) {
    const rifaLookup = getRifaLookupConfig();
    const targetConfig = getTargetFirestoreConfig();
    const serviceAccountEmail =
      targetConfig?.serviceAccount?.client_email ||
      targetConfig?.serviceAccount?.clientEmail ||
      null;

    const exposeDebugDetails =
      String(process.env.EXPOSE_DEBUG_DETAILS || "")
        .trim()
        .toLowerCase() === "true";

    const readMessage = `Sem permissao para ler rifas no projeto ${rifaLookup.projectId}. No Google Cloud, abra esse projeto > IAM e conceda a service account usada pela API um papel com acesso ao Firestore (ex.: Cloud Datastore User).`;
    const writeMessage = `Sem permissao para gravar rifas no projeto ${rifaLookup.projectId}. Se o GET /rifa funciona mas bloquear/desbloquear nao, a service account das Functions provavelmente so tem leitura: no IAM desse projeto, conceda escrita no Firestore (ex.: Cloud Datastore User).`;

    const message = kind === "read" ? readMessage : writeMessage;

    const baseDetails = {
      rifaLookupProjectId: rifaLookup.projectId,
      rifaLookupCollection: rifaLookup.collection,
      rifaLookupMatchField: rifaLookup.matchField || null,
    };

    throw new HttpError(
      403,
      message,
      exposeDebugDetails ? { ...baseDetails, serviceAccountEmail } : baseDetails,
    );
  }

  throw error;
}

async function getRifa(req, res, rifaId) {
  await requireUser(req);

  const normalizedId = String(rifaId || "").trim();
  if (!normalizedId) {
    throw new HttpError(400, "Informe o Rifa ID.");
  }

  const targetConfig = getTargetFirestoreConfig();
  const rifaLookup = getRifaLookupConfig();
  let docSnap;
  try {
    const db = getRifaLookupFirestoreDb();
    const col = db.collection(rifaLookup.collection);

    if (rifaLookup.matchField) {
      const qs = await col.where(rifaLookup.matchField, "==", normalizedId).limit(1).get();
      docSnap = qs.empty ? null : qs.docs[0];
    } else {
      const snap = await col.doc(normalizedId).get();
      docSnap = snap.exists ? snap : null;
    }
  } catch (error) {
    const code = error?.code || error?.status;
    if (code === 7 || code === "PERMISSION_DENIED" || String(code).includes("permission")) {
      const serviceAccountEmail =
        targetConfig?.serviceAccount?.client_email ||
        targetConfig?.serviceAccount?.clientEmail ||
        null;

      logger.warn("Rifa lookup permission denied", {
        rifaLookupProjectId: rifaLookup.projectId,
        rifaLookupCollection: rifaLookup.collection,
        rifaLookupMatchField: rifaLookup.matchField || null,
        serviceAccountEmail,
        code,
      });

      rethrowRifaFirestorePermissionError(error, "read");
    }
    throw error;
  }
  if (!docSnap) {
    throw new HttpError(404, "Rifa nao encontrada.", {
      rifaLookupProjectId: rifaLookup.projectId,
      collection: rifaLookup.collection,
      rifaLookupMatchField: rifaLookup.matchField || null,
      lookupValue: normalizedId,
      targetFirestoreDisableEmulator: targetConfig.disableEmulator,
    });
  }

  sendJson(res, 200, {
    ok: true,
    rifaId: normalizedId,
    meta: {
      rifaLookupProjectId: rifaLookup.projectId,
      rifaLookupCollection: rifaLookup.collection,
      rifaLookupMatchField: rifaLookup.matchField || null,
      firestoreDocumentId: docSnap.id,
      targetFirestoreDisableEmulator: targetConfig.disableEmulator,
    },
    data: serializeFirestoreValue(docSnap.data() || {}),
  });
}

async function getRifaDocSnapshot(normalizedId) {
  const rifaLookup = getRifaLookupConfig();
  const db = getRifaLookupFirestoreDb();
  const col = db.collection(rifaLookup.collection);

  if (rifaLookup.matchField) {
    const qs = await col.where(rifaLookup.matchField, "==", normalizedId).limit(1).get();
    return qs.empty ? null : qs.docs[0];
  }

  const snap = await col.doc(normalizedId).get();
  return snap.exists ? snap : null;
}

function validateRifaId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new HttpError(400, "Informe o Rifa ID.");
  }
  if (normalized.length > 200) {
    throw new HttpError(400, "Informe um Rifa ID valido.");
  }
  return normalized;
}

function validateFreeTrialDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
    throw new HttpError(400, "Informe um numero valido de dias (1-3650).");
  }
  return parsed;
}

function supportDocTimestamps() {
  const ts = FieldValue.serverTimestamp();
  return { updatedAt: ts, lastUpdatedAt: ts };
}

function buildRifaLockPatch(locked) {
  const { unlockedField, mirrorBlocked } = getRifaLockWriteConfig();
  const patch = {
    [unlockedField]: !locked,
    ...supportDocTimestamps(),
  };

  if (mirrorBlocked) {
    patch.blocked = locked;
  }

  if (!locked && unlockedField === "unlocked") {
    patch.unlockedAt = FieldValue.serverTimestamp();
    patch.unlockReason = "support";
  }

  return patch;
}

async function applyRifaLockedState(normalizedId, locked) {
  let snap;
  try {
    snap = await getRifaDocSnapshot(normalizedId);
  } catch (error) {
    rethrowRifaFirestorePermissionError(error, "write");
  }

  if (!snap) {
    throw new HttpError(404, "Rifa nao encontrada.");
  }

  try {
    await snap.ref.update(buildRifaLockPatch(locked));
  } catch (error) {
    rethrowRifaFirestorePermissionError(error, "write");
  }

  return snap;
}

async function lockRifa(req, res, rifaId) {
  const actor = await requireUser(req);
  assertRateLimit(`${actor.uid}:write`, {
    max: Number(process.env.API_RATE_LIMIT_WRITE_PER_WINDOW || 20),
  });

  const normalizedId = validateRifaId(rifaId);
  const snap = await applyRifaLockedState(normalizedId, true);

  await logAuditEvent({
    module: "rifa",
    action: "lock",
    actor,
    target: { rifaId: normalizedId, docPath: snap.ref.path },
    status: "success",
  });

  sendJson(res, 200, {
    ok: true,
    result: { message: "Rifa bloqueada com sucesso.", rifaId: normalizedId },
  });
}

async function unlockRifa(req, res, rifaId) {
  const actor = await requireUser(req);
  assertRateLimit(`${actor.uid}:write`, {
    max: Number(process.env.API_RATE_LIMIT_WRITE_PER_WINDOW || 20),
  });

  const normalizedId = validateRifaId(rifaId);
  const snap = await applyRifaLockedState(normalizedId, false);

  await logAuditEvent({
    module: "rifa",
    action: "unlock",
    actor,
    target: { rifaId: normalizedId, docPath: snap.ref.path },
    status: "success",
  });

  sendJson(res, 200, {
    ok: true,
    result: { message: "Rifa desbloqueada com sucesso.", rifaId: normalizedId },
  });
}

/**
 * Extensao de trial alinhada ao app: freeTrialExpiresAt = max(agora, expiracao atual futura) + X dias.
 * Mesmos campos que o HTTP grantRaffleFreeTrial do app (days ou trialDays no body); aqui o id vai na URL.
 * lastUpdatedAt espelha updatedAt para compatibilidade com leitores legados do app.
 */
async function addRifaFreeTrialDays(req, res, rifaId) {
  const actor = await requireUser(req);
  assertRateLimit(`${actor.uid}:write`, {
    max: Number(process.env.API_RATE_LIMIT_WRITE_PER_WINDOW || 20),
  });

  const normalizedId = validateRifaId(rifaId);
  const body = await readJsonBody(req);
  const daysRaw = body?.days ?? body?.trialDays;
  const days = validateFreeTrialDays(daysRaw);

  let snap;
  try {
    snap = await getRifaDocSnapshot(normalizedId);
  } catch (error) {
    rethrowRifaFirestorePermissionError(error, "write");
  }

  if (!snap) {
    throw new HttpError(404, "Rifa nao encontrada.");
  }

  const db = snap.ref.firestore;
  let result;
  try {
    result = await db.runTransaction(async (tx) => {
      const current = await tx.get(snap.ref);
      if (!current.exists) {
        throw new HttpError(404, "Rifa nao encontrada.");
      }

      const data = current.data() || {};
      const now = new Date();

      let base = now;
      const currentExpiresAt = data.freeTrialExpiresAt;
      if (currentExpiresAt && typeof currentExpiresAt.toDate === "function") {
        const asDate = currentExpiresAt.toDate();
        if (!Number.isNaN(asDate.getTime()) && asDate.getTime() > now.getTime()) {
          base = asDate;
        }
      }

      const nextExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

      const ts = FieldValue.serverTimestamp();
      tx.update(snap.ref, {
        freeTrialActive: true,
        freeTrialExpiresAt: Timestamp.fromDate(nextExpiresAt),
        updatedAt: ts,
        lastUpdatedAt: ts,
      });

      return {
        expiresAt: nextExpiresAt.toISOString(),
      };
    });
  } catch (error) {
    rethrowRifaFirestorePermissionError(error, "write");
  }

  await logAuditEvent({
    module: "rifa",
    action: "add_free_trial_days",
    actor,
    target: { rifaId: normalizedId, docPath: snap.ref.path },
    status: "success",
    metadata: { days, expiresAt: result.expiresAt },
  });

  sendJson(res, 200, {
    ok: true,
    result: {
      message: "Dias gratis adicionados com sucesso.",
      rifaId: normalizedId,
      days,
      expiresAt: result.expiresAt,
    },
  });
}

async function getSession(req, res) {
  const actor = await requireUser(req);

  sendJson(res, 200, {
    ok: true,
    session: {
      actor,
      permissions: {
        role: "support",
        canReadRevenueCat: true,
        canWriteFirestore: true,
        canReadAuditLogs: true,
        canManagePromotionalAccess: true,
      },
    },
  });
}

async function getRevenueCatProjects(req, res) {
  await requireUser(req);

  sendJson(res, 200, {
    ok: true,
    projects: listRevenueCatProjects(),
  });
}

async function getRevenueCatCustomer(req, res, projectId, appUserId) {
  const actor = await requireUser(req);
  validateAppUserId(appUserId);
  assertRateLimit(`${actor.uid}:revenuecat`, {
    max: Number(process.env.API_RATE_LIMIT_REVENUECAT_PER_WINDOW || 30),
  });

  try {
    const payload = await fetchRevenueCatSubscriber(projectId, appUserId);
    const summary = buildCustomerSummary(payload);

    await logAuditEvent({
      module: "revenuecat",
      action: "lookup_customer",
      actor,
      target: {
        projectId: summary.project?.projectId || projectId,
        appUserId,
      },
      status: "success",
      metadata: {
        projectLabel: summary.project?.label || null,
        hasActiveEntitlement: summary.status.hasActiveEntitlement,
        currentProduct: summary.currentProduct,
      },
    });

    sendJson(res, 200, {
      ok: true,
      customer: summary,
    });
  } catch (error) {
    await logAuditEvent({
      module: "revenuecat",
      action: "lookup_customer",
      actor,
      target: { projectId, appUserId },
      status: "error",
      metadata: {
        message: error.message,
      },
    });
    throw error;
  }
}

async function searchRevenueCatCustomer(req, res, appUserId) {
  const actor = await requireUser(req);
  validateAppUserId(appUserId);
  assertRateLimit(`${actor.uid}:revenuecat`, {
    max: Number(process.env.API_RATE_LIMIT_REVENUECAT_PER_WINDOW || 30),
  });

  try {
    const search = await findCustomersAcrossProjects(appUserId);

    await logAuditEvent({
      module: "revenuecat",
      action: "search_customer_all_projects",
      actor,
      target: { appUserId },
      status: "success",
      metadata: {
        totalMatches: search.totalMatches,
        searchedProjectCount: search.searchedProjectCount,
        matchedProjectIds: search.matches.map((match) => match.customer.project?.projectId || null),
      },
    });

    sendJson(res, 200, {
      ok: true,
      search,
    });
  } catch (error) {
    await logAuditEvent({
      module: "revenuecat",
      action: "search_customer_all_projects",
      actor,
      target: { appUserId },
      status: "error",
      metadata: {
        message: error.message,
      },
    });
    throw error;
  }
}

async function getRevenueCatHistory(req, res, projectId, appUserId) {
  const actor = await requireUser(req);
  validateAppUserId(appUserId);
  assertRateLimit(`${actor.uid}:revenuecat`, {
    max: Number(process.env.API_RATE_LIMIT_REVENUECAT_PER_WINDOW || 30),
  });

  const payload = await fetchRevenueCatSubscriber(projectId, appUserId);
  const history = buildCustomerHistory(payload);

  await logAuditEvent({
    module: "revenuecat",
    action: "lookup_history",
    actor,
    target: {
      projectId: history.project?.projectId || projectId,
      appUserId,
    },
    status: "success",
    metadata: {
      projectLabel: history.project?.label || null,
      totalItems: history.items.length,
    },
  });

  sendJson(res, 200, {
    ok: true,
    history,
  });
}

async function grantPromotionalAccess(req, res, projectId, appUserId) {
  const actor = await requireUser(req);
  validateAppUserId(appUserId);
  assertRateLimit(`${actor.uid}:write`, {
    max: Number(process.env.API_RATE_LIMIT_WRITE_PER_WINDOW || 20),
  });

  const entitlementId = getPromotionalEntitlementId();
  const body = await readJsonBody(req);
  const grant = validatePromotionalAccessPayload(body);

  try {
    await fetchRevenueCatSubscriber(projectId, appUserId);
    const result = await grantRevenueCatPromotionalAccess(projectId, appUserId, grant);

    await logAuditEvent({
      module: "revenuecat",
      action: "grant_promotional_access",
      actor,
      target: { projectId, appUserId },
      status: "success",
      metadata: {
        entitlementId,
        grantKind: grant.grantKind,
        expiresAt: result.expiresAt,
      },
    });

    sendJson(res, 200, {
      ok: true,
      result: {
        message: "Acesso manual Pro concedido com sucesso.",
        projectId,
        appUserId,
        entitlementId,
        expiresAt: result.expiresAt,
        grantKind: grant.grantKind,
      },
    });
  } catch (error) {
    await logAuditEvent({
      module: "revenuecat",
      action: "grant_promotional_access",
      actor,
      target: { projectId, appUserId },
      status: "error",
      metadata: {
        entitlementId,
        grantKind: grant.grantKind,
        expiresAt: grant.expiresAt,
        message: error.message,
      },
    });
    throw error;
  }
}

async function getFirestoreConfig(req, res) {
  await requireUser(req);

  sendJson(res, 200, {
    ok: true,
    config: getFirestoreAdminConfig(),
  });
}

async function creditUser(req, res, userId) {
  const actor = await requireUser(req);
  assertRateLimit(`${actor.uid}:write`, {
    max: Number(process.env.API_RATE_LIMIT_WRITE_PER_WINDOW || 20),
  });

  const body = await readJsonBody(req);
  const targetUserId = validateUserId(userId);
  const amount = validateAmount(body.amount);
  const reason = validateOptionalReason(body.reason);
  const config = getFirestoreAdminConfig();
  const db = getTargetFirestoreDb();
  const docRef = db.collection(config.usersCollection).doc(targetUserId);

  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) {
      throw new HttpError(404, "Usuario nao encontrado no Firestore.");
    }

    transaction.update(docRef, {
      [config.creditField]: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      before: snapshot.get(config.creditField) || 0,
      delta: amount,
    };
  });

  await logAuditEvent({
    module: "firestore",
    action: "credit_user",
    actor,
    target: { userId: targetUserId },
    status: "success",
    metadata: {
      reason,
      before: result.before,
      delta: result.delta,
      field: config.creditField,
    },
  });

  sendJson(res, 200, {
    ok: true,
    result: {
      message: "Credito aplicado com sucesso.",
      userId: targetUserId,
      field: config.creditField,
      delta: amount,
      before: result.before,
      after: result.before + amount,
      reason,
    },
  });
}

async function debitUser(req, res, userId) {
  const actor = await requireUser(req);
  assertRateLimit(`${actor.uid}:write`, {
    max: Number(process.env.API_RATE_LIMIT_WRITE_PER_WINDOW || 20),
  });

  const body = await readJsonBody(req);
  const targetUserId = validateUserId(userId);
  const amount = validateAmount(body.amount);
  const reason = validateOptionalReason(body.reason);
  const config = getFirestoreAdminConfig();
  const db = getTargetFirestoreDb();
  const docRef = db.collection(config.usersCollection).doc(targetUserId);

  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) {
      throw new HttpError(404, "Usuario nao encontrado no Firestore.");
    }

    const before = Number(snapshot.get(config.creditField) || 0);
    const after = before - amount;
    if (!config.allowNegativeCredits && after < 0) {
      throw new HttpError(400, "O debito deixaria o saldo negativo.");
    }

    transaction.update(docRef, {
      [config.creditField]: after,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { before, after };
  });

  await logAuditEvent({
    module: "firestore",
    action: "debit_user",
    actor,
    target: { userId: targetUserId },
    status: "success",
    metadata: {
      reason,
      before: result.before,
      after: result.after,
      delta: amount,
      field: config.creditField,
    },
  });

  sendJson(res, 200, {
    ok: true,
    result: {
      message: "Debito aplicado com sucesso.",
      userId: targetUserId,
      field: config.creditField,
      delta: amount,
      before: result.before,
      after: result.after,
      reason,
    },
  });
}

async function updateUserFields(req, res, userId) {
  const actor = await requireUser(req);
  assertRateLimit(`${actor.uid}:write`, {
    max: Number(process.env.API_RATE_LIMIT_WRITE_PER_WINDOW || 20),
  });

  const body = await readJsonBody(req);
  const targetUserId = validateUserId(userId);
  const reason = validateOptionalReason(body.reason);
  const updates = validateUpdatePayload(body.updates);
  const config = getFirestoreAdminConfig();
  const db = getTargetFirestoreDb();
  const docRef = db.collection(config.usersCollection).doc(targetUserId);
  const sanitized = sanitizeAuditPayload(updates);

  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new HttpError(404, "Usuario nao encontrado no Firestore.");
  }

  const payload = {
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.update(payload);

  await logAuditEvent({
    module: "firestore",
    action: "update_fields",
    actor,
    target: { userId: targetUserId },
    status: "success",
    metadata: {
      reason,
      fields: Object.keys(updates),
      updates: sanitized,
    },
  });

  sendJson(res, 200, {
    ok: true,
    result: {
      message: "Campos atualizados com sucesso.",
      userId: targetUserId,
      updatedFields: Object.keys(updates),
      reason,
    },
  });
}

async function getAuditLogs(req, res) {
  await requireUser(req);
  const limit = validateAuditLimit(req.query.limit);
  const logs = await fetchAuditLogs({ limit });

  sendJson(res, 200, {
    ok: true,
    logs,
  });
}

exports.api = onRequest(
  {
    region: REGION,
    cors: false,
    secrets: [
      "REVENUECAT_PROJECTS_JSON",
      "TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON",
    ],
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        handleCorsPreflight(req, res);
        return;
      }

      const corsResult = applyCors(req, res);
      if (!corsResult.allowed) {
        throw new HttpError(403, "Origin não permitido.");
      }

      assertRateLimit(`global:${req.ip || "unknown"}`, {
        max: Number(process.env.API_RATE_LIMIT_MAX_REQUESTS || 60),
      });

      const segments = getPathSegments(req);
      const [resource, scope] = segments;

      if (req.method === "GET" && resource === "health") {
        sendJson(res, 200, {
          ok: true,
          service: "codefusion-backoffice-api",
          region: REGION,
        });
        return;
      }

      if (req.method === "GET" && resource === "auth" && scope === "session") {
        await getSession(req, res);
        return;
      }

      if (req.method === "GET" && resource === "rifa" && scope && !segments[2]) {
        await getRifa(req, res, decodeURIComponent(scope));
        return;
      }

      if (
        req.method === "POST" &&
        resource === "rifa" &&
        scope &&
        segments[2] === "lock" &&
        !segments[3]
      ) {
        await lockRifa(req, res, decodeURIComponent(scope));
        return;
      }

      if (
        req.method === "POST" &&
        resource === "rifa" &&
        scope &&
        segments[2] === "unlock" &&
        !segments[3]
      ) {
        await unlockRifa(req, res, decodeURIComponent(scope));
        return;
      }

      if (
        req.method === "POST" &&
        resource === "rifa" &&
        scope &&
        segments[2] === "free-trial" &&
        !segments[3]
      ) {
        await addRifaFreeTrialDays(req, res, decodeURIComponent(scope));
        return;
      }

      if (req.method === "GET" && resource === "revenuecat" && scope === "projects" && segments.length === 2) {
        await getRevenueCatProjects(req, res);
        return;
      }

      if (
        req.method === "GET" &&
        resource === "revenuecat" &&
        scope === "customer" &&
        segments[2] &&
        !segments[3]
      ) {
        await searchRevenueCatCustomer(req, res, decodeURIComponent(segments[2]));
        return;
      }

      if (
        req.method === "GET" &&
        resource === "revenuecat" &&
        scope === "projects" &&
        segments[2] &&
        segments[3] === "customer" &&
        segments[4] &&
        !segments[5]
      ) {
        await getRevenueCatCustomer(
          req,
          res,
          decodeURIComponent(segments[2]),
          decodeURIComponent(segments[4]),
        );
        return;
      }

      if (
        req.method === "POST" &&
        resource === "revenuecat" &&
        scope === "projects" &&
        segments[2] &&
        segments[3] === "customer" &&
        segments[4] &&
        segments[5] === "promotional-access" &&
        !segments[6]
      ) {
        await grantPromotionalAccess(
          req,
          res,
          decodeURIComponent(segments[2]),
          decodeURIComponent(segments[4]),
        );
        return;
      }

      if (
        req.method === "GET" &&
        resource === "revenuecat" &&
        scope === "projects" &&
        segments[2] &&
        segments[3] === "customer" &&
        segments[4] &&
        segments[5] === "history"
      ) {
        await getRevenueCatHistory(
          req,
          res,
          decodeURIComponent(segments[2]),
          decodeURIComponent(segments[4]),
        );
        return;
      }

      if (req.method === "GET" && resource === "firestore" && scope === "admin-config") {
        await getFirestoreConfig(req, res);
        return;
      }

      if (
        req.method === "POST" &&
        resource === "firestore" &&
        scope === "users" &&
        segments[2] &&
        segments[3] === "credit"
      ) {
        await creditUser(req, res, decodeURIComponent(segments[2]));
        return;
      }

      if (
        req.method === "POST" &&
        resource === "firestore" &&
        scope === "users" &&
        segments[2] &&
        segments[3] === "debit"
      ) {
        await debitUser(req, res, decodeURIComponent(segments[2]));
        return;
      }

      if (
        req.method === "POST" &&
        resource === "firestore" &&
        scope === "users" &&
        segments[2] &&
        segments[3] === "update-fields"
      ) {
        await updateUserFields(req, res, decodeURIComponent(segments[2]));
        return;
      }

      if (req.method === "GET" && resource === "audit" && scope === "logs") {
        await getAuditLogs(req, res);
        return;
      }

      throw new HttpError(404, "Rota nao encontrada.");
    } catch (error) {
      logger.error("API request failed", error);
      sendError(res, error);
    }
  },
);
