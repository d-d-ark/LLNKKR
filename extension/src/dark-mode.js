// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
(() => {
  "use strict";

  if (window.__entryLlnkDarkModeLoaded) return;
  window.__entryLlnkDarkModeLoaded = true;

  const SETTINGS_KEY = "entryLlnkSettings";
  const CACHE_KEY = "entryLlnkDarkMode";
  const root = document.documentElement;
  let lastPath = location.pathname;
  let routeTimer = 0;

  function isDisabledRoute() {
    return /^\/group(?:\/|$)/.test(location.pathname);
  }

  function applyPageClasses() {
    const path = location.pathname;
    const isEntryStoryLike = /^\/community\/(?:entrystory|tips|qna|notice)(?:\/|$)/.test(path)
      || /^\/profile\/[a-f0-9]{24}\/community\/entrystory(?:\/|$)/i.test(path);
    const isProject = /^\/project(?:\/|$)/.test(path);
    const isProjectList = /^\/project\/list(?:\/|$)/.test(path);
    const isProjectEdit = /^\/project\/[^/]+\/edit(?:\/|$)/.test(path);

    root.classList.toggle(
      "entry-chat-page-entrystory",
      isEntryStoryLike,
    );
    root.classList.toggle("entry-chat-page-project", isProject);
    root.classList.toggle("entry-chat-page-project-list", isProjectList);
    root.classList.toggle("entry-chat-page-project-edit", isProjectEdit);
    root.classList.toggle("entry-chat-page-profile", /^\/profile\/[a-f0-9]{24}(?:\/|$)/i.test(path));
    root.classList.toggle("entry-chat-page-ws", /^\/ws(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-home", path === "/");
  }

  function applyDarkMode(enabled) {
    const active = Boolean(enabled) && !isDisabledRoute();
    applyPageClasses();
    root.classList.toggle("entry-chat-themed", active);
    root.classList.toggle("entry-chat-dark-mode", active);
    root.classList.remove("entry-chat-darker-mode");
    root.style.colorScheme = active ? "dark" : "";
    try {
      localStorage.setItem(CACHE_KEY, active ? "1" : "0");
    } catch (_) {}
  }

  function readCachedMode() {
    try {
      return localStorage.getItem(CACHE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function refreshFromStorage() {
    chrome.storage.local.get([SETTINGS_KEY], (saved) => {
      applyDarkMode(Boolean(saved?.[SETTINGS_KEY]?.darkMode));
    });
  }

  function scheduleRouteRefresh() {
    if (routeTimer || location.pathname === lastPath) return;
    applyPageClasses();
    routeTimer = window.setTimeout(() => {
      routeTimer = 0;
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      refreshFromStorage();
    }, 0);
  }

  function wrapHistoryMethod(name) {
    const original = history[name];
    if (typeof original !== "function" || original.__entryLlnkWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      scheduleRouteRefresh();
      return result;
    };
    wrapped.__entryLlnkWrapped = true;
    history[name] = wrapped;
  }

  applyDarkMode(readCachedMode());
  refreshFromStorage();
  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", scheduleRouteRefresh);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
    applyDarkMode(Boolean(changes[SETTINGS_KEY].newValue?.darkMode));
  });
  new MutationObserver(scheduleRouteRefresh).observe(root, { childList: true, subtree: true });
})();
