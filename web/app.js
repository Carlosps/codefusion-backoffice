(function bootstrap() {
  /** Incremente ao mudar o front; confirme no console se o deploy chegou ao browser. */
  const BACKOFFICE_BUILD_ID = "2026-04-11-rifa-logs";
  console.info("[backoffice] app.js carregado", BACKOFFICE_BUILD_ID, {
    href: typeof location !== "undefined" ? location.href : "",
  });

  const config = window.BACKOFFICE_CONFIG;
  const state = {
    auth: null,
    user: null,
    session: null,
    revenueCatProjects: [],
    revenueCatAppUserId: null,
    rifa: null,
  };

  const PROJECT_VISUALS = {
    "rifa-facil": {
      iconSrc: "./assets/app-icons/rifa-facil.png",
      accentClass: "theme-sun",
    },
    "rifa-digital": {
      iconSrc: "./assets/app-icons/rifa-digital.png",
      accentClass: "theme-royal",
    },
  };

  const relativeTimeFormatter = new Intl.RelativeTimeFormat("pt-BR", {
    numeric: "auto",
  });

  const nodes = {
    setupWarning: document.getElementById("setup-warning"),
    setupWarningMessage: document.getElementById("setup-warning-message"),
    authIdentity: document.getElementById("auth-identity"),
    authIdentityName: document.getElementById("auth-identity-name"),
    authIdentityEmail: document.getElementById("auth-identity-email"),
    authPanel: document.getElementById("auth-panel"),
    authPanelEyebrow: document.getElementById("auth-panel-eyebrow"),
    authPanelTitle: document.getElementById("auth-panel-title"),
    authPanelDescription: document.getElementById("auth-panel-description"),
    authFeedback: document.getElementById("auth-feedback"),
    loginButton: document.getElementById("login-button"),
    logoutButton: document.getElementById("logout-button"),
    revenueCatPanel: document.getElementById("revenuecat-panel"),
    revenueCatForm: document.getElementById("revenuecat-form"),
    revenueCatConfigSummary: document.getElementById("revenuecat-config-summary"),
    revenueCatInput: document.getElementById("revenuecat-app-user-id"),
    revenueCatFeedback: document.getElementById("revenuecat-feedback"),
    revenueCatResults: document.getElementById("revenuecat-results"),
    reloadHistoryButton: document.getElementById("reload-history-button"),
    rifaForm: document.getElementById("rifa-form"),
    rifaInput: document.getElementById("rifa-id"),
    rifaFeedback: document.getElementById("rifa-feedback"),
    rifaResults: document.getElementById("rifa-results"),
  };

  function showSetupWarning(message) {
    nodes.setupWarning.classList.remove("hidden");
    nodes.setupWarningMessage.innerHTML = message;
  }

  function setFeedback(element, message, type) {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.remove("error", "success");
    if (type) {
      element.classList.add(type);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  /**
   * Clique no texto dentro de <button> pode deixar event.target como Text (sem .closest).
   */
  function elementFromClickTarget(target) {
    if (!target) {
      return null;
    }
    if (target.nodeType === Node.TEXT_NODE || target.nodeType === Node.COMMENT_NODE) {
      return target.parentElement;
    }
    return target instanceof Element ? target : null;
  }

  function closestFromClickTarget(target, selector) {
    const el = elementFromClickTarget(target);
    return el && typeof el.closest === "function" ? el.closest(selector) : null;
  }

  function formatDate(value, fallback = "Não informado", withTime = true) {
    if (!value) {
      return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" } : {}),
    }).format(date);
  }

  function formatRelativeDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const diffInDays = Math.round((date.getTime() - Date.now()) / 86400000);
    const absoluteDays = Math.abs(diffInDays);
    let unit = "day";
    let amount = diffInDays;

    if (absoluteDays >= 365) {
      unit = "year";
      amount = Math.round(diffInDays / 365);
    } else if (absoluteDays >= 60) {
      unit = "month";
      amount = Math.round(diffInDays / 30);
    } else if (absoluteDays >= 14) {
      unit = "week";
      amount = Math.round(diffInDays / 7);
    }

    const humanized = relativeTimeFormatter.format(amount, unit);
    if (amount < 0) {
      return `Expirou ${humanized}`;
    }
    if (amount === 0) {
      return "Vence hoje";
    }
    return `Vence ${humanized}`;
  }

  function getLocalDateInputValue(date = new Date()) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function toLocalEndOfDayISOString(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error("Escolha uma data final valida.");
    }

    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      23,
      59,
      59,
      999,
    );

    if (Number.isNaN(date.getTime())) {
      throw new Error("Escolha uma data final valida.");
    }

    return date.toISOString();
  }

  function renderTable(columns, rows) {
    const head = columns
      .map(
        (column) =>
          `<th class="${escapeHtml(column.className || "")}">${escapeHtml(column.label)}</th>`,
      )
      .join("");

    const body = rows
      .map((row) => {
        const cells = columns
          .map((column) => {
            const value = column.render ? column.render(row) : escapeHtml(row[column.key]);
            return `<td class="${escapeHtml(column.className || "")}">${value}</td>`;
          })
          .join("");

        return `<tr>${cells}</tr>`;
      })
      .join("");

    return `
      <div class="table-wrap">
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function hideElement(element) {
    element.classList.add("hidden");
  }

  function showElement(element) {
    element.classList.remove("hidden");
  }

  function translateHistoryType(type) {
    return type === "non_subscription" ? "Compra única" : "Assinatura";
  }

  function getStoreMeta(store) {
    const normalized = String(store || "").trim().toLowerCase();

    if (normalized === "app_store") {
      return {
        label: "App Store",
        className: "store-badge-apple",
        icon: `
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M12.2 4.2c.7-.8 1.2-1.9 1.1-3-1 .1-2.2.7-2.9 1.5-.7.8-1.2 1.9-1.1 2.9 1 .1 2.2-.5 2.9-1.4ZM14.6 10.6c0-2 1.7-2.9 1.8-3-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.3.7-2.9.7s-1.5-.7-2.5-.7c-1.3 0-2.5.8-3.2 2-.8 1.5-.2 3.8.6 5 .4.6.9 1.4 1.6 1.4.7 0 1-.4 1.8-.4.8 0 1.1.4 1.8.4.8 0 1.3-.7 1.7-1.3.5-.8.8-1.6.8-1.7 0 0-1.6-.6-1.6-2.8Z"/>
          </svg>
        `,
      };
    }

    if (normalized === "play_store") {
      return {
        label: "Play Store",
        className: "store-badge-play",
        icon: `
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3.8 2.6 12.7 10 3.8 17.4a1.2 1.2 0 0 1-.4-.9V3.5c0-.3.1-.6.4-.9Z"/>
            <path d="m13.7 10 2.2 1.8c.8.6.8 1.7 0 2.3l-1.8 1-7.6-6.4 7.6-6.4 1.8 1c.8.6.8 1.7 0 2.3L13.7 10Z"/>
          </svg>
        `,
      };
    }

    if (normalized === "stripe") {
      return {
        label: "Stripe",
        className: "store-badge-stripe",
        icon: `
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M9.7 7.1c0-.7.6-1 1.4-1 .9 0 2 .3 2.9.8V4.1A7 7 0 0 0 11 3.5c-2.6 0-4.3 1.3-4.3 3.7 0 4 5.5 3.3 5.5 4.9 0 .8-.7 1.1-1.7 1.1s-2.3-.4-3.3-.9v2.9c1 .4 2.1.6 3.4.6 2.7 0 4.6-1.3 4.6-3.8-.1-4.2-5.5-3.5-5.5-4.9Z"/>
          </svg>
        `,
      };
    }

    if (normalized === "promotional") {
      return {
        label: "Promocional",
        className: "store-badge-promo",
        icon: `
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 1.8 12 6l4.6.7-3.3 3.2.8 4.5L10 12.1 5.9 14.4l.8-4.5L3.4 6.7 8 6l2-4.2Z"/>
          </svg>
        `,
      };
    }

    return {
      label: store || "Não informado",
      className: "",
      icon: `
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
        </svg>
      `,
    };
  }

  function renderStoreBadge(store) {
    const meta = getStoreMeta(store);

    return `
      <span class="store-badge ${meta.className}">
        ${meta.icon}
        <span>${escapeHtml(meta.label)}</span>
      </span>
    `;
  }

  function getProjectVisual(projectId) {
    return PROJECT_VISUALS[projectId] || null;
  }

  function getInitials(label) {
    return String(label || "App")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function renderProjectAvatar(project, sizeClass = "") {
    const visual = getProjectVisual(project.projectId);
    const classes = ["project-avatar"];
    if (sizeClass) {
      classes.push(sizeClass);
    }
    if (visual && visual.accentClass) {
      classes.push(visual.accentClass);
    }

    if (visual && visual.iconSrc) {
      return `
        <span class="${classes.join(" ")}">
          <img src="${escapeHtml(visual.iconSrc)}" alt="${escapeHtml(project.label || project.projectId)}" />
        </span>
      `;
    }

    return `
      <span class="${classes.join(" ")} project-avatar-fallback">
        ${escapeHtml(getInitials(project.label || project.projectId))}
      </span>
    `;
  }

  function renderAuthPanel({ eyebrow, title, description, showLogin }) {
    nodes.authPanelEyebrow.textContent = eyebrow;
    nodes.authPanelTitle.textContent = title;
    nodes.authPanelDescription.textContent = description;
    nodes.loginButton.classList.toggle("hidden", !showLogin);
  }

  function renderIdentity() {
    const actor = state.session?.actor || {};
    const displayName =
      actor.name ||
      state.user?.displayName ||
      actor.email ||
      state.user?.email ||
      actor.uid ||
      "Operador";
    const email = actor.email || state.user?.email || actor.uid || "";

    nodes.authIdentityName.textContent = displayName;
    nodes.authIdentityEmail.textContent = email;
    nodes.authIdentity.classList.toggle("hidden", !state.user);
  }

  async function getIdToken() {
    if (!state.user) {
      return null;
    }

    return state.user.getIdToken(true);
  }

  function logRifa(message, detail) {
    if (detail !== undefined) {
      console.log("[rifa]", message, detail);
    } else {
      console.log("[rifa]", message);
    }
  }

  async function apiRequest(path, options = {}) {
    const method = options.method || "GET";
    const url = `${config.functionsBaseUrl}${path}`;
    const logRifaApi = path.includes("/rifa/");

    if (logRifaApi) {
      logRifa("apiRequest", {
        method,
        url,
        functionsBaseUrl: config.functionsBaseUrl,
        hasBody: Boolean(options.body),
      });
    }

    const token = await getIdToken();
    if (!token) {
      if (logRifaApi) {
        logRifa("apiRequest abortado: sem token (sessão)");
      }
      const error = new Error("Sua sessão expirou. Entre novamente.");
      error.status = 401;
      throw error;
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (networkError) {
      if (logRifaApi) {
        logRifa("fetch falhou (rede / CORS / offline)", {
          message: networkError?.message,
          name: networkError?.name,
        });
      }
      throw networkError;
    }

    if (logRifaApi) {
      logRifa("apiRequest HTTP", { status: response.status, ok: response.ok, url });
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (logRifaApi) {
        logRifa("apiRequest erro JSON", {
          status: response.status,
          error: payload?.error || payload,
        });
      }
      const error = new Error(payload.error?.message || "Não foi possível concluir a operação.");
      error.status = response.status;
      throw error;
    }

    if (logRifaApi) {
      logRifa("apiRequest ok", { ok: payload?.ok });
    }

    return payload;
  }

  async function refreshSession() {
    const payload = await apiRequest("/auth/session");
    state.session = payload.session;
    renderIdentity();
  }

  function renderRevenueCatConfigSummary(message, type = "info") {
    if (!message) {
      hideElement(nodes.revenueCatConfigSummary);
      nodes.revenueCatConfigSummary.textContent = "";
      nodes.revenueCatConfigSummary.classList.remove("error");
      return;
    }

    nodes.revenueCatConfigSummary.textContent = message;
    nodes.revenueCatConfigSummary.classList.toggle("error", type === "error");
    showElement(nodes.revenueCatConfigSummary);
  }

  async function refreshRevenueCatProjects() {
    const submitButton = nodes.revenueCatForm.querySelector('button[type="submit"]');

    try {
      const payload = await apiRequest("/revenuecat/projects");
      state.revenueCatProjects = payload.projects || [];
      const hasProjects = state.revenueCatProjects.length > 0;
      nodes.revenueCatInput.disabled = !hasProjects;
      submitButton.disabled = !hasProjects;

      if (!state.revenueCatProjects.length) {
        renderRevenueCatConfigSummary(
          "Nenhum aplicativo foi configurado para consulta no momento.",
        );
        return;
      }

      renderRevenueCatConfigSummary("");
      setFeedback(nodes.revenueCatFeedback, "", null);
    } catch (error) {
      state.revenueCatProjects = [];
      nodes.revenueCatInput.disabled = true;
      submitButton.disabled = true;
      clearRevenueCatResults();
      renderRevenueCatConfigSummary(error.message, "error");
      setFeedback(nodes.revenueCatFeedback, error.message, "error");
      throw error;
    }
  }

  function clearRevenueCatResults() {
    state.revenueCatAppUserId = null;
    nodes.revenueCatResults.innerHTML = "";
    hideElement(nodes.revenueCatResults);
    nodes.reloadHistoryButton.classList.add("hidden");
  }

  function clearRifaResults() {
    if (!nodes.rifaResults) {
      return;
    }
    nodes.rifaResults.innerHTML = "";
    hideElement(nodes.rifaResults);
  }

  function formatBoolean(value) {
    if (value === true) {
      return "Sim";
    }
    if (value === false) {
      return "Não";
    }
    return "Não informado";
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
      return "Não informado";
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return String(value);
    }
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(parsed);
  }

  function renderRifaPhoto(imageLinks) {
    const first = Array.isArray(imageLinks) ? imageLinks.find(Boolean) : null;
    if (!first || typeof first !== "string") {
      return "";
    }

    return `
      <span class="project-avatar project-avatar-large">
        <img src="${escapeHtml(first)}" alt="Foto da rifa" />
      </span>
    `;
  }

  function flattenRifaData(data, prefix = "") {
    const rows = [];
    const excludedKeys = new Set([
      "unlockPrice",
      "unlocked",
      "currentProfit",
      "freeTrialActive",
      "imageLinks",
      "freeTrialExpiresAt",
      "unlockedAt",
      "unlockReason",
      "reservedBuyers",
      "buyers",
    ]);

    const input = data && typeof data === "object" ? data : {};
    for (const [key, value] of Object.entries(input)) {
      if (prefix === "" && excludedKeys.has(key)) {
        continue;
      }

      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        rows.push(...flattenRifaData(value, path));
        continue;
      }

      rows.push({ key: path, value });
    }

    return rows;
  }

  /**
   * Deriva estado de bloqueio a partir de campos comuns (unlocked, isUnlocked, blocked).
   */
  function interpretRifaLockState(data) {
    if (!data || typeof data !== "object") {
      return { state: "unknown", chipUnlocked: null };
    }

    const u = data.unlocked;
    if (u === true || u === "true" || u === 1 || u === "1") {
      return { state: "unlocked", chipUnlocked: true };
    }
    if (u === false || u === "false" || u === 0 || u === "0") {
      return { state: "locked", chipUnlocked: false };
    }

    const iu = data.isUnlocked;
    if (iu === true || iu === "true" || iu === 1 || iu === "1") {
      return { state: "unlocked", chipUnlocked: true };
    }
    if (iu === false || iu === "false" || iu === 0 || iu === "0") {
      return { state: "locked", chipUnlocked: false };
    }

    if (data.blocked === true) {
      return { state: "locked", chipUnlocked: false };
    }
    if (data.blocked === false) {
      return { state: "unlocked", chipUnlocked: true };
    }

    return { state: "unknown", chipUnlocked: null };
  }

  function renderRifaResult(payload) {
    if (!nodes.rifaResults) {
      return;
    }

    const data = payload?.data ?? {};
    state.rifa = {
      rifaId: payload?.rifaId || null,
      data,
    };
    const unlockPrice = data?.unlockPrice;
    const { state: lockState, chipUnlocked } = interpretRifaLockState(data);
    const unlocked = chipUnlocked;
    const currentProfit = data?.currentProfit;
    const freeTrialActive = data?.freeTrialActive;
    const freeTrialExpiresAt = data?.freeTrialExpiresAt;
    const unlockedAt = data?.unlockedAt;
    const unlockReason = data?.unlockReason;
    const reservedBuyersCount = Array.isArray(data?.reservedBuyers) ? data.reservedBuyers.length : null;
    const buyersCount = Array.isArray(data?.buyers) ? data.buyers.length : null;
    const imageLinks = data?.imageLinks;

    const statusTone = unlocked === true ? "success" : unlocked === false ? "" : "";
    const trialTone = freeTrialActive === true ? "success" : "";
    const photo = renderRifaPhoto(imageLinks);
    const toggleLabel = lockState === "unlocked" ? "Bloquear rifa" : "Desbloquear rifa";
    const lockControlsHtml =
      lockState === "unknown"
        ? `
                  <button
                    class="button button-secondary button-compact"
                    type="button"
                    data-rifa-action="lock-rifa"
                  >
                    Bloquear rifa
                  </button>
                  <button
                    class="button button-secondary button-compact"
                    type="button"
                    data-rifa-action="unlock-rifa"
                  >
                    Desbloquear rifa
                  </button>
                `
        : `
                  <button
                    class="button button-secondary button-compact"
                    type="button"
                    data-rifa-action="toggle-lock"
                  >
                    ${escapeHtml(toggleLabel)}
                  </button>
                `;

    const additionalRows = flattenRifaData(data).map((row) => ({
      key: row.key,
      value:
        row.value === null || row.value === undefined
          ? "—"
          : typeof row.value === "string"
            ? row.value
            : JSON.stringify(row.value),
    }));

    nodes.rifaResults.innerHTML = `
      <article class="customer-result">
        <section class="summary-strip theme-royal">
          <div class="summary-hero">
            <div class="app-result-heading">
              ${photo}
              <div class="summary-hero-copy">
                <div class="status-chip-row">
                  <span class="status-chip ${unlocked === true ? "status-chip-success" : "status-chip-muted"}">
                    ${escapeHtml(unlocked === true ? "Rifa desbloqueada" : unlocked === false ? "Rifa bloqueada" : "Status não informado")}
                  </span>
                  ${lockControlsHtml}
                  <div class="inline-days">
                    <input
                      class="input-compact"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      step="1"
                      placeholder="Dias"
                      aria-label="Dias grátis"
                      data-rifa-days-input="1"
                    />
                    <button
                      class="button button-secondary button-compact"
                      type="button"
                      data-rifa-action="add-free-days"
                    >
                      Adicionar dias grátis
                    </button>
                  </div>
                </div>
                <h3>Rifa</h3>
                <p>
                  ID <span class="mono">${escapeHtml(payload?.rifaId || "-")}</span>
                </p>
              </div>
            </div>
          </div>

          <div class="summary-grid">
            ${renderMetricCard("Unlock price", unlockPrice ?? "Não informado")}
            ${renderMetricCard("Unlocked", formatBoolean(unlocked), "", statusTone)}
            ${renderMetricCard("Current profit", formatNumber(currentProfit))}
            ${renderMetricCard("Free trial ativo", formatBoolean(freeTrialActive), "", trialTone)}
            ${renderMetricCard("Free trial expira", formatDate(freeTrialExpiresAt, "Não informado"))}
            ${renderMetricCard("Unlocked at", formatDate(unlockedAt, "Não informado"))}
            ${renderMetricCard("Unlock reason", unlockReason ?? "Não informado")}
            ${renderMetricCard(
              "Compradores",
              buyersCount === null ? "Não informado" : String(buyersCount),
              reservedBuyersCount === null ? "" : `Reservados: ${reservedBuyersCount}`,
            )}
          </div>
        </section>

        <section class="result-section result-section-wide">
          <div class="section-heading compact">
            <h3>Campos adicionais</h3>
          </div>
          ${
            additionalRows.length
              ? renderTable(
                  [
                    { label: "Campo", key: "key" },
                    { label: "Valor", key: "value" },
                  ],
                  additionalRows,
                )
              : '<div class="empty-state">Nenhum campo adicional encontrado.</div>'
          }
        </section>
      </article>
    `;
    showElement(nodes.rifaResults);
  }

  function getCurrentAccess(summary) {
    const items = [...(summary.subscriptions || []), ...(summary.nonSubscriptions || [])];
    const current = items.find((item) => item.productId === summary.currentProduct);
    return current || items[0] || null;
  }

  function getExpirationPresentation(item, fallback = "Sem data de expiração") {
    if (item?.isLifetime) {
      return {
        primary: "Acesso vitalício",
        secondary: "Sem vencimento",
      };
    }

    if (!item?.expiresDate) {
      return {
        primary: fallback,
        secondary: item?.accessPeriodLabel
          ? `Período identificado: ${item.accessPeriodLabel}`
          : "",
      };
    }

    const notes = [formatRelativeDate(item.expiresDate)];
    if (item.expirationSource === "derived_from_product") {
      notes.push("Estimado pelo produto");
    }

    return {
      primary: formatDate(item.expiresDate, "Sem data de expiração", false),
      secondary: notes.filter(Boolean).join(" | "),
    };
  }

  function getManualAccessPresentation(customer) {
    const manualAccess = customer.manualProAccess || null;
    if (!manualAccess) {
      return {
        title: "Nenhum Pro manual ativo",
        detail: "Conceda acesso promocional ao entitlement Pro para este App User ID.",
        tone: "",
      };
    }

    const expiration = getExpirationPresentation(manualAccess, "Sem data de expiração");
    if (manualAccess.isActive) {
      return {
        title: "Pro manual ativo",
        detail: [expiration.primary, expiration.secondary].filter(Boolean).join(" | "),
        tone: "success",
      };
    }

    return {
      title: "Ultimo Pro manual expirado",
      detail: [expiration.primary, expiration.secondary].filter(Boolean).join(" | "),
      tone: "",
    };
  }

  function renderMetricCard(label, primary, secondary = "", tone = "") {
    const toneClass = tone ? ` summary-card-${tone}` : "";

    return `
      <article class="summary-card${toneClass}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(primary)}</strong>
        ${secondary ? `<p>${escapeHtml(secondary)}</p>` : ""}
      </article>
    `;
  }

  function renderProductCell(row) {
    const badges = [];
    if (row.type === "non_subscription") {
      badges.push('<span class="mini-badge">Compra única</span>');
    }
    if (row.accessPeriodLabel) {
      badges.push(`<span class="mini-badge mini-badge-accent">${escapeHtml(row.accessPeriodLabel)}</span>`);
    }

    return `
      <div class="cell-stack">
        <strong class="mono">${escapeHtml(row.productId || "Não informado")}</strong>
        ${badges.length ? `<div class="inline-badges">${badges.join("")}</div>` : ""}
      </div>
    `;
  }

  function renderDateCell(value) {
    return `
      <div class="cell-stack">
        <strong>${escapeHtml(formatDate(value, "-"))}</strong>
      </div>
    `;
  }

  function renderExpirationCell(row, fallback = "Sem data de expiração") {
    const presentation = getExpirationPresentation(row, fallback);

    return `
      <div class="cell-stack cell-stack-date">
        <strong>${escapeHtml(presentation.primary)}</strong>
        ${presentation.secondary ? `<span>${escapeHtml(presentation.secondary)}</span>` : ""}
      </div>
    `;
  }

  function renderManualAccessSection(customer) {
    const projectId = customer.project?.projectId || "";
    const appUserId = customer.appUserId || "";
    const manual = getManualAccessPresentation(customer);

    return `
      <section class="result-section result-section-wide">
        <div class="section-heading compact">
          <h3>Acesso manual Pro</h3>
          <span class="status-chip ${manual.tone ? `status-chip-${manual.tone}` : ""}">
            ${escapeHtml(manual.title)}
          </span>
        </div>
        <div class="manual-access-card">
          <div class="manual-access-overview">
            <div>
              <strong>${escapeHtml(manual.title)}</strong>
              <p>${escapeHtml(manual.detail)}</p>
            </div>
            <p class="manual-access-note">
              Projeto <span class="mono">${escapeHtml(projectId)}</span> | App User ID
              <span class="mono">${escapeHtml(appUserId)}</span>
            </p>
          </div>

          <form
            class="manual-access-form"
            data-project-id="${escapeHtml(projectId)}"
            data-app-user-id="${escapeHtml(appUserId)}"
          >
            <fieldset class="manual-access-fieldset">
              <div class="manual-access-actions">
                <button class="button button-secondary" type="button" data-grant-kind="weekly">
                  Conceder semanal
                </button>
                <button class="button button-secondary" type="button" data-grant-kind="monthly">
                  Conceder mensal
                </button>
                <button class="button button-secondary" type="button" data-grant-kind="annual">
                  Conceder anual
                </button>
              </div>

              <div class="manual-access-custom">
                <label class="field grow">
                  <span>Até data</span>
                  <input
                    type="date"
                    name="customExpirationDate"
                    min="${escapeHtml(getLocalDateInputValue())}"
                  />
                </label>
                <button class="button button-primary" type="button" data-grant-kind="until">
                  Aplicar data
                </button>
              </div>
              <div class="manual-access-footer">
                <div class="feedback manual-access-feedback"></div>
              </div>
            </fieldset>
          </form>
        </div>
      </section>
    `;
  }

  function renderMatchSections(match) {
    const { customer, history } = match;
    const sections = [];

    sections.push(renderManualAccessSection(customer));

    if (customer.entitlements.all.length) {
      sections.push(`
        <section class="result-section">
          <div class="section-heading compact">
            <h3>Acessos</h3>
          </div>
          ${renderTable(
            [
              {
                label: "Status",
                className: "col-status",
                render: (row) => (row.isActive ? "Ativo" : "Inativo"),
              },
              {
                label: "Expira",
                className: "col-expiration",
                render: (row) => renderExpirationCell(row, "Sem data de expiração"),
              },
            ],
            customer.entitlements.all,
          )}
        </section>
      `);
    }

    if (customer.subscriptions.length) {
      sections.push(`
        <section class="result-section">
          <div class="section-heading compact">
            <h3>Assinaturas</h3>
          </div>
          ${renderTable(
            [
              {
                label: "Loja",
                className: "col-store",
                render: (row) => renderStoreBadge(row.store),
              },
              {
                label: "Compra",
                className: "col-date",
                render: (row) => renderDateCell(row.purchaseDate),
              },
              {
                label: "Expira",
                className: "col-expiration",
                render: (row) => renderExpirationCell(row, "Sem data de expiração"),
              },
            ],
            customer.subscriptions,
          )}
        </section>
      `);
    }

    sections.push(`
      <section class="result-section result-section-wide">
        <div class="section-heading compact">
          <h3>Histórico de compras</h3>
        </div>
        ${
          history.items.length
            ? renderTable(
                [
                  {
                    label: "Tipo",
                    className: "col-type",
                    render: (row) => escapeHtml(translateHistoryType(row.type)),
                  },
                  {
                    label: "Produto",
                    className: "col-product",
                    render: (row) => renderProductCell(row),
                  },
                  {
                    label: "Loja",
                    className: "col-store",
                    render: (row) => renderStoreBadge(row.store),
                  },
                  {
                    label: "Data",
                    className: "col-date",
                    render: (row) => renderDateCell(row.eventDate),
                  },
                  {
                    label: "Expira",
                    className: "col-expiration",
                    render: (row) => renderExpirationCell(row, "Sem data de expiração"),
                  },
                ],
                history.items,
              )
            : '<div class="empty-state">Nenhuma compra foi encontrada para este cliente.</div>'
        }
      </section>
    `);

    return `<div class="detail-grid">${sections.join("")}</div>`;
  }

  function renderCustomerMatch(match) {
    const { customer, history } = match;
    const currentAccess = getCurrentAccess(customer);
    const hasActive = customer.status.hasActiveAccess;
    const expiration = getExpirationPresentation(currentAccess, "Sem data de expiração");
    const project = customer.project || {
      projectId: "desconhecido",
      label: "Aplicativo",
    };
    const accentClass = getProjectVisual(project.projectId)?.accentClass || "";
    const historySummary = customer.nonSubscriptionCount
      ? `${history.items.length} registros | ${customer.nonSubscriptionCount} compras únicas`
      : `${history.items.length} registros`;

    return `
      <article class="customer-result">
        <section class="summary-strip ${accentClass}">
          <div class="summary-hero">
            <div class="app-result-heading">
              ${renderProjectAvatar(project, "project-avatar-large")}
              <div class="summary-hero-copy">
                <span class="status-chip ${hasActive ? "status-chip-success" : "status-chip-muted"}">
                  ${escapeHtml(hasActive ? "Acesso ativo" : "Acesso expirado")}
                </span>
                <h3>${escapeHtml(project.label)}</h3>
                <p>
                  <span class="mono">${escapeHtml(project.projectId)}</span>
                  | ${escapeHtml(historySummary)}
                </p>
              </div>
            </div>
            <div class="summary-actions">
              ${
                customer.managementUrl
                  ? `<a class="button button-secondary" href="${escapeHtml(customer.managementUrl)}" target="_blank" rel="noreferrer">Gerenciar assinatura</a>`
                  : ""
              }
            </div>
          </div>

          <div class="summary-grid">
            ${renderMetricCard(
              "Produto atual",
              customer.currentProduct || "Não identificado",
              currentAccess?.accessPeriodLabel || "Último item reconhecido na conta",
            )}
            ${renderMetricCard("Expiração", expiration.primary, expiration.secondary, hasActive ? "success" : "")}
            ${renderMetricCard(
              "Primeiro registro",
              formatDate(customer.firstSeen, "Não informado"),
            )}
            ${renderMetricCard(
              "Loja principal",
              getStoreMeta(currentAccess?.store).label,
              currentAccess?.store ? "Origem mais recente do acesso" : "Não foi possível identificar a loja",
            )}
          </div>
        </section>

        ${renderMatchSections(match)}
      </article>
    `;
  }

  function renderSearchResults(search) {
    const notices = [];

    if (search.totalMatches === 1) {
      notices.push("Encontramos informações para este cliente.");
    } else {
      notices.push("Encontramos este cliente em mais de um aplicativo.");
    }

    if (search.partialErrors && search.partialErrors.length) {
      notices.push("Algumas consultas não puderam ser concluídas.");
    }

    nodes.revenueCatResults.innerHTML = `
      <section class="search-notice">
        <strong>Resultado da busca</strong>
        <p>${escapeHtml(notices.join(" "))}</p>
      </section>
      ${search.matches.map((match) => renderCustomerMatch(match)).join("")}
    `;

    showElement(nodes.revenueCatResults);
    nodes.reloadHistoryButton.classList.remove("hidden");
  }

  async function loadRevenueCat(appUserId) {
    if (!appUserId) {
      throw new Error("Informe o App User ID.");
    }

    state.revenueCatAppUserId = appUserId;
    setFeedback(nodes.revenueCatFeedback, "Consultando cliente...", null);

    const payload = await apiRequest(`/revenuecat/customer/${encodeURIComponent(appUserId)}`);

    renderSearchResults(payload.search);
    setFeedback(nodes.revenueCatFeedback, "Consulta concluída com sucesso.", "success");
  }

  function setManualAccessFormFeedback(form, message, type) {
    setFeedback(form.querySelector(".manual-access-feedback"), message, type);
  }

  function setManualAccessFormBusy(form, isBusy) {
    const fieldset = form.querySelector(".manual-access-fieldset");
    if (fieldset) {
      fieldset.disabled = isBusy;
    }
  }

  function buildPromotionalAccessPayload(form, grantKind) {
    const payload = { grantKind };

    if (grantKind === "until") {
      const rawDate = form.querySelector('[name="customExpirationDate"]')?.value;
      if (!rawDate) {
        throw new Error("Escolha a data final antes de aplicar.");
      }

      payload.expiresAt = toLocalEndOfDayISOString(rawDate);
    }

    return payload;
  }

  async function refreshRevenueCatAfterManualAccess(appUserId, successMessage) {
    await loadRevenueCat(appUserId);
    setFeedback(nodes.revenueCatFeedback, successMessage, "success");
  }

  async function handleGrantPromotionalAccess(form, grantKind) {
    const projectId = form.dataset.projectId;
    const appUserId = form.dataset.appUserId;

    try {
      const payload = buildPromotionalAccessPayload(form, grantKind);
      setManualAccessFormBusy(form, true);
      setManualAccessFormFeedback(form, "Aplicando acesso manual...", null);

      await apiRequest(
        `/revenuecat/projects/${encodeURIComponent(projectId)}/customer/${encodeURIComponent(appUserId)}/promotional-access`,
        {
          method: "POST",
          body: payload,
        },
      );

      await refreshRevenueCatAfterManualAccess(appUserId, "Acesso manual atualizado com sucesso.");
    } catch (error) {
      setManualAccessFormFeedback(form, error.message, "error");
    } finally {
      setManualAccessFormBusy(form, false);
    }
  }

  function hideProtectedPanels() {
    hideElement(nodes.revenueCatPanel);
  }

  function showAccessDenied(user, message) {
    hideProtectedPanels();
    clearRevenueCatResults();
    showElement(nodes.authPanel);
    nodes.logoutButton.classList.remove("hidden");
    renderAuthPanel({
      eyebrow: "Acesso negado",
      title: "Sua conta não tem acesso a este backoffice.",
      description: "Use outra conta autorizada para continuar.",
      showLogin: false,
    });
    nodes.authIdentityName.textContent = user.displayName || user.email || user.uid || "Operador";
    nodes.authIdentityEmail.textContent = user.email || user.uid || "";
    nodes.authIdentity.classList.remove("hidden");
    setFeedback(nodes.authFeedback, message || "Sua conta não tem acesso a este backoffice.", "error");
  }

  async function handleAuthenticatedState(user) {
    state.user = user;
    state.session = null;
    renderIdentity();
    nodes.logoutButton.classList.remove("hidden");
    setFeedback(nodes.authFeedback, "", null);

    try {
      await refreshSession();
    } catch (error) {
      if (error.status === 403) {
        showAccessDenied(user, error.message);
        return;
      }

      renderAuthPanel({
        eyebrow: "Sessão",
        title: "Não foi possível carregar a sessão.",
        description: "Tente entrar novamente em instantes.",
        showLogin: false,
      });
      showElement(nodes.authPanel);
      setFeedback(nodes.authFeedback, error.message, "error");
      return;
    }

    hideElement(nodes.authPanel);
    showElement(nodes.revenueCatPanel);

    try {
      await refreshRevenueCatProjects();
    } catch (error) {
      setFeedback(nodes.authFeedback, error.message, "error");
    }
  }

  function handleSignedOutState() {
    state.user = null;
    state.session = null;
    state.revenueCatProjects = [];
    nodes.logoutButton.classList.add("hidden");
    renderIdentity();
    renderAuthPanel({
      eyebrow: "Acesso",
      title: "Acessar backoffice",
      description: "Entre com a conta Google autorizada para continuar.",
      showLogin: true,
    });
    showElement(nodes.authPanel);
    hideProtectedPanels();
    clearRevenueCatResults();
    nodes.revenueCatInput.value = "";
    renderRevenueCatConfigSummary("");
    setFeedback(nodes.authFeedback, "", null);
    setFeedback(nodes.revenueCatFeedback, "", null);
  }

  async function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    await state.auth.signInWithPopup(provider);
  }

  async function signOut() {
    await state.auth.signOut();
  }

  function attachEvents() {
    nodes.loginButton.addEventListener("click", async () => {
      try {
        await signIn();
      } catch (error) {
        setFeedback(nodes.authFeedback, error.message, "error");
      }
    });

    nodes.logoutButton.addEventListener("click", async () => {
      await signOut();
    });

    nodes.revenueCatForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearRevenueCatResults();

      try {
        await loadRevenueCat(nodes.revenueCatInput.value.trim());
      } catch (error) {
        setFeedback(nodes.revenueCatFeedback, error.message, "error");
      }
    });

    nodes.rifaForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = nodes.rifaInput?.value?.trim();
      if (!value) {
        setFeedback(nodes.rifaFeedback, "Informe o Rifa ID.", "error");
        return;
      }

      clearRifaResults();
      state.rifa = null;
      setFeedback(nodes.rifaFeedback, "Consultando rifa...", null);

      try {
        const payload = await apiRequest(`/rifa/${encodeURIComponent(value)}`);
        renderRifaResult(payload);
        setFeedback(nodes.rifaFeedback, "Consulta concluída com sucesso.", "success");
      } catch (error) {
        clearRifaResults();
        setFeedback(nodes.rifaFeedback, error.message, "error");
      }
    });

    if (!nodes.rifaResults) {
      console.warn("[rifa] #rifa-results não existe no DOM; ações de bloqueio/dias grátis não serão ligadas.");
    }

    nodes.rifaResults?.addEventListener("click", async (event) => {
      logRifa("click em #rifa-results", {
        targetNode: event.target?.nodeName,
        targetIsElement: event.target instanceof Element,
      });

      const button = closestFromClickTarget(event.target, "[data-rifa-action]");
      if (!button) {
        logRifa("nenhum elemento [data-rifa-action] encontrado a partir do target (clique fora dos botões?)");
        return;
      }

      const rifaAction = button.dataset.rifaAction;
      logRifa("botão rifa", { rifaAction, disabled: button.disabled });

      if (rifaAction === "toggle-lock" || rifaAction === "lock-rifa" || rifaAction === "unlock-rifa") {
        const rifaId = state.rifa?.rifaId;
        if (!rifaId) {
          logRifa("abortado: state.rifa.rifaId vazio (consulte a rifa de novo)");
          setFeedback(nodes.rifaFeedback, "Rifa ID nao encontrado. Consulte a rifa novamente.", "error");
          return;
        }

        const lockMeta = interpretRifaLockState(state.rifa?.data);
        let endpoint;
        let actionLabel;

        if (rifaAction === "lock-rifa") {
          endpoint = `/rifa/${encodeURIComponent(rifaId)}/lock`;
          actionLabel = "bloquear";
        } else if (rifaAction === "unlock-rifa") {
          endpoint = `/rifa/${encodeURIComponent(rifaId)}/unlock`;
          actionLabel = "desbloquear";
        } else if (lockMeta.state === "unlocked") {
          endpoint = `/rifa/${encodeURIComponent(rifaId)}/lock`;
          actionLabel = "bloquear";
        } else if (lockMeta.state === "locked") {
          endpoint = `/rifa/${encodeURIComponent(rifaId)}/unlock`;
          actionLabel = "desbloquear";
        } else {
          logRifa("abortado: estado de bloqueio desconhecido para toggle-lock", { lockMeta, rifaAction });
          setFeedback(
            nodes.rifaFeedback,
            "Estado de bloqueio ambíguo: use Bloquear rifa ou Desbloquear rifa (dois botões acima).",
            "error",
          );
          return;
        }

        logRifa(`iniciando ${actionLabel}`, { endpoint, rifaId, lockMeta });
        setFeedback(nodes.rifaFeedback, `Tentando ${actionLabel} rifa...`, null);
        button.disabled = true;
        try {
          const result = await apiRequest(endpoint, { method: "POST", body: {} });
          const payload = await apiRequest(`/rifa/${encodeURIComponent(rifaId)}`);
          renderRifaResult(payload);
          setFeedback(nodes.rifaFeedback, result?.result?.message || "Operacao concluida com sucesso.", "success");
          logRifa(`${actionLabel} concluído com sucesso`);
        } catch (error) {
          logRifa(`${actionLabel} falhou`, { message: error?.message, status: error?.status });
          setFeedback(nodes.rifaFeedback, error.message, "error");
        } finally {
          button.disabled = false;
        }
        return;
      }

      if (rifaAction === "add-free-days") {
        const rifaId = state.rifa?.rifaId;
        const wrapper = button.closest(".status-chip-row") || nodes.rifaResults;
        const input = wrapper?.querySelector("[data-rifa-days-input]");
        const raw = input?.value?.trim();
        const days = Number(raw);

        if (!rifaId) {
          logRifa("add-free-days abortado: sem rifaId");
          setFeedback(nodes.rifaFeedback, "Rifa ID nao encontrado. Consulte a rifa novamente.", "error");
          return;
        }

        if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
          logRifa("add-free-days abortado: dias inválidos", { raw, days });
          setFeedback(nodes.rifaFeedback, "Informe um número válido de dias (ex.: 7).", "error");
          return;
        }

        logRifa("add-free-days", { rifaId, days });
        setFeedback(nodes.rifaFeedback, `Adicionando ${days} dia(s) gratis...`, null);
        button.disabled = true;
        try {
          const result = await apiRequest(`/rifa/${encodeURIComponent(rifaId)}/free-trial`, {
            method: "POST",
            body: { days, trialDays: days },
          });
          const payload = await apiRequest(`/rifa/${encodeURIComponent(rifaId)}`);
          renderRifaResult(payload);
          setFeedback(nodes.rifaFeedback, result?.result?.message || "Operacao concluida com sucesso.", "success");
          logRifa("add-free-days concluído");
        } catch (error) {
          logRifa("add-free-days falhou", { message: error?.message, status: error?.status });
          setFeedback(nodes.rifaFeedback, error.message, "error");
        } finally {
          button.disabled = false;
        }
        return;
      }

      logRifa("clique ignorado: data-rifa-action não tratado", { rifaAction });
    });

    nodes.reloadHistoryButton.addEventListener("click", async () => {
      const appUserId = nodes.revenueCatInput.value.trim() || state.revenueCatAppUserId;
      if (!appUserId) {
        return;
      }

      try {
        await loadRevenueCat(appUserId);
      } catch (error) {
        setFeedback(nodes.revenueCatFeedback, error.message, "error");
      }
    });

    nodes.revenueCatResults.addEventListener("click", async (event) => {
      const grantButton = closestFromClickTarget(event.target, "[data-grant-kind]");
      if (grantButton) {
        const form = grantButton.closest(".manual-access-form");
        if (form) {
          await handleGrantPromotionalAccess(form, grantButton.dataset.grantKind);
        }
      }
    });
  }

  function initFirebase() {
    if (window.location.protocol === "file:") {
      showSetupWarning(
        "Esta página não deve ser aberta por <code>file://</code>. Rode <code>npm run serve</code> e abra a URL local, como <code>http://127.0.0.1:5002</code>.",
      );
      nodes.loginButton.disabled = true;
      return;
    }

    if (!config || !config.firebase || !config.firebase.apiKey) {
      showSetupWarning(
        "Crie o arquivo <code>web/config.js</code> a partir de <code>web/config.example.js</code> para conectar esta interface ao seu projeto Firebase.",
      );
      nodes.loginButton.disabled = true;
      return;
    }

    firebase.initializeApp(config.firebase);
    state.auth = firebase.auth();

    state.auth.onAuthStateChanged(async (user) => {
      if (!user) {
        handleSignedOutState();
        return;
      }

      try {
        await handleAuthenticatedState(user);
      } catch (error) {
        setFeedback(nodes.authFeedback, error.message, "error");
      }
    });
  }

  attachEvents();
  initFirebase();
})();
