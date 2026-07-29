(() => {
  "use strict";

  const SETTINGS_KEY = "entryLlnkSettings";
  const defaults = {
    darkMode: false,
    draft: true,
    liveRefresh: true,
    spaceshipMotion: true,
    autoMore: true,
    imageSpoiler: true,
    shortenProjectLinks: true,
  };

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(error);
      else resolve();
    });
  });

  function syncThemeButton(enabled) {
    const button = document.querySelector("#themeButton");
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", enabled ? "다크모드 끄기" : "다크모드 켜기");
    button.querySelector("span").textContent = enabled ? "light_mode" : "dark_mode";
  }

  async function saveSetting(name, value) {
    const saved = await storageGet([SETTINGS_KEY]);
    const settings = { ...defaults, ...(saved[SETTINGS_KEY] || {}), [name]: value };
    await storageSet({ [SETTINGS_KEY]: settings });
    if (name === "darkMode") syncThemeButton(value);
  }

  async function initialize() {
    const saved = await storageGet([SETTINGS_KEY]);
    const settings = { ...defaults, ...(saved[SETTINGS_KEY] || {}) };
    document.querySelectorAll("[data-setting]").forEach((input) => {
      input.checked = Boolean(settings[input.dataset.setting]);
      input.addEventListener("change", () => saveSetting(input.dataset.setting, input.checked));
    });
    syncThemeButton(settings.darkMode);
    document.querySelector("#version").textContent = `v${chrome.runtime.getManifest().version}`;
  }

  document.querySelector("#themeButton").addEventListener("click", () => {
    const input = document.querySelector('[data-setting="darkMode"]');
    input.checked = !input.checked;
    saveSetting("darkMode", input.checked);
  });
  initialize().catch(() => {});
})();
