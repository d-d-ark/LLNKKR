(() => {
  "use strict";

  if (window.__entryLlnkThumbnailRuntime) return;
  window.__entryLlnkThumbnailRuntime = true;
  let pending = null;
  let timer = 0;

  function apply(payload) {
    const image = String(payload?.image || "");
    if (!image.startsWith("data:image/")) return false;
    const canvas = window.Entry?.canvas_;
    if (!canvas || typeof canvas.toDataURL !== "function") return false;
    if (!canvas.__entryLlnkOriginalToDataURL) {
      try {
        Object.defineProperty(canvas, "__entryLlnkOriginalToDataURL", {
          value: canvas.toDataURL.bind(canvas),
          configurable: true,
        });
      } catch (_) {
        canvas.__entryLlnkOriginalToDataURL = canvas.toDataURL.bind(canvas);
      }
    }
    canvas.toDataURL = () => image;
    window.__entryLlnkWorkspaceThumbnail = {
      name: String(payload.name || "thumbnail.png"),
      size: Number(payload.size || 0),
      appliedAt: Date.now(),
    };
    return true;
  }

  function schedule(payload) {
    pending = payload;
    if (apply(payload)) return;
    clearInterval(timer);
    let tries = 0;
    timer = window.setInterval(() => {
      tries += 1;
      if (apply(pending) || tries >= 48) clearInterval(timer);
    }, 250);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data || {};
    if (data.source !== "entry-llnk-workspace-thumbnail") return;
    schedule(data.payload || {});
  });
})();
