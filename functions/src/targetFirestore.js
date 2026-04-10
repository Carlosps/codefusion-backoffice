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

module.exports = {
  getTargetFirestoreConfig,
  getTargetFirestoreDb,
  getRifaLookupConfig,
  getRifaLookupFirestoreDb,
};
