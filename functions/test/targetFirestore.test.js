const test = require("node:test");
const assert = require("node:assert/strict");

const { HttpError } = require("../src/errors");
const {
  getTargetFirestoreConfig,
  getRifaLookupConfig,
} = require("../src/targetFirestore");

test("getTargetFirestoreConfig reads project id and keeps service account optional", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;

  const config = getTargetFirestoreConfig();

  assert.equal(config.projectId, "rifa-73864");
  assert.equal(config.serviceAccount, null);
});

test("getTargetFirestoreConfig normalizes multiline private keys", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: "rifa-73864",
    client_email: "service-account@example.com",
    private_key: "line-1\\nline-2",
  });

  const config = getTargetFirestoreConfig();

  assert.equal(config.serviceAccount.private_key, "line-1\nline-2");
});

test("getTargetFirestoreConfig rejects invalid JSON", () => {
  process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON = "{invalid";

  assert.throws(() => getTargetFirestoreConfig(), (error) => {
    assert.ok(error instanceof HttpError);
    assert.match(error.message, /JSON invalido/);
    return true;
  });
});

test("getRifaLookupConfig defaults to target project and raffles collection", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  delete process.env.RIFA_LOOKUP_PROJECT_ID;
  delete process.env.RIFA_LOOKUP_COLLECTION;

  const config = getRifaLookupConfig();

  assert.equal(config.projectId, "rifa-73864");
  assert.equal(config.collection, "raffles");
  assert.equal(config.matchField, "");
});

test("getRifaLookupConfig respects overrides", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  process.env.RIFA_LOOKUP_PROJECT_ID = "rifa-digital-f21e7";
  process.env.RIFA_LOOKUP_COLLECTION = "rifas";
  process.env.RIFA_LOOKUP_MATCH_FIELD = "rifaId";

  const config = getRifaLookupConfig();

  assert.equal(config.projectId, "rifa-digital-f21e7");
  assert.equal(config.collection, "rifas");
  assert.equal(config.matchField, "rifaId");
});

test("getRifaLookupConfig clears matchField when unset", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  delete process.env.RIFA_LOOKUP_PROJECT_ID;
  delete process.env.RIFA_LOOKUP_COLLECTION;
  delete process.env.RIFA_LOOKUP_MATCH_FIELD;

  const config = getRifaLookupConfig();

  assert.equal(config.matchField, "");
});
