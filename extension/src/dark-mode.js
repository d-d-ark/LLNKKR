(() => {
  "use strict";

  document.documentElement.dataset.entryLlnkActive = "1";

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
    root.classList.toggle("entry-chat-page-learn", /^\/learn(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-study", /^\/study(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-challenge", /^\/challenge(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-about", /^\/about(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-faq", /^\/faq(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-download", /^\/download(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-material", /^\/material(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-onboarding", /^\/onboarding(?:\/|$)/.test(path));
    root.classList.toggle("entry-chat-page-discovery", /^\/discovery(?:\/|$)/.test(path));
  }

  function applyPageSurfaceFixes() {
    const selector = "[class~='e1qduyw34'] :is(h2, h3, h4, p, strong, em)";
    const active = root.classList.contains("entry-chat-dark-mode") && /^\/about(?:\/|$)/.test(location.pathname);
    document.querySelectorAll(selector).forEach((element) => {
      if (active) {
        element.style.setProperty("color", "#202124", "important");
        element.dataset.entryLlnkAboutContrast = "1";
      } else if (element.dataset.entryLlnkAboutContrast === "1") {
        element.style.removeProperty("color");
        delete element.dataset.entryLlnkAboutContrast;
      }
    });
  }

  function applyDarkMode(enabled) {
    const active = Boolean(enabled) && !isDisabledRoute();
    applyPageClasses();
    root.classList.toggle("entry-chat-themed", active);
    root.classList.toggle("entry-chat-dark-mode", active);
    root.classList.remove("entry-chat-darker-mode");
    root.style.colorScheme = active ? "dark" : "";
    applyPageSurfaceFixes();
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
  new MutationObserver(() => {
    scheduleRouteRefresh();
    applyPageSurfaceFixes();
  }).observe(root, { childList: true, subtree: true });
})();
