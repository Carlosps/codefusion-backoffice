const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const { HttpError } = require("./errors");

const TARGET_APP_NAME = "target-firestore";
const RIFA_LOOKUP_APP_NAME = "rifa-lookup-firestore";
const PRODUCTION_FIRESTORE_HOST = "firestore.googleapis.com";

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
      "TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON contem JSON invalido.",
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
      "TARGET_FIRESTORE_PROJECT_ID nao foi configurado para o Firestore administrativo.",
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
      `Nao foi possivel inicializar o Firestore do projeto alvo (${config.projectId}).`,
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

/**
 * Projeto e coleção usados só na rota GET /rifa/:id.
 * Por padrão: mesmo projeto que TARGET e coleção "raffles".
 */
function getRifaLookupConfig() {
  const target = getTargetFirestoreConfig();
  const projectId = String(
    process.env.RIFA_LOOKUP_PROJECT_ID || target.projectId || "",
  ).trim();
  const collection = String(process.env.RIFA_LOOKUP_COLLECTION || "raffles").trim();

  if (!projectId) {
    throw new HttpError(
      500,
      "Defina TARGET_FIRESTORE_PROJECT_ID ou RIFA_LOOKUP_PROJECT_ID para consultar rifas.",
    );
  }

  if (!collection) {
    throw new HttpError(500, "RIFA_LOOKUP_COLLECTION nao pode ser vazio.");
  }

  const matchField = String(process.env.RIFA_LOOKUP_MATCH_FIELD || "").trim();

  return { projectId, collection, matchField };
}

function getRifaLookupFirestoreApp() {
  const targetConfig = getTargetFirestoreConfig();
  const { projectId } = getRifaLookupConfig();

  if (projectId === targetConfig.projectId) {
    return getTargetFirestoreApp();
  }

  const existingApp = getApps().find((app) => app.name === RIFA_LOOKUP_APP_NAME);
  if (existingApp) {
    return existingApp;
  }

  if (!targetConfig.projectId) {
    throw new HttpError(
      500,
      "TARGET_FIRESTORE_PROJECT_ID e obrigatorio para credenciais do Firestore.",
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

    return initializeApp(options, RIFA_LOOKUP_APP_NAME);
  } catch (error) {
    throw new HttpError(
      500,
      `Nao foi possivel inicializar o Firestore de consulta de rifas (${projectId}).`,
    );
  }
}

function getRifaLookupFirestoreDb() {
  const app = getRifaLookupFirestoreApp();
  const config = getTargetFirestoreConfig();
  return getFirestoreDbFromApp(app, config.disableEmulator);
}

/**
 * Fonte da verdade no Firestore (contrato compartilhado com o app de rifas):
 * - Estado de liberacao: um booleano no campo configuravel (padrao `unlocked`).
 *   Legado: alguns docs podem ter so `isUnlocked` ou so `blocked`; o backoffice
 *   grava o campo canonico (`RIFA_UNLOCKED_FIELD` / SUPPORT_RAFFLE_UNLOCKED_FIELD)
 *   e, se mirror ativo, tambem `blocked` para manter leituras antigas alinhadas.
 * - Desbloqueio pelo suporte: `unlockReason: "support"` (nunca valores tipo EXTERNAL_UNLOCK).
 *
 * Prioridade de env (primeiro valor nao-vazio vence):
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
  getRifaLookupFirestoreDb,
  getRifaLockWriteConfig,
};
