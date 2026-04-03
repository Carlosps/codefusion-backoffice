const test = require("node:test");
const assert = require("node:assert/strict");

const { HttpError } = require("../src/errors");
const { getTargetFirestoreConfig } = require("../src/targetFirestore");

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
