const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { HttpError } = require("./errors");
const { computePromotionalExpiresAt } = require("./revenuecat");

const CONTRACT_PROJECT_ID = "gerador-contratos";
const PLAN_CREDITS = { starter: 3, plus: 10 };

function validateContractAccess(body, appUserId) {
  if (!appUserId || appUserId.includes("/") || appUserId.startsWith("$RCAnonymousID:")) {
    throw new HttpError(400, "Pesquise pelo UID do Firebase do usuário para liberar plano e créditos.");
  }
  const planType = body.planType || "plus";
  if (!Object.hasOwn(PLAN_CREDITS, planType)) {
    throw new HttpError(400, "Escolha o plano Starter ou Plus.");
  }
  const credits = body.credits ?? PLAN_CREDITS[planType];
  if (!Number.isSafeInteger(credits) || credits < 0 || credits > 10000) {
    throw new HttpError(400, "Informe de 0 a 10000 créditos inteiros para adicionar.");
  }
  if (typeof body.requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId)) {
    throw new HttpError(400, "Identificador da liberação inválido. Atualize a página.");
  }
  return { planType, credits, requestId: body.requestId };
}

async function grantContractAccess({ db, appUserId, grant, options, actor, grantAccess }) {
  const userRef = db.collection("users").doc(appUserId);
  const logRef = db.collection("credit_logs").doc(`support-${options.requestId}`);
  const fingerprint = JSON.stringify({ appUserId, grant, planType: options.planType, credits: options.credits });
  // Reserve the operation before calling RevenueCat: validates Firestore write access
  // and keeps retries tied to the same user, values and expiration.
  const operation = await db.runTransaction(async (tx) => {
    const [user, log] = await Promise.all([tx.get(userRef), tx.get(logRef)]);
    if (log.exists) {
      if (log.data().fingerprint !== fingerprint) {
        throw new HttpError(409, "Esta tentativa já foi iniciada com outros valores. Repita os valores originais ou atualize a página para uma nova liberação.");
      }
      return log.data();
    }
    if (!user.exists) {
      throw new HttpError(404, "Usuário não encontrado em users do app de contratos. Pesquise pelo UID do Firebase; o Pro ainda não foi concedido.");
    }
    const credits = user.data().credits ?? 0;
    if (!Number.isSafeInteger(credits) || credits < 0 || !Number.isSafeInteger(credits + options.credits)) {
      throw new HttpError(409, "O saldo atual de créditos do usuário é inválido.");
    }
    const record = {
      fingerprint, uid: appUserId, type: "purchase", amount: options.credits,
      planType: options.planType, reason: "Liberação manual pelo suporte",
      externalRef: options.requestId, status: "pending", actorUid: actor.uid,
      expiresAt: computePromotionalExpiresAt(grant.grantKind, grant.expiresAt),
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(logRef, record);
    return record;
  });
  if (operation.status === "completed") return operation.result;

  const result = await grantAccess({ grantKind: "until", expiresAt: operation.expiresAt });
  try {
    return await db.runTransaction(async (tx) => {
      const [user, log] = await Promise.all([tx.get(userRef), tx.get(logRef)]);
      if (log.data()?.status === "completed") return log.data().result;
      if (!user.exists) throw new Error("Documento do usuário removido durante a liberação.");
      const before = user.data().credits ?? 0;
      if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(before + options.credits)) {
        throw new Error("Saldo de créditos inválido.");
      }
      const after = before + options.credits;
      // Do not shorten an existing paid plan when granting a shorter promotion.
      const previousExpiration = user.data().planExpiresAt;
      const expiresAt = Timestamp.fromDate(new Date(result.expiresAt));
      const effectiveExpiration = previousExpiration?.toMillis?.() > expiresAt.toMillis()
        ? previousExpiration : expiresAt;
      tx.update(userRef, {
        planType: options.planType, planExpiresAt: effectiveExpiration,
        credits: after, updatedAt: FieldValue.serverTimestamp(),
      });
      const completed = {
        entitlementId: result.entitlementId, expiresAt: result.expiresAt,
        planType: options.planType, creditsAdded: options.credits, creditsBefore: before,
        creditsAfter: after, userId: appUserId, planExpiresAt: effectiveExpiration.toDate().toISOString(),
      };
      tx.update(logRef, { status: "completed", result: completed, updatedAt: FieldValue.serverTimestamp() });
      return completed;
    });
  } catch (error) {
    throw new HttpError(502, "O Pro foi concedido no RevenueCat, mas a atualização de plano/créditos falhou. Repita a mesma operação para concluir sem duplicar créditos.", { message: error.message });
  }
}

module.exports = { CONTRACT_PROJECT_ID, PLAN_CREDITS, validateContractAccess, grantContractAccess };
