(function bootstrap() {
  /** Incremente ao mudar o front; confirme no console se o deploy chegou ao browser. */
  const BACKOFFICE_BUILD_ID = "2026-06-08-revoke-access";
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
    "controle-estoque": {
      iconSrc: "./assets/app-icons/controle-estoque.png",
    },
    "gerador-contratos": {
      iconSrc: "./assets/app-icons/gerador-contratos.png",
    },
  };

  const RIFA_EDITABLE_FIELDS = [
    { field: "email", label: "E-mail", type: "email" },
  ];

  const relativeTimeFormatter = new Intl.RelativeTimeFormat("pt-BR", {
    numeric: "auto",
  });

  const nodes = {
    setupWarning: document.getElementById("setup-warning"),
    setupWarningMessage: document.getElementById("setup-warning-message"),
    authIdentity: document.getElementById("auth-identity"),
    authIdentityName: document.getElementById("auth-identity-name"),
    authIdentityEmail: document.getElementById("auth-identity-email"),
    authAvatar: document.querySelector("#auth-identity .auth-avatar"),
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
    rifaSubmit: document.getElementById("rifa-submit"),
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

  function coerceDate(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number") {
      const timestamp = value > 100000000000 ? value : value * 1000;
      const date = new Date(timestamp);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (/^\d{10,13}$/.test(trimmed)) {
        return coerceDate(Number(trimmed));
      }
      const date = new Date(trimmed);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === "object") {
      const seconds = value.seconds ?? value._seconds;
      if (typeof seconds === "number") {
        return coerceDate(seconds);
      }
    }

    return null;
  }

  function formatDate(value, fallback = "Não informado", withTime = true) {
    const date = coerceDate(value);
    if (!date) {
      return value ? String(value) : fallback;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" } : {}),
    }).format(date);
  }

  function formatRaffleDate(value) {
    const date = coerceDate(value);
    if (!date) {
      return "Não informado";
    }
    const dateLabel = new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "long",
    }).format(date);

    const startOfDay = (d) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };
    const diffDays = Math.round(
      (startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86400000,
    );
    let suffix = "";
    if (diffDays === 0) {
      suffix = " (hoje)";
    } else if (diffDays === 1) {
      suffix = " (amanhã)";
    } else if (diffDays > 1) {
      suffix = ` (${diffDays} dias)`;
    } else if (diffDays === -1) {
      suffix = " (ontem)";
    } else {
      suffix = ` (há ${Math.abs(diffDays)} dias)`;
    }
    return `${dateLabel}${suffix}`;
  }

  function formatRelativeDate(value) {
    const date = coerceDate(value);
    if (!date) {
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
    nodes.loginButton.disabled = !showLogin;
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
    if (nodes.authAvatar) {
      nodes.authAvatar.textContent = getInitials(displayName);
    }
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
      error.details = payload.error?.details || null;
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
    state.rifa = null;
    if (!nodes.rifaResults) {
      return;
    }
    nodes.rifaResults.innerHTML = "";
    hideElement(nodes.rifaResults);
  }

  function setRifaSubmitMode(mode) {
    const btn = nodes.rifaSubmit;
    if (!btn) return;
    if (mode === "clear") {
      btn.dataset.mode = "clear";
      btn.type = "button";
      btn.textContent = "Limpar";
    } else {
      btn.dataset.mode = "search";
      btn.type = "submit";
      btn.textContent = "Consultar";
    }
  }

  function setRifaSubmitLoading(isLoading) {
    const btn = nodes.rifaSubmit;
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Consultando…';
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  function clearSearchResults() {
    clearRevenueCatResults();
    clearRifaResults();
    state.rifa = null;
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

  function formatCurrencyBRL(value) {
    if (value === null || value === undefined || value === "") {
      return "Não informado";
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return String(value);
    }
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed);
  }

  function parsePurchasedNumbers(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  function computeRealProfit(data) {
    const purchased = parsePurchasedNumbers(data?.purchased_numbers);
    const unit = Number.isFinite(Number(data?.price)) ? Number(data.price) : null;
    if (!purchased || unit === null) {
      return null;
    }
    return unit * purchased.length;
  }

  const RIFA_FEE_TIERS = [
    { maxRevenue: 100, fee: 7.99 },
    { maxRevenue: 200, fee: 16.99 },
    { maxRevenue: 400, fee: 26.99 },
    { maxRevenue: 700, fee: 36.99 },
    { maxRevenue: 1000, fee: 47.99 },
    { maxRevenue: 2000, fee: 67.99 },
    { maxRevenue: 4000, fee: 77.99 },
    { maxRevenue: 7000, fee: 127.99 },
    { maxRevenue: 10000, fee: 199.99 },
    { maxRevenue: 20000, fee: 249.99 },
    { maxRevenue: 30000, fee: 499.99 },
    { maxRevenue: 50000, fee: 999.99 },
    { maxRevenue: 70000, fee: 1499.99 },
    { maxRevenue: 100000, fee: 1999.99 },
    { maxRevenue: 150000, fee: 2999.99 },
    { maxRevenue: Infinity, fee: 3999.99 },
  ];

  function computePotentialRevenue(data) {
    const price = Number(data?.price);
    const slots = Number(data?.slots);
    if (!Number.isFinite(price) || !Number.isFinite(slots) || price <= 0 || slots <= 0) {
      return null;
    }
    return price * slots;
  }

  function getRifaFeeTier(revenue) {
    if (!Number.isFinite(revenue) || revenue <= 0) {
      return null;
    }
    const tier = RIFA_FEE_TIERS.find((t) => revenue <= t.maxRevenue) || RIFA_FEE_TIERS[RIFA_FEE_TIERS.length - 1];
    const tierLabel = Number.isFinite(tier.maxRevenue)
      ? `Até ${formatCurrencyBRL(tier.maxRevenue)}`
      : `Acima de ${formatCurrencyBRL(RIFA_FEE_TIERS[RIFA_FEE_TIERS.length - 2].maxRevenue)}`;
    const percentOfRevenue = (tier.fee / revenue) * 100;
    return { fee: tier.fee, tierLabel, percentOfRevenue };
  }

  function formatPercentBR(value) {
    if (!Number.isFinite(value)) {
      return "—";
    }
    return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
  }

  function buildRifaFeeSupportMessage(data) {
    const revenue = computePotentialRevenue(data);
    const tier = revenue !== null ? getRifaFeeTier(revenue) : null;
    if (!revenue || !tier) {
      return null;
    }
    return `Olá! A taxa de ativação da sua rifa é de ${formatCurrencyBRL(tier.fee)}.`;
  }

  function pickFirstText(...values) {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text) {
        return text;
      }
    }
    return "";
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
  }

  function getRifaTitle(data) {
    return pickFirstText(
      data?.title,
      data?.name,
      data?.raffleName,
      data?.raffleTitle,
      data?.description,
      data?.prize,
      "Rifa sem título",
    );
  }

  function getRifaImageLinks(data) {
    const arr = Array.isArray(data?.imagesLinks)
      ? data.imagesLinks
      : Array.isArray(data?.imageLinks)
        ? data.imageLinks
        : null;
    if (arr) {
      return arr.filter((item) => typeof item === "string" && item.trim());
    }
    if (typeof data?.imageUrl === "string" && data.imageUrl.trim()) {
      return [data.imageUrl.trim()];
    }
    return [];
  }

  function formatPhone(data) {
    const ddi = pickFirstText(data?.ddi, data?.countryCode, data?.phoneDdi);
    const phone = pickFirstText(data?.phone, data?.phoneNumber, data?.whatsapp);
    if (!ddi && !phone) {
      return "";
    }

    const cleanDdi = ddi.replace(/[^\d+]/g, "");
    const cleanPhone = phone.replace(/[^\d]/g, "");
    if (cleanDdi && cleanPhone) {
      return `${cleanDdi.startsWith("+") ? cleanDdi : `+${cleanDdi}`} ${cleanPhone}`;
    }
    return phone || ddi;
  }

  function formatMaybeDate(value) {
    if (value === null || value === undefined || value === "") {
      return "Não informado";
    }
    return formatDate(value, "Não informado");
  }

  function renderProjectLabel(appKey, label, sizeClass = "project-avatar-tiny") {
    const project = {
      projectId: appKey,
      label: label || appKey || "Rifa",
    };
    return `
      <span class="app-inline-label">
        ${renderProjectAvatar(project, sizeClass)}
        <span>${escapeHtml(project.label)}</span>
      </span>
    `;
  }

  function renderSpecValue(value, meta = "") {
    const isEmpty =
      value === null ||
      value === undefined ||
      value === "" ||
      value === "Não informado" ||
      value === "Nao informado";
    const valueHtml = isEmpty
      ? '<span class="spec-value spec-empty">—</span>'
      : `<span class="spec-value">${escapeHtml(value)}</span>`;
    const cleanMeta = String(meta || "").trim();
    const metaIsEmpty =
      !cleanMeta ||
      /(:\s*)?(Não informado|Nao informado)\s*$/.test(cleanMeta) ||
      cleanMeta === "Não informado";
    const metaHtml = metaIsEmpty ? "" : `<span class="spec-meta">${escapeHtml(cleanMeta)}</span>`;
    return `${valueHtml}${metaHtml}`;
  }

  function renderSpecValueMono(value) {
    const isEmpty =
      value === null || value === undefined || value === "" || value === "Não informado";
    if (isEmpty) {
      return '<span class="spec-value spec-empty">—</span>';
    }
    return `<span class="spec-value mono">${escapeHtml(value)}</span>`;
  }

  const ICON_LOCK_CLOSED = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>`;
  const ICON_LOCK_OPEN = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.2"/><path d="M5 7V5a3 3 0 0 1 5.2-2"/></svg>`;
  const ICON_PLUS = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3.5v9 M3.5 8h9"/></svg>`;
  const ICON_CHEVRON_RIGHT = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>`;

  function renderRifaThumb(imageLinks, title) {
    const first = Array.isArray(imageLinks) ? imageLinks.find(Boolean) : null;
    if (!first) {
      return "";
    }
    return `
      <span class="rifa-thumb">
        <img src="${escapeHtml(first)}" alt="${escapeHtml(title || "Foto da rifa")}" loading="lazy" />
      </span>
    `;
  }

  function renderCellStack(primary, secondary = "") {
    return `
      <span class="cell-stack">
        <strong>${escapeHtml(primary || "Não informado")}</strong>
        ${secondary ? `<span>${escapeHtml(secondary)}</span>` : ""}
      </span>
    `;
  }

  function renderRifaIdentityCell(match) {
    const data = match?.data || {};
    const title = getRifaTitle(data);
    const images = getRifaImageLinks(data);
    return `
      <span class="rifa-identity-cell">
        ${renderRifaThumb(images, title)}
        ${renderCellStack(title, match?.firestoreDocumentId ? `Documento ${match.firestoreDocumentId}` : "")}
      </span>
    `;
  }

  function renderRifaContactCell(data) {
    const phone = formatPhone(data);
    const email = pickFirstText(data?.email);
    if (phone) {
      return renderCellStack(phone, email);
    }
    return renderCellStack(email || "Contato não informado");
  }

  function renderRifaSituationCell(data) {
    const { state } = interpretRifaLockState(data);
    const status =
      state === "unlocked"
        ? "Desbloqueada"
        : state === "locked"
          ? "Bloqueada"
          : "Status não informado";

    const slots = Number.isFinite(Number(data?.slots)) ? Number(data.slots) : null;
    const purchased = parsePurchasedNumbers(data?.purchased_numbers);
    const purchasedCount = purchased ? purchased.length : null;
    const soldPercent =
      slots && slots > 0 && purchasedCount !== null
        ? Math.round((purchasedCount / slots) * 100)
        : null;
    const realProfit = computeRealProfit(data);

    const parts = [];
    if (purchasedCount !== null && slots !== null) {
      parts.push(
        soldPercent !== null
          ? `${purchasedCount}/${slots} (${soldPercent}%)`
          : `${purchasedCount}/${slots}`,
      );
    } else if (purchasedCount !== null) {
      parts.push(`${purchasedCount} vendido(s)`);
    }
    if (realProfit !== null) {
      parts.push(`Lucro ${formatCurrencyBRL(realProfit)}`);
    }

    if (!parts.length) {
      const buyersCount = Array.isArray(data?.buyers) ? data.buyers.length : null;
      const reservedBuyersCount = Array.isArray(data?.reservedBuyers) ? data.reservedBuyers.length : null;
      if (buyersCount !== null) parts.push(`${buyersCount} comprador(es)`);
      if (reservedBuyersCount !== null) parts.push(`${reservedBuyersCount} reservado(s)`);
    }

    return renderCellStack(status, parts.join(" · "));
  }

  function renderDetailItem(label, value, options = {}) {
    const display = value === null || value === undefined || value === "" ? "Não informado" : value;
    return `
      <div class="detail-item ${options.wide ? "detail-item-wide" : ""}">
        <span>${escapeHtml(label)}</span>
        <strong class="${options.mono ? "mono" : ""}">${escapeHtml(display)}</strong>
      </div>
    `;
  }

  function renderRifaImageGallery(imageLinks) {
    if (!imageLinks.length) {
      return '<div class="empty-state">Nenhuma imagem cadastrada.</div>';
    }
    return `
      <div class="rifa-image-gallery">
        ${imageLinks
          .map(
            (src, index) => `
              <a href="${escapeHtml(src)}" target="_blank" rel="noreferrer">
                <img src="${escapeHtml(src)}" alt="Imagem da rifa ${index + 1}" loading="lazy" />
              </a>
            `,
          )
          .join("")}
      </div>
    `;
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

  function renderRifaEditSection(match) {
    const data = match?.data ?? {};
    const appKey = match?.appKey || "";
    const fieldsHtml = RIFA_EDITABLE_FIELDS.map((config) => {
      const value = data?.[config.field] ?? "";
      return `
        <label class="field grow">
          <span>${escapeHtml(config.label)}</span>
          <input
            name="${escapeHtml(config.field)}"
            type="${escapeHtml(config.type || "text")}"
            value="${escapeHtml(value)}"
            autocomplete="off"
            required
            data-rifa-edit-input="${escapeHtml(config.field)}"
          />
        </label>
      `;
    }).join("");

    return `
      <form class="rifa-edit-form inline-edit-panel" data-rifa-edit-form="1" data-app-key="${escapeHtml(appKey)}">
        <div>
          <h3>Editar e-mail</h3>
          <p>Atualize o e-mail operacional salvo no documento da rifa.</p>
        </div>
        <div class="inline-edit-fields">
          ${fieldsHtml}
          <button class="button button-primary" type="submit">
            Salvar e-mail
          </button>
        </div>
      </form>
    `;
  }

  function flattenRifaData(data, prefix = "") {
    const rows = [];
    const excludedKeys = new Set([
      "unlockPrice",
      "price",
      "unlocked",
      "freeTrialActive",
      "imageLinks",
      "imagesLinks",
      "reservedBuyers",
      "buyers",
      "title",
      "name",
      "raffleName",
      "raffleTitle",
      "description",
      "prize",
      "email",
      "ddi",
      "countryCode",
      "phoneDdi",
      "phone",
      "phoneNumber",
      "whatsapp",
      "raffleDate",
      "raffle_date",
      "imageUrl",
      "slots",
      "purchased_numbers",
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

  function normalizeRifaMatches(payload) {
    if (Array.isArray(payload?.matches)) {
      return payload.matches;
    }

    if (payload?.data) {
      return [
        {
          appKey: "rifa-facil",
          label: "Rifa Facil",
          projectId: payload?.meta?.rifaLookupProjectId || "",
          collection: payload?.meta?.rifaLookupCollection || "raffles",
          firestoreDocumentId: payload?.meta?.firestoreDocumentId || payload?.rifaId || "",
          rifaId: payload?.rifaId || "",
          data: payload.data,
        },
      ];
    }

    return [];
  }

  function getRifaCorrelationStatusLabel(status) {
    if (status === "recurring") {
      return "Cliente recorrente";
    }
    if (status === "single") {
      return "Rifa única";
    }
    return "Correlação indisponível";
  }

  function getRifaCorrelationStatusClass(status) {
    if (status === "recurring") {
      return "status-chip-success";
    }
    if (status === "single") {
      return "status-chip-muted";
    }
    return "status-chip-muted";
  }

  function renderRifaCorrelationPanel(correlation) {
    if (!correlation) {
      return "";
    }

    if (!correlation.email) {
      return `
        <article class="record-panel rifa-correlation-panel">
          <header class="record-header">
            <div class="record-title">
              <h3>Correlação por e-mail</h3>
              <p>Preencha o e-mail da rifa para identificar se o cliente tem outras rifas.</p>
            </div>
            <span class="status-chip status-chip-muted">Sem e-mail</span>
          </header>
        </article>
      `;
    }

    const matches = Array.isArray(correlation.matches) ? correlation.matches : [];
    const countsByApp = Array.isArray(correlation.countsByApp) ? correlation.countsByApp : [];
    const partialErrors = Array.isArray(correlation.partialErrors) ? correlation.partialErrors : [];
    const countsHtml = countsByApp.length
      ? countsByApp
          .map(
            (item) =>
              `<span>${escapeHtml(String(item.count || 0))} ${
                Number(item.count) === 1 ? "rifa" : "rifas"
              } em ${escapeHtml(item.label || item.appKey)}</span>`,
          )
          .join("")
      : '<span class="empty">Nenhuma rifa encontrada</span>';

    const rows = matches.map((match) => ({
      appKey: match.appKey || "",
      appLabel: match.label || match.appKey || "Rifa",
      rifaId: match.rifaId || match.firestoreDocumentId || "",
      match,
      data: match.data || {},
    }));

    return `
      <article class="record-panel rifa-correlation-panel">
        <header class="record-header">
          <div class="record-title">
            <h3>Correlação por e-mail</h3>
            <p>
              <span class="mono">${escapeHtml(correlation.email)}</span>
              | ${escapeHtml(String(correlation.total || 0))} rifa(s) encontrada(s)
            </p>
          </div>
          <span class="status-chip ${getRifaCorrelationStatusClass(correlation.status)}">
            ${escapeHtml(getRifaCorrelationStatusLabel(correlation.status))}
          </span>
        </header>

        <p class="correlation-counts">${countsHtml}</p>

        ${
          rows.length
            ? renderTable(
                [
                  {
                    label: "App",
                    key: "appLabel",
                    render: (row) => renderProjectLabel(row.appKey, row.appLabel),
                  },
                  {
                    label: "Rifa",
                    key: "rifaId",
                    render: (row) => renderRifaIdentityCell(row.match),
                  },
                  {
                    label: "Contato",
                    key: "rifaId",
                    render: (row) => renderRifaContactCell(row.data),
                  },
                  {
                    label: "Situação",
                    key: "rifaId",
                    render: (row) => renderRifaSituationCell(row.data),
                  },
                  {
                    label: "Ação",
                    key: "rifaId",
                    render: (row) => `
                      <button
                        class="link-action"
                        type="button"
                        data-rifa-action="open-related-rifa"
                        data-rifa-id="${escapeHtml(row.rifaId)}"
                      >
                        Abrir ${ICON_CHEVRON_RIGHT}
                      </button>
                    `,
                  },
                ],
                rows,
              )
            : '<div class="empty-state">Nenhuma rifa relacionada encontrada para este e-mail.</div>'
        }

        ${
          partialErrors.length
            ? `<p class="correlation-warning">${escapeHtml(partialErrors.length)} app(s) não puderam ser consultados por permissão.</p>`
            : ""
        }
      </article>
    `;
  }

  function renderRifaFeeSection(match) {
    const data = match?.data || {};
    const appKey = match?.appKey || "";
    const revenue = computePotentialRevenue(data);
    const tier = revenue !== null ? getRifaFeeTier(revenue) : null;

    const price = Number(data?.price);
    const slots = Number(data?.slots);
    const priceLabel = Number.isFinite(price) && price > 0 ? formatCurrencyBRL(price) : "Não informado";
    const slotsLabel =
      Number.isFinite(slots) && slots > 0
        ? new Intl.NumberFormat("pt-BR").format(slots)
        : "Não informado";
    const revenueLabel = revenue !== null ? formatCurrencyBRL(revenue) : "Não informado";
    const tierLabelText = tier ? tier.tierLabel : "Não informado";
    const feeLabel = tier ? formatCurrencyBRL(tier.fee) : "Não informado";
    const percentLabel = tier ? formatPercentBR(tier.percentOfRevenue) : "Não informado";

    const canCopy = Boolean(tier);
    const copyButton = `
      <button
        class="button button-secondary button-compact rifa-fee-copy"
        type="button"
        data-rifa-action="copy-fee-message"
        data-app-key="${escapeHtml(appKey)}"
        ${canCopy ? "" : "disabled"}
      >
        Copiar mensagem para o suporte
      </button>
    `;

    return `
      <div class="rifa-detail-section">
        <div class="section-heading compact">
          <h3>Taxa de ativação</h3>
        </div>
        <div class="detail-grid">
          ${renderDetailItem("Faturamento potencial", revenueLabel, { wide: true })}
          ${renderDetailItem("Cálculo", `${slotsLabel} cotas × ${priceLabel}`)}
          ${renderDetailItem("Faixa", tierLabelText)}
          ${renderDetailItem("Taxa de ativação", feeLabel)}
          ${renderDetailItem("% do faturamento", percentLabel)}
        </div>
        <div class="rifa-fee-actions">
          ${copyButton}
        </div>
      </div>
    `;
  }

  function renderRifaOperationalDetails(match) {
    const data = match?.data || {};
    const title = getRifaTitle(data);
    const phone = formatPhone(data);
    const imageLinks = getRifaImageLinks(data);
    const additionalRows = flattenRifaData(data).map((row) => ({
      key: row.key,
      value:
        row.value === null || row.value === undefined
          ? "—"
          : typeof row.value === "string" || typeof row.value === "number" || typeof row.value === "boolean"
            ? String(row.value)
            : JSON.stringify(row.value),
    }));

    return `
      <section class="rifa-details">
        <div class="rifa-detail-section">
          <div class="section-heading compact">
            <h3>Identificação</h3>
          </div>
          <div class="detail-grid">
            ${renderDetailItem("Título", title, { wide: true })}
            ${renderDetailItem("Descrição", data?.description || "Não informado", { wide: true })}
          </div>
        </div>

        <div class="rifa-detail-section">
          <div class="section-heading compact">
            <h3>Contato</h3>
          </div>
          <div class="detail-grid">
            ${renderDetailItem("E-mail", data?.email || "Não informado", { wide: true })}
            ${renderDetailItem("Telefone", phone || "Não informado")}
            ${renderDetailItem("DDI", pickFirstText(data?.ddi, data?.countryCode, data?.phoneDdi) || "Não informado")}
          </div>
        </div>

        <div class="rifa-detail-section">
          <div class="section-heading compact">
            <h3>Sorteio</h3>
          </div>
          <div class="detail-grid">
            ${renderDetailItem("Data da rifa", formatRaffleDate(data?.raffle_date ?? data?.raffleDate), { wide: true })}
            ${renderDetailItem("Preço", formatCurrencyBRL(data?.price ?? data?.unlockPrice))}
            ${renderDetailItem("Receita atual", formatCurrencyBRL(computeRealProfit(data)))}
          </div>
        </div>

        ${renderRifaFeeSection(match)}

        <div class="rifa-detail-section">
          <div class="section-heading compact">
            <h3>Mídia</h3>
          </div>
          ${renderRifaImageGallery(imageLinks)}
        </div>

        <details class="raw-fields rifa-detail-section-wide">
          <summary>Campos técnicos</summary>
          ${
            additionalRows.length
              ? renderTable(
                  [
                    { label: "Campo", key: "key" },
                    { label: "Valor", key: "value" },
                  ],
                  additionalRows,
                )
              : '<div class="empty-state">Nenhum campo técnico adicional encontrado.</div>'
          }
        </details>
      </section>
    `;
  }

  function renderRifaMatchCard(match) {
    const data = match?.data ?? {};
    const appKey = match?.appKey || "";
    const project = {
      projectId: appKey,
      label: match?.label || appKey || "Rifa",
    };
    const accentClass = getProjectVisual(appKey)?.accentClass || "";
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
    const slots = Number.isFinite(Number(data?.slots)) ? Number(data.slots) : null;
    const purchasedNumbers = parsePurchasedNumbers(data?.purchased_numbers);
    const purchasedCount = purchasedNumbers ? purchasedNumbers.length : null;
    const soldPercent =
      slots && slots > 0 && purchasedCount !== null
        ? Math.round((purchasedCount / slots) * 100)
        : null;
    const unitPrice = Number.isFinite(Number(data?.price)) ? Number(data.price) : null;
    const realProfit =
      unitPrice !== null && purchasedCount !== null ? unitPrice * purchasedCount : null;
    const imageLinks = getRifaImageLinks(data);

    const photo = renderRifaPhoto(imageLinks);
    const toggleLabel = lockState === "unlocked" ? "Bloquear rifa" : "Desbloquear rifa";
    const toggleIcon = lockState === "unlocked" ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN;
    const actionAttrs = `data-app-key="${escapeHtml(appKey)}"`;
    const lockControlsHtml =
      lockState === "unknown"
        ? `
                  <button
                    class="button button-secondary button-compact"
                    type="button"
                    data-rifa-action="lock-rifa"
                    ${actionAttrs}
                  >
                    <span class="button-icon">${ICON_LOCK_CLOSED}</span>
                    Bloquear rifa
                  </button>
                  <button
                    class="button button-secondary button-compact"
                    type="button"
                    data-rifa-action="unlock-rifa"
                    ${actionAttrs}
                  >
                    <span class="button-icon">${ICON_LOCK_OPEN}</span>
                    Desbloquear rifa
                  </button>
                `
        : `
                  <button
                    class="button button-primary"
                    type="button"
                    data-rifa-action="toggle-lock"
                    ${actionAttrs}
                  >
                    <span class="button-icon">${toggleIcon}</span>
                    ${escapeHtml(toggleLabel)}
                  </button>
                `;

    const statusLabel =
      unlocked === true
        ? "Rifa desbloqueada"
        : unlocked === false
          ? "Rifa bloqueada"
          : "Status não informado";
    const statusClass = unlocked === true ? "status-chip-success" : "status-chip-muted";
    const freeTrialLabel = [
      formatBoolean(freeTrialActive),
      freeTrialExpiresAt ? `expira ${formatDate(freeTrialExpiresAt, "Não informado")}` : "",
    ].filter(Boolean).join(" | ");
    const unlockDetail = [
      unlockedAt ? `em ${formatDate(unlockedAt, "Não informado")}` : "",
      unlockReason ? `motivo: ${unlockReason}` : "",
    ].filter(Boolean).join(" | ") || "Não informado";

    return `
      <article class="record-panel rifa-record ${accentClass}" data-rifa-record="1">
        <header class="record-header">
          <div class="app-result-heading">
              ${renderProjectAvatar(project, "project-avatar-large")}
              <div class="record-title">
                <h3>${escapeHtml(project.label)}</h3>
              </div>
          </div>
          <div class="record-status">
            <span class="status-chip ${statusClass}">${escapeHtml(statusLabel)}</span>
          </div>
        </header>

        <div class="rifa-actions-bar">
          <div class="rifa-actions-group">
            <span class="action-group-label">Acesso</span>
            <div class="rifa-actions-group-actions">
              ${lockControlsHtml}
            </div>
          </div>
          <div class="rifa-actions-divider" aria-hidden="true"></div>
          <div class="rifa-actions-group">
            <span class="action-group-label">Trial grátis</span>
            <div class="rifa-actions-group-actions">
              <span class="input-with-suffix">
                <input
                  class="input-compact"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  placeholder="7"
                  aria-label="Dias grátis"
                  data-rifa-days-input="1"
                />
                <span class="input-suffix">dias</span>
              </span>
              <button
                class="button button-secondary button-compact"
                type="button"
                data-rifa-action="add-free-days"
                ${actionAttrs}
              >
                <span class="button-icon">${ICON_PLUS}</span>
                Adicionar
              </button>
            </div>
          </div>
        </div>

        <dl class="spec-grid">
          <div>
            <dt>Lucro atual</dt>
            <dd>
              ${renderSpecValue(
                formatCurrencyBRL(realProfit),
                `Preço: ${formatCurrencyBRL(unitPrice ?? unlockPrice)}`,
              )}
            </dd>
          </div>
          <div>
            <dt>Free trial</dt>
            <dd>
              ${renderSpecValue(freeTrialLabel)}
            </dd>
          </div>
          <div>
            <dt>Desbloqueio</dt>
            <dd>
              ${renderSpecValue(formatBoolean(unlocked), unlockDetail)}
            </dd>
          </div>
          <div>
            <dt>Compradores</dt>
            <dd>
              ${renderSpecValue(
                buyersCount === null ? null : String(buyersCount),
                reservedBuyersCount === null ? "" : `Reservados: ${reservedBuyersCount}`,
              )}
            </dd>
          </div>
          <div>
            <dt>Vendidos</dt>
            <dd>
              ${renderSpecValue(
                soldPercent === null ? null : `${soldPercent}%`,
                slots !== null && purchasedCount !== null
                  ? `${purchasedCount} de ${slots} números`
                  : "",
              )}
            </dd>
          </div>
        </dl>

        ${renderRifaEditSection(match)}

        ${renderRifaOperationalDetails(match)}
      </article>
    `;
  }

  function renderRifaResult(payload) {
    if (!nodes.rifaResults) {
      return;
    }

    const matches = normalizeRifaMatches(payload);
    const emailCorrelation = payload?.emailCorrelation || null;
    state.rifa = {
      rifaId: payload?.rifaId || matches[0]?.rifaId || null,
      matches,
      emailCorrelation,
    };

    const correlationHtml = renderRifaCorrelationPanel(emailCorrelation);
    const matchesHtml = matches.length ? matches.map(renderRifaMatchCard).join("") : "";
    const hasResultHtml = Boolean(correlationHtml || matchesHtml);
    nodes.rifaResults.innerHTML = hasResultHtml
      ? `${correlationHtml}${matchesHtml}`
      : '<div class="empty-state">Nenhuma rifa encontrada.</div>';
    showElement(nodes.rifaResults);
    setRifaSubmitMode("clear");
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
    const entitlementId = manualAccess?.entitlementId || customer.project?.entitlementId || "pro";
    const entitlementLabel = `entitlement ${entitlementId}`;

    if (!manualAccess) {
      return {
        title: "Nenhum acesso manual ativo",
        detail: `Conceda acesso promocional ao ${entitlementLabel} para este App User ID.`,
        tone: "",
        entitlementId,
      };
    }

    const expiration = getExpirationPresentation(manualAccess, "Sem data de expiração");
    if (manualAccess.isActive) {
      return {
        title: "Acesso manual ativo",
        detail: [entitlementLabel, expiration.primary, expiration.secondary].filter(Boolean).join(" | "),
        tone: "success",
        entitlementId,
      };
    }

    return {
      title: "Ultimo acesso manual expirado",
      detail: [entitlementLabel, expiration.primary, expiration.secondary].filter(Boolean).join(" | "),
      tone: "",
      entitlementId,
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
    const canRevoke = Boolean(customer.manualProAccess?.isActive);

    return `
      <section class="result-section result-section-wide">
        <div class="section-heading compact">
          <h3>Acesso manual</h3>
          <div class="section-heading-actions">
            <span class="status-chip ${manual.tone ? `status-chip-${manual.tone}` : ""}">
              ${escapeHtml(manual.title)}
            </span>
            ${
              canRevoke
                ? `<button
                  class="button button-compact button-danger-ghost"
                  type="button"
                  data-action="revoke"
                >
                  Remover acesso
                </button>`
                : ""
            }
          </div>
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

        ${
          customer.isEmpty
            ? `<div class="empty-customer-notice">Sem compras ou acessos registrados — use a liberação manual abaixo.</div>`
            : ""
        }

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

  async function loadRifaById(rifaId, options = {}) {
    const value = String(rifaId || "").trim();
    if (!value) {
      setFeedback(nodes.rifaFeedback, "Informe o Rifa ID.", "error");
      return;
    }

    if (!options.preserveResults) {
      clearRifaResults();
    }
    if (nodes.rifaInput) {
      nodes.rifaInput.value = value;
    }
    setFeedback(nodes.rifaFeedback, options.feedbackMessage || "Consultando rifa...", null);

    const payload = await apiRequest(`/rifa/${encodeURIComponent(value)}`);
    renderRifaResult(payload);
    if (options.scrollToRecord) {
      nodes.rifaResults?.querySelector("[data-rifa-record]")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    setFeedback(nodes.rifaFeedback, "Consulta concluída com sucesso.", "success");
  }

  async function loadRifasByEmail(email) {
    const value = String(email || "").trim();
    if (!value) {
      setFeedback(nodes.rifaFeedback, "Informe o e-mail do cliente.", "error");
      return;
    }

    clearRifaResults();
    setFeedback(nodes.rifaFeedback, "Buscando rifas por e-mail...", null);

    const payload = await apiRequest(`/rifa/by-email/${encodeURIComponent(value)}`);
    renderRifaResult(payload);
    setFeedback(nodes.rifaFeedback, "Busca por e-mail concluída com sucesso.", "success");
  }

  async function loadRifaLookup(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      setFeedback(nodes.rifaFeedback, "Informe o Rifa ID ou e-mail.", "error");
      return;
    }

    if (looksLikeEmail(normalized)) {
      await loadRifasByEmail(normalized);
      return;
    }

    if (normalized.includes("@")) {
      throw new Error("Informe um e-mail válido ou um Rifa ID.");
    }

    await loadRifaById(normalized);
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

  async function handleRevokePromotionalAccess(form, triggerButton = null) {
    const projectId = form.dataset.projectId;
    const appUserId = form.dataset.appUserId;

    if (!window.confirm("Remover o acesso manual deste cliente?")) {
      return;
    }

    try {
      if (triggerButton) {
        triggerButton.disabled = true;
      }
      setManualAccessFormBusy(form, true);
      setManualAccessFormFeedback(form, "Removendo acesso manual...", null);

      await apiRequest(
        `/revenuecat/projects/${encodeURIComponent(projectId)}/customer/${encodeURIComponent(appUserId)}/revoke-promotional-access`,
        { method: "POST" },
      );

      await refreshRevenueCatAfterManualAccess(appUserId, "Acesso manual removido com sucesso.");
    } catch (error) {
      setManualAccessFormFeedback(form, error.message, "error");
    } finally {
      setManualAccessFormBusy(form, false);
      if (triggerButton?.isConnected) {
        triggerButton.disabled = false;
      }
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
    provider.setCustomParameters({ prompt: "select_account" });
    nodes.loginButton.disabled = true;
    setFeedback(nodes.authFeedback, "Abrindo login do Google...", null);

    try {
      await state.auth.signInWithPopup(provider);
    } finally {
      if (!state.user) {
        nodes.loginButton.disabled = false;
      }
    }
  }

  function getSignInErrorMessage(error) {
    if (error?.code === "auth/popup-blocked") {
      return "O navegador bloqueou o pop-up do Google. Libere pop-ups para code-fusion-backoffice.web.app e tente novamente.";
    }

    if (error?.code === "auth/popup-closed-by-user") {
      return "Login cancelado. Clique em Entrar com Google para tentar novamente.";
    }

    return error?.message || "Não foi possível iniciar o login com Google.";
  }

  async function signOut() {
    await state.auth.signOut();
  }

  function attachEvents() {
    nodes.loginButton.addEventListener("click", async () => {
      try {
        await signIn();
      } catch (error) {
        setFeedback(nodes.authFeedback, getSignInErrorMessage(error), "error");
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

      if (nodes.rifaSubmit?.dataset.mode === "clear") {
        if (nodes.rifaInput) nodes.rifaInput.value = "";
        setFeedback(nodes.rifaFeedback, "", null);
        clearRifaResults();
        nodes.rifaInput?.focus();
        return;
      }

      const value = nodes.rifaInput?.value?.trim();
      if (!value) {
        setFeedback(nodes.rifaFeedback, "Informe o Rifa ID ou e-mail.", "error");
        return;
      }

      clearRifaResults();
      setRifaSubmitLoading(true);
      try {
        await loadRifaLookup(value);
      } catch (error) {
        clearRifaResults();
        setRifaSubmitMode("search");
        setFeedback(nodes.rifaFeedback, error.message, "error");
      } finally {
        setRifaSubmitLoading(false);
      }
    });

    nodes.rifaSubmit?.addEventListener("click", (event) => {
      if (nodes.rifaSubmit.dataset.mode !== "clear") return;
      event.preventDefault();
      if (nodes.rifaInput) nodes.rifaInput.value = "";
      setFeedback(nodes.rifaFeedback, "", null);
      clearRifaResults();
      setRifaSubmitMode("search");
      nodes.rifaInput?.focus();
    });

    nodes.rifaInput?.addEventListener("input", () => {
      if (nodes.rifaSubmit?.dataset.mode === "clear") {
        setRifaSubmitMode("search");
      }
    });

    if (!nodes.rifaResults) {
      console.warn("[rifa] #rifa-results não existe no DOM; ações de bloqueio/dias grátis não serão ligadas.");
    }

    nodes.rifaResults?.addEventListener("submit", async (event) => {
      const form = event.target?.closest?.("[data-rifa-edit-form]");
      if (!form) {
        return;
      }

      event.preventDefault();

      const rifaId = state.rifa?.rifaId;
      const appKey = form.dataset.appKey || "";
      const match = state.rifa?.matches?.find((item) => item.appKey === appKey);
      if (!rifaId) {
        setFeedback(nodes.rifaFeedback, "Rifa ID não encontrado. Consulte a rifa novamente.", "error");
        return;
      }
      if (!match) {
        setFeedback(nodes.rifaFeedback, "App da rifa não encontrado. Consulte a rifa novamente.", "error");
        return;
      }

      const updates = {};
      for (const config of RIFA_EDITABLE_FIELDS) {
        const input = form.querySelector(`[name="${config.field}"]`);
        if (!input) {
          continue;
        }
        updates[config.field] = input.value.trim();
      }

      const buttons = Array.from(form.querySelectorAll("button"));
      buttons.forEach((button) => {
        button.disabled = true;
      });

      setFeedback(nodes.rifaFeedback, `Salvando dados da rifa em ${match.label || appKey}...`, null);
      try {
        const result = await apiRequest(`/rifa/${encodeURIComponent(rifaId)}/update-fields`, {
          method: "POST",
          body: { appKey, updates },
        });
        const payload = await apiRequest(`/rifa/${encodeURIComponent(rifaId)}`);
        renderRifaResult(payload);
        setFeedback(nodes.rifaFeedback, result?.result?.message || "Dados atualizados com sucesso.", "success");
      } catch (error) {
        setFeedback(nodes.rifaFeedback, error.message, "error");
      } finally {
        buttons.forEach((button) => {
          button.disabled = false;
        });
      }
    });

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
        const appKey = button.dataset.appKey || "";
        const match = state.rifa?.matches?.find((item) => item.appKey === appKey);
        if (!rifaId) {
          logRifa("abortado: state.rifa.rifaId vazio (consulte a rifa de novo)");
          setFeedback(nodes.rifaFeedback, "Rifa ID não encontrado. Consulte a rifa novamente.", "error");
          return;
        }
        if (!match) {
          logRifa("abortado: appKey da rifa não encontrado", { appKey });
          setFeedback(nodes.rifaFeedback, "App da rifa não encontrado. Consulte a rifa novamente.", "error");
          return;
        }

        const lockMeta = interpretRifaLockState(match.data);
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

        logRifa(`iniciando ${actionLabel}`, { endpoint, rifaId, appKey, lockMeta });
        setFeedback(nodes.rifaFeedback, `Tentando ${actionLabel} rifa em ${match.label || appKey}...`, null);
        button.disabled = true;
        try {
          const result = await apiRequest(endpoint, { method: "POST", body: { appKey } });
          const payload = await apiRequest(`/rifa/${encodeURIComponent(rifaId)}`);
          renderRifaResult(payload);
          setFeedback(nodes.rifaFeedback, result?.result?.message || "Operação concluída com sucesso.", "success");
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
        const appKey = button.dataset.appKey || "";
        const match = state.rifa?.matches?.find((item) => item.appKey === appKey);
        const wrapper = button.closest(".status-chip-row") || nodes.rifaResults;
        const input = wrapper?.querySelector("[data-rifa-days-input]");
        const raw = input?.value?.trim();
        const days = Number(raw);

        if (!rifaId) {
          logRifa("add-free-days abortado: sem rifaId");
          setFeedback(nodes.rifaFeedback, "Rifa ID não encontrado. Consulte a rifa novamente.", "error");
          return;
        }
        if (!match) {
          logRifa("add-free-days abortado: appKey não encontrado", { appKey });
          setFeedback(nodes.rifaFeedback, "App da rifa não encontrado. Consulte a rifa novamente.", "error");
          return;
        }

        if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
          logRifa("add-free-days abortado: dias inválidos", { raw, days });
          setFeedback(nodes.rifaFeedback, "Informe um número válido de dias (ex.: 7).", "error");
          return;
        }

        logRifa("add-free-days", { rifaId, appKey, days });
        setFeedback(nodes.rifaFeedback, `Adicionando ${days} dia(s) gratis em ${match.label || appKey}...`, null);
        button.disabled = true;
        try {
          const result = await apiRequest(`/rifa/${encodeURIComponent(rifaId)}/free-trial`, {
            method: "POST",
            body: { appKey, days, trialDays: days },
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

      if (rifaAction === "copy-fee-message") {
        const appKey = button.dataset.appKey || "";
        const match = state.rifa?.matches?.find((item) => item.appKey === appKey);
        if (!match) {
          logRifa("copy-fee-message abortado: appKey não encontrado", { appKey });
          setFeedback(nodes.rifaFeedback, "App da rifa não encontrado. Consulte a rifa novamente.", "error");
          return;
        }
        const message = buildRifaFeeSupportMessage(match.data || {});
        if (!message) {
          setFeedback(nodes.rifaFeedback, "Preço ou número de cotas indisponível para calcular a taxa.", "error");
          return;
        }
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(message);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = message;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "absolute";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }
          setFeedback(nodes.rifaFeedback, "Mensagem copiada para a área de transferência.", "success");
          logRifa("copy-fee-message concluído", { appKey });
        } catch (error) {
          logRifa("copy-fee-message falhou", { message: error?.message });
          setFeedback(nodes.rifaFeedback, "Não foi possível copiar a mensagem.", "error");
        }
        return;
      }

      if (rifaAction === "open-related-rifa") {
        const relatedRifaId = button.dataset.rifaId || "";
        if (!relatedRifaId) {
          setFeedback(nodes.rifaFeedback, "Rifa relacionada sem ID para abrir.", "error");
          return;
        }

        const previousText = button.textContent;
        button.disabled = true;
        button.textContent = "Abrindo...";
        setFeedback(nodes.rifaFeedback, "Abrindo rifa relacionada...", null);
        try {
          await loadRifaById(relatedRifaId, {
            preserveResults: true,
            scrollToRecord: true,
            feedbackMessage: "Abrindo rifa relacionada...",
          });
        } catch (error) {
          setFeedback(nodes.rifaFeedback, error.message, "error");
        } finally {
          button.disabled = false;
          button.textContent = previousText;
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

      clearRevenueCatResults();

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
        return;
      }

      const revokeButton = closestFromClickTarget(event.target, '[data-action="revoke"]');
      if (revokeButton) {
        const section = revokeButton.closest(".result-section");
        const form = section?.querySelector(".manual-access-form");
        if (form) {
          await handleRevokePromotionalAccess(form, revokeButton);
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
    if (config.authEmulatorUrl && isLocalEnvironment()) {
      state.auth.useEmulator(config.authEmulatorUrl, { disableWarnings: true });
    } else if (config.authEmulatorUrl) {
      console.warn("[backoffice] authEmulatorUrl ignorado fora do ambiente local.");
    }

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

  function setupViewRouting() {
    const navItems = Array.from(document.querySelectorAll("[data-view]"));
    const views = {
      rifa: document.getElementById("rifa-view"),
      revenuecat: document.getElementById("revenuecat-view"),
    };
    const STORAGE_KEY = "backoffice:active-view";

    function activate(viewKey) {
      if (!views[viewKey]) {
        return;
      }
      Object.entries(views).forEach(([key, element]) => {
        if (!element) {
          return;
        }
        element.classList.toggle("hidden", key !== viewKey);
      });
      navItems.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.view === viewKey);
      });
      try {
        sessionStorage.setItem(STORAGE_KEY, viewKey);
      } catch (error) {
        /* sessionStorage indisponível (modo privado) — ignorar */
      }
    }

    navItems.forEach((button) => {
      button.addEventListener("click", () => activate(button.dataset.view));
    });

    let saved = null;
    try {
      saved = sessionStorage.getItem(STORAGE_KEY);
    } catch (error) {
      /* ignore */
    }
    activate(saved && views[saved] ? saved : "rifa");
  }

  attachEvents();
  setupViewRouting();
  initFirebase();

  function isLocalEnvironment() {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1"
    );
  }
})();
