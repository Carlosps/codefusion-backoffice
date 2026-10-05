const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../web/app.js"), "utf8");
function loadFunction(name, next, context) {
  return vm.runInNewContext(`${source.slice(source.indexOf(`  function ${name}(`), source.indexOf(`  ${next}`, source.indexOf(`  function ${name}(`)))}; ${name}`, context);
}

test("manual access form offers plan/credits only for contracts, with Plus/10 selected", () => {
  const render = loadFunction("renderManualAccessSection", "function renderMatchSections(", {
    escapeHtml: String,
    getManualAccessPresentation: () => ({ title: "Sem acesso", detail: "Teste" }),
    getLocalDateInputValue: () => "2026-10-05",
  });
  const html = render({ project: { projectId: "gerador-contratos" }, appUserId: "uid" });
  assert.match(html, /value="plus" selected/);
  assert.match(html, /name="contractCredits"[^>]+value="10"/);
  assert.match(html, /value="starter"/);
  assert.doesNotMatch(render({ project: { projectId: "rifa-facil" } }), /name="contractCredits"/);
});

test("contract payload sends selected plan/credits and retains idempotency key for retry", () => {
  const build = loadFunction("buildPromotionalAccessPayload", "async function refreshRevenueCatAfterManualAccess(", {
    crypto: { randomUUID: () => "operation-123456789" },
    toLocalEndOfDayISOString: (value) => `${value}T23:59:59.999Z`,
  });
  const fields = { contractPlanType: { value: "starter" }, contractCredits: { value: "5" }, customExpirationDate: { value: "2099-01-01" } };
  const form = {
    dataset: { projectId: "gerador-contratos" },
    querySelector: (selector) => fields[selector.match(/name="([^"]+)"/)[1]],
  };
  const first = build(form, "monthly");
  assert.equal(first.planType, "starter");
  assert.equal(first.credits, 5);
  assert.equal(build(form, "monthly").requestId, first.requestId);
  assert.equal(build(form, "until").expiresAt, "2099-01-01T23:59:59.999Z");
  fields.contractCredits.value = "";
  assert.throws(() => build(form, "monthly"), /créditos inteiros/);
  assert.equal(JSON.stringify(build({ dataset: { projectId: "rifa-facil" } }, "monthly")), '{"grantKind":"monthly"}');
});
