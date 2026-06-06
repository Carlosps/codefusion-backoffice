const test = require("node:test");
const assert = require("node:assert/strict");

const { applyCors, getAllowedOrigins, parseAllowedOrigins } = require("../src/cors");

function withAllowedOrigins(value, fn) {
  const previous = process.env.BACKOFFICE_ALLOWED_ORIGINS;
  if (value === undefined) {
    delete process.env.BACKOFFICE_ALLOWED_ORIGINS;
  } else {
    process.env.BACKOFFICE_ALLOWED_ORIGINS = value;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.BACKOFFICE_ALLOWED_ORIGINS;
    } else {
      process.env.BACKOFFICE_ALLOWED_ORIGINS = previous;
    }
  }
}

function createResponseRecorder() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

test("parseAllowedOrigins trims comma-separated origins", () => {
  assert.deepEqual(
    parseAllowedOrigins(" https://a.test, ,https://b.test "),
    ["https://a.test", "https://b.test"],
  );
});

test("getAllowedOrigins includes current Firebase Hosting domain by default", () => {
  withAllowedOrigins(undefined, () => {
    assert.ok(getAllowedOrigins().includes("https://code-fusion-backoffice.web.app"));
    assert.ok(getAllowedOrigins().includes("https://code-fusion-backoffice.firebaseapp.com"));
  });
});

test("applyCors allows current Firebase Hosting origin", () => {
  withAllowedOrigins(undefined, () => {
    const res = createResponseRecorder();
    const result = applyCors(
      { headers: { origin: "https://code-fusion-backoffice.web.app" } },
      res,
    );

    assert.deepEqual(result, {
      origin: "https://code-fusion-backoffice.web.app",
      allowed: true,
    });
    assert.equal(
      res.headers["Access-Control-Allow-Origin"],
      "https://code-fusion-backoffice.web.app",
    );
  });
});

test("applyCors rejects unknown origins", () => {
  withAllowedOrigins(undefined, () => {
    const res = createResponseRecorder();
    const result = applyCors(
      { headers: { origin: "https://unknown.example.com" } },
      res,
    );

    assert.deepEqual(result, {
      origin: "https://unknown.example.com",
      allowed: false,
    });
    assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
  });
});
