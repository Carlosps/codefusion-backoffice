const test = require("node:test");
const assert = require("node:assert/strict");

const {
  inferPixType,
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

test("validateRifaUpdatePayload accepts raffle name and description", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  const payload = validateRifaUpdatePayload({
    name: "  Rifa beneficente  ",
    description: "  Prêmio principal  ",
  });

  assert.deepEqual(payload, {
    name: "Rifa beneficente",
    description: "Prêmio principal",
  });
});

test("validateRifaUpdatePayload accepts empty description for clearing", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.deepEqual(validateRifaUpdatePayload({ description: " " }), {
    description: "",
  });
});

test("inferPixType identifies supported Pix key types", () => {
  assert.equal(inferPixType("000.000.000-00"), 1);
  assert.equal(inferPixType("11.111.111/1111-11"), 2);
  assert.equal(inferPixType("pix@example.com"), 3);
  assert.equal(inferPixType("(11) 1234-56789"), 4);
  assert.equal(inferPixType("d3f2g4h6j8k9l1m3n5p7q9r2s4t6v8w0x2y4z6a8b0c3"), 5);
  assert.equal(inferPixType(""), 0);
});

test("validateRifaUpdatePayload infers Pix type when omitted", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.deepEqual(validateRifaUpdatePayload({ pixKey: "pix@example.com" }), {
    pixKey: "pix@example.com",
    pixType: 3,
  });
});

test("validateRifaUpdatePayload accepts matching Pix type", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.deepEqual(
    validateRifaUpdatePayload({
      pixKey: "529.982.247-25",
      pixType: "1",
    }),
    {
      pixKey: "529.982.247-25",
      pixType: 1,
    },
  );
});

test("validateRifaUpdatePayload accepts fallback Pix type zero", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.deepEqual(
    validateRifaUpdatePayload({
      pixKey: "pix@example.com",
      pixType: 0,
    }),
    {
      pixKey: "pix@example.com",
      pixType: 0,
    },
  );
});

test("validateRifaUpdatePayload rejects invalid Pix type", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.throws(
    () => validateRifaUpdatePayload({ pixKey: "pix@example.com", pixType: "documento" }),
    /Tipo de chave Pix inválido/,
  );
});

test("validateRifaUpdatePayload rejects Pix type without Pix key", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.throws(
    () => validateRifaUpdatePayload({ pixType: 3 }),
    /Informe a chave Pix para atualizar o tipo/,
  );
});

test("validateRifaUpdatePayload rejects Pix type mismatch", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.throws(
    () => validateRifaUpdatePayload({ pixKey: "pix@example.com", pixType: 1 }),
    /A chave Pix não corresponde ao tipo informado/,
  );
});

test("validateRifaUpdatePayload rejects empty Pix key when sent", () => {
  delete process.env.RIFA_ALLOWED_UPDATE_FIELDS;

  assert.throws(
    () => validateRifaUpdatePayload({ pixKey: " " }),
    /Informe a chave Pix/,
  );
});
