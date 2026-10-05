const test = require("node:test");
const assert = require("node:assert/strict");
const { Timestamp } = require("firebase-admin/firestore");
const { validateContractAccess, grantContractAccess } = require("../src/contractAccess");

const requestId = "01234567-89ab-cdef-0123-456789abcdef";
const expiresAt = "2099-01-01T00:00:00.000Z";

function fixture(user = { credits: 7, name: "Cliente" }) {
  const docs = new Map(user ? [["users/firebase-uid", user]] : []);
  const db = {
    collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
    runTransaction: async (callback) => {
      const writes = [];
      const result = await callback({
        get: async (ref) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
        set: (ref, value) => writes.push(() => docs.set(ref.path, value)),
        update: (ref, value) => writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...value })),
      });
      writes.forEach((write) => write());
      return result;
    },
  };
  const args = {
    db, appUserId: "firebase-uid", actor: { uid: "admin-uid" },
    grant: { grantKind: "until", expiresAt },
    options: validateContractAccess({ requestId }, "firebase-uid"),
    grantAccess: async (grant) => ({ entitlementId: "pro", expiresAt: grant.expiresAt }),
  };
  return { docs, args };
}

test("contract validation defaults to Plus/10, supports Starter/3 and rejects unsafe input", () => {
  assert.deepEqual(validateContractAccess({ requestId }, "uid"), { planType: "plus", credits: 10, requestId });
  assert.equal(validateContractAccess({ requestId, planType: "starter" }, "uid").credits, 3);
  for (const credits of [-1, 1.5, "10", 10001]) {
    assert.throws(() => validateContractAccess({ requestId, credits }, "uid"));
  }
  assert.throws(() => validateContractAccess({ requestId, planType: "other" }, "uid"));
  assert.throws(() => validateContractAccess({ requestId }, "$RCAnonymousID:test"));
  assert.throws(() => validateContractAccess({ requestId }, "users/uid"));
  assert.throws(() => validateContractAccess({}, "uid"));
});

test("grant activates Firestore plan and adds credits atomically; retry does not grant or credit twice", async () => {
  const { docs, args } = fixture();
  let calls = 0;
  args.grantAccess = async (grant) => {
    calls++;
    return { entitlementId: "pro", expiresAt: grant.expiresAt };
  };
  const result = await grantContractAccess(args);
  const user = docs.get("users/firebase-uid");
  assert.equal(user.credits, 17);
  assert.equal(user.planType, "plus");
  assert.equal(user.planExpiresAt.toDate().toISOString(), expiresAt);
  assert.equal(user.name, "Cliente");
  assert.equal(result.creditsBefore, 7);
  assert.equal(result.creditsAdded, 10);
  assert.equal(docs.get(`credit_logs/support-${requestId}`).status, "completed");
  assert.deepEqual(await grantContractAccess(args), result);
  assert.equal(calls, 1);
  assert.equal(docs.get("users/firebase-uid").credits, 17);
  await assert.rejects(grantContractAccess({ ...args, options: { ...args.options, credits: 3 } }), /outros valores/);
});

test("missing user and corrupt credits stop the grant before RevenueCat", async () => {
  for (const user of [null, { credits: "7" }, { credits: -2 }]) {
    const { args } = fixture(user);
    args.grantAccess = async () => assert.fail("RevenueCat must not be called");
    await assert.rejects(grantContractAccess(args));
  }
});

test("RevenueCat failure leaves credits unchanged and retry completes the reserved grant", async () => {
  const { docs, args } = fixture();
  args.grantAccess = async () => { throw new Error("RevenueCat unavailable"); };
  await assert.rejects(grantContractAccess(args), /unavailable/);
  assert.equal(docs.get("users/firebase-uid").credits, 7);
  assert.equal(docs.get(`credit_logs/support-${requestId}`).status, "pending");
  args.grantAccess = async (grant) => ({ entitlementId: "pro", expiresAt: grant.expiresAt });
  await grantContractAccess(args);
  assert.equal(docs.get("users/firebase-uid").credits, 17);
});

test("Firestore failure after RevenueCat is explicit and can be retried without duplicate credits", async () => {
  const { docs, args } = fixture();
  const run = args.db.runTransaction;
  let calls = 0;
  args.db.runTransaction = async (callback) => {
    if (++calls === 2) throw new Error("Firestore unavailable");
    return run(callback);
  };
  await assert.rejects(grantContractAccess(args), /Pro foi concedido.*Repita/);
  assert.equal(docs.get("users/firebase-uid").credits, 7);
  await grantContractAccess(args);
  await grantContractAccess(args);
  assert.equal(docs.get("users/firebase-uid").credits, 17);
});

test("a shorter promotion preserves the existing plan expiration", async () => {
  const longer = Timestamp.fromDate(new Date("2099-06-01T00:00:00Z"));
  const { docs, args } = fixture({ credits: 2, planExpiresAt: longer });
  await grantContractAccess(args);
  assert.equal(docs.get("users/firebase-uid").planExpiresAt, longer);
});
