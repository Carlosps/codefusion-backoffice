const { HttpError } = require("./errors");

function getRevenueCatBaseUrl() {
  return process.env.REVENUECAT_API_BASE_URL || "https://api.revenuecat.com/v1";
}

function getRevenueCatV2BaseUrl() {
  return process.env.REVENUECAT_V2_API_BASE_URL || "https://api.revenuecat.com/v2";
}

function getPromotionalEntitlementId(project = null) {
  return (
    String(project?.entitlementId || "").trim() ||
    String(process.env.REVENUECAT_PROMOTIONAL_PRO_ENTITLEMENT || "").trim() ||
    "pro"
  );
}

function createRevenueCatConfigError(message) {
  return new HttpError(
    412,
    `${message} Configure REVENUECAT_PROJECTS_JSON nas Functions: use functions/.secret.local no Emulator local e Firebase Secret Manager no deploy.`,
  );
}

function normalizeDate(value) {
  return value || null;
}

function isFutureDate(value) {
  return value ? Date.parse(value) > Date.now() : false;
}

function toTimestamp(value) {
  return value ? Date.parse(value) || 0 : 0;
}

function addDuration(date, unit, count) {
  const result = new Date(date.getTime());

  if (unit === "day") {
    result.setUTCDate(result.getUTCDate() + count);
    return result;
  }

  if (unit === "month") {
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + count);
    const lastDayOfMonth = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, lastDayOfMonth));
    return result;
  }

  if (unit === "year") {
    const month = result.getUTCMonth();
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCFullYear(result.getUTCFullYear() + count, month, 1);
    const lastDayOfMonth = new Date(
      Date.UTC(result.getUTCFullYear(), month + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, lastDayOfMonth));
    return result;
  }

  return result;
}

function detectProductDuration(productId) {
  const normalized = String(productId || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (/(lifetime|vitalici|permanent|forever|ilimitad)/.test(normalized)) {
    return {
      kind: "lifetime",
      label: "Vitalicio",
    };
  }

  const explicitPatterns = [
    {
      match: /(\d+)[\s_-]*(day|days|dia|dias)\b/,
      create: (count) => ({
        unit: "day",
        count,
        label: count === 1 ? "Diario" : `${count} dias`,
      }),
    },
    {
      match: /(\d+)[\s_-]*(week|weeks|semana|semanas)\b/,
      create: (count) => ({
        unit: "day",
        count: count * 7,
        label: count === 1 ? "Semanal" : `${count} semanas`,
      }),
    },
    {
      match: /(\d+)[\s_-]*(month|months|mes|meses)\b/,
      create: (count) => ({
        unit: "month",
        count,
        label: count === 1 ? "Mensal" : `${count} meses`,
      }),
    },
    {
      match: /(\d+)[\s_-]*(year|years|ano|anos)\b/,
      create: (count) => ({
        unit: "year",
        count,
        label: count === 1 ? "Anual" : `${count} anos`,
      }),
    },
  ];

  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern.match);
    if (match) {
      return pattern.create(Number(match[1]));
    }
  }

  const keywordDurations = [
    { match: /(quarterly|trimestral)/, unit: "month", count: 3, label: "Trimestral" },
    { match: /(semiannual|semi_annual|semestral|half[_-]?year)/, unit: "month", count: 6, label: "Semestral" },
    { match: /(annual|yearly|anual)/, unit: "year", count: 1, label: "Anual" },
    { match: /(monthly|mensal)/, unit: "month", count: 1, label: "Mensal" },
    { match: /(weekly|semanal)/, unit: "day", count: 7, label: "Semanal" },
  ];

  return keywordDurations.find((duration) => duration.match.test(normalized)) || null;
}

function deriveExpirationDetails(productId, purchaseDate) {
  const duration = detectProductDuration(productId);
  if (!duration) {
    return null;
  }

  if (duration.kind === "lifetime") {
    return {
      accessPeriodLabel: duration.label,
      expiresDate: null,
      expirationSource: "derived_lifetime",
      isLifetime: true,
    };
  }

  if (!purchaseDate) {
    return null;
  }

  const purchase = new Date(purchaseDate);
  if (Number.isNaN(purchase.getTime())) {
    return null;
  }

  return {
    accessPeriodLabel: duration.label,
    expiresDate: addDuration(purchase, duration.unit, duration.count).toISOString(),
    expirationSource: "derived_from_product",
    isLifetime: false,
  };
}

function toProjectList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    return Object.entries(payload).map(([projectId, config]) => ({
      projectId,
      ...(config || {}),
    }));
  }

  throw createRevenueCatConfigError("REVENUECAT_PROJECTS_JSON precisa ser um array ou objeto.");
}

function sanitizeProject(project) {
  const projectId = String(project.projectId || project.id || "").trim();
  const label = String(project.label || project.name || projectId).trim();
  const secretKey = String(project.secretKey || "").trim();
  const revenueCatProjectId = String(project.revenueCatProjectId || "").trim();
  const v2SecretKey = String(project.v2SecretKey || "").trim();
  const apiBaseUrl = String(project.apiBaseUrl || getRevenueCatBaseUrl()).trim();
  const apiV2BaseUrl = String(project.apiV2BaseUrl || getRevenueCatV2BaseUrl()).trim();
  const entitlementId = String(project.entitlementId || "").trim();

  if (!projectId || !label || !secretKey) {
    throw createRevenueCatConfigError(
      "Cada projeto do RevenueCat precisa ter projectId, label e secretKey.",
    );
  }

  return {
    projectId,
    label,
    secretKey,
    revenueCatProjectId,
    v2SecretKey,
    apiBaseUrl,
    apiV2BaseUrl,
    hasSecureLookupConfig: Boolean(revenueCatProjectId && v2SecretKey),
    entitlementId: entitlementId || getPromotionalEntitlementId(),
  };
}

function getRevenueCatProjectsConfig() {
  const rawProjects = String(process.env.REVENUECAT_PROJECTS_JSON || "").trim();

  if (rawProjects) {
    try {
      const parsed = JSON.parse(rawProjects);
      const projects = toProjectList(parsed).map(sanitizeProject);
      if (!projects.length) {
        throw createRevenueCatConfigError("REVENUECAT_PROJECTS_JSON não pode estar vazio.");
      }
      return projects;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw createRevenueCatConfigError("REVENUECAT_PROJECTS_JSON contém JSON inválido.");
    }
  }

  throw createRevenueCatConfigError("RevenueCat não configurado no backend.");
}

function listRevenueCatProjects() {
  return getRevenueCatProjectsConfig().map((project) => ({
    projectId: project.projectId,
    label: project.label,
    entitlementId: getPromotionalEntitlementId(project),
    lookupConfigured: project.hasSecureLookupConfig,
  }));
}

function getRevenueCatProject(projectId) {
  const normalizedProjectId = String(projectId || "").trim();
  const project = getRevenueCatProjectsConfig().find(
    (entry) => entry.projectId === normalizedProjectId,
  );

  if (!project) {
    throw new HttpError(404, "Projeto do RevenueCat não configurado.");
  }

  return project;
}

function sortByDateDesc(items, key) {
  return [...items].sort((left, right) => {
    const leftValue = toTimestamp(left[key]);
    const rightValue = toTimestamp(right[key]);
    return rightValue - leftValue;
  });
}

function normalizeStore(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePeriodType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isPromotionalEntitlement(item) {
  const productIdentifier = String(item?.productIdentifier || "")
    .trim()
    .toLowerCase();

  return (
    normalizeStore(item?.store) === "promotional" ||
    normalizePeriodType(item?.periodType) === "promotional" ||
    productIdentifier.startsWith("rc_promo_")
  );
}

function buildManualProAccess(entitlements, project = null) {
  const entitlementId = getPromotionalEntitlementId(project);
  const manualItems = entitlements
    .filter((item) => item.identifier === entitlementId && isPromotionalEntitlement(item))
    .sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return Number(right.isActive) - Number(left.isActive);
      }

      return toTimestamp(right.expiresDate) - toTimestamp(left.expiresDate);
    });

  const current = manualItems[0];
  if (!current) {
    return null;
  }

  return {
    entitlementId,
    productIdentifier: current.productIdentifier || null,
    store: current.store || null,
    periodType: current.periodType || null,
    isActive: Boolean(current.isActive),
    expiresDate: current.expiresDate || null,
  };
}

function addDays(date, count) {
  return addDuration(date, "day", count);
}

function computePromotionalExpiresAt(grantKind, providedExpiresAt, now = new Date()) {
  if (grantKind === "weekly") {
    return addDays(now, 7).toISOString();
  }

  if (grantKind === "monthly") {
    return addDuration(now, "month", 1).toISOString();
  }

  if (grantKind === "annual") {
    return addDuration(now, "year", 1).toISOString();
  }

  return new Date(providedExpiresAt).toISOString();
}

function toRevenueCatSubscriberPayload(project, appUserId, payload) {
  return {
    project: {
      projectId: project.projectId,
      label: project.label,
      entitlementId: getPromotionalEntitlementId(project),
    },
    app_user_id: appUserId,
    request_date: payload?.request_date || null,
    subscriber: payload?.subscriber || {},
  };
}

async function parseRevenueCatResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function mapRevenueCatError(response, payload, fallbackMessage) {
  const message = payload?.message || fallbackMessage;

  if (response.status === 404) {
    return new HttpError(404, "Cliente não encontrado no RevenueCat.");
  }

  if (response.status >= 400 && response.status < 500) {
    return new HttpError(400, message);
  }

  return new HttpError(502, fallbackMessage);
}

async function revenueCatRequest(project, path, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${project.apiBaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${project.secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseRevenueCatResponse(response);
  return { response, payload };
}

async function revenueCatV2Request(project, path, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${project.apiV2BaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${project.v2SecretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseRevenueCatResponse(response);
  return { response, payload };
}

function mapRevenueCatV2Error(response, payload) {
  if (response.status === 401 || response.status === 403) {
    return new HttpError(
      502,
      "Não foi possível autenticar a busca segura no RevenueCat. Verifique a chave V2 e a permissão Customer information: Read.",
    );
  }

  if (response.status === 429) {
    return new HttpError(429, "O RevenueCat atingiu o limite de consultas. Tente novamente em instantes.");
  }

  return new HttpError(
    502,
    payload?.message || "Falha ao consultar o RevenueCat pela API V2.",
  );
}

async function searchRevenueCatCustomers(projectId, appUserId, fetchImpl = fetch) {
  const project = getRevenueCatProject(projectId);
  if (!project.hasSecureLookupConfig) {
    throw createRevenueCatConfigError(
      `O aplicativo ${project.label} precisa de revenueCatProjectId e v2SecretKey para a busca segura.`,
    );
  }
  const query = new URLSearchParams({
    search: String(appUserId),
    limit: "1",
  });
  const { response, payload } = await revenueCatV2Request(
    project,
    `/projects/${encodeURIComponent(project.revenueCatProjectId)}/customers?${query.toString()}`,
    {},
    fetchImpl,
  );

  if (!response.ok) {
    throw mapRevenueCatV2Error(response, payload);
  }

  if (!payload || !Array.isArray(payload.items)) {
    throw new HttpError(502, "Resposta inválida da busca segura no RevenueCat.");
  }

  return payload.items;
}

async function assertRevenueCatCustomerExists(projectId, appUserId, searcher = searchRevenueCatCustomers) {
  const customers = await searcher(projectId, appUserId);
  if (!Array.isArray(customers) || !customers.length) {
    throw new HttpError(404, "Cliente não encontrado no RevenueCat.");
  }

  return customers[0];
}

function buildSubscriptions(subscriber) {
  const subscriptions = Object.entries(subscriber.subscriptions || {}).map(([productId, data]) => ({
    productId,
    store: data.store || null,
    purchaseDate: normalizeDate(data.purchase_date),
    originalPurchaseDate: normalizeDate(data.original_purchase_date),
    expiresDate: normalizeDate(data.expires_date),
    isSandbox: Boolean(data.is_sandbox),
    unsubscribeDetectedAt: normalizeDate(data.unsubscribe_detected_at),
    billingIssueDetectedAt: normalizeDate(data.billing_issues_detected_at),
    ownershipType: data.ownership_type || null,
    periodType: data.period_type || null,
    hasActiveAccess: data.expires_date ? isFutureDate(data.expires_date) : true,
    expirationSource: data.expires_date ? "provider" : null,
    accessPeriodLabel: null,
    isLifetime: !data.expires_date,
  }));

  return sortByDateDesc(subscriptions, "expiresDate");
}

function buildNonSubscriptionItems(subscriber) {
  const items = [];

  for (const [productId, purchases] of Object.entries(subscriber.non_subscriptions || {})) {
    for (const purchase of purchases) {
      const purchaseDate = normalizeDate(purchase.purchase_date);
      const derivedExpiration = deriveExpirationDetails(productId, purchaseDate);
      const expiresDate = derivedExpiration ? derivedExpiration.expiresDate : null;
      const isLifetime = Boolean(derivedExpiration && derivedExpiration.isLifetime);

      items.push({
        type: "non_subscription",
        productId,
        store: purchase.store || null,
        purchaseDate,
        originalPurchaseDate: purchaseDate,
        expiresDate,
        eventDate: purchaseDate,
        isSandbox: Boolean(purchase.is_sandbox),
        periodType: null,
        accessPeriodLabel: derivedExpiration ? derivedExpiration.accessPeriodLabel : null,
        expirationSource: derivedExpiration ? derivedExpiration.expirationSource : null,
        isLifetime,
        hasActiveAccess: isLifetime || isFutureDate(expiresDate),
      });
    }
  }

  return sortByDateDesc(items, "eventDate");
}

function buildEntitlements(subscriber) {
  const all = Object.entries(subscriber.entitlements || {}).map(([identifier, data]) => ({
    identifier,
    productIdentifier: data.product_identifier || null,
    isActive: Boolean(data.expires_date ? isFutureDate(data.expires_date) : true),
    purchaseDate: normalizeDate(data.purchase_date),
    originalPurchaseDate: normalizeDate(data.original_purchase_date),
    expiresDate: normalizeDate(data.expires_date),
    willRenew: data.will_renew ?? null,
    store: data.store || null,
    periodType: data.period_type || null,
  }));

  return {
    all,
    active: all.filter((item) => item.isActive),
  };
}

function hasSubscriptions(subscriber) {
  return Object.keys(subscriber?.subscriptions || {}).length > 0;
}

function hasNonSubscriptions(subscriber) {
  return Object.keys(subscriber?.non_subscriptions || {}).length > 0;
}

function hasEntitlements(subscriber) {
  return Object.keys(subscriber?.entitlements || {}).length > 0;
}

function getLatestExpirationDate(items) {
  return items
    .map((item) => item.expiresDate)
    .filter(Boolean)
    .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] || null;
}

function pickCurrentProduct(subscriptions, nonSubscriptions) {
  const ranked = [...subscriptions, ...nonSubscriptions].sort((left, right) => {
    const leftScore = Number(Boolean(left.isLifetime || left.hasActiveAccess));
    const rightScore = Number(Boolean(right.isLifetime || right.hasActiveAccess));

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const expirationDiff = toTimestamp(right.expiresDate) - toTimestamp(left.expiresDate);
    if (expirationDiff !== 0) {
      return expirationDiff;
    }

    return toTimestamp(right.purchaseDate || right.eventDate) - toTimestamp(left.purchaseDate || left.eventDate);
  });

  const current = ranked[0];

  return current ? current.productId : null;
}

function buildCustomerSummary(payload) {
  const subscriber = payload.subscriber || {};
  const subscriptions = buildSubscriptions(subscriber);
  const nonSubscriptions = buildNonSubscriptionItems(subscriber);
  const entitlements = buildEntitlements(subscriber);
  const manualProAccess = buildManualProAccess(entitlements.all, payload.project);
  const latestExpirationDate = getLatestExpirationDate([...subscriptions, ...nonSubscriptions]);
  const hasLifetimeAccess =
    subscriptions.some((item) => item.isLifetime) || nonSubscriptions.some((item) => item.isLifetime);
  const hasActiveSubscription = subscriptions.some((item) => item.hasActiveAccess);
  const hasActiveNonSubscription = nonSubscriptions.some((item) => item.hasActiveAccess);
  const isEmpty =
    subscriptions.length === 0 &&
    nonSubscriptions.length === 0 &&
    entitlements.all.length === 0 &&
    !subscriber.original_purchase_date;

  return {
    project: payload.project || null,
    appUserId: payload.app_user_id || subscriber.original_app_user_id || null,
    originalAppUserId: subscriber.original_app_user_id || null,
    firstSeen: normalizeDate(subscriber.first_seen),
    lastSeen: normalizeDate(subscriber.last_seen),
    requestDate: normalizeDate(payload.request_date),
    managementUrl: subscriber.management_url || null,
    currentProduct: pickCurrentProduct(subscriptions, nonSubscriptions),
    isEmpty,
    status: {
      hasActiveEntitlement: entitlements.active.length > 0,
      hasActiveSubscription,
      hasActiveNonSubscription,
      hasActiveAccess:
        entitlements.active.length > 0 || hasActiveSubscription || hasActiveNonSubscription || hasLifetimeAccess,
      latestExpirationDate,
      hasLifetimeAccess,
    },
    entitlements,
    manualProAccess,
    subscriptions,
    nonSubscriptions,
    activeSubscriptions: subscriptions
      .filter((item) => item.hasActiveAccess)
      .map((item) => item.productId),
    nonSubscriptionCount: nonSubscriptions.length,
    rawOverview: {
      originalApplicationVersion: subscriber.original_application_version || null,
      originalPurchaseDate: normalizeDate(subscriber.original_purchase_date),
    },
  };
}

function buildCustomerHistory(payload) {
  const subscriber = payload.subscriber || {};
  const items = [];

  for (const [productId, data] of Object.entries(subscriber.subscriptions || {})) {
    items.push({
      type: "subscription",
      productId,
      store: data.store || null,
      purchaseDate: normalizeDate(data.purchase_date),
      originalPurchaseDate: normalizeDate(data.original_purchase_date),
      expiresDate: normalizeDate(data.expires_date),
      eventDate: normalizeDate(data.purchase_date || data.original_purchase_date),
      isSandbox: Boolean(data.is_sandbox),
      periodType: data.period_type || null,
      accessPeriodLabel: null,
      expirationSource: data.expires_date ? "provider" : null,
      isLifetime: !data.expires_date,
      hasActiveAccess: data.expires_date ? isFutureDate(data.expires_date) : true,
    });
  }

  items.push(...buildNonSubscriptionItems(subscriber));

  return {
    project: payload.project || null,
    items: sortByDateDesc(items, "eventDate"),
  };
}

function sortMatches(matches) {
  return [...matches].sort((left, right) => {
    const leftStatus = left.customer.status;
    const rightStatus = right.customer.status;

    if (leftStatus.hasActiveAccess !== rightStatus.hasActiveAccess) {
      return Number(rightStatus.hasActiveAccess) - Number(leftStatus.hasActiveAccess);
    }

    if (leftStatus.hasLifetimeAccess !== rightStatus.hasLifetimeAccess) {
      return Number(rightStatus.hasLifetimeAccess) - Number(leftStatus.hasLifetimeAccess);
    }

    const expirationDiff =
      toTimestamp(right.customer.status.latestExpirationDate) -
      toTimestamp(left.customer.status.latestExpirationDate);
    if (expirationDiff !== 0) {
      return expirationDiff;
    }

    return toTimestamp(right.customer.requestDate) - toTimestamp(left.customer.requestDate);
  });
}

async function findCustomersAcrossProjects(
  appUserId,
  searcher = searchRevenueCatCustomers,
  fetcher = fetchRevenueCatSubscriber,
) {
  const projects = listRevenueCatProjects();
  const settled = await Promise.allSettled(
    projects.map(async (project) => {
      const customers = await searcher(project.projectId, appUserId);

      // Mantém a injeção de um fetcher de subscriber usada nos testes legados.
      // A busca real sempre retorna uma lista V2 e segue pelo caminho seguro abaixo.
      if (customers && !Array.isArray(customers) && customers.subscriber) {
        return {
          customer: buildCustomerSummary(customers),
          history: buildCustomerHistory(customers),
        };
      }

      if (!Array.isArray(customers) || !customers.length) {
        return null;
      }

      const payload = await fetcher(project.projectId, appUserId, {
        customerConfirmed: true,
        searcher,
      });
      return {
        customer: buildCustomerSummary(payload),
        history: buildCustomerHistory(payload),
      };
    }),
  );

  const matches = [];
  const errors = [];

  settled.forEach((result, index) => {
    const project = projects[index];

    if (result.status === "fulfilled") {
      if (result.value) {
        matches.push({
          customer: result.value.customer,
          history: result.value.history,
        });
      }
      return;
    }

    const error = result.reason;
    if (error) {
      errors.push({
        projectId: project.projectId,
        message: error.message || "Falha ao consultar o RevenueCat.",
        status: error.status || 502,
      });
    }
  });

  if (!matches.length) {
    if (errors.length) {
      const first = errors[0];
      const code = Number(first.status);
      const safeStatus =
        Number.isInteger(code) && code >= 400 && code < 600 ? code : 502;
      throw new HttpError(safeStatus, first.message || "Falha ao consultar o RevenueCat.");
    }

    const searchedProjects = projects.map((project) => ({
      projectId: project.projectId,
      label: project.label,
    }));

    const labels = searchedProjects.map((entry) => entry.label).join(", ");
    throw new HttpError(
      404,
      `Cliente não encontrado nos aplicativos configurados (${labels}).`,
      { searchedProjects },
    );
  }

  return {
    appUserId,
    searchedProjectCount: projects.length,
    totalMatches: matches.length,
    matches: sortMatches(matches),
    partialErrors: errors,
  };
}

async function fetchRevenueCatSubscriber(projectId, appUserId, options = {}) {
  const project = getRevenueCatProject(projectId);
  const fetchImpl = options.fetchImpl || fetch;
  const searcher =
    options.searcher ||
    ((configuredProjectId, configuredAppUserId) =>
      searchRevenueCatCustomers(configuredProjectId, configuredAppUserId, fetchImpl));

  if (!options.customerConfirmed) {
    await assertRevenueCatCustomerExists(projectId, appUserId, searcher);
  }

  const { response, payload } = await revenueCatRequest(
    project,
    `/subscribers/${encodeURIComponent(appUserId)}`,
    {},
    fetchImpl,
  );

  if (response.status === 404) {
    throw new HttpError(404, "Cliente não encontrado no RevenueCat.");
  }

  if (!response.ok) {
    throw new HttpError(502, "Falha ao consultar o RevenueCat.");
  }

  if (!payload || !payload.subscriber) {
    throw new HttpError(404, "Cliente não encontrado no RevenueCat.");
  }

  return toRevenueCatSubscriberPayload(project, appUserId, payload);
}

async function grantRevenueCatPromotionalAccess(
  projectId,
  appUserId,
  grant,
  fetchImpl = fetch,
) {
  const project = getRevenueCatProject(projectId);
  await assertRevenueCatCustomerExists(
    projectId,
    appUserId,
    (configuredProjectId, configuredAppUserId) =>
      searchRevenueCatCustomers(configuredProjectId, configuredAppUserId, fetchImpl),
  );
  const entitlementId = getPromotionalEntitlementId(project);
  const effectiveExpiresAt = computePromotionalExpiresAt(grant.grantKind, grant.expiresAt);
  const { response, payload } = await revenueCatRequest(
    project,
    `/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/promotional`,
    {
      method: "POST",
      body: {
        end_time_ms: new Date(effectiveExpiresAt).getTime(),
      },
    },
    fetchImpl,
  );

  if (!response.ok) {
    throw mapRevenueCatError(
      response,
      payload,
      "Falha ao conceder acesso promocional no RevenueCat.",
    );
  }

  return {
    entitlementId,
    expiresAt: effectiveExpiresAt,
    customer: toRevenueCatSubscriberPayload(project, appUserId, payload),
  };
}

async function revokeRevenueCatPromotionalAccess(projectId, appUserId, fetchImpl = fetch) {
  const project = getRevenueCatProject(projectId);
  await assertRevenueCatCustomerExists(
    projectId,
    appUserId,
    (configuredProjectId, configuredAppUserId) =>
      searchRevenueCatCustomers(configuredProjectId, configuredAppUserId, fetchImpl),
  );
  const entitlementId = getPromotionalEntitlementId(project);
  const { response, payload } = await revenueCatRequest(
    project,
    `/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/revoke_promotionals`,
    { method: "POST" },
    fetchImpl,
  );

  if (!response.ok) {
    throw mapRevenueCatError(
      response,
      payload,
      "Falha ao remover acesso promocional no RevenueCat.",
    );
  }

  return {
    entitlementId,
    customer: toRevenueCatSubscriberPayload(project, appUserId, payload),
  };
}

module.exports = {
  buildManualProAccess,
  computePromotionalExpiresAt,
  getRevenueCatProjectsConfig,
  getPromotionalEntitlementId,
  listRevenueCatProjects,
  getRevenueCatProject,
  fetchRevenueCatSubscriber,
  searchRevenueCatCustomers,
  assertRevenueCatCustomerExists,
  buildCustomerHistory,
  buildCustomerSummary,
  findCustomersAcrossProjects,
  grantRevenueCatPromotionalAccess,
  revokeRevenueCatPromotionalAccess,
  isPromotionalEntitlement,
};
