const test = require("node:test");
const assert = require("node:assert/strict");

const { getPathSegments } = require("../src/http");

test("getPathSegments keeps direct api paths unchanged", () => {
  assert.deepEqual(getPathSegments({ path: "/auth/session" }), ["auth", "session"]);
});

test("getPathSegments removes hosting api prefix", () => {
  assert.deepEqual(getPathSegments({ path: "/api/auth/session" }), ["auth", "session"]);
});

test("getPathSegments removes emulator function prefix", () => {
  assert.deepEqual(
    getPathSegments({ path: "/backoffice-code-fusion/southamerica-east1/api/auth/session" }),
    ["auth", "session"],
  );
});

test("getPathSegments keeps nested revenuecat route after removing prefix", () => {
  assert.deepEqual(
    getPathSegments({ path: "/api/revenuecat/projects/ios-main/customer/user_123" }),
    ["revenuecat", "projects", "ios-main", "customer", "user_123"],
  );
});
