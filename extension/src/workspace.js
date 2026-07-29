(() => {
  "use strict";

  const Ringcl = window.EntryLlnk;
  if (!Ringcl || window.__entryLlnkWorkspaceLoaded || window.self !== window.top) return;
  window.__entryLlnkWorkspaceLoaded = true;

  const MAX_BYTES = 1_000_000;
  let payload = null;
  let observer = null;
  let toolResizeObserver = null;
  let hydrationFrame = 0;

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(reader.error || new Error("파일을 읽지 못했습니다.")), { once: true });
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(value) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return "0KB";
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
    return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)}MB`;
  }

  function formatFileLabel(value = {}) {
    const rawName = Ringcl.text(value.name || "thumbnail") || "thumbnail";
    const name = rawName.length > 10 ? `${rawName.slice(0, 10)}...` : rawName;
    return `${name} · ${formatBytes(value.size)}`;
  }

  function ensureRuntime(doc) {
    if (!doc || doc.getElementById("entry-chat-thumbnail-runtime-script")) return;
    const script = doc.createElement("script");
    script.id = "entry-chat-thumbnail-runtime-script";
    script.src = chrome.runtime.getURL("src/thumbnail-runtime.js");
    script.async = false;
    script.onerror = () => script.remove();
    (doc.head || doc.documentElement).appendChild(script);
  }

  function deliver() {
    if (!payload?.image) return;
    ensureRuntime(document);
    window.postMessage({ source: "entry-llnk-workspace-thumbnail", payload }, location.origin);
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        ensureRuntime(frame.contentDocument);
        frame.contentWindow?.postMessage({ source: "entry-llnk-workspace-thumbnail", payload }, location.origin);
      } catch (_) {}
    });
  }

  function updateUi() {
    const tool = document.querySelector(".entry-chat-workspace-thumbnail-floating[data-entry-llnk-owned='1']");
    if (!tool) return;
    const status = tool.querySelector('[data-role="workspaceThumbnailStatus"]');
    if (!status) return;
    if (!payload?.image) {
      status.textContent = "PNG/APNG";
      tool.classList.remove("has-image", "has-error");
      return;
    }
    const label = formatFileLabel(payload);
    status.textContent = payload.tooLarge ? `${label} · 1MB 초과` : label;
    tool.classList.add("has-image");
    tool.classList.toggle("has-error", payload.tooLarge === true);
  }

  async function applyFile(file) {
    const validType = /^(?:image\/png|image\/apng)$/i.test(file.type || "") || /\.(?:png|apng)$/i.test(file.name || "");
    if (!validType) throw new Error("PNG/APNG 파일만 선택할 수 있어요.");
    const image = await readAsDataUrl(file);
    if (!image.startsWith("data:image/")) throw new Error("이미지 데이터를 읽지 못했습니다.");
    payload = {
      image,
      name: file.name || "thumbnail",
      size: Number(file.size || 0),
      type: file.type || "image/png",
      supported: true,
      tooLarge: Number(file.size || 0) > MAX_BYTES,
    };
    updateUi();
    deliver();
    window.setTimeout(deliver, 250);
    window.setTimeout(deliver, 1000);
  }

  function ensurePicker() {
    let picker = document.getElementById("entry-chat-workspace-thumbnail-input");
    if (picker) return picker;
    picker = document.createElement("input");
    picker.id = "entry-chat-workspace-thumbnail-input";
    picker.type = "file";
    picker.accept = "image/png,image/apng,.png,.apng";
    picker.style.display = "none";
    picker.dataset.entryLlnkOwned = "1";
    picker.addEventListener("change", () => {
      const file = picker.files?.[0];
      if (file) applyFile(file).catch(() => {});
    });
    document.documentElement.appendChild(picker);
    return picker;
  }

  function chooseFile() {
    const picker = ensurePicker();
    picker.value = "";
    picker.click();
  }

  function getWorkspaceTitleInput() {
    const canvas = document.getElementById("entryCanvas");
    const board = document.getElementById("entryWorkspaceBoard");
    if (!canvas || !board || canvas.getBoundingClientRect().width <= 0 || board.getBoundingClientRect().width <= 0) return null;
    const input = document.querySelector("#common_srch input[maxlength='30']");
    if (!(input instanceof HTMLInputElement) || input.type !== "text") return null;
    const rect = input.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? input : null;
  }

  function positionTool(tool, input) {
    if (!tool || !input || tool.parentElement !== input.parentElement) return;
    tool.style.left = `${input.offsetLeft + input.offsetWidth + 8}px`;
  }

  function ensureTool() {
    const titleInput = getWorkspaceTitleInput();
    const existing = document.querySelector(".entry-chat-workspace-thumbnail-floating");
    if (!titleInput) {
      existing?.remove();
      toolResizeObserver?.disconnect();
      toolResizeObserver = null;
      return null;
    }
    if (existing) {
      if (existing.parentElement !== titleInput.parentElement) titleInput.insertAdjacentElement("afterend", existing);
      positionTool(existing, titleInput);
      return existing;
    }
    Ringcl.ensureIconFont?.();
    const tool = document.createElement("div");
    tool.className = "entry-chat-workspace-thumbnail-floating";
    tool.dataset.entryLlnkOwned = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "workspace-thumbnail";
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined entry-chat-symbol";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "image";
    const label = document.createElement("span");
    label.textContent = "썸네일";
    button.append(icon, label);
    button.addEventListener("click", chooseFile);
    const status = document.createElement("span");
    status.dataset.role = "workspaceThumbnailStatus";
    status.textContent = "PNG/APNG";
    tool.append(button, status);
    titleInput.insertAdjacentElement("afterend", tool);
    positionTool(tool, titleInput);
    toolResizeObserver?.disconnect();
    toolResizeObserver = new ResizeObserver(() => positionTool(tool, titleInput));
    toolResizeObserver.observe(titleInput);
    toolResizeObserver.observe(titleInput.parentElement);
    updateUi();
    return tool;
  }

  function mutationsContainFrame(mutations = []) {
    return mutations.some((mutation) => [...mutation.addedNodes].some((node) => (
      node instanceof Element
      && (node.matches("iframe, frame") || node.querySelector("iframe, frame"))
    )));
  }

  function scheduleToolHydration() {
    if (hydrationFrame) return;
    hydrationFrame = window.requestAnimationFrame(() => {
      hydrationFrame = 0;
      ensureTool();
    });
  }

  function init() {
    if (!/^\/ws(?:\/|$)/.test(location.pathname)) return;
    document.documentElement.classList.add("entry-chat-page-ws");
    document.documentElement.dataset.entryLlnkActive = "1";
    scheduleToolHydration();
    const schedule = (mutations) => {
      scheduleToolHydration();
      if (payload && mutationsContainFrame(mutations)) deliver();
    };
    observer = new MutationObserver(schedule);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", ensureTool, { passive: true });
    window.addEventListener("pagehide", () => {
      observer?.disconnect();
      toolResizeObserver?.disconnect();
      window.cancelAnimationFrame(hydrationFrame);
      window.removeEventListener("resize", ensureTool);
    }, { once: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
