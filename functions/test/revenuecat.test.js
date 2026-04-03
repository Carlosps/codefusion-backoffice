const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getRevenueCatProjectsConfig,
  getPromotionalEntitlementId,
  listRevenueCatProjects,
  buildCustomerHistory,
  buildCustomerSummary,
  computePromotionalExpiresAt,
  findCustomersAcrossProjects,
  grantRevenueCatPromotionalAccess,
} = require("../src/revenuecat");

const payload = {
  project: {
    projectId: "ios-main",
    label: "iOS Main",
  },
  app_user_id: "user_123",
  request_date: "2026-04-03T10:00:00Z",
  subscriber: {
    original_app_user_id: "user_123",
    first_seen: "2026-01-01T00:00:00Z",
    management_url: "https://example.com/manage",
    subscriptions: {
      "pro_monthly": {
        store: "app_store",
        purchase_date: "2026-04-01T00:00:00Z",
        original_purchase_date: "2026-03-01T00:00:00Z",
        expires_date: "2099-05-01T00:00:00Z",
        is_sandbox: false,
        ownership_type: "PURCHASED",
        period_type: "normal",
      },
    },
    entitlements: {
      pro: {
        product_identifier: "pro_monthly",
        purchase_date: "2026-04-01T00:00:00Z",
        original_purchase_date: "2026-03-01T00:00:00Z",
        expires_date: "2099-05-01T00:00:00Z",
        will_renew: true,
        store: "app_store",
      },
    },
    non_subscriptions: {
      "lifetime_boost": [
        {
          purchase_date: "2026-02-01T00:00:00Z",
          store: "play_store",
          is_sandbox: false,
        },
      ],
    },
  },
};

test("buildCustomerSummary returns active status", () => {
  const summary = buildCustomerSummary(payload);

  assert.equal(summary.project.projectId, "ios-main");
  assert.equal(summary.appUserId, "user_123");
  assert.equal(summary.currentProduct, "pro_monthly");
  assert.equal(summary.status.hasActiveEntitlement, true);
  assert.equal(summary.subscriptions.length, 1);
  assert.equal(summary.manualProAccess, null);
});

test("buildCustomerSummary exposes promotional pro access", () => {
  const promotionalPayload = {
    ...payload,
    subscriber: {
      ...payload.subscriber,
      entitlements: {
        pro: {
          product_identifier: "rc_promo_pro",
          purchase_date: "2026-04-01T00:00:00Z",
          original_purchase_date: "2026-04-01T00:00:00Z",
          expires_date: "2099-05-01T00:00:00Z",
          will_renew: false,
          store: "promotional",
          period_type: "promotional",
        },
      },
    },
  };

  const summary = buildCustomerSummary(promotionalPayload);

  assert.deepEqual(summary.manualProAccess, {
    entitlementId: "pro",
    productIdentifier: "rc_promo_pro",
    store: "promotional",
    periodType: "promotional",
    isActive: true,
    expiresDate: "2099-05-01T00:00:00Z",
  });
});

test("buildCustomerHistory merges subscription and non-subscription purchases", () => {
  const history = buildCustomerHistory(payload);

  assert.equal(history.project.label, "iOS Main");
  assert.equal(history.items.length, 2);
  assert.equal(history.items[0].type, "subscription");
  assert.equal(history.items[1].type, "non_subscription");
});

test("buildCustomerSummary derives expiration for one-time monthly purchase", () => {
  const monthlyPayload = {
    project: {
      projectId: "rifa-digital",
      label: "Rifa Digital",
    },
    app_user_id: "user_monthly",
    request_date: "2026-04-03T10:00:00Z",
    subscriber: {
      original_app_user_id: "user_monthly",
      first_seen: "2026-04-03T10:00:00Z",
      subscriptions: {},
      entitlements: {},
      non_subscriptions: {
        pro_mensal: [
          {
            purchase_date: "2026-04-03T00:00:00Z",
            store: "play_store",
            is_sandbox: false,
          },
        ],
      },
    },
  };

  const summary = buildCustomerSummary(monthlyPayload);
  const history = buildCustomerHistory(monthlyPayload);

  assert.equal(summary.currentProduct, "pro_mensal");
  assert.equal(summary.status.latestExpirationDate, "2026-05-03T00:00:00.000Z");
  assert.equal(summary.status.hasActiveNonSubscription, true);
  assert.equal(summary.status.hasActiveAccess, true);
  assert.equal(history.items[0].expiresDate, "2026-05-03T00:00:00.000Z");
  assert.equal(history.items[0].accessPeriodLabel, "Mensal");
});

test("findCustomersAcrossProjects returns matches sorted by active access", async () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify([
    {
      projectId: "rifa-facil",
      label: "Rifa Facil",
      secretKey: "secret_1",
    },
    {
      projectId: "rifa-digital",
      label: "Rifa Digital",
      secretKey: "secret_2",
    },
  ]);
  delete process.env.REVENUECAT_SECRET_KEY;

  const result = await findCustomersAcrossProjects("user_123", async (projectId, appUserId) => {
    if (projectId === "rifa-facil") {
      return payload;
    }

    if (projectId === "rifa-digital") {
      throw Object.assign(new Error("Cliente nao encontrado no RevenueCat."), { status: 404 });
    }

    throw new Error(`Projeto inesperado: ${projectId}:${appUserId}`);
  });

  assert.equal(result.totalMatches, 1);
  assert.equal(result.matches[0].customer.project.projectId, "ios-main");
  assert.equal(result.searchedProjectCount, 2);
});

test("findCustomersAcrossProjects ignores projects without relevant subscriber data", async () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify([
    {
      projectId: "rifa-facil",
      label: "Rifa Facil",
      secretKey: "secret_1",
    },
    {
      projectId: "rifa-digital",
      label: "Rifa Digital",
      secretKey: "secret_2",
    },
  ]);
  delete process.env.REVENUECAT_SECRET_KEY;

  await assert.rejects(
    () =>
      findCustomersAcrossProjects("ghost_user", async (projectId) => {
        if (projectId === "rifa-facil") {
          return {
            project: {
              projectId: "rifa-facil",
              label: "Rifa Facil",
            },
            app_user_id: "ghost_user",
            request_date: "2026-04-03T10:00:00Z",
            subscriber: {
              original_app_user_id: "ghost_user",
              subscriptions: {},
              entitlements: {},
              non_subscriptions: {},
            },
          };
        }

        if (projectId === "rifa-digital") {
          throw Object.assign(new Error("Cliente nao encontrado no RevenueCat."), { status: 404 });
        }

        throw new Error(`Projeto inesperado: ${projectId}`);
      }),
    (error) =>
      error.status === 404 &&
      error.message === "Cliente nao encontrado nos aplicativos configurados.",
  );
});

test("findCustomersAcrossProjects ignores subscriber created at request time", async () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify([
    {
      projectId: "rifa-facil",
      label: "Rifa Facil",
      secretKey: "secret_1",
    },
  ]);
  delete process.env.REVENUECAT_SECRET_KEY;

  await assert.rejects(
    () =>
      findCustomersAcrossProjects("ghost_with_first_seen", async () => ({
        project: {
          projectId: "rifa-facil",
          label: "Rifa Facil",
        },
        app_user_id: "ghost_with_first_seen",
        request_date: "2026-04-03T10:00:00Z",
        subscriber: {
          original_app_user_id: "ghost_with_first_seen",
          first_seen: "2026-04-03T10:00:00.999Z",
          subscriptions: {},
          entitlements: {},
          non_subscriptions: {},
        },
      })),
    (error) =>
      error.status === 404 &&
      error.message === "Cliente nao encontrado nos aplicativos configurados.",
  );
});

test("findCustomersAcrossProjects keeps subscriber with historical first_seen and no purchases", async () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify([
    {
      projectId: "rifa-facil",
      label: "Rifa Facil",
      secretKey: "secret_1",
    },
  ]);
  delete process.env.REVENUECAT_SECRET_KEY;

  const result = await findCustomersAcrossProjects("user_first_seen", async () => ({
    project: {
      projectId: "rifa-facil",
      label: "Rifa Facil",
    },
    app_user_id: "user_first_seen",
    request_date: "2026-04-03T10:00:00Z",
    subscriber: {
      original_app_user_id: "user_first_seen",
      first_seen: "2026-04-01T00:00:00Z",
      subscriptions: {},
      entitlements: {},
      non_subscriptions: {},
    },
  }));

  assert.equal(result.totalMatches, 1);
  assert.equal(result.matches[0].customer.firstSeen, "2026-04-01T00:00:00Z");
  assert.equal(result.matches[0].history.items.length, 0);
});

test("findCustomersAcrossProjects keeps subscriber with subscription even if first_seen matches request", async () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify([
    {
      projectId: "rifa-facil",
      label: "Rifa Facil",
      secretKey: "secret_1",
    },
  ]);
  delete process.env.REVENUECAT_SECRET_KEY;

  const result = await findCustomersAcrossProjects("user_subscription_only", async () => ({
    project: {
      projectId: "rifa-facil",
      label: "Rifa Facil",
    },
    app_user_id: "user_subscription_only",
    request_date: "2026-04-03T10:00:00Z",
    subscriber: {
      original_app_user_id: "user_subscription_only",
      first_seen: "2026-04-03T10:00:00Z",
      subscriptions: {
        pro_monthly: {
          store: "app_store",
          purchase_date: "2026-04-01T00:00:00Z",
          original_purchase_date: "2026-04-01T00:00:00Z",
          expires_date: "2099-05-01T00:00:00Z",
          is_sandbox: false,
          period_type: "normal",
        },
      },
      entitlements: {},
      non_subscriptions: {},
    },
  }));

  assert.equal(result.totalMatches, 1);
  assert.equal(result.matches[0].customer.firstSeen, "2026-04-03T10:00:00Z");
  assert.equal(result.matches[0].customer.subscriptions.length, 1);
  assert.equal(result.matches[0].customer.status.hasActiveSubscription, true);
});

test("getRevenueCatProjectsConfig parses multiple configured projects", () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify([
    {
      projectId: "ios-main",
      label: "iOS Main",
      secretKey: "secret_1",
    },
    {
      projectId: "android-main",
      label: "Android Main",
      secretKey: "secret_2",
      apiBaseUrl: "https://api.revenuecat.com/v1",
    },
  ]);
  delete process.env.REVENUECAT_SECRET_KEY;

  const projects = getRevenueCatProjectsConfig();

  assert.equal(projects.length, 2);
  assert.equal(projects[0].projectId, "ios-main");
  assert.equal(projects[1].label, "Android Main");
});

test("getPromotionalEntitlementId defaults to pro", () => {
  delete process.env.REVENUECAT_PROMOTIONAL_PRO_ENTITLEMENT;
  assert.equal(getPromotionalEntitlementId(), "pro");
});

test("computePromotionalExpiresAt supports weekly monthly annual and until", () => {
  const now = new Date("2026-04-03T10:00:00.000Z");

  assert.equal(
    computePromotionalExpiresAt("weekly", null, now),
    "2026-04-10T10:00:00.000Z",
  );
  assert.equal(
    computePromotionalExpiresAt("monthly", null, now),
    "2026-05-03T10:00:00.000Z",
  );
  assert.equal(
    computePromotionalExpiresAt("annual", null, now),
    "2027-04-03T10:00:00.000Z",
  );
  assert.equal(
    computePromotionalExpiresAt("until", "2026-04-20T23:59:59.999Z", now),
    "2026-04-20T23:59:59.999Z",
  );
});

test("grantRevenueCatPromotionalAccess sends end_time_ms to promotional endpoint", async () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify([
    {
      projectId: "ios-main",
      label: "iOS Main",
      secretKey: "secret_1",
    },
  ]);

  let request = null;
  const result = await grantRevenueCatPromotionalAccess(
    "ios-main",
    "user_123",
    {
      grantKind: "weekly",
      expiresAt: null,
    },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            request_date: "2026-04-03T10:00:00Z",
            subscriber: {
              entitlements: {},
              subscriptions: {},
            },
          }),
      };
    },
  );

  assert.equal(
    request.url,
    "https://api.revenuecat.com/v1/subscribers/user_123/entitlements/pro/promotional",
  );
  assert.equal(request.options.method, "POST");
  assert.equal(typeof JSON.parse(request.options.body).end_time_ms, "number");
  assert.equal(result.entitlementId, "pro");
});

test("listRevenueCatProjects hides secret keys", () => {
  process.env.REVENUECAT_PROJECTS_JSON = JSON.stringify({
    "ios-main": {
      label: "iOS Main",
      secretKey: "secret_1",
    },
  });
  delete process.env.REVENUECAT_SECRET_KEY;

  const projects = listRevenueCatProjects();

  assert.deepEqual(projects, [
    {
      projectId: "ios-main",
      label: "iOS Main",
    },
  ]);
});

test("getRevenueCatProjectsConfig returns actionable config error when missing", () => {
  delete process.env.REVENUECAT_PROJECTS_JSON;
  delete process.env.REVENUECAT_SECRET_KEY;

  assert.throws(
    () => getRevenueCatProjectsConfig(),
    (error) =>
      error.status === 412 &&
      error.message.includes("RevenueCat nao configurado no backend.") &&
      error.message.includes("REVENUECAT_PROJECTS_JSON"),
  );
});

test("getRevenueCatProjectsConfig returns actionable config error when JSON is invalid", () => {
  process.env.REVENUECAT_PROJECTS_JSON = "{invalid";
  delete process.env.REVENUECAT_SECRET_KEY;

  assert.throws(
    () => getRevenueCatProjectsConfig(),
    (error) =>
      error.status === 412 &&
      error.message.includes("REVENUECAT_PROJECTS_JSON contem JSON invalido."),
  );
});
