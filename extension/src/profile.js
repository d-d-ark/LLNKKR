(() => {
  "use strict";

  const Ringcl = window.EntryLlnk;
  if (!Ringcl || window.__entryLlnkProfileLoaded || window.self !== window.top) return;
  window.__entryLlnkProfileLoaded = true;

  const { $, text, safeHttpUrl, debounce } = Ringcl;
  let observer = null;
  let hydrationFrame = 0;
  let hydrationTimer = 0;
  let stabilizationTimers = [];
  let lastProfileId = "";

  function profileIdFromPath() {
    return location.pathname.match(/^\/profile\/([a-f0-9]{24})(?:\/|$)/i)?.[1]?.toLowerCase() || "";
  }

  function getBio() {
    return $(".css-1gpgvwy.e1b2s6y612, [class~='css-1gpgvwy'][class~='e1b2s6y612'], [data-testid='profile-description']");
  }

  function linkifyBio() {
    const bio = getBio();
    if (!bio || bio.closest(".entry-chat-root")) return;
    const original = text(bio.textContent).trim();
    if (!original) return;
    const alreadyLinked = Boolean(bio.querySelector(".entry-chat-profile-rainbow-link[data-entry-llnk-owned='1']"));
    if (alreadyLinked && bio.dataset.entryChatLinkedText === original) return;
    const pattern = /(^|[\s(])((?:(?:https?:\/\/|www\.)[^\s<>"']+)|(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"']*)?))/gi;
    const matches = [...original.matchAll(pattern)];
    if (!matches.length) {
      delete bio.dataset.entryChatLinkedText;
      return;
    }
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    matches.forEach((match) => {
      const index = Number(match.index || 0);
      if (index > cursor) fragment.appendChild(document.createTextNode(original.slice(cursor, index)));
      if (match[1]) fragment.appendChild(document.createTextNode(match[1]));
      const rawUrl = match[2] || "";
      const trailing = rawUrl.match(/[.,!?;:)\]]+$/)?.[0] || "";
      const visibleUrl = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
      const url = safeHttpUrl(/^https?:\/\//i.test(visibleUrl) ? visibleUrl : `https://${visibleUrl}`);
      if (url && visibleUrl) {
        const link = document.createElement("a");
        link.className = "entry-chat-profile-rainbow-link";
        link.dataset.entryLlnkOwned = "1";
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = visibleUrl;
        fragment.appendChild(link);
      } else {
        fragment.appendChild(document.createTextNode(visibleUrl));
      }
      if (trailing) fragment.appendChild(document.createTextNode(trailing));
      cursor = index + match[0].length;
    });
    if (cursor < original.length) fragment.appendChild(document.createTextNode(original.slice(cursor)));
    bio.dataset.entryChatOriginalText = original;
    bio.dataset.entryChatLinkedText = original;
    bio.replaceChildren(fragment);
  }

  function normalizeProfileCommunityBackgrounds() {
    const dark = document.documentElement.classList.contains("entry-chat-dark-mode");
    const elements = document.querySelectorAll(
      ".css-m0nf83.ebifrqs1, button.active.css-1oz7jgs.e1raq2kp3, [data-entry-llnk-profile-transparent='1']"
    );
    elements.forEach((element) => {
      if (dark && element.matches(".css-m0nf83.ebifrqs1, button.active.css-1oz7jgs.e1raq2kp3")) {
        element.dataset.entryLlnkProfileTransparent = "1";
        element.style.setProperty("background", "transparent", "important");
        element.style.setProperty("background-color", "transparent", "important");
        element.style.setProperty("background-image", "none", "important");
        element.style.setProperty("box-shadow", "none", "important");
        element.style.setProperty("transition", "none", "important");
        return;
      }
      if (element.dataset.entryLlnkProfileTransparent === "1") {
        delete element.dataset.entryLlnkProfileTransparent;
        ["background", "background-color", "background-image", "box-shadow", "transition"].forEach((property) => {
          element.style.removeProperty(property);
        });
      }
    });
  }

  function refresh(root = document) {
    const profileId = profileIdFromPath();
    if (!profileId) return;
    if (profileId !== lastProfileId) {
      lastProfileId = profileId;
      root = document;
    }
    linkifyBio();
    normalizeProfileCommunityBackgrounds();
  }

  function scheduleHydration(root = document) {
    if (hydrationFrame) window.cancelAnimationFrame(hydrationFrame);
    hydrationFrame = window.requestAnimationFrame(() => {
      hydrationFrame = 0;
      refresh(root);
    });
    window.clearTimeout(hydrationTimer);
    hydrationTimer = window.setTimeout(() => refresh(document), 240);
  }

  function init() {
    if (!profileIdFromPath()) return;
    document.documentElement.classList.add("entry-chat-page-profile");
    document.documentElement.dataset.entryLlnkActive = "1";
    scheduleHydration(document);
    const schedule = debounce((mutations) => {
      const root = mutations.flatMap((mutation) => [...mutation.addedNodes]).find((node) => node instanceof Element) || document;
      scheduleHydration(root);
    }, 90);
    observer = new MutationObserver(schedule);
    observer.observe(document.body || document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true
    });
    const themeObserver = new MutationObserver(() => scheduleHydration(document));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    stabilizationTimers = [400, 900, 1800].map((delay) => window.setTimeout(() => refresh(document), delay));
    document.addEventListener("click", () => scheduleHydration(document), true);
    window.addEventListener("popstate", () => scheduleHydration(document));
    window.addEventListener("pageshow", () => scheduleHydration(document));
    window.addEventListener("pagehide", () => {
      observer?.disconnect();
      themeObserver.disconnect();
      window.cancelAnimationFrame(hydrationFrame);
      window.clearTimeout(hydrationTimer);
      stabilizationTimers.forEach((timer) => window.clearTimeout(timer));
      stabilizationTimers = [];
    }, { once: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
