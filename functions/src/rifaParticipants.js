const DEFAULT_BUYERS_COLLECTION = "buyers";
const DEFAULT_RESERVED_BUYERS_COLLECTION = "reservedBuyers";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickField(source, fields) {
  if (!isPlainObject(source)) {
    return "";
  }

  for (const field of fields) {
    const value = source[field];
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function normalizeNumbersValue(value) {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeNumbersValue);
  }

  if (isPlainObject(value)) {
    const nested = pickField(value, [
      "number",
      "Number",
      "numero",
      "Numero",
      "num",
      "value",
      "Value",
      "label",
      "Label",
      "ticket",
      "Ticket",
    ]);
    return nested ? [nested] : [];
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return [];
    }

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        return normalizeNumbersValue(JSON.parse(text));
      } catch {
        // Continua com a separação simples abaixo.
      }
    }

    return text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  return [];
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function getSelectedNumbers(data) {
  if (!isPlainObject(data)) {
    return [];
  }

  const fields = [
    "selectedNumbers",
    "Selected Numbers",
    "selected_numbers",
    "numbers",
    "Numbers",
    "reservedNumbers",
    "Reserved Numbers",
    "purchasedNumbers",
    "Purchased Numbers",
    "tickets",
    "Tickets",
    "number",
    "Number",
    "numeros",
    "Números",
    "Numero",
  ];

  for (const field of fields) {
    const numbers = normalizeNumbersValue(data[field]);
    if (numbers.length) {
      return uniqueValues(numbers);
    }
  }

  return [];
}

function getSortNumber(selectedNumbers) {
  const numericValues = selectedNumbers
    .map((value) => Number(String(value).replace(",", ".")))
    .filter(Number.isFinite);
  if (!numericValues.length) {
    return null;
  }
  return Math.min(...numericValues);
}

function getFullName(data, fallback = "") {
  const fullName = pickField(data, [
    "fullName",
    "Full Name",
    "name",
    "Name",
    "nome",
    "Nome",
    "buyerName",
    "Buyer Name",
    "customerName",
    "Customer Name",
    "userName",
    "User Name",
  ]);

  if (fullName) {
    return fullName;
  }

  const firstName = pickField(data, [
    "firstName",
    "First Name",
    "first_name",
    "firstname",
    "FirstName",
  ]);
  const lastName = pickField(data, [
    "lastName",
    "Last Name",
    "last_name",
    "lastname",
    "LastName",
  ]);
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function getPhone(data) {
  return pickField(data, [
    "phone",
    "Phone",
    "phoneNumber",
    "Phone Number",
    "whatsapp",
    "WhatsApp",
    "telefone",
    "Telefone",
    "mobile",
    "Mobile",
  ]);
}

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return "";
    }
  }

  if (isPlainObject(value)) {
    const seconds = value.seconds ?? value._seconds;
    if (typeof seconds === "number") {
      const millis = seconds * 1000;
      const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
      const date = new Date(millis + Math.floor(Number(nanos) / 1000000));
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).trim() : date.toISOString();
}

function getCreatedAt(data) {
  if (!isPlainObject(data)) {
    return "";
  }

  for (const field of ["createdAt", "Created At", "created_at", "addedAt", "Added At"]) {
    const normalized = normalizeDateValue(data[field]);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function getParticipantReference(entry) {
  if (typeof entry === "string" || typeof entry === "number") {
    const text = String(entry).trim();
    return text ? { id: text, path: text.includes("/") ? text : "" } : { id: "", path: "" };
  }

  if (!isPlainObject(entry)) {
    return { id: "", path: "" };
  }

  const path = pickField(entry, ["path", "_path", "refPath", "referencePath"]);
  const id = pickField(entry, ["id", "_id", "docId", "documentId", "uid"]);
  const pathId = path ? path.split("/").filter(Boolean).pop() || "" : "";
  return { id: id || pathId, path };
}

function getPartialParticipantData(entry) {
  if (!isPlainObject(entry)) {
    return {};
  }

  const ignoredRefOnlyFields = new Set(["id", "_id", "docId", "documentId", "path", "_path"]);
  return Object.entries(entry).some(([key]) => !ignoredRefOnlyFields.has(key)) ? entry : {};
}

async function fetchParticipantDoc(db, collectionName, ref) {
  if (!ref.id && !ref.path) {
    return null;
  }

  const snap = ref.path && typeof db.doc === "function"
    ? await db.doc(ref.path).get()
    : await db.collection(collectionName).doc(ref.id).get();

  if (!snap?.exists) {
    return null;
  }

  return {
    id: snap.id || ref.id,
    data: snap.data() || {},
  };
}

function normalizeParticipant(entry, options = {}) {
  const ref = getParticipantReference(entry);
  const data = options.data || getPartialParticipantData(entry);
  const id = options.id || ref.id || "";
  const fallbackName = options.fallbackName || id || "Participante";
  const selectedNumbers = getSelectedNumbers(data);

  return {
    id,
    fullName: getFullName(data, fallbackName),
    phone: getPhone(data),
    createdAt: getCreatedAt(data),
    selectedNumbers,
    sortNumber: getSortNumber(selectedNumbers),
  };
}

function sortParticipants(participants) {
  return [...participants].sort((a, b) => {
    const aSort = a.sortNumber === null ? Number.POSITIVE_INFINITY : a.sortNumber;
    const bSort = b.sortNumber === null ? Number.POSITIVE_INFINITY : b.sortNumber;
    if (aSort !== bSort) {
      return aSort - bSort;
    }
    return String(a.fullName || "").localeCompare(String(b.fullName || ""), "pt-BR");
  });
}

function serializeParticipantError(kind, target, collectionName, error) {
  return {
    kind,
    appKey: target?.appKey || "",
    collection: collectionName,
    code: error?.code || error?.status || null,
    message:
      kind === "buyers"
        ? "Não foi possível carregar compradores."
        : "Não foi possível carregar reservas.",
  };
}

async function enrichParticipantList({
  db,
  target,
  entries,
  collectionName,
  kind,
}) {
  const participants = [];
  const input = Array.isArray(entries) ? entries : [];

  for (const entry of input) {
    const ref = getParticipantReference(entry);
    const partialData = getPartialParticipantData(entry);
    const fetched = await fetchParticipantDoc(db, collectionName, ref);

    participants.push(
      normalizeParticipant(entry, {
        id: fetched?.id || ref.id,
        data: fetched?.data || partialData,
        fallbackName: ref.id || (kind === "buyers" ? "Comprador" : "Reservado"),
      }),
    );
  }

  return {
    participants: sortParticipants(participants),
    error: null,
  };
}

async function buildRifaParticipantDetails({ db, target, data }) {
  const buyersCollection = target?.buyersCollection || DEFAULT_BUYERS_COLLECTION;
  const reservedBuyersCollection =
    target?.reservedBuyersCollection || DEFAULT_RESERVED_BUYERS_COLLECTION;
  const result = {
    buyers: [],
    reservedBuyers: [],
    partialErrors: [],
  };

  try {
    const buyers = await enrichParticipantList({
      db,
      target,
      entries: data?.buyers,
      collectionName: buyersCollection,
      kind: "buyers",
    });
    result.buyers = buyers.participants;
  } catch (error) {
    result.partialErrors.push(serializeParticipantError("buyers", target, buyersCollection, error));
  }

  try {
    const reservedBuyers = await enrichParticipantList({
      db,
      target,
      entries: data?.reservedBuyers,
      collectionName: reservedBuyersCollection,
      kind: "reservedBuyers",
    });
    result.reservedBuyers = reservedBuyers.participants;
  } catch (error) {
    result.partialErrors.push(
      serializeParticipantError("reservedBuyers", target, reservedBuyersCollection, error),
    );
  }

  return result;
}

module.exports = {
  DEFAULT_BUYERS_COLLECTION,
  DEFAULT_RESERVED_BUYERS_COLLECTION,
  normalizeNumbersValue,
  getParticipantReference,
  normalizeParticipant,
  sortParticipants,
  enrichParticipantList,
  buildRifaParticipantDetails,
};
