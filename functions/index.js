const { initializeApp } = require("firebase-admin/app");
const { FieldValue } = require("firebase-admin/firestore");
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
const { getTargetFirestoreDb } = require("./src/targetFirestore");
const {
  validateAppUserId,
  validateAuditLimit,
  validatePromotionalAccessPayload,
  validateUserId,
  validateOptionalReason,
} = require("./src/validation");

initializeApp();

const REGION = "southamerica-east1";

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
    cors: true,
    secrets: ["REVENUECAT_PROJECTS_JSON", "TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON"],
  },
  async (req, res) => {
    try {
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
