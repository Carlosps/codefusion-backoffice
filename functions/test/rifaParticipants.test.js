const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getParticipantReference,
  normalizeNumbersValue,
  normalizeParticipant,
  buildRifaParticipantDetails,
} = require("../src/rifaParticipants");

function makeDoc(id, data) {
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  };
}

function makeDb(collections = {}, options = {}) {
  return {
    collection(collectionName) {
      if (options.throwCollections?.includes(collectionName)) {
        throw Object.assign(new Error("permission denied"), {
          code: "PERMISSION_DENIED",
        });
      }

      return {
        doc(id) {
          return {
            async get() {
              return makeDoc(id, collections[collectionName]?.[id] || null);
            },
          };
        },
      };
    },
    doc(path) {
      const parts = String(path || "").split("/").filter(Boolean);
      const id = parts.pop();
      const collectionName = parts.join("/");
      return {
        async get() {
          return makeDoc(id, collections[collectionName]?.[id] || null);
        },
      };
    },
  };
}

test("getParticipantReference supports ids and serialized references", () => {
  assert.deepEqual(getParticipantReference("buyer-1"), {
    id: "buyer-1",
    path: "",
  });
  assert.deepEqual(getParticipantReference({ id: "buyer-2" }), {
    id: "buyer-2",
    path: "",
  });
  assert.deepEqual(getParticipantReference({ path: "buyers/buyer-3" }), {
    id: "buyer-3",
    path: "buyers/buyer-3",
  });
});

test("normalizeParticipant builds name phone selected numbers and sort number", () => {
  const participant = normalizeParticipant(
    { id: "buyer-1" },
    {
      data: {
        firstName: "Ana",
        lastName: "Silva",
        Phone: "+55 85999999999",
        createdAt: { seconds: 1767225600, nanoseconds: 0 },
        selectedNumbers: ["12", "3", "30"],
      },
    },
  );

  assert.deepEqual(participant, {
    id: "buyer-1",
    fullName: "Ana Silva",
    phone: "+55 85999999999",
    createdAt: "2026-01-01T00:00:00.000Z",
    selectedNumbers: ["12", "3", "30"],
    sortNumber: 3,
  });
});

test("normalizeParticipant accepts legacy spaced Firestore field names", () => {
  const participant = normalizeParticipant(
    "reserved-1",
    {
      data: {
        "First Name": "Bruno",
        "Last Name": "Costa",
        "Selected Numbers": "[\"8\", \"2\"]",
      },
    },
  );

  assert.equal(participant.fullName, "Bruno Costa");
  assert.deepEqual(participant.selectedNumbers, ["8", "2"]);
  assert.equal(participant.sortNumber, 2);
});

test("normalizeNumbersValue accepts arrays JSON strings and comma-separated strings", () => {
  assert.deepEqual(normalizeNumbersValue([1, "2", { number: "3" }]), ["1", "2", "3"]);
  assert.deepEqual(normalizeNumbersValue("[4, \"5\"]"), ["4", "5"]);
  assert.deepEqual(normalizeNumbersValue("6, 7,8"), ["6", "7", "8"]);
});

test("buildRifaParticipantDetails reads buyers and reservedBuyers and sorts by selected number", async () => {
  const db = makeDb({
    buyers: {
      "buyer-a": {
        firstName: "Zelia",
        lastName: "Maior",
        phone: "111",
        createdAt: "2026-06-02T10:00:00Z",
        selectedNumbers: ["20", "30"],
      },
      "buyer-b": {
        "First Name": "Ana",
        "Last Name": "Menor",
        Phone: "222",
        createdAt: "2026-06-01T10:00:00Z",
        "Selected Numbers": "3, 10",
      },
    },
    reservedBuyers: {
      "reserved-a": {
        firstName: "Carlos",
        lastName: "Reserva",
        selectedNumbers: ["9"],
      },
    },
  });

  const details = await buildRifaParticipantDetails({
    db,
    target: {
      appKey: "rifa-facil",
      buyersCollection: "buyers",
      reservedBuyersCollection: "reservedBuyers",
    },
    data: {
      buyers: ["buyer-a", { id: "buyer-b" }],
      reservedBuyers: [{ path: "reservedBuyers/reserved-a" }],
    },
  });

  assert.deepEqual(details.partialErrors, []);
  assert.deepEqual(details.buyers.map((buyer) => buyer.id), ["buyer-b", "buyer-a"]);
  assert.deepEqual(details.buyers.map((buyer) => buyer.fullName), ["Ana Menor", "Zelia Maior"]);
  assert.deepEqual(details.buyers.map((buyer) => buyer.createdAt), [
    "2026-06-01T10:00:00.000Z",
    "2026-06-02T10:00:00.000Z",
  ]);
  assert.deepEqual(details.reservedBuyers[0].selectedNumbers, ["9"]);
});

test("buildRifaParticipantDetails returns partial error without throwing list failure", async () => {
  const db = makeDb(
    {
      buyers: {
        "buyer-a": {
          firstName: "Ana",
          selectedNumbers: ["1"],
        },
      },
    },
    { throwCollections: ["reservedBuyers"] },
  );

  const details = await buildRifaParticipantDetails({
    db,
    target: {
      appKey: "rifa-facil",
      buyersCollection: "buyers",
      reservedBuyersCollection: "reservedBuyers",
    },
    data: {
      buyers: ["buyer-a"],
      reservedBuyers: ["reserved-a"],
    },
  });

  assert.equal(details.buyers.length, 1);
  assert.equal(details.reservedBuyers.length, 0);
  assert.equal(details.partialErrors.length, 1);
  assert.equal(details.partialErrors[0].collection, "reservedBuyers");
});
