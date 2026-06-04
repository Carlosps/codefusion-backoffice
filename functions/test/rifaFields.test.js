const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateRifaUpdatePayload,
} = require("../src/rifaFields");

test("validateRifaUpdatePayload accepts email", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  const payload = validateRifaUpdatePayload({
    email: "pessoa@example.com",
  });

  assert.deepEqual(payload, {
    email: "pessoa@example.com",
  });
});

test("validateRifaUpdatePayload normalizes email spaces and case", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  const payload = validateRifaUpdatePayload({
    email: "  Pessoa@Example.COM  ",
  });

  assert.deepEqual(payload, {
    email: "pessoa@example.com",
  });
});

test("validateRifaUpdatePayload rejects fields outside allowlist", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.throws(
    () => validateRifaUpdatePayload({ title: "Nova rifa" }),
    /Campo não permitido para edição: title/,
  );
});

test("validateRifaUpdatePayload rejects empty payload", () => {
  assert.throws(
    () => validateRifaUpdatePayload({}),
    /Envie ao menos um campo em updates/,
  );
});

test("validateRifaUpdatePayload rejects invalid email", () => {
  assert.throws(
    () => validateRifaUpdatePayload({ email: "email-invalido" }),
    /Informe um e-mail válido/,
  );
});

test("validateRifaUpdatePayload rejects empty email", () => {
  assert.throws(
    () => validateRifaUpdatePayload({ email: " " }),
    /Informe um e-mail válido/,
  );
});
