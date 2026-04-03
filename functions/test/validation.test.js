const test = require("node:test");
const assert = require("node:assert/strict");

const { validatePromotionalAccessPayload } = require("../src/validation");

test("validatePromotionalAccessPayload accepts weekly monthly and annual without expiresAt", () => {
  assert.deepEqual(validatePromotionalAccessPayload({ grantKind: "weekly" }), {
    grantKind: "weekly",
    expiresAt: null,
  });

  assert.deepEqual(validatePromotionalAccessPayload({ grantKind: "monthly" }), {
    grantKind: "monthly",
    expiresAt: null,
  });

  assert.deepEqual(validatePromotionalAccessPayload({ grantKind: "annual" }), {
    grantKind: "annual",
    expiresAt: null,
  });
});

test("validatePromotionalAccessPayload normalizes future until date", () => {
  const payload = validatePromotionalAccessPayload(
    {
      grantKind: "until",
      expiresAt: "2026-04-20T23:59:59.999Z",
    },
    Date.parse("2026-04-03T10:00:00.000Z"),
  );

  assert.deepEqual(payload, {
    grantKind: "until",
    expiresAt: "2026-04-20T23:59:59.999Z",
  });
});

test("validatePromotionalAccessPayload rejects invalid combinations", () => {
  assert.throws(() =>
    validatePromotionalAccessPayload({
      grantKind: "weekly",
      expiresAt: "2026-04-20T23:59:59.999Z",
    }),
  );

  assert.throws(
    () =>
      validatePromotionalAccessPayload(
        {
          grantKind: "until",
          expiresAt: "2026-04-01T00:00:00.000Z",
        },
        Date.parse("2026-04-03T10:00:00.000Z"),
      ),
  );
});
