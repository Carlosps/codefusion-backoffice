const test = require("node:test");
const assert = require("node:assert/strict");

test("audit module can be imported before firebase-admin initializeApp", () => {
  assert.doesNotThrow(() => require("../src/audit"));
});
