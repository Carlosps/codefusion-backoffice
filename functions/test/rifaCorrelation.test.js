const test = require("node:test");
const assert = require("node:assert/strict");

const { HttpError } = require("../src/errors");
const {
  normalizeRifaCorrelationEmail,
  getRifaEmailLookupValues,
  getEmailFromMatches,
  dedupeRelatedRifas,
  classifyRifaCorrelation,
  findRifasByEmail,
  buildRifaEmailCorrelationFromMatches,
  assertEmailCorrelationHasResults,
} = require("../src/rifaCorrelation");

const targets = [
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
    matchField: "rifaId",
  },
];

function makeDoc(id, data) {
  return {
    id,
    data: () => data,
  };
}

function makeDb(docsByApp, calls = []) {
  return (target) => ({
    collection(collectionName) {
      assert.equal(collectionName, target.collection);
      return {
        where(field, operator, value) {
          calls.push({ appKey: target.appKey, field, operator, value });
          return {
            limit(limitValue) {
              calls[calls.length - 1].limit = limitValue;
              return {
                async get() {
                  const value = docsByApp[target.appKey];
                  if (value instanceof Error) {
                    throw value;
                  }
                  return { docs: value || [] };
                },
              };
            },
          };
        },
      };
    },
  });
}

function makeDbByField(docsByAppAndField, calls = []) {
  return (target) => ({
    collection(collectionName) {
      assert.equal(collectionName, target.collection);
      return {
        where(field, operator, value) {
          calls.push({ appKey: target.appKey, field, operator, value });
          return {
            limit(limitValue) {
              calls[calls.length - 1].limit = limitValue;
              return {
                async get() {
                  const valueByField = docsByAppAndField[target.appKey] || {};
                  const docs = valueByField[`${field}:${value}`] || [];
                  return { docs };
                },
              };
            },
          };
        },
      };
    },
  });
}

function serialize(value) {
  return value;
}

function serializeTarget(target) {
  return {
    appKey: target.appKey,
    label: target.label,
    projectId: target.projectId,
    collection: target.collection,
    matchField: target.matchField || null,
  };
}

function isPermissionError(error) {
  return error?.code === 7 || error?.code === "PERMISSION_DENIED";
}

test("normalizeRifaCorrelationEmail trims and lowercases valid email", () => {
  assert.equal(normalizeRifaCorrelationEmail("  Cliente@Example.COM  "), "cliente@example.com");
});

test("normalizeRifaCorrelationEmail rejects invalid email", () => {
  assert.throws(() => normalizeRifaCorrelationEmail("email-invalido"), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    return true;
  });
});

test("getRifaEmailLookupValues keeps normalized and original legacy casing", () => {
  assert.deepEqual(getRifaEmailLookupValues(" Cliente@Example.COM "), [
    "cliente@example.com",
    "Cliente@Example.COM",
  ]);
  assert.deepEqual(getRifaEmailLookupValues("cliente@example.com"), ["cliente@example.com"]);
});

test("getEmailFromMatches extracts first valid email and ignores invalid legacy values", () => {
  const email = getEmailFromMatches([
    { data: { email: "sem-arroba" } },
    { data: { email: " Pessoa@Example.com " } },
  ]);

  assert.equal(email, "pessoa@example.com");
});

test("classifyRifaCorrelation handles unknown, single and recurring", () => {
  assert.equal(classifyRifaCorrelation(0, null), "unknown");
  assert.equal(classifyRifaCorrelation(1, "cliente@example.com"), "single");
  assert.equal(classifyRifaCorrelation(2, "cliente@example.com"), "recurring");
});

test("dedupeRelatedRifas removes repeated app and document pairs", () => {
  const result = dedupeRelatedRifas([
    { appKey: "rifa-facil", firestoreDocumentId: "a" },
    { appKey: "rifa-facil", firestoreDocumentId: "a" },
    { appKey: "rifa-digital", firestoreDocumentId: "a" },
  ]);

  assert.deepEqual(result.map((item) => `${item.appKey}:${item.firestoreDocumentId}`), [
    "rifa-facil:a",
    "rifa-digital:a",
  ]);
});

test("findRifasByEmail aggregates apps, infers ids, counts and respects limit", async () => {
  const calls = [];
  const result = await findRifasByEmail({
    email: " Cliente@Example.COM ",
    targets,
    getDb: makeDb(
      {
        "rifa-facil": [makeDoc("doc-1", { email: "cliente@example.com", title: "A" })],
        "rifa-digital": [makeDoc("doc-2", { email: "cliente@example.com", rifaId: "public-2" })],
      },
      calls,
    ),
    serializeFirestoreValue: serialize,
    isPermissionError,
    serializeTarget,
    limit: 7,
  });

  assert.equal(result.email, "cliente@example.com");
  assert.equal(result.status, "recurring");
  assert.equal(result.total, 2);
  assert.deepEqual(result.countsByApp, [
    { appKey: "rifa-facil", label: "Rifa Facil", count: 1 },
    { appKey: "rifa-digital", label: "Rifa Digital", count: 1 },
  ]);
  assert.deepEqual(result.matches.map((match) => match.rifaId), ["doc-1", "public-2"]);
  assert.deepEqual(calls.map((call) => call.limit), [7, 7, 7, 7, 7, 7]);
});

test("findRifasByEmail searches normalized field and legacy email casing", async () => {
  const calls = [];
  const result = await findRifasByEmail({
    email: " Cliente@Example.COM ",
    targets: [targets[0]],
    getDb: makeDbByField(
      {
        "rifa-facil": {
          "emailNormalized:cliente@example.com": [
            makeDoc("doc-normalized", {
              email: "Cliente@Example.COM",
              emailNormalized: "cliente@example.com",
            }),
          ],
          "email:Cliente@Example.COM": [
            makeDoc("doc-legacy", { email: "Cliente@Example.COM" }),
          ],
        },
      },
      calls,
    ),
    serializeFirestoreValue: serialize,
    isPermissionError,
    serializeTarget,
    limit: 7,
  });

  assert.equal(result.total, 2);
  assert.deepEqual(
    result.matches.map((match) => match.firestoreDocumentId),
    ["doc-normalized", "doc-legacy"],
  );
  assert.deepEqual(
    calls.map((call) => `${call.field}:${call.value}`),
    [
      "emailNormalized:cliente@example.com",
      "email:cliente@example.com",
      "email:Cliente@Example.COM",
    ],
  );
});

test("findRifasByEmail keeps permission errors partial when another app returns data", async () => {
  const denied = Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" });
  const result = await findRifasByEmail({
    email: "cliente@example.com",
    targets,
    getDb: makeDb({
      "rifa-facil": [makeDoc("doc-1", { email: "cliente@example.com" })],
      "rifa-digital": denied,
    }),
    serializeFirestoreValue: serialize,
    isPermissionError,
    serializeTarget,
  });

  assert.equal(result.status, "single");
  assert.equal(result.total, 1);
  assert.equal(result.partialErrors.length, 1);
  assert.equal(result.partialErrors[0].appKey, "rifa-digital");
});

test("buildRifaEmailCorrelationFromMatches keeps current rifa when normalized query misses legacy casing", async () => {
  const result = await buildRifaEmailCorrelationFromMatches({
    matches: [
      {
        appKey: "rifa-facil",
        label: "Rifa Facil",
        projectId: "rifa-73864",
        collection: "raffles",
        firestoreDocumentId: "doc-legacy",
        rifaId: "doc-legacy",
        data: { email: "Cliente@Example.COM" },
      },
    ],
    targets,
    getDb: makeDb({
      "rifa-facil": [],
      "rifa-digital": [],
    }),
    serializeFirestoreValue: serialize,
    isPermissionError,
    serializeTarget,
  });

  assert.equal(result.email, "cliente@example.com");
  assert.equal(result.status, "single");
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].firestoreDocumentId, "doc-legacy");
});

test("buildRifaEmailCorrelationFromMatches dedupes current rifa against query results", async () => {
  const result = await buildRifaEmailCorrelationFromMatches({
    matches: [
      {
        appKey: "rifa-facil",
        label: "Rifa Facil",
        projectId: "rifa-73864",
        collection: "raffles",
        firestoreDocumentId: "doc-1",
        rifaId: "doc-1",
        data: { email: "cliente@example.com" },
      },
    ],
    targets,
    getDb: makeDb({
      "rifa-facil": [makeDoc("doc-1", { email: "cliente@example.com" })],
      "rifa-digital": [],
    }),
    serializeFirestoreValue: serialize,
    isPermissionError,
    serializeTarget,
  });

  assert.equal(result.total, 1);
  assert.equal(result.matches.length, 1);
});

test("assertEmailCorrelationHasResults throws 404 for empty direct email lookup", () => {
  assert.throws(
    () => assertEmailCorrelationHasResults({ email: "cliente@example.com", matches: [] }),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 404);
      assert.match(error.message, /Nenhuma rifa/);
      return true;
    },
  );
});

test("assertEmailCorrelationHasResults throws 403 when empty lookup has permission errors", () => {
  assert.throws(
    () =>
      assertEmailCorrelationHasResults({
        email: "cliente@example.com",
        matches: [],
        partialErrors: [
          {
            appKey: "rifa-digital",
            status: 403,
            message: "Sem permissão para ler rifas neste projeto.",
          },
        ],
      }),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 403);
      assert.match(error.message, /consultar rifas/);
      return true;
    },
  );
});
