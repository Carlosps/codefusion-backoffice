const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFirestoreAdminConfig,
  validateAmount,
  validateUpdatePayload,
} = require("../src/firestoreAdmin");

test("getFirestoreAdminConfig reads defaults", () => {
  delete process.env.TARGET_FIRESTORE_PROJECT_ID;
  delete process.env.FIRESTORE_USERS_COLLECTION;
  delete process.env.FIRESTORE_CREDIT_FIELD;
  delete process.env.FIRESTORE_ALLOWED_UPDATE_FIELDS;

  const config = getFirestoreAdminConfig();

  assert.equal(config.targetProjectId, "");
  assert.equal(config.usersCollection, "users");
  assert.equal(config.creditField, "credits");
  assert.deepEqual(config.allowedUpdateFields, []);
});

test("validateAmount accepts positive number", () => {
  process.env.FIRESTORE_MAX_CREDIT_DELTA = "100";
  assert.equal(validateAmount(5), 5);
});

test("validateUpdatePayload rejects fields outside allowlist", () => {
  process.env.FIRESTORE_ALLOWED_UPDATE_FIELDS = "supportStatus";

  assert.throws(() => validateUpdatePayload({ credits: 10 }));
});

test("validateUpdatePayload accepts allowlisted fields", () => {
  process.env.FIRESTORE_ALLOWED_UPDATE_FIELDS = "supportStatus,supportNotes.latest";

  const payload = validateUpdatePayload({
    supportStatus: "reviewed",
    "supportNotes.latest": "Checked by support",
  });

  assert.deepEqual(payload, {
    supportStatus: "reviewed",
    "supportNotes.latest": "Checked by support",
  });
});
