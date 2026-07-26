// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
(() => {
  "use strict";

  if (window.self === window.top || !new URLSearchParams(location.search).has("entry_llnk_image_upload")) return;
  if (window.__entryLlnkImageUploadBridge) return;
  window.__entryLlnkImageUploadBridge = true;

  function normalizeUploadUrl(value) {
    let source = String(value || "").trim();
    if (!source || !source.includes("/uploads/")) return "";
    for (let index = 0; index < 2; index += 1) {
      const box = document.createElement("textarea");
      box.innerHTML = source;
      const decoded = box.value;
      if (!decoded || decoded === source) break;
      source = decoded.trim();
    }
    source = source.replace(/^url\((.*)\)$/i, "$1").trim().replace(/^['"]|['"]$/g, "");
    const match = source.match(/(?:(?:https?:)?\/\/playentry\.org)?\/uploads\/[^"'()<>\s]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^"'()<>\s]*)?/i);
    if (!match) return "";
    let raw = match[0];
    if (raw.startsWith("//")) raw = `https:${raw}`;
    if (raw.startsWith("/uploads/")) raw = `https://playentry.org${raw}`;
    try {
      const url = new URL(raw.replace(/&amp;/gi, "&").replace(/[;,]+$/g, ""), "https://playentry.org");
      if (url.hostname !== "playentry.org" || !url.pathname.startsWith("/uploads/")) return "";
      if (/^\/uploads\/(?:fonts|thumb)\//i.test(url.pathname) || /EmptyImage\.svg$/i.test(url.pathname)) return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function scanDocument(doc, depth = 0) {
    if (!doc || depth > 4) return "";
    const candidates = [];
    const roots = [...doc.querySelectorAll(".se-component.se-image, .se-section-image, .se-module-image, .__se-module-image")];
    roots.forEach((root) => {
      root.querySelectorAll("[src*='/uploads/'], [src*='playentry.org/uploads/']")
        .forEach((element) => candidates.push(element.getAttribute("src") || ""));
      root.querySelectorAll("[srcset*='/uploads/'], [srcset*='playentry.org/uploads/']").forEach((element) => {
        String(element.getAttribute("srcset") || "").split(",")
          .forEach((part) => candidates.push(part.trim().split(/\s+/)[0] || ""));
      });
      root.querySelectorAll("[data-src*='/uploads/'], [data-url*='/uploads/']")
        .forEach((element) => candidates.push(element.getAttribute("data-src") || element.getAttribute("data-url") || ""));
      root.querySelectorAll("[style*='/uploads/']").forEach((element) => {
        const matches = String(element.getAttribute("style") || "").match(/url\((['"]?)([^'")]+\/uploads\/[^'")]+)\1\)/gi) || [];
        matches.forEach((item) => candidates.push(item.replace(/^url\((['"]?)/i, "").replace(/(['"]?)\)$/i, "")));
      });
    });
    const found = candidates.map(normalizeUploadUrl).find(Boolean);
    if (found) return found;
    for (const frame of doc.querySelectorAll("iframe, frame")) {
      try {
        const nested = scanDocument(frame.contentDocument, depth + 1);
        if (nested) return nested;
      } catch (_) {}
    }
    return "";
  }

  let lastUrl = "";
  let interval = 0;
  let observer = null;
  const notify = () => {
    const imageUrl = scanDocument(document);
    if (!imageUrl || imageUrl === lastUrl) return;
    lastUrl = imageUrl;
    window.top.postMessage({ source: "entry-llnk-image-upload", imageUrl }, "https://playentry.org");
  };
  const stop = () => {
    observer?.disconnect();
    observer = null;
    if (interval) window.clearInterval(interval);
    interval = 0;
  };
  const start = () => {
    notify();
    if (document.body) {
      observer = new MutationObserver(notify);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "srcset", "data-src", "data-url", "style", "class"],
      });
    }
    interval = window.setInterval(notify, 500);
    window.setTimeout(stop, 35000);
  };

  window.addEventListener("pagehide", stop, { once: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
