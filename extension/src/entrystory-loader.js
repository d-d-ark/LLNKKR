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
  const PROFILE_SCRIPT_FILES = [
    "src/profile.js",
  ];
  const CORE_STYLE_FILES = ["styles/base.css"];
  const ENTRY_STORY_STYLE_FILES = ["styles/entrystory.css"];
  const PROFILE_STYLE_FILES = ["styles/profile.css"];
  const NATIVE_LIVE_RUNTIME_FILE = "src/entrystory-native-live.js";
  let coreLoading = null;
  let coreLoaded = false;
  let entryStoryLoading = null;
  let entryStoryLoaded = false;
  let profileLoading = null;
  let profileLoaded = false;
  let routeCheckScheduled = false;
  let lastRouteHref = "";
  let liveRefreshEnabled = false;
  let nativeLiveRuntimeInjected = false;

  function isCanonicalLiveRoute() {
    if (location.pathname !== "/community/entrystory/list") return false;
    const params = new URLSearchParams(location.search);
    if (params.getAll("sort").length !== 1 || params.getAll("term").length !== 1) return false;
    const keys = [...params.keys()];
    return keys.length === 2
      && keys.every((key) => key === "sort" || key === "term")
      && params.get("sort") === "created"
      && params.get("term") === "all";
  }

  function updateNativeLiveState() {
    if (!document.documentElement) return;
    document.documentElement.dataset.entryLlnkNativeLive = liveRefreshEnabled && isCanonicalLiveRoute() ? "1" : "0";
  }

  function ensureNativeLiveRuntime() {
    if (!document.documentElement || nativeLiveRuntimeInjected) return;
    nativeLiveRuntimeInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(NATIVE_LIVE_RUNTIME_FILE);
    script.dataset.entryLlnkPageRuntime = NATIVE_LIVE_RUNTIME_FILE;
    script.addEventListener("load", () => script.remove(), { once: true });
    script.addEventListener("error", () => {
      nativeLiveRuntimeInjected = false;
      script.remove();
    }, { once: true });
    (document.head || document.documentElement).appendChild(script);
  }

  function isEntryStoryRoute() {
    return /^\/community\/entrystory(?:\/|$)/.test(location.pathname)
      || /^\/profile\/[a-f0-9]{24}\/community\/entrystory(?:\/|$)/i.test(location.pathname);
  }

  function isProfileRoute() {
    return /^\/profile\/[a-f0-9]{24}(?:\/|$)/i.test(location.pathname);
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
    })().catch(() => {
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
    })().catch(() => {
    }).finally(() => {
      entryStoryLoading = null;
    });
    return entryStoryLoading;
  }

  async function loadProfile() {
    if (profileLoaded || profileLoading || !isProfileRoute()) return profileLoading;
    ensureStyles(PROFILE_STYLE_FILES);
    profileLoading = (async () => {
      await loadCore();
      for (const file of PROFILE_SCRIPT_FILES) await import(chrome.runtime.getURL(file));
      profileLoaded = true;
    })().catch(() => {
    }).finally(() => {
      profileLoading = null;
    });
    return profileLoading;
  }

  function checkRoute() {
    routeCheckScheduled = false;
    lastRouteHref = location.href;
    loadCore();
    updateNativeLiveState();
    if (isEntryStoryRoute()) ensureNativeLiveRuntime();
    if (isEntryStoryRoute()) loadEntryStory();
    if (isProfileRoute()) loadProfile();
  }

  function scheduleRouteCheck() {
    if (routeCheckScheduled || location.href === lastRouteHref) return;
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

  chrome.storage.local.get(["entryLlnkSettings"], (saved) => {
    liveRefreshEnabled = saved.entryLlnkSettings?.liveRefresh !== false;
    updateNativeLiveState();
    if (isEntryStoryRoute()) ensureNativeLiveRuntime();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.entryLlnkSettings) return;
    liveRefreshEnabled = changes.entryLlnkSettings.newValue?.liveRefresh !== false;
    updateNativeLiveState();
  });
})();
