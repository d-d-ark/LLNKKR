// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
(() => {
  "use strict";

  if (window.__entryLlnkEntryStoryLoader) return;
  window.__entryLlnkEntryStoryLoader = true;

  const CORE_SCRIPT_FILES = [
    "src/common.js",
  ];
  const ENTRY_STORY_SCRIPT_FILES = [
    "src/entrystory.js",
  ];
  const CORE_STYLE_FILES = ["styles/base.css"];
  const ENTRY_STORY_STYLE_FILES = ["styles/entrystory.css"];
  let coreLoading = null;
  let coreLoaded = false;
  let entryStoryLoading = null;
  let entryStoryLoaded = false;
  let routeCheckScheduled = false;

  function isEntryStoryRoute() {
    return /^\/community\/entrystory(?:\/|$)/.test(location.pathname)
      || /^\/profile\/[a-f0-9]{24}\/community\/entrystory(?:\/|$)/i.test(location.pathname);
  }

  function ensureStyles(files) {
    files.forEach((file) => {
      if (document.querySelector(`link[data-entry-llnk-route-style="${file}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL(file);
      link.dataset.entryLlnkRouteStyle = file;
      (document.head || document.documentElement).appendChild(link);
    });
  }

  async function loadCore() {
    if (coreLoaded || coreLoading) return coreLoading;
    ensureStyles(CORE_STYLE_FILES);
    coreLoading = (async () => {
      for (const file of CORE_SCRIPT_FILES) await import(chrome.runtime.getURL(file));
      coreLoaded = true;
    })().catch((error) => {
      console.debug("[LLNKKR] 공통 모듈 로드 실패", error);
    }).finally(() => {
      coreLoading = null;
    });
    return coreLoading;
  }

  async function loadEntryStory() {
    if (entryStoryLoaded || entryStoryLoading || !isEntryStoryRoute()) return entryStoryLoading;
    ensureStyles(ENTRY_STORY_STYLE_FILES);
    entryStoryLoading = (async () => {
      await loadCore();
      for (const file of ENTRY_STORY_SCRIPT_FILES) await import(chrome.runtime.getURL(file));
      entryStoryLoaded = true;
    })().catch((error) => {
      console.debug("[LLNKKR] 엔트리이야기 모듈 로드 실패", error);
    }).finally(() => {
      entryStoryLoading = null;
    });
    return entryStoryLoading;
  }

  function checkRoute() {
    routeCheckScheduled = false;
    loadCore();
    if (isEntryStoryRoute()) loadEntryStory();
  }

  function scheduleRouteCheck() {
    if (routeCheckScheduled || entryStoryLoaded) return;
    routeCheckScheduled = true;
    queueMicrotask(checkRoute);
  }

  function wrapHistoryMethod(name) {
    const original = history[name];
    if (typeof original !== "function") return;
    history[name] = function (...args) {
      const result = original.apply(this, args);
      scheduleRouteCheck();
      return result;
    };
  }

  scheduleRouteCheck();
  const handleNavigation = () => {
    scheduleRouteCheck();
  };
  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("hashchange", handleNavigation);
  const observer = new MutationObserver((mutations) => {
    scheduleRouteCheck();
  });
  const startObserver = () => {
    if (!document.documentElement) {
      document.addEventListener("readystatechange", startObserver, { once: true });
      return;
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  startObserver();
})();
