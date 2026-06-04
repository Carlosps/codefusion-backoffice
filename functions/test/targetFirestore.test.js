const test = require("node:test");
const assert = require("node:assert/strict");

const { HttpError } = require("../src/errors");
const {
  getTargetFirestoreConfig,
  getRifaLookupConfig,
  getRifaLookupTargets,
  resolveRifaLookupTarget,
  getRifaLockWriteConfig,
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

test("getRifaLookupTargets defaults to Rifa Facil and Rifa Digital", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  delete process.env.RIFA_LOOKUP_PROJECT_ID;
  delete process.env.RIFA_LOOKUP_COLLECTION;
  delete process.env.RIFA_LOOKUP_MATCH_FIELD;
  delete process.env.RIFA_LOOKUP_TARGETS;

  const targets = getRifaLookupTargets();

  assert.deepEqual(
    targets.map(({ appKey, label, projectId, collection, matchField }) => ({
      appKey,
      label,
      projectId,
      collection,
      matchField,
    })),
    [
      {
        appKey: "rifa-facil",
        label: "Rifa Facil",
        projectId: "rifa-73864",
        collection: "raffles",
        matchField: "",
      },
      {
        appKey: "rifa-digital",
        label: "Rifa Digital",
        projectId: "rifa-digital-f21e7",
        collection: "raffles",
        matchField: "",
      },
    ],
  );
});

test("getRifaLookupConfig returns first configured target for compatibility", () => {
  delete process.env.RIFA_LOOKUP_TARGETS;
  delete process.env.RIFA_LOOKUP_PROJECT_ID;
  delete process.env.RIFA_LOOKUP_COLLECTION;
  delete process.env.RIFA_LOOKUP_MATCH_FIELD;

  const config = getRifaLookupConfig();

  assert.equal(config.projectId, "rifa-73864");
  assert.equal(config.collection, "raffles");
  assert.equal(config.appKey, "rifa-facil");
});

test("getRifaLookupTargets respects JSON overrides", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  delete process.env.RIFA_LOOKUP_PROJECT_ID;
  delete process.env.RIFA_LOOKUP_COLLECTION;
  delete process.env.RIFA_LOOKUP_MATCH_FIELD;
  process.env.RIFA_LOOKUP_TARGETS = JSON.stringify([
    {
      appKey: "custom",
      label: "Custom App",
      projectId: "custom-project",
      collection: "customRaffles",
      matchField: "rifaId",
    },
  ]);

  const targets = getRifaLookupTargets();

  assert.equal(targets.length, 1);
  assert.equal(targets[0].appKey, "custom");
  assert.equal(targets[0].label, "Custom App");
  assert.equal(targets[0].projectId, "custom-project");
  assert.equal(targets[0].collection, "customRaffles");
  assert.equal(targets[0].matchField, "rifaId");

  delete process.env.RIFA_LOOKUP_TARGETS;
});

test("getRifaLookupTargets keeps legacy match field override", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  process.env.RIFA_LOOKUP_PROJECT_ID = "rifa-digital-f21e7";
  process.env.RIFA_LOOKUP_COLLECTION = "rifas";
  process.env.RIFA_LOOKUP_MATCH_FIELD = "id";
  delete process.env.RIFA_LOOKUP_TARGETS;

  const targets = getRifaLookupTargets();

  assert.equal(targets.length, 1);
  assert.equal(targets[0].projectId, "rifa-digital-f21e7");
  assert.equal(targets[0].collection, "rifas");
  assert.equal(targets[0].matchField, "id");
});

test("resolveRifaLookupTarget keeps empty appKey compatible for single target config", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  process.env.RIFA_LOOKUP_PROJECT_ID = "rifa-digital-f21e7";
  delete process.env.RIFA_LOOKUP_COLLECTION;
  delete process.env.RIFA_LOOKUP_MATCH_FIELD;
  delete process.env.RIFA_LOOKUP_TARGETS;

  const target = resolveRifaLookupTarget("");

  assert.equal(target.appKey, "rifa-facil");
  assert.equal(target.projectId, "rifa-digital-f21e7");
});

test("resolveRifaLookupTarget rejects invalid appKey", () => {
  process.env.TARGET_FIRESTORE_PROJECT_ID = "rifa-73864";
  delete process.env.TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON;
  delete process.env.RIFA_LOOKUP_PROJECT_ID;
  delete process.env.RIFA_LOOKUP_COLLECTION;
  delete process.env.RIFA_LOOKUP_TARGETS;

  assert.throws(() => resolveRifaLookupTarget("desconhecido"), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    assert.match(error.message, /App da rifa invalido/);
    assert.deepEqual(error.details.allowedAppKeys, ["rifa-facil", "rifa-digital"]);
    return true;
  });
});

test("resolveRifaLookupTarget returns only allowed server-side targets", () => {
  delete process.env.RIFA_LOOKUP_PROJECT_ID;
  delete process.env.RIFA_LOOKUP_COLLECTION;
  delete process.env.RIFA_LOOKUP_TARGETS;

  const target = resolveRifaLookupTarget("rifa-digital");

  assert.equal(target.appKey, "rifa-digital");
  assert.equal(target.projectId, "rifa-digital-f21e7");
  assert.equal(target.collection, "raffles");
});

test("getRifaLockWriteConfig defaults unlocked field and no blocked mirror", () => {
  delete process.env.RIFA_UNLOCKED_FIELD;
  delete process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD;
  delete process.env.RIFA_MIRROR_BLOCKED_FIELD;
  delete process.env.SUPPORT_MIRROR_BLOCKED_FIELD;

  const config = getRifaLockWriteConfig();

  assert.equal(config.unlockedField, "unlocked");
  assert.equal(config.mirrorBlocked, false);
});

test("getRifaLockWriteConfig respects env overrides", () => {
  delete process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD;
  delete process.env.SUPPORT_MIRROR_BLOCKED_FIELD;
  process.env.RIFA_UNLOCKED_FIELD = "isUnlocked";
  process.env.RIFA_MIRROR_BLOCKED_FIELD = "true";

  const config = getRifaLockWriteConfig();

  assert.equal(config.unlockedField, "isUnlocked");
  assert.equal(config.mirrorBlocked, true);

  delete process.env.RIFA_UNLOCKED_FIELD;
  delete process.env.RIFA_MIRROR_BLOCKED_FIELD;
});

test("getRifaLockWriteConfig prefers RIFA_UNLOCKED_FIELD over SUPPORT_RAFFLE_UNLOCKED_FIELD", () => {
  process.env.RIFA_UNLOCKED_FIELD = "unlocked";
  process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD = "isUnlocked";
  delete process.env.RIFA_MIRROR_BLOCKED_FIELD;
  delete process.env.SUPPORT_MIRROR_BLOCKED_FIELD;

  const config = getRifaLockWriteConfig();

  assert.equal(config.unlockedField, "unlocked");

  delete process.env.RIFA_UNLOCKED_FIELD;
  delete process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD;
});

test("getRifaLockWriteConfig falls back to SUPPORT_RAFFLE_UNLOCKED_FIELD", () => {
  delete process.env.RIFA_UNLOCKED_FIELD;
  process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD = "isUnlocked";
  delete process.env.RIFA_MIRROR_BLOCKED_FIELD;
  delete process.env.SUPPORT_MIRROR_BLOCKED_FIELD;

  const config = getRifaLockWriteConfig();

  assert.equal(config.unlockedField, "isUnlocked");

  delete process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD;
});

test("getRifaLockWriteConfig mirror from SUPPORT_MIRROR_BLOCKED_FIELD", () => {
  delete process.env.RIFA_UNLOCKED_FIELD;
  delete process.env.SUPPORT_RAFFLE_UNLOCKED_FIELD;
  delete process.env.RIFA_MIRROR_BLOCKED_FIELD;
  process.env.SUPPORT_MIRROR_BLOCKED_FIELD = "true";

  const config = getRifaLockWriteConfig();

  assert.equal(config.mirrorBlocked, true);

  delete process.env.SUPPORT_MIRROR_BLOCKED_FIELD;
});

test("getRifaLockWriteConfig RIFA_MIRROR_BLOCKED_FIELD=false overrides SUPPORT true", () => {
  process.env.RIFA_MIRROR_BLOCKED_FIELD = "false";
  process.env.SUPPORT_MIRROR_BLOCKED_FIELD = "true";

  const config = getRifaLockWriteConfig();

  assert.equal(config.mirrorBlocked, false);

  delete process.env.RIFA_MIRROR_BLOCKED_FIELD;
  delete process.env.SUPPORT_MIRROR_BLOCKED_FIELD;
});
