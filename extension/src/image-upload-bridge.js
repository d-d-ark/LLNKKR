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

  function scanError(doc, depth = 0) {
    if (!doc || depth > 4) return "";
    const nodes = [...doc.querySelectorAll('[role="alert"], [role="dialog"], [aria-modal="true"], [aria-live="assertive"], [aria-live="polite"], .css-ye9ri9.e10kbqtd0, [class*="error"], [class*="Error"], [class*="toast"], [class*="Toast"]')];
    for (const node of nodes) {
      const style = doc.defaultView?.getComputedStyle(node);
      if (style?.display === "none" || style?.visibility === "hidden") continue;
      const message = String(node.textContent || "").replace(/\s+/g, " ").trim();
      const uploadFailure = /요청을\s*처리하지\s*못했습니다|(?:업로드|파일|이미지).{0,60}(?:실패|오류|초과|불가|지원하지|처리하지|너무\s*(?:크|큽)|제한)|(?:실패|오류|초과|불가|지원하지|처리하지).{0,60}(?:업로드|파일|이미지)|(?:최대|제한).{0,40}(?:MB|KB|GB|용량|크기)/i;
      if (message && uploadFailure.test(message)) return message.slice(0, 180);
    }
    const invalidInput = [...doc.querySelectorAll('input[type="file"]')].find((input) => input.validity && !input.validity.valid);
    const validationMessage = String(invalidInput?.validationMessage || "").replace(/\s+/g, " ").trim();
    if (validationMessage) return validationMessage.slice(0, 180);
    for (const frame of doc.querySelectorAll("iframe, frame")) {
      try {
        const nested = scanError(frame.contentDocument, depth + 1);
        if (nested) return nested;
      } catch (_) {}
    }
    return "";
  }

  let lastUrl = "";
  let lastError = "";
  let interval = 0;
  let observer = null;
  const notify = () => {
    const imageUrl = scanDocument(document);
    if (imageUrl && imageUrl !== lastUrl) {
      lastUrl = imageUrl;
      window.top.postMessage({ source: "entry-llnk-image-upload", imageUrl }, "https://playentry.org");
      return;
    }
    const error = scanError(document);
    if (!error || error === lastError) return;
    lastError = error;
    window.top.postMessage({ source: "entry-llnk-image-upload", error }, "https://playentry.org");
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
