const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const { HttpError } = require("./errors");

const TARGET_APP_NAME = "target-firestore";
const RIFA_LOOKUP_APP_PREFIX = "rifa-lookup-firestore";
const PRODUCTION_FIRESTORE_HOST = "firestore.googleapis.com";
const DEFAULT_RIFA_LOOKUP_TARGETS = [
  {
    appKey: "rifa-facil",
    label: "Rifa Facil",
    projectId: "rifa-73864",
    collection: "raffles",
    buyersCollection: "buyers",
    reservedBuyersCollection: "reservedBuyers",
  },
  {
    appKey: "rifa-digital",
    label: "Rifa Digital",
    projectId: "rifa-digital-f21e7",
    collection: "raffles",
    buyersCollection: "buyers",
    reservedBuyersCollection: "reservedBuyers",
  },
];

function parseServiceAccountJson(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (parsed.private_key) {
      parsed.private_key = String(parsed.private_key).replaceAll("\\n", "\n");
    }

    return parsed;
  } catch (error) {
    throw new HttpError(
      500,
      "TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON contém JSON inválido.",
    );
  }
}

function getTargetFirestoreConfig() {
  return {
    projectId: String(process.env.TARGET_FIRESTORE_PROJECT_ID || "").trim(),
    serviceAccount: parseServiceAccountJson(process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON),
    disableEmulator:
      String(process.env.TARGET_FIRESTORE_DISABLE_EMULATOR || "")
        .trim()
        .toLowerCase() === "true",
  };
}

function getTargetFirestoreApp() {
  const existingApp = getApps().find((app) => app.name === TARGET_APP_NAME);
  if (existingApp) {
    return existingApp;
  }

  const config = getTargetFirestoreConfig();

  if (!config.projectId) {
    throw new HttpError(
      500,
      "TARGET_FIRESTORE_PROJECT_ID não foi configurado para o Firestore administrativo.",
    );
  }

  try {
    const options = {
      projectId: config.projectId,
      credential: config.serviceAccount
        ? cert(config.serviceAccount)
        : applicationDefault(),
    };

    return initializeApp(options, TARGET_APP_NAME);
  } catch (error) {
    throw new HttpError(
      500,
      `Não foi possível inicializar o Firestore do projeto alvo (${config.projectId}).`,
    );
  }
}

function getFirestoreDbFromApp(app, disableEmulator) {
  if (!disableEmulator) {
    return getFirestore(app);
  }

  const savedEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const savedFirestoreHost = process.env.FIRESTORE_HOST;

  try {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.FIRESTORE_HOST = PRODUCTION_FIRESTORE_HOST;
    return getFirestore(app);
  } finally {
    if (savedEmulatorHost) {
      process.env.FIRESTORE_EMULATOR_HOST = savedEmulatorHost;
    } else {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    }

    if (savedFirestoreHost) {
      process.env.FIRESTORE_HOST = savedFirestoreHost;
    } else {
      delete process.env.FIRESTORE_HOST;
    }
  }
}

function getTargetFirestoreDb() {
  const app = getTargetFirestoreApp();
  const config = getTargetFirestoreConfig();
  return getFirestoreDbFromApp(app, config.disableEmulator);
}

function normalizeLookupTarget(target, index) {
  const appKey = String(target?.appKey || "").trim();
  const label = String(target?.label || appKey || `Rifa ${index + 1}`).trim();
  const projectId = String(target?.projectId || "").trim();
  const collection = String(target?.collection || "raffles").trim();
  const matchField = String(target?.matchField || "").trim();
  const buyersCollection = String(target?.buyersCollection || "buyers").trim();
  const reservedBuyersCollection = String(
    target?.reservedBuyersCollection || "reservedBuyers",
  ).trim();

  if (!appKey) {
    throw new HttpError(500, "RIFA_LOOKUP_TARGETS contém appKey vazio.");
  }
  if (!projectId) {
    throw new HttpError(500, `Projeto Firebase ausente para ${appKey}.`);
  }
  if (!collection) {
    throw new HttpError(500, `Coleção Firestore ausente para ${appKey}.`);
  }
  if (!buyersCollection) {
    throw new HttpError(500, `Coleção de compradores ausente para ${appKey}.`);
  }
  if (!reservedBuyersCollection) {
    throw new HttpError(500, `Coleção de reservados ausente para ${appKey}.`);
  }

  return {
    appKey,
    label,
    projectId,
    collection,
    matchField,
    buyersCollection,
    reservedBuyersCollection,
  };
}

function parseRifaLookupTargetsJson(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error("RIFA_LOOKUP_TARGETS deve ser um array.");
    }
    return parsed.map(normalizeLookupTarget);
  } catch (error) {
    throw new HttpError(500, "RIFA_LOOKUP_TARGETS contém JSON inválido.");
  }
}

function buildLegacySingleRifaLookupTarget() {
  const target = getTargetFirestoreConfig();
  const projectId = String(
    process.env.RIFA_LOOKUP_PROJECT_ID || target.projectId || "",
  ).trim();
  const collection = String(process.env.RIFA_LOOKUP_COLLECTION || "raffles").trim();
  const matchField = String(process.env.RIFA_LOOKUP_MATCH_FIELD || "").trim();

  if (!projectId) {
    throw new HttpError(
      500,
      "Defina TARGET_FIRESTORE_PROJECT_ID ou RIFA_LOOKUP_PROJECT_ID para consultar rifas.",
    );
  }

  if (!collection) {
    throw new HttpError(500, "RIFA_LOOKUP_COLLECTION não pode ser vazio.");
  }

  return [
    normalizeLookupTarget({
      appKey: process.env.RIFA_LOOKUP_APP_KEY || "rifa-facil",
      label: process.env.RIFA_LOOKUP_LABEL || "Rifa Facil",
      projectId,
      collection,
      matchField,
    }, 0),
  ];
}

/**
 * Projetos e coleções consultados pela rota GET /rifa/:id.
 * Por padrão consulta Rifa Facil e Rifa Digital na coleção "raffles", por documentId.
 */
function getRifaLookupTargets() {
  const configuredTargets = parseRifaLookupTargetsJson(process.env.RIFA_LOOKUP_TARGETS);
  if (configuredTargets) {
    return configuredTargets;
  }

  if (
    process.env.RIFA_LOOKUP_PROJECT_ID ||
    process.env.RIFA_LOOKUP_COLLECTION ||
    process.env.RIFA_LOOKUP_APP_KEY ||
    process.env.RIFA_LOOKUP_LABEL
  ) {
    return buildLegacySingleRifaLookupTarget();
  }

  return DEFAULT_RIFA_LOOKUP_TARGETS.map(normalizeLookupTarget);
}

function getRifaLookupConfig() {
  return getRifaLookupTargets()[0];
}

function resolveRifaLookupTarget(appKey) {
  const normalized = String(appKey || "").trim();
  const targets = getRifaLookupTargets();
  if (!normalized) {
    if (targets.length === 1) {
      return targets[0];
    }
    throw new HttpError(400, "Informe o app da rifa.");
  }

  const target = targets.find((candidate) => candidate.appKey === normalized);
  if (!target) {
    throw new HttpError(400, "App da rifa inválido.", {
      appKey: normalized,
      allowedAppKeys: targets.map((candidate) => candidate.appKey),
    });
  }

  return target;
}

function getRifaLookupFirestoreApp(target) {
  const targetConfig = getTargetFirestoreConfig();
  const { appKey, projectId } = target || getRifaLookupConfig();

  if (projectId === targetConfig.projectId) {
    return getTargetFirestoreApp();
  }

  const appName = `${RIFA_LOOKUP_APP_PREFIX}-${appKey}`;
  const existingApp = getApps().find((app) => app.name === appName);
  if (existingApp) {
    return existingApp;
  }

  if (!targetConfig.projectId) {
    throw new HttpError(
      500,
      "TARGET_FIRESTORE_PROJECT_ID é obrigatório para credenciais do Firestore.",
    );
  }

  getTargetFirestoreApp();

  try {
    const options = {
      projectId,
      credential: targetConfig.serviceAccount
        ? cert(targetConfig.serviceAccount)
        : applicationDefault(),
    };

    return initializeApp(options, appName);
  } catch (error) {
    throw new HttpError(
      500,
      `Não foi possível inicializar o Firestore de consulta de rifas (${projectId}).`,
    );
  }
}

function getRifaLookupFirestoreDb(target) {
  const app = getRifaLookupFirestoreApp(target);
  const config = getTargetFirestoreConfig();
  return getFirestoreDbFromApp(app, config.disableEmulator);
}

/**
 * Fonte da verdade no Firestore (contrato compartilhado com o app de rifas):
 * - Estado de liberação: um booleano no campo configurável (padrão `unlocked`).
 *   Legado: alguns docs podem ter só `isUnlocked` ou só `blocked`; o backoffice
 *   grava o campo canônico (`RIFA_UNLOCKED_FIELD` / SUPPORT_RAFFLE_UNLOCKED_FIELD)
 *   e, se mirror ativo, também `blocked` para manter leituras antigas alinhadas.
 * - Desbloqueio pelo suporte: `unlockReason: "support"` (nunca valores tipo EXTERNAL_UNLOCK).
 *
 * Prioridade de env (primeiro valor não vazio vence):
 * - Campo booleano principal: RIFA_UNLOCKED_FIELD, depois SUPPORT_RAFFLE_UNLOCKED_FIELD
 *   (espelho de functions.config support.raffle_unlocked_field no app, mapeado para env no deploy).
 * - Espelhar blocked: RIFA_MIRROR_BLOCKED_FIELD, depois SUPPORT_MIRROR_BLOCKED_FIELD
 *   (espelho de support.mirror_blocked_field).
 */
function pickFirstNonEmptyString(...candidates) {
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) {
      return s;
    }
  }
  return "";
}

function resolveMirrorBlockedEnv() {
  const keys = ["RIFA_MIRROR_BLOCKED_FIELD", "SUPPORT_MIRROR_BLOCKED_FIELD"];
  for (const key of keys) {
    const v = String(process.env[key] || "").trim().toLowerCase();
    if (v === "true") {
      return true;
    }
    if (v === "false") {
      return false;
    }
  }
  return false;
}

function getRifaLockWriteConfig() {
  const unlockedField =
    pickFirstNonEmptyString(process.env.RIFA_UNLOCKED_FIELD, process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD) ||
    "unlocked";
  const mirrorBlocked = resolveMirrorBlockedEnv();

  return { unlockedField, mirrorBlocked };
}

module.exports = {
  getTargetFirestoreConfig,
  getTargetFirestoreDb,
  getRifaLookupConfig,
  getRifaLookupTargets,
  resolveRifaLookupTarget,
  getRifaLookupFirestoreDb,
  getRifaLockWriteConfig,
};
