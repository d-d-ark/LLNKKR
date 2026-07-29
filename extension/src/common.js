(() => {
  "use strict";

  if (window.EntryLlnk) return;

  const VERSION = chrome.runtime.getManifest().version;
  const API_BASE = "https://llnk.kr/api/ringcl";
  const INSTALL_ID_KEY = "entryLlnkClientId";
  const LAST_IDENTITY_KEY = "entryLlnkLastIdentity";
  const IDENTITY_CACHE_MS = 5 * 60 * 1000;
  const EMPTY_IDENTITY_CACHE_MS = 12 * 1000;
  let identityCache = null;
  let identityLoadedAt = 0;
  let identityLoad = null;
  let iconFontRequested = false;

  const text = (value) => value == null ? "" : String(value);
  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function debounce(fn, delay = 80) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(error);
        else resolve();
      });
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(error);
        else resolve();
      });
    });
  }

  function createUuid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function getInstallId() {
    const saved = await storageGet([INSTALL_ID_KEY]).catch(() => ({}));
    const current = text(saved[INSTALL_ID_KEY]).trim().toLowerCase();
    if (/^[a-f0-9-]{36}$/.test(current)) return current;
    const next = createUuid();
    await storageSet({ [INSTALL_ID_KEY]: next }).catch(() => {});
    return next;
  }

  function extractEntryTokens() {
    let xToken = "";
    try {
      const nextData = JSON.parse($("#__NEXT_DATA__")?.textContent || "null");
      const stack = nextData && typeof nextData === "object" ? [nextData] : [];
      const visited = new Set();
      while (stack.length && visited.size < 3000 && !xToken) {
        const item = stack.pop();
        if (!item || typeof item !== "object" || visited.has(item)) continue;
        visited.add(item);
        if (typeof item.xToken === "string" && item.xToken) xToken = item.xToken;
        else Object.values(item).forEach((value) => {
          if (value && typeof value === "object" && !visited.has(value)) stack.push(value);
        });
      }
    } catch (_) {}
    if (!xToken) {
      try {
        xToken = localStorage.getItem("playentry_token") || "";
      } catch (_) {}
    }
    return {
      csrfToken: $('meta[name="csrf-token"]')?.getAttribute("content") || "",
      xToken,
    };
  }

  async function entryGraphql(operation, query, variables = {}, options = {}) {
    const { csrfToken, xToken } = extractEntryTokens();
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "x-client-type": "Client",
    };
    if (csrfToken) headers["csrf-token"] = csrfToken;
    if (xToken) headers["x-token"] = xToken;
    const response = await fetch(`/graphql/${operation}`, {
      method: "POST",
      credentials: "include",
      headers,
      signal: options.signal,
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.errors?.length) {
      throw new Error(payload.errors?.[0]?.message || `Entry GraphQL ${response.status}`);
    }
    return payload.data || {};
  }

  function normalizeIdentity(raw, source = "entry_graphql") {
    const entryUserId = text(raw?.id || raw?.entryUserId || raw?.entry_user_id).trim().toLowerCase();
    const nickname = text(raw?.nickname || raw?.username).trim().slice(0, 40);
    if (!/^[a-f0-9]{24}$/.test(entryUserId) || !nickname) return null;
    return { entryUserId, nickname, source };
  }

  function readNicknameText(element) {
    if (!element) return "";
    const direct = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => text(node.textContent))
      .join(" ")
      .trim();
    if (direct) return direct.replace(/\([^)]+\)/g, "").trim().slice(0, 40);
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.(".blind, [class~='blind'], [aria-hidden='true']")
      .forEach((node) => node.remove());
    return text(clone.textContent).replace(/\([^)]+\)/g, "").trim().slice(0, 40);
  }

  function identityFromProfileLink(link, nicknameRoot = null, source = "entry_dom") {
    const entryUserId = text(link?.getAttribute?.("href"))
      .match(/\/profile\/([a-f0-9]{24})(?:\/project)?(?:[/?#]|$)?/i)?.[1]?.toLowerCase() || "";
    if (!entryUserId) return null;
    const nicknameElement = nicknameRoot?.querySelector?.(".css-kf2376.egkznh63, [class~='css-kf2376'][class~='egkznh63']")
      || link.querySelector?.(".css-kf2376.egkznh63, [class~='css-kf2376'][class~='egkznh63']");
    const nickname = readNicknameText(nicknameElement || link);
    return normalizeIdentity({ id: entryUserId, nickname }, source);
  }

  function visibleAccountMenuIdentity(doc = document) {
    const menus = $$(".css-1f8moxb.egkznh61, [class~='css-1f8moxb'][class~='egkznh61']", doc);
    for (const menu of menus) {
      if (doc === document && (!isVisible(menu) || menu.closest(".entry-chat-root"))) continue;
      const hasSignout = $$('a[data-testid="signout"], a[role="button"]', menu)
        .some((link) => link.getAttribute("data-testid") === "signout" || text(link.textContent).trim() === "로그아웃");
      if (!hasSignout) continue;
      const profileLink = $$('a[href^="/profile/"], a[href*="/profile/"]', menu)
        .find((link) => /\/profile\/[a-f0-9]{24}(?:\/project)?(?:[/?#]|$)?/i.test(text(link.getAttribute("href"))));
      const identity = identityFromProfileLink(profileLink, menu, "entry_menu");
      if (identity) return identity;
    }
    return null;
  }

  function visibleAccountHeaderIdentity() {
    const containers = [
      $("#userPageId"),
      $(".css-f10ey3.e141lsuo1, [class~='css-f10ey3'][class~='e141lsuo1']"),
    ].filter((element) => element && isVisible(element) && !element.closest(".entry-chat-root"));
    for (const container of containers) {
      const profileLink = $$('a[href^="/profile/"], a[href*="/profile/"]', container)
        .find((link) => /\/profile\/[a-f0-9]{24}(?:\/project)?(?:[/?#]|$)?/i.test(text(link.getAttribute("href"))));
      if (!profileLink) continue;
      const entryUserId = text(profileLink.getAttribute("href"))
        .match(/\/profile\/([a-f0-9]{24})(?:\/project)?(?:[/?#]|$)?/i)?.[1]?.toLowerCase() || "";
      const nickname = visibleAccountNickname() || readNicknameText(profileLink);
      const identity = normalizeIdentity({ id: entryUserId, nickname }, "entry_header");
      if (identity) return identity;
    }
    return null;
  }

  function visibleAccountNickname() {
    const candidates = [
      $("#userPageId .css-kf2376.egkznh63, #userPageId [class~='egkznh63']"),
      $(".css-f10ey3.e141lsuo1 .css-kf2376.egkznh63, [class~='css-f10ey3'][class~='e141lsuo1'] [class~='egkznh63']"),
      $(".css-1p1vhpq.eg4k6ki1 .css-13o7eu2.eg4k6ki2, [class~='css-1p1vhpq'][class~='eg4k6ki1'] [class~='eg4k6ki2']"),
    ].filter(Boolean);
    return candidates.map(readNicknameText).find(Boolean) || "";
  }

  function hasVisibleAccountSignal() {
    return [
      $("#userPageId"),
      $(".css-f10ey3.e141lsuo1, [class~='css-f10ey3'][class~='e141lsuo1']"),
      $("[data-testid='avatarButton']"),
      $(".css-1p1vhpq.eg4k6ki1, [class~='css-1p1vhpq'][class~='eg4k6ki1']"),
    ].some((element) => element && isVisible(element) && !element.closest(".entry-chat-root"));
  }

  async function storedEntryIdentity() {
    const saved = await storageGet([LAST_IDENTITY_KEY]).catch(() => ({}));
    const candidates = [[saved[LAST_IDENTITY_KEY], "ringcl_storage"]];
    const visibleNickname = visibleAccountNickname().toLocaleLowerCase();
    for (const [raw, source] of candidates) {
      const identity = normalizeIdentity(raw, source);
      if (!identity) continue;
      if (!visibleNickname || identity.nickname.toLocaleLowerCase() === visibleNickname) return identity;
    }
    return null;
  }

  async function fetchEntryIdentityFromGraphql() {
    const queries = [
      ["SELECT_USER", "query SELECT_USER { user { id nickname username } }", "user"],
      ["SELECT_ME", "query SELECT_ME { me { id nickname username } }", "me"],
      ["SELECT_VIEWER", "query SELECT_VIEWER { viewer { id nickname username } }", "viewer"],
    ];
    for (const [operation, query, key] of queries) {
      try {
        const data = await entryGraphql(operation, query, {});
        const identity = normalizeIdentity(data?.[key], "entry_graphql");
        if (identity) return identity;
      } catch (_) {}
    }
    return null;
  }

  async function resolveEntryIdentity(force = false) {
    const cacheAge = Date.now() - identityLoadedAt;
    const cacheTtl = identityCache ? IDENTITY_CACHE_MS : EMPTY_IDENTITY_CACHE_MS;
    if (!force && identityLoadedAt && cacheAge < cacheTtl) return identityCache;
    if (identityLoad) return identityLoad;
    identityLoad = (async () => {
      const fromDom = visibleAccountMenuIdentity() || visibleAccountHeaderIdentity();
      const accountVisible = Boolean(fromDom) || hasVisibleAccountSignal();
      const fromGraphql = fromDom || !accountVisible ? null : await fetchEntryIdentityFromGraphql();
      const fromStorage = fromDom || fromGraphql || !accountVisible ? null : await storedEntryIdentity();
      const identity = fromDom || fromGraphql || fromStorage;
      identityCache = identity;
      identityLoadedAt = Date.now();
      if (identity) await storageSet({ [LAST_IDENTITY_KEY]: identity }).catch(() => {});
      return identity;
    })().finally(() => {
      identityLoad = null;
    });
    return identityLoad;
  }

  async function getClientContext() {
    const [clientId, identity] = await Promise.all([getInstallId(), resolveEntryIdentity()]);
    return {
      client_id: clientId,
      entry_user_id: identity?.entryUserId || "",
      nickname: identity?.nickname || "",
      identity_source: identity?.source || "none",
    };
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = {
      accept: "application/json",
      "X-LLNKKR-Version": VERSION,
    };
    let body;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const response = await fetch(`${API_BASE}/${path}`, {
      method,
      headers,
      body,
      credentials: "omit",
      signal: options.signal,
      cache: options.cache || "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(text(payload.error).trim() || `LLNKKR API ${response.status}`);
      error.status = response.status;
      error.path = path;
      throw error;
    }
    return payload;
  }

  function ensureIconFont() {
    if (iconFontRequested) return;
    iconFontRequested = true;
    if (document.querySelector('link[data-entry-chat-icons="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.entryChatIcons = "1";
    link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0";
    (document.head || document.documentElement).appendChild(link);
  }

  function safeHttpUrl(value, base = location.origin) {
    try {
      const url = new URL(text(value).trim(), base);
      return /^https?:$/.test(url.protocol) ? url : null;
    } catch (_) {
      return null;
    }
  }

  window.EntryLlnk = {
    VERSION,
    API_BASE,
    text,
    $,
    $$,
    escapeHtml,
    isVisible,
    debounce,
    storageGet,
    storageSet,
    storageRemove,
    getInstallId,
    getClientContext,
    resolveEntryIdentity,
    extractEntryTokens,
    entryGraphql,
    api,
    ensureIconFont,
    safeHttpUrl,
  };
})();
