const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const { HttpError } = require("./errors");

const TARGET_APP_NAME = "target-firestore";
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

function getTargetFirestoreDb() {
  const app = getTargetFirestoreApp();
  const config = getTargetFirestoreConfig();

  if (!config.disableEmulator) {
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

module.exports = {
  getTargetFirestoreConfig,
  getTargetFirestoreDb,
};
