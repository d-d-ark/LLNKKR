// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
(() => {
  "use strict";

  const Ringcl = window.EntryLlnk;
  if (!Ringcl || window.__entryLlnkEntryStoryLoaded || window.self !== window.top) return;
  window.__entryLlnkEntryStoryLoaded = true;

  const { $, $$, text, debounce, isVisible, safeHttpUrl } = Ringcl;
  const POST_SELECTOR = "li.css-tasfte.eqmdslz0, li[class~='eqmdslz0']";
  const BODY_SELECTOR = ".css-6wq60h.eqt5hs60, [class~='eqt5hs60']";
  const LIST_SELECTOR = ".css-1i5jedo.e1lgujxn5, [class~='e1lgujxn5']";
  const WRITER_SELECTOR = "textarea#Write, textarea[name='Write']";
  const MAX_POST_LENGTH = 500;
  const MAX_LINE_BREAKS = 10;
  const LINE_BREAK_MARKER = " ".repeat(3);
  const DRAFT_STORAGE_KEY = "entryLlnkEntryStoryDraftPersistent";
  const DRAFT_SUBMIT_SESSION_KEY = "entryLlnkEntryStoryDraftSubmitPending";
  const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
  const DRAFT_SAVE_DELAY_MS = 240;
  const DRAFT_GUARD_INTERVAL_MS = 300;
  const LIVE_REFRESH_MS = 5000;
  const state = {
    observer: null,
    draftObserver: null,
    lazyObserver: null,
    liveTimer: 0,
    liveAbort: null,
    liveTopId: "",
    liveDedupeQueued: false,
    autoMoreAt: 0,
    autoMoreClickCount: 0,
    autoMoreClicking: false,
    autoMorePageKey: "",
    autoMoreReleaseTimer: 0,
    scrollRaf: 0,
    writerPreviewTimer: 0,
    draftPersistTimer: 0,
    draftGuardTimer: 0,
    draftGuardRunning: false,
    draftRestoreCleanup: null,
    draftValue: "",
    draftSavedAt: 0,
    draftPersistentLoaded: false,
    draftOwnerId: "",
    draftOwnerCheckedAt: 0,
    draftOwnerVerification: null,
    draftSubmitPendingUntil: 0,
    draftSubmittedValue: "",
    draftFailureWatchTimer: 0,
    uploadCleanup: null,
    hidePromotions: true,
    autoMoreEnabled: true,
    liveRefreshEnabled: true,
    livePosts: [],
    imageSpoilerEnabled: true,
    draftEnabled: true,
    blouplaFrames: new Map(),
  };

  const IMAGE_SHORT_LINK_BASE = "https://Llnk.kr/i";
  const IMAGE_SHORT_LINK_RE = /https:\/\/llnk\.kr\/(?:i[a-z0-9]{4}|i\.php\?c=[a-z0-9]{4})\b/i;

  function isEntryStoryPage() {
    return /^\/community\/entrystory(?:\/|$)/.test(location.pathname)
      || /^\/profile\/[a-f0-9]{24}\/community\/entrystory(?:\/|$)/i.test(location.pathname);
  }

  function isEntryStoryListPage() {
    return /^\/community\/entrystory(?:\/|$)/.test(location.pathname);
  }

  function getImageShortLinkCode(value) {
    try {
      const url = value instanceof URL ? value : new URL(text(value).trim());
      if (url.protocol !== "https:") return "";
      if (url.hostname !== "llnk.kr") return "";
      const compactMatch = url.pathname.match(/^\/i([a-z0-9]{4})\/?$/i);
      const code = text(
        compactMatch?.[1] || (url.pathname === "/i.php" ? url.searchParams.get("c") : "") || ""
      ).toLowerCase();
      return /^[a-z0-9]{4}$/.test(code) ? code : "";
    } catch (_) {
      return "";
    }
  }

  function getBlouplaImageUrl(value) {
    try {
      const url = value instanceof URL ? new URL(value.href) : new URL(text(value).trim());
      if (url.protocol !== "https:" || url.hostname !== "img.bloupla.net" || url.port) return "";
      if (!/^\/[a-z0-9_-]{4,64}\/?$/i.test(url.pathname)) return "";
      url.pathname = url.pathname.replace(/\/$/, "");
      url.search = "";
      url.searchParams.set("raw", "1");
      url.hash = "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function limitLineBreakMarkers(value) {
    const source = text(value);
    let output = "";
    let index = 0;
    let markerCount = 0;
    let consecutiveCount = 0;
    let inCode = false;
    while (index < source.length) {
      if (source[index] === "`" && source[index - 1] !== "\\") {
        inCode = !inCode;
        output += source[index];
        index += 1;
        consecutiveCount = 0;
        continue;
      }
      const isSpaceMarker = !inCode && source.startsWith(LINE_BREAK_MARKER, index);
      const markerLength = isSpaceMarker ? LINE_BREAK_MARKER.length : 0;
      if (markerLength) {
        markerCount += 1;
        consecutiveCount += 1;
        if (markerCount <= MAX_LINE_BREAKS && consecutiveCount <= 4) {
          output += source.slice(index, index + markerLength);
        } else if (isSpaceMarker) {
          output += " ";
        }
        index += markerLength;
        continue;
      }
      output += source[index];
      index += 1;
      consecutiveCount = 0;
    }
    return output;
  }

  function appendPlainText(nodes, value) {
    if (!value) return;
    const previous = nodes[nodes.length - 1];
    if (previous?.nodeType === Node.TEXT_NODE) previous.textContent += value;
    else nodes.push(document.createTextNode(value));
  }

  function parseInline(source, context = null) {
    const value = text(source);
    const nodes = [];
    const renderContext = context || {};
    let index = 0;
    const specs = [
      ["__***", "***__", "ubi"], ["__**", "**__", "ub"], ["__*", "*__", "ui"],
      ["***", "***", "bi"], ["**", "**", "b"], ["__", "__", "u"],
      ["~~", "~~", "s"], ["||", "||", "spoiler"], ["`", "`", "code"], ["*", "*", "i"],
    ];
    while (index < value.length) {
      if (value[index] === " ") {
        let spaceEnd = index + 1;
        while (value[spaceEnd] === " ") spaceEnd += 1;
        const runLength = spaceEnd - index;
        const breakCount = Math.floor(runLength / LINE_BREAK_MARKER.length);
        const remainingSpaces = runLength % LINE_BREAK_MARKER.length;
        for (let count = 0; count < breakCount; count += 1) nodes.push(document.createElement("br"));
        appendPlainText(nodes, " ".repeat(remainingSpaces));
        index = spaceEnd;
        continue;
      }
      if (value[index] === "\n") {
        nodes.push(document.createElement("br"));
        index += 1;
        continue;
      }
      const disabledLabelLink = value.slice(index).match(/^\[[^\]\n]+\]\s*\(https?:\/\/[^\s)]+\)/i);
      if (disabledLabelLink) {
        appendPlainText(nodes, disabledLabelLink[0]);
        index += disabledLabelLink[0].length;
        continue;
      }
      const urlMatch = value.slice(index).match(/^https?:\/\/[^\s<>"']+/i);
      if (urlMatch) {
        let raw = urlMatch[0];
        const trailing = raw.match(/[.,!?;:)\]}]+$/)?.[0] || "";
        if (trailing) raw = raw.slice(0, -trailing.length);
        const url = safeHttpUrl(raw);
        if (url) {
          const imageCode = getImageShortLinkCode(url);
          if (imageCode) {
            nodes.push(createImageCard({ code: imageCode, source: "llnk" }));
            if (trailing) appendPlainText(nodes, trailing);
            index += urlMatch[0].length;
            continue;
          }
          const blouplaImageUrl = getBlouplaImageUrl(url);
          if (blouplaImageUrl) {
            nodes.push(createImageCard({ directUrl: blouplaImageUrl, source: "bloupla" }));
            if (trailing) appendPlainText(nodes, trailing);
            index += urlMatch[0].length;
            continue;
          }
          const link = document.createElement("a");
          link.className = "entry-chat-md-link entry-chat-message-link";
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = isProjectUrl(url) ? "[작품 링크]" : raw;
          nodes.push(link);
          if (trailing) appendPlainText(nodes, trailing);
          index += urlMatch[0].length;
          continue;
        }
      }
      let formatted = false;
      for (const [open, close, type] of specs) {
        if (!value.startsWith(open, index)) continue;
        const end = value.indexOf(close, index + open.length);
        if (end <= index + open.length) continue;
        const element = document.createElement(type === "code" ? "code" : "span");
        element.className = `entry-chat-md-${type}`;
        const inner = value.slice(index + open.length, end);
        if (type === "code") element.textContent = inner;
        else parseInline(inner, renderContext).forEach((child) => element.appendChild(child));
        if (type === "spoiler") {
          element.tabIndex = 0;
          element.setAttribute("role", "button");
          element.setAttribute("aria-label", "스포일러 보기");
          const reveal = () => element.classList.add("is-revealed");
          element.addEventListener("click", reveal);
          element.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              reveal();
            }
          });
        }
        nodes.push(element);
        index = end + close.length;
        formatted = true;
        break;
      }
      if (formatted) continue;
      appendPlainText(nodes, value[index]);
      index += 1;
    }
    return nodes;
  }

  function createImageCard(marker) {
    const card = document.createElement("span");
    card.className = "entry-chat-image-card";
    card.dataset.entryLlnkOwned = "1";
    card.dataset.entryLlnkLazyType = "image";
    card.dataset.entryLlnkCode = marker.code || "";
    card.dataset.entryLlnkDirectUrl = marker.directUrl || "";
    card.dataset.entryLlnkSource = marker.source || "";
    const loading = document.createElement("span");
    loading.className = "entry-chat-image-loading";
    loading.textContent = "이미지 불러오는 중…";
    card.appendChild(loading);
    observeLazyCard(card);
    return card;
  }

  function createImageSourceBadge(source) {
    const badge = document.createElement("span");
    const isBloupla = source === "bloupla";
    const label = isBloupla ? "Bloupla" : "Llnkkr";
    badge.className = `entry-chat-image-source-badge ${isBloupla ? "is-bloupla" : "is-llnk"}`;
    badge.textContent = label;
    badge.setAttribute("aria-label", `${label} 이미지`);
    return badge;
  }

  function renderContent(source) {
    const value = limitLineBreakMarkers(source);
    return parseInline(value);
  }

  function hasRenderableSyntax(value) {
    return IMAGE_SHORT_LINK_RE.test(value)
      || /( {3}|\*[^*\n]+\*|\*\*|__|~~|`|\|\||https?:\/\/)/iu.test(value);
  }

  function imageShortLinkFromAnchor(anchor) {
    try {
      const href = text(anchor?.getAttribute?.("href") || "").trim();
      if (!href) return "";
      const url = new URL(href, location.origin);
      const target = url.hostname === "playentry.org" && url.pathname === "/redirect"
        ? new URL(text(url.searchParams.get("external") || "").trim())
        : url;
      return getImageShortLinkCode(target) || getBlouplaImageUrl(target) ? target.href : "";
    } catch (_) {
      return "";
    }
  }

  function postBodySource(body) {
    const ownsRenderedBody = body?.dataset?.entryLlnkOwned === "1"
      || body?.classList?.contains("entry-chat-markdown-rendered");
    const saved = ownsRenderedBody
      ? text(body?.dataset?.entryChatLiveRaw || body?.dataset?.entryLlnkOriginal || "").trim()
      : "";
    if (saved) return saved;
    const clone = body?.cloneNode?.(true);
    if (!clone) return "";
    $$('a[href]', clone).forEach((anchor) => {
      const shortLink = imageShortLinkFromAnchor(anchor);
      if (shortLink) anchor.textContent = shortLink;
    });
    return text(clone.textContent).trim();
  }

  function renderPostBody(body, source, force = false) {
    const value = text(source).trim();
    if (!body || !value) return false;
    const signature = `${value.length}:${value.slice(0, 80)}:${value.slice(-40)}`;
    if (body.dataset.entryLlnkSignature === signature && body.dataset.entryChatLiveRaw === value) return false;
    body.dataset.entryLlnkSignature = signature;
    body.dataset.entryChatLiveRaw = value;
    if (hasRenderableSyntax(value)) {
      body.dataset.entryLlnkOriginal = value;
      body.replaceChildren(...renderContent(value));
      body.classList.add("entry-chat-markdown-rendered");
      body.dataset.entryLlnkOwned = "1";
    } else if (force) {
      body.textContent = value;
      body.classList.remove("entry-chat-markdown-rendered");
      delete body.dataset.entryLlnkOwned;
      delete body.dataset.entryLlnkOriginal;
    }
    return true;
  }

  function scheduleWriterPreview(delay = 90) {
    window.clearTimeout(state.writerPreviewTimer);
    state.writerPreviewTimer = window.setTimeout(renderWriterPreview, delay);
  }

  function ensureWriterPreview(writer) {
    const holder = writer?.closest?.(".css-11v8s45, [class~='ed0ret11']") || writer?.parentElement;
    if (!holder) return null;
    let preview = $(".entry-chat-md-preview", holder);
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "entry-chat-md-preview";
      preview.dataset.entryLlnkOwned = "1";
      holder.appendChild(preview);
    }
    preview.classList.add("entry-rich-unified-preview");
    return preview;
  }

  function hideWriterPreview(preview) {
    if (!preview) return;
    if (!preview.classList.contains("is-visible") && !preview.childNodes.length) {
      delete preview.dataset.entryChatPreviewValue;
      delete preview.dataset.entryRichOwned;
      return;
    }
    preview.replaceChildren();
    preview.classList.remove("is-visible");
    delete preview.dataset.entryChatPreviewValue;
    delete preview.dataset.entryRichOwned;
  }

  function renderWriterPreview() {
    const writer = getWriter();
    if (!writer || writer.closest(".entry-chat-root")) return;
    const preview = ensureWriterPreview(writer);
    if (!preview) return;
    const value = encodedPostValue(writer.value);
    if (!value || !hasRenderableSyntax(value)) {
      hideWriterPreview(preview);
      return;
    }
    const previewValue = value;
    if (!previewValue || !hasRenderableSyntax(previewValue)) {
      hideWriterPreview(preview);
      return;
    }
    if (preview.dataset.entryChatPreviewValue === previewValue && preview.classList.contains("is-visible")) return;
    preview.dataset.entryRichOwned = "1";
    preview.dataset.entryChatPreviewValue = previewValue;
    preview.replaceChildren(...renderContent(previewValue));
    preview.classList.add("is-visible");
  }

  function processPost(post) {
    if (!(post instanceof Element) || post.closest(".entry-chat-root")) return;
    const body = post.matches(BODY_SELECTOR) ? post : $(BODY_SELECTOR, post);
    if (!body || body.closest("[data-entry-llnk-owned='1']")) return;
    const source = postBodySource(body);
    if (!source) return;
    if (!renderPostBody(body, source)) {
      shortenProjectLinks(post);
      applyPromotionFilter(post);
      return;
    }
    shortenProjectLinks(post);
    applyPromotionFilter(post);
  }

  function processRoot(root = document, options = {}) {
    if (!isEntryStoryPage()) {
      removeScrollTopButton();
      document.documentElement.classList.remove("entry-chat-image-spoiler-enabled");
      stopLiveRefresh();
      return;
    }
    document.documentElement.classList.add("entry-chat-page-entrystory", "entry-chat-image-spoiler-enabled");
    const posts = [];
    if (root instanceof Element) {
      const owner = root.matches(POST_SELECTOR) ? root : root.closest(POST_SELECTOR);
      if (owner) posts.push(owner);
    }
    posts.push(...$$(POST_SELECTOR, root));
    [...new Set(posts)].slice(0, 160).forEach(processPost);
    if (!options.skipPageUi) {
      ensureWriterTools();
      ensureScrollTopButton();
      ensurePromotionToggle();
      if (isEntryStoryListPage()) startLiveRefresh();
      else stopLiveRefresh();
    }
  }

  function isProjectUrl(url) {
    return url?.hostname === "playentry.org" && /^\/project\/[a-f0-9]{24}(?:\/|$)/i.test(url.pathname);
  }

  function shortenProjectLinks(root = document) {
    $$('a[href]:not([data-entry-llnk-project-link])', root).slice(0, 200).forEach((link) => {
      const url = safeHttpUrl(link.getAttribute("href"));
      if (!isProjectUrl(url) || link.querySelector("img, video, canvas, button")) return;
      const label = text(link.textContent).trim();
      if (!/(?:https?:\/\/)?(?:www\.)?playentry\.org\/project\//i.test(label) && !/^\/project\//i.test(label)) return;
      link.dataset.entryLlnkProjectLink = "1";
      link.textContent = "[작품 링크]";
      link.classList.add("entry-chat-short-project-link", "entry-chat-md-link");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  function applyPromotionFilter(post) {
    if (!isEntryStoryListPage()) {
      post?.classList?.remove("entry-chat-entry-story-link-filtered");
      return;
    }
    const body = $(BODY_SELECTOR, post) || post;
    const value = `${text(body.dataset.entryLlnkOriginal || body.textContent)} ${$$('a[href]', body).map((link) => link.href).join(" ")}`;
    const shouldHide = state.hidePromotions && /(?:playentry\.org\/project(?:\/|\b)|naver\.me\/)/i.test(value);
    post.classList.toggle("entry-chat-entry-story-link-filtered", shouldHide);
    $(":scope > .entry-chat-link-filter-placeholder", post)?.remove();
  }

  function ensurePromotionToggle() {
    if (!isEntryStoryListPage()) {
      $("[data-entry-llnk-link-filter='1']")?.remove();
      return;
    }
    const container = $$(".css-wa4axc.e1lgujxn8, [class~='css-wa4axc'][class~='e1lgujxn8']")
      .find((element) => isVisible(element) && !element.closest(".entry-chat-root"));
    if (!container) return;
    let button = $("[data-entry-llnk-link-filter='1']");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "entry-chat-story-link-filter-toggle";
      button.dataset.entryLlnkLinkFilter = "1";
      button.dataset.entryLlnkOwned = "1";
      button.addEventListener("click", async () => {
        state.hidePromotions = !state.hidePromotions;
        const saved = await Ringcl.storageGet(["entryLlnkSettings"]).catch(() => ({}));
        await Ringcl.storageSet({
          entryLlnkSettings: {
            ...(saved.entryLlnkSettings || {}),
            hidePromotions: state.hidePromotions,
          },
        }).catch(() => {});
        syncPromotionToggle(button);
        $$(POST_SELECTOR).forEach(applyPromotionFilter);
      });
    }
    if (button.parentElement !== container || button !== container.firstElementChild) container.insertBefore(button, container.firstElementChild);
    syncPromotionToggle(button);
  }

  function syncPromotionToggle(button = $("[data-entry-llnk-link-filter='1']")) {
    if (!button) return;
    button.classList.toggle("is-active", state.hidePromotions);
    button.setAttribute("aria-pressed", state.hidePromotions ? "true" : "false");
    button.title = state.hidePromotions ? "홍보 가리는 중" : "홍보 가리기";
    button.textContent = state.hidePromotions ? "홍보 가리는 중" : "홍보 가리기";
  }

  function getList() {
    return $$(LIST_SELECTOR).find((element) => !element.closest(".entry-chat-root")) || $(POST_SELECTOR)?.parentElement || null;
  }

  function checkAutoMore() {
    if (!state.autoMoreEnabled || !isEntryStoryListPage() || state.autoMoreClicking || Date.now() - state.autoMoreAt < 1400) return;
    const pageKey = `${location.pathname}?${location.search}`;
    if (state.autoMorePageKey !== pageKey) {
      state.autoMorePageKey = pageKey;
      state.autoMoreClickCount = 0;
    }
    const scrolling = document.scrollingElement || document.documentElement || document.body;
    const scrollTop = Number(window.scrollY || scrolling?.scrollTop || 0);
    const scrollHeight = Number(scrolling?.scrollHeight || document.documentElement.scrollHeight || 0);
    const viewportHeight = Number(window.innerHeight || scrolling?.clientHeight || 0);
    const scrollRange = Math.max(0, scrollHeight - viewportHeight);
    const scrollProgress = scrollRange > 0 ? scrollTop / scrollRange : 0;
    const requiredProgress = 1 - (0.75 / (state.autoMoreClickCount + 1));
    if (scrollProgress < requiredProgress) return;
    const button = $$('button.css-1cmqu6s.e1lgujxn6, button[class~="css-1cmqu6s"][class~="e1lgujxn6"]')
      .filter((candidate) => (
        !candidate.closest(".entry-chat-root")
        && isVisible(candidate)
        && !candidate.disabled
        && candidate.getAttribute("aria-disabled") !== "true"
        && text(candidate.textContent).replace(/\s+/g, "") === "더보기"
      ))
      .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((left, right) => right.rect.top - left.rect.top)[0]?.candidate;
    if (!button) return;
    const beforeHeight = scrollHeight;
    const list = getList();
    const beforeCount = list ? [...list.children].filter((element) => element.matches?.(POST_SELECTOR)).length : 0;
    state.autoMoreClicking = true;
    state.autoMoreAt = Date.now();
    try {
      button.click();
      waitForAutoMoreGrowth(beforeHeight, beforeCount);
    } catch (_) {
      state.autoMoreClicking = false;
    }
  }

  function waitForAutoMoreGrowth(beforeHeight, beforeCount, startedAt = Date.now()) {
    window.clearTimeout(state.autoMoreReleaseTimer);
    state.autoMoreReleaseTimer = window.setTimeout(() => {
      if (!isEntryStoryListPage()) {
        state.autoMoreClicking = false;
        return;
      }
      const scrolling = document.scrollingElement || document.documentElement || document.body;
      const currentHeight = Number(scrolling?.scrollHeight || document.documentElement.scrollHeight || 0);
      const list = getList();
      const currentCount = list ? [...list.children].filter((element) => element.matches?.(POST_SELECTOR)).length : 0;
      const grew = currentHeight > beforeHeight + 80 || currentCount > beforeCount;
      if (grew || Date.now() - startedAt >= 5000) {
        if (grew) state.autoMoreClickCount += 1;
        state.autoMoreClicking = false;
        state.autoMoreReleaseTimer = 0;
        return;
      }
      waitForAutoMoreGrowth(beforeHeight, beforeCount, startedAt);
    }, 180);
  }

  function removeScrollTopButton() {
    $$(".entry-chat-entry-story-scroll-top[data-entry-llnk-owned='1']").forEach((button) => button.remove());
  }

  function ensureScrollTopButton() {
    if (!isEntryStoryListPage()) {
      removeScrollTopButton();
      return;
    }
    if ($(".entry-chat-entry-story-scroll-top[data-entry-llnk-owned='1']")) return;
    Ringcl.ensureIconFont?.();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entry-chat-entry-story-scroll-top";
    button.dataset.entryLlnkOwned = "1";
    button.title = "맨 위로";
    button.setAttribute("aria-label", "맨 위로");
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined entry-chat-symbol";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "arrow_upward";
    button.appendChild(icon);
    button.addEventListener("click", () => {
      button.classList.remove("has-new-post");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(button);
  }

  function updateScrollUi() {
    if (!isEntryStoryListPage()) {
      removeScrollTopButton();
      return;
    }
    const button = $(".entry-chat-entry-story-scroll-top[data-entry-llnk-owned='1']");
    if (button) {
      const list = getList();
      if (list) {
        const rect = list.getBoundingClientRect();
        const width = button.offsetWidth || 44;
        const gap = window.innerWidth <= 720 ? 8 : 14;
        const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right + gap));
        button.style.left = `${Math.round(left)}px`;
      }
      button.classList.toggle("is-visible", window.scrollY > Math.max(520, window.innerHeight * 0.7));
    }
    checkAutoMore();
  }

  function onScroll() {
    if (state.scrollRaf) return;
    state.scrollRaf = requestAnimationFrame(() => {
      state.scrollRaf = 0;
      updateScrollUi();
    });
  }

  function ensureLazyObserver() {
    if (state.lazyObserver) return state.lazyObserver;
    state.lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        state.lazyObserver.unobserve(entry.target);
        loadLazyCard(entry.target);
      });
    }, { rootMargin: "240px" });
    return state.lazyObserver;
  }

  function observeLazyCard(card) {
    ensureLazyObserver().observe(card);
  }

  function ensureBlouplaFrameListener() {
    if (state.blouplaFrameListener) return;
    state.blouplaFrameListener = true;
    const extensionOrigin = new URL(chrome.runtime.getURL("/")).origin;
    window.addEventListener("message", (event) => {
      const payload = event.data;
      if (event.origin !== extensionOrigin || payload?.type !== "entry-llnkkR-bloupla-image") return;
      const token = text(payload.token).trim();
      const entry = state.blouplaFrames.get(token);
      if (!entry || event.source !== entry.frame.contentWindow) return;
      state.blouplaFrames.delete(token);
      const card = entry.host.closest(".entry-chat-image-card");
      if (payload.error) {
        if (card) {
          card.textContent = "이미지를 불러오지 못했습니다.";
          card.classList.add("is-error");
        }
        return;
      }
      const width = Math.max(1, Number(payload.width) || 1);
      const height = Math.max(1, Number(payload.height) || 1);
      const ratio = Math.max(0.25, Math.min(4, width / height));
      entry.host.style.aspectRatio = String(ratio);
      sizeImageCardForRatio(card, ratio);
    });
  }

  function sizeImageCardForRatio(card, ratio) {
    if (!card) return;
    const normalizedRatio = Math.max(0.25, Math.min(4, Number(ratio) || 1));
    const width = normalizedRatio < 1
      ? Math.max(110, Math.round(440 * normalizedRatio))
      : 420;
    card.style.width = `min(${width}px, 100%)`;
    card.classList.toggle("is-portrait", normalizedRatio < 1);
  }

  function createBlouplaImageHost(imageUrl) {
    const url = new URL(imageUrl);
    const code = url.pathname.slice(1);
    const token = crypto.randomUUID();
    const host = document.createElement("span");
    host.className = "entry-chat-bloupla-image-host";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ":host{display:block;width:100%;aspect-ratio:16/9;background:#0f1115;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0;pointer-events:none}";
    const frame = document.createElement("iframe");
    frame.title = "Bloupla 이미지";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    root.append(style, frame);
    state.blouplaFrames.set(token, { frame, host });
    ensureBlouplaFrameListener();
    const source = `${chrome.runtime.getURL("src/bloupla-image-frame.html")}?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`;
    const navigate = () => {
      frame.removeAttribute("srcdoc");
      if (frame.getAttribute("src") !== source) frame.setAttribute("src", source);
    };
    navigate();
    requestAnimationFrame(navigate);
    return host;
  }

  async function loadLazyCard(card) {
    if (card.dataset.entryLlnkLazyLoaded === "1") return;
    card.dataset.entryLlnkLazyLoaded = "1";
    if (card.dataset.entryLlnkLazyType === "image") {
      try {
        let remote = card.dataset.entryLlnkDirectUrl;
        if (!remote && card.dataset.entryLlnkSource === "llnk") {
          const payload = await Ringcl.api(`images.php?code=${encodeURIComponent(`i${card.dataset.entryLlnkCode || ""}`)}`);
          if (!payload.image?.url) throw new Error("이미지 주소를 찾지 못했습니다.");
          remote = payload.image.url;
        }
        if (!remote) throw new Error("이미지 주소를 찾지 못했습니다.");
        const safe = safeHttpUrl(remote, "https://playentry.org");
        const entryUploadUrl = safe?.hostname === "playentry.org" && safe.pathname.startsWith("/uploads/")
          ? safe.href
          : "";
        const blouplaImageUrl = card.dataset.entryLlnkSource === "bloupla"
          ? getBlouplaImageUrl(safe)
          : "";
        const imageUrl = entryUploadUrl || blouplaImageUrl;
        if (!imageUrl) throw new Error("이미지 주소가 올바르지 않습니다.");
        const wrapper = document.createElement("span");
        wrapper.className = "entry-chat-image-spoiler";
        const link = document.createElement("a");
        link.className = "entry-chat-image-link";
        link.href = imageUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        if (blouplaImageUrl) {
          link.appendChild(createBlouplaImageHost(blouplaImageUrl));
        } else {
          const image = document.createElement("img");
          image.src = imageUrl;
          image.alt = "이미지";
          image.loading = "lazy";
          image.decoding = "async";
          link.appendChild(image);
        }
        const cover = document.createElement("button");
        cover.type = "button";
        cover.className = "entry-chat-image-spoiler-cover";
        cover.textContent = "이미지 보기";
        cover.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          wrapper.classList.add("is-revealed");
          card.classList.remove("has-spoiler");
        });
        wrapper.appendChild(link);
        if (state.imageSpoilerEnabled) wrapper.appendChild(cover);
        else wrapper.classList.add("is-revealed");
        wrapper.appendChild(createImageSourceBadge(card.dataset.entryLlnkSource));
        card.replaceChildren(wrapper);
        card.dataset.imageLoaded = "1";
        card.classList.toggle("has-spoiler", state.imageSpoilerEnabled);
      } catch (error) {
        card.textContent = error.message || "이미지를 불러오지 못했습니다.";
        card.classList.add("is-error");
      }
      return;
    }
  }

  function getWriter() {
    return $$(WRITER_SELECTOR).find((element) => (
      !element.closest(".entry-chat-root")
      && !element.closest(".css-1cyfuwa.ed0ret0, [class~='css-1cyfuwa'][class~='ed0ret0']")
    )) || null;
  }

  function getSubmit(writer = getWriter()) {
    if (!writer) return null;
    const form = writer.closest(".css-1uvivr9.ed0ret1, [class~='css-1uvivr9'][class~='ed0ret1'], .css-cbwem1.e1lgujxn2, [class~='css-cbwem1'][class~='e1lgujxn2'], form") || writer.parentElement?.parentElement || document;
    return $$('button, a[data-testid="button"], a.css-c0d46e, a[class~="e1lwjzl20"]', form).find((button) => (
      !button.closest(".css-1cyfuwa.ed0ret0, [class~='css-1cyfuwa'][class~='ed0ret0']")
      && text(button.textContent).replace(/\s+/g, "") === "등록"
    )) || null;
  }

  function insertAtSelection(writer, insertion) {
    const value = writer.value || "";
    const start = Number.isFinite(writer.selectionStart) ? writer.selectionStart : value.length;
    const end = Number.isFinite(writer.selectionEnd) ? writer.selectionEnd : value.length;
    const prefix = start > 0 && !/[\s\n]$/.test(value.slice(0, start)) ? " " : "";
    const next = `${prefix}${insertion}`;
    if (typeof writer.setRangeText === "function") writer.setRangeText(next, start, end, "end");
    else writer.value = `${value.slice(0, start)}${next}${value.slice(end)}`;
    writer.dispatchEvent(new Event("input", { bubbles: true }));
    writer.dispatchEvent(new Event("change", { bubbles: true }));
    writer.focus();
  }

  function ensureWriterTools() {
    const writer = getWriter();
    if (!writer) return;
    Ringcl.ensureIconFont?.();
    bindWriter(writer);
    suppressPendingDraftInWriter(writer);
    ensureCounter(writer);
    renderWriterPreview();
    offerDraftRestore(writer);
    const submit = getSubmit(writer);
    bindSubmit(writer, submit);
    if (!submit) return;
    const form = writer.closest(".css-1uvivr9.ed0ret1, [class~='css-1uvivr9'][class~='ed0ret1'], .css-cbwem1.e1lgujxn2, [class~='css-cbwem1'][class~='e1lgujxn2'], form") || writer.parentElement?.parentElement;
    const submitArea = submit.closest(".css-11ofcmn.ed0ret4, [class~='css-11ofcmn'][class~='ed0ret4']") || submit.parentElement;
    if (!submitArea) return;
    form?.classList.add("entry-chat-compose-shell");
    submitArea.classList.add("entry-chat-compose-action-row");
    if ($("[data-entry-chat-image-control='1']", submitArea)) {
      syncImageControlState();
      return;
    }
    const imageControl = createImageControl(writer);
    imageControl.dataset.entryLlnkOwned = "1";
    submitArea.insertBefore(imageControl, submit);
    syncImageControlState();
  }

  function createComposeIcon(name, extraClass = "entry-chat-compose-icon") {
    const icon = document.createElement("span");
    icon.className = `material-symbols-outlined entry-chat-symbol ${extraClass}`.trim();
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = name;
    return icon;
  }

  function createImageControl(writer) {
    const control = document.createElement("span");
    control.className = "entry-chat-image-compose";
    control.dataset.entryChatImageControl = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entry-chat-image-toggle is-ready";
    button.setAttribute("aria-label", "이미지 첨부");
    button.appendChild(createComposeIcon("image"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const preview = $("[data-entry-chat-image-preview-panel='1']");
      if (preview?.classList.contains("is-visible") && getPendingImageCode()) {
        removeImageAttachment(writer, preview);
        return;
      }
      chooseImage(writer);
    });
    control.appendChild(button);
    return control;
  }

  function bindWriter(writer) {
    if (writer.dataset.entryLlnkBound === "1") return;
    writer.dataset.entryLlnkBound = "1";
    const update = (event = null) => {
      if (writer.dataset.entryLlnkDraftAnimating !== "1") {
        saveDraft(writer, { allowClear: Boolean(event?.isTrusted) });
      }
      updateCounter(writer);
    };
    writer.addEventListener("input", (event) => {
      update(event);
      if (writer.dataset.entryLlnkDraftAnimating !== "1") scheduleWriterPreview();
    });
    writer.addEventListener("change", (event) => {
      update(event);
      scheduleWriterPreview();
    });
    writer.addEventListener("compositionend", (event) => {
      update(event);
      scheduleWriterPreview();
    });
    writer.addEventListener("blur", update);
  }

  function bindSubmit(writer, submit) {
    if (!submit || submit.dataset.entryLlnkBound === "1") return;
    submit.dataset.entryLlnkBound = "1";
    submit.addEventListener("click", (event) => {
      if (prepareImageSubmit(event, writer)) return;
      const submittedValue = text(writer?.value);
      saveDraft(writer);
      if (submittedValue.trim()) {
        state.draftSubmittedValue = submittedValue;
        state.draftSubmitPendingUntil = Date.now() + 35000;
        rememberDraftSubmitPending(submittedValue);
        startDraftFailureWatch();
      }
      prepareWriterForSubmit(writer);
      window.setTimeout(() => suppressPendingDraftInWriter(writer), 180);
      window.setTimeout(renderWriterPreview, 120);
    }, true);
  }

  function draftOwnerId() {
    return text(state.draftOwnerId).trim();
  }

  function readDraftSubmitPending() {
    try {
      const pending = JSON.parse(sessionStorage.getItem(DRAFT_SUBMIT_SESSION_KEY) || "null");
      const value = text(pending?.value);
      const ownerEntryUserId = text(pending?.ownerEntryUserId).trim();
      const expiresAt = Number(pending?.expiresAt || 0);
      if (!value.trim() || !expiresAt || expiresAt <= Date.now()) {
        sessionStorage.removeItem(DRAFT_SUBMIT_SESSION_KEY);
        return null;
      }
      return { value, ownerEntryUserId, expiresAt };
    } catch (_) {
      try { sessionStorage.removeItem(DRAFT_SUBMIT_SESSION_KEY); } catch (_) {}
      return null;
    }
  }

  function clearDraftSubmitPending() {
    state.draftSubmitPendingUntil = 0;
    state.draftSubmittedValue = "";
    window.clearInterval(state.draftFailureWatchTimer);
    state.draftFailureWatchTimer = 0;
    try { sessionStorage.removeItem(DRAFT_SUBMIT_SESSION_KEY); } catch (_) {}
  }

  function restoreDraftSubmitPending(ownerEntryUserId = "") {
    const pending = readDraftSubmitPending();
    if (!pending) {
      state.draftSubmitPendingUntil = 0;
      state.draftSubmittedValue = "";
      return false;
    }
    const owner = text(ownerEntryUserId).trim();
    if (owner && pending.ownerEntryUserId && pending.ownerEntryUserId !== owner) {
      clearDraftSubmitPending();
      return false;
    }
    state.draftSubmitPendingUntil = pending.expiresAt;
    state.draftSubmittedValue = pending.value;
    return true;
  }

  function rememberDraftSubmitPending(value) {
    const submittedValue = text(value);
    if (!submittedValue.trim()) return;
    const expiresAt = Date.now() + 35000;
    state.draftSubmitPendingUntil = expiresAt;
    state.draftSubmittedValue = submittedValue;
    try {
      sessionStorage.setItem(DRAFT_SUBMIT_SESSION_KEY, JSON.stringify({
        value: submittedValue,
        ownerEntryUserId: draftOwnerId(),
        expiresAt,
      }));
    } catch (_) {}
  }

  function suppressPendingDraftInWriter(writer = getWriter()) {
    if (!writer?.isConnected || Date.now() >= state.draftSubmitPendingUntil) return false;
    const pendingValue = text(state.draftSubmittedValue);
    if (!pendingValue.trim() || encodedPostValue(writer.value) !== encodedPostValue(pendingValue)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(writer, "");
    else writer.value = "";
    writer.dispatchEvent(new Event("input", { bubbles: true }));
    writer.dispatchEvent(new Event("change", { bubbles: true }));
    delete writer.dataset.entryLlnkDraftRestored;
    updateCounter(writer);
    scheduleWriterPreview(0);
    return true;
  }

  function resetDraftRuntimeForAccount(nextOwnerEntryUserId = "") {
    const nextOwner = text(nextOwnerEntryUserId).trim();
    const previousOwner = draftOwnerId();
    if (previousOwner === nextOwner) return;
    const previousDraft = state.draftValue;
    window.clearTimeout(state.draftPersistTimer);
    state.draftPersistTimer = 0;
    state.draftValue = "";
    state.draftSavedAt = 0;
    state.draftPersistentLoaded = false;
    state.draftOwnerId = nextOwner;
    restoreDraftSubmitPending(nextOwner);
    const writer = getWriter();
    if (writer) {
      const current = text(writer.value);
      const restoredByRingcl = writer.dataset.entryLlnkDraftRestored === "1";
      if (restoredByRingcl || (previousDraft && current === previousDraft)) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        if (setter) setter.call(writer, "");
        else writer.value = "";
        writer.dispatchEvent(new Event("input", { bubbles: true }));
        writer.dispatchEvent(new Event("change", { bubbles: true }));
        updateCounter(writer);
        scheduleWriterPreview(0);
      }
      delete writer.dataset.entryLlnkDraftRestored;
    }
    clearDraftRestoreEffects();
  }

  async function refreshDraftOwner(force = false) {
    if (!force && state.draftOwnerCheckedAt && Date.now() - state.draftOwnerCheckedAt < 30000) return draftOwnerId();
    if (state.draftOwnerVerification) return state.draftOwnerVerification;
    state.draftOwnerVerification = Ringcl.resolveEntryIdentity(true)
      .then((identity) => {
        const nextOwner = text(identity?.entryUserId).trim();
        resetDraftRuntimeForAccount(nextOwner);
        state.draftOwnerCheckedAt = Date.now();
        return nextOwner;
      })
      .catch(() => {
        state.draftOwnerCheckedAt = Date.now();
        return draftOwnerId();
      })
      .finally(() => {
        state.draftOwnerVerification = null;
      });
    return state.draftOwnerVerification;
  }

  function saveDraft(writer, options = {}) {
    if (!state.draftEnabled) return;
    const value = text(writer?.value);
    if (!value.trim()) {
      if (options.allowClear) clearDraft();
      return;
    }
    const ownerEntryUserId = draftOwnerId();
    if (!ownerEntryUserId) return;
    state.draftValue = value;
    state.draftSavedAt = Date.now();
    try {
      sessionStorage.setItem("entryLlnkEntryStoryDraftSession", value);
      sessionStorage.setItem("entryLlnkEntryStoryDraftSessionAt", String(state.draftSavedAt));
      sessionStorage.setItem("entryLlnkEntryStoryDraftSessionOwner", ownerEntryUserId);
    } catch (_) {}
    window.clearTimeout(state.draftPersistTimer);
    state.draftPersistTimer = window.setTimeout(() => {
      state.draftPersistTimer = 0;
      Ringcl.storageSet({
        [DRAFT_STORAGE_KEY]: { value, savedAt: state.draftSavedAt, ownerEntryUserId },
      }).catch(() => {});
    }, DRAFT_SAVE_DELAY_MS);
  }

  function readDraft() {
    const currentOwner = draftOwnerId();
    if (!currentOwner) return null;
    if (state.draftValue) return { value: state.draftValue, savedAt: state.draftSavedAt };
    try {
      const value = sessionStorage.getItem("entryLlnkEntryStoryDraftSession") || "";
      const savedAt = Number(sessionStorage.getItem("entryLlnkEntryStoryDraftSessionAt") || 0);
      const savedOwner = text(sessionStorage.getItem("entryLlnkEntryStoryDraftSessionOwner") || "").trim();
      if (!value.trim() || !savedAt || Date.now() - savedAt >= DRAFT_TTL_MS || !savedOwner || savedOwner !== currentOwner) return null;
      state.draftValue = value;
      state.draftSavedAt = savedAt;
      return { value, savedAt };
    } catch (_) {
      return null;
    }
  }

  async function readPersistentDraft() {
    if (state.draftPersistentLoaded) return state.draftValue ? { value: state.draftValue, savedAt: state.draftSavedAt } : null;
    state.draftPersistentLoaded = true;
    const saved = await Ringcl.storageGet([DRAFT_STORAGE_KEY]).catch(() => ({}));
    const record = saved?.[DRAFT_STORAGE_KEY];
    if (!record || typeof record !== "object") return null;
    const value = text(record.value);
    const savedAt = Number(record.savedAt || 0);
    const savedOwner = text(record.ownerEntryUserId).trim();
    const currentOwner = draftOwnerId();
    if (!value.trim() || !savedAt || Date.now() - savedAt >= DRAFT_TTL_MS) {
      Ringcl.storageRemove([DRAFT_STORAGE_KEY]).catch(() => {});
      return null;
    }
    if (!currentOwner || !savedOwner || savedOwner !== currentOwner) return null;
    if (!state.draftValue || savedAt > state.draftSavedAt) {
      state.draftValue = value;
      state.draftSavedAt = savedAt;
      try {
        sessionStorage.setItem("entryLlnkEntryStoryDraftSession", value);
        sessionStorage.setItem("entryLlnkEntryStoryDraftSessionAt", String(savedAt));
        sessionStorage.setItem("entryLlnkEntryStoryDraftSessionOwner", savedOwner);
      } catch (_) {}
    }
    return { value: state.draftValue, savedAt: state.draftSavedAt };
  }

  function clearDraft() {
    window.clearTimeout(state.draftPersistTimer);
    state.draftPersistTimer = 0;
    state.draftValue = "";
    state.draftSavedAt = 0;
    state.draftPersistentLoaded = true;
    try {
      sessionStorage.removeItem("entryLlnkEntryStoryDraftSession");
      sessionStorage.removeItem("entryLlnkEntryStoryDraftSessionAt");
      sessionStorage.removeItem("entryLlnkEntryStoryDraftSessionOwner");
    } catch (_) {}
    Ringcl.storageRemove([DRAFT_STORAGE_KEY]).catch(() => {});
    clearDraftSubmitPending();
    clearDraftRestoreEffects();
  }

  async function restoreDraftOnPageLoad(writer = getWriter()) {
    if (!state.draftEnabled) return;
    if (!isEntryStoryListPage() || !writer || writer.dataset.entryLlnkDraftRestored === "1" || text(writer.value).trim()) return;
    if (Date.now() < state.draftSubmitPendingUntil) return;
    const ownerEntryUserId = await refreshDraftOwner();
    if (!ownerEntryUserId || !writer.isConnected || text(writer.value).trim()) return;
    let draft = readDraft();
    if (!draft) draft = await readPersistentDraft();
    if (!draft?.value?.trim() || !writer.isConnected || text(writer.value).trim()) return;
    restoreDraftIntoWriter(writer, draft.value, { announce: true });
  }

  function restoreDraftIntoWriter(writer, value, options = {}) {
    const draftValue = text(value);
    if (
      !writer?.isConnected
      || writer.dataset.entryLlnkDraftAnimating === "1"
      || !draftValue.trim()
      || text(writer.value) === draftValue
    ) return false;
    writer.dataset.entryLlnkDraftRestored = "1";
    if (options.announce) playDraftRestoreAnimation(writer, draftValue);
    else setDraftRestoreValue(writer, draftValue, true);
    return true;
  }

  function setDraftRestoreValue(writer, value, notify = false) {
    if (!writer?.isConnected) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(writer, value);
    else writer.value = value;
    if (!notify) return;
    writer.dispatchEvent(new Event("input", { bubbles: true }));
    writer.dispatchEvent(new Event("change", { bubbles: true }));
    updateCounter(writer);
    scheduleWriterPreview(0);
  }

  function setDraftRestoreProgress(writer, value) {
    if (!writer?.isConnected) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(writer, value);
    else writer.value = value;
    writer.dispatchEvent(new Event("input", { bubbles: true }));
    updateCounter(writer);
  }

  function measureDraftTextMetrics(writer, value) {
    if (!writer?.isConnected) return { totalWidth: 0, maxLineWidth: 0, contentWidth: 0, paddingLeft: 0 };
    const canvas = measureDraftTextMetrics.canvas || document.createElement("canvas");
    measureDraftTextMetrics.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) return { totalWidth: 0, maxLineWidth: 0, contentWidth: 0, paddingLeft: 0 };
    const style = getComputedStyle(writer);
    context.font = [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize, style.fontFamily]
      .filter(Boolean)
      .join(" ");
    context.fontKerning = "normal";
    if ("letterSpacing" in context) context.letterSpacing = style.letterSpacing;
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const contentWidth = Math.max(1, writer.clientWidth - paddingLeft - paddingRight);
    const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
    const lineWidths = [];
    for (const paragraph of text(value).replace(/\r\n?/g, "\n").split("\n")) {
      let lineWidth = 0;
      for (const character of Array.from(paragraph)) {
        const characterWidth = context.measureText(character).width + letterSpacing;
        if (lineWidth > 0 && lineWidth + characterWidth > contentWidth) {
          lineWidths.push(lineWidth);
          lineWidth = 0;
        }
        lineWidth += characterWidth;
      }
      lineWidths.push(lineWidth);
    }
    return {
      totalWidth: lineWidths.reduce((total, width) => total + width, 0),
      maxLineWidth: Math.max(0, ...lineWidths),
      contentWidth,
      paddingLeft,
    };
  }

  function draftFlightTiming(characterCount, metrics = {}) {
    const count = Math.max(1, Number(characterCount) || 1);
    const travelWidth = Math.max(count * 8, Number(metrics.totalWidth) || 0);
    const sweepDistance = Math.max(72, Math.min(Number(metrics.contentWidth) || 72, Number(metrics.maxLineWidth) || 72));
    const entryDuration = 660;
    const typingDuration = Math.max(280, Math.min(2350, 220 + travelWidth * 0.22));
    const sweepDuration = Math.max(520, Math.min(2700, typingDuration + 220));
    const exitDuration = 760;
    const duration = entryDuration + sweepDuration + exitDuration;
    return {
      duration,
      entryEnd: entryDuration / duration,
      exitStart: (entryDuration + sweepDuration) / duration,
      typingStart: entryDuration + 90,
      typingDuration,
      sweepDistance,
      paddingLeft: Number(metrics.paddingLeft) || 0,
    };
  }

  function draftFlightPose(writer, progress, timing, writingProgress = 0) {
    const rect = writer.getBoundingClientRect();
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const mix = (start, end, amount) => start + (end - start) * amount;
    const easeOutCubic = (value) => 1 - (1 - value) ** 3;
    const easeInCubic = (value) => value ** 3;
    const easeOutBack = (value) => {
      const overshoot = 1.28;
      return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
    };
    const entryEnd = timing.entryEnd;
    const exitStart = timing.exitStart;
    const flightY = rect.top - 82;
    const sweepStartX = rect.left + timing.paddingLeft - 56;
    const sweepEndX = Math.min(rect.right - 70, sweepStartX + timing.sweepDistance);
    let x = sweepStartX;
    let y = flightY;
    let scale = 0.68;
    let rotate = 0;
    let yaw = 0;
    let opacity = 1;

    if (progress < entryEnd) {
      const local = clamp(progress / entryEnd, 0, 1);
      const eased = easeOutBack(local);
      x = mix(-240, sweepStartX, eased);
      y = mix(rect.bottom + 150, flightY, easeOutCubic(local));
      scale = mix(2.35, 0.68, easeOutCubic(local)) + Math.sin(local * Math.PI) * 0.16;
      rotate = mix(-42, 2, eased) + Math.sin(local * Math.PI * 2) * 5;
      yaw = mix(-28, -4, easeOutCubic(local));
      opacity = clamp(local / 0.12, 0, 1);
    } else if (progress <= exitStart) {
      const local = clamp((progress - entryEnd) / (exitStart - entryEnd), 0, 1);
      const eased = local * local * (3 - 2 * local);
      const writeT = clamp(writingProgress, 0, 1);
      x = mix(sweepStartX, sweepEndX, writeT);
      y = flightY + Math.sin(writeT * Math.PI * 3) * 4;
      scale = 0.68 + Math.sin(writeT * Math.PI) * 0.055;
      rotate = Math.sin(writeT * Math.PI * 2.4) * 3.2;
      yaw = mix(-4, 5, eased);
    } else {
      const local = clamp((progress - exitStart) / (1 - exitStart), 0, 1);
      const eased = easeInCubic(local);
      x = mix(sweepEndX, window.innerWidth + 250, eased);
      y = mix(flightY, rect.top - 160, eased) + Math.sin(local * Math.PI) * 10;
      scale = mix(0.68, 2.55, eased);
      rotate = mix(1, 34, eased);
      yaw = mix(5, 30, eased);
      opacity = local > 0.84 ? clamp((1 - local) / 0.16, 0, 1) : 1;
    }

    const impact = progress < entryEnd
      ? Math.sin(clamp(progress / entryEnd, 0, 1) * Math.PI)
      : progress > exitStart
        ? Math.sin(clamp((progress - exitStart) / (1 - exitStart), 0, 1) * Math.PI)
        : 0.12 + Math.sin(progress * Math.PI * 4) * 0.04;
    return { x, y, scale, rotate, yaw, opacity, impact };
  }

  function draftBeamHeight(writer, pose) {
    const rect = writer.getBoundingClientRect();
    const flightCenter = 56;
    const beamTop = 84;
    const scale = Math.max(0.2, pose.scale);
    const visualBeamTop = pose.y + flightCenter + (beamTop - flightCenter) * scale;
    return Math.max(0, Math.min(168, (rect.bottom - visualBeamTop) / scale));
  }

  async function restoreUnexpectedlyClearedDraft() {
    if (!state.draftEnabled) return;
    if (state.draftGuardRunning || !isEntryStoryListPage() || document.visibilityState === "hidden") return;
    if (Date.now() < state.draftSubmitPendingUntil) return;
    const writer = getWriter();
    if (!writer?.isConnected || writer.dataset.entryLlnkDraftAnimating === "1" || text(writer.value).trim()) return;
    state.draftGuardRunning = true;
    try {
      if (!draftOwnerId()) await refreshDraftOwner();
      let draft = readDraft();
      if (!draft) draft = await readPersistentDraft();
      const currentWriter = getWriter();
      if (
        !draft?.value?.trim()
        || !currentWriter?.isConnected
        || currentWriter.dataset.entryLlnkDraftAnimating === "1"
        || text(currentWriter.value).trim()
        || Date.now() < state.draftSubmitPendingUntil
      ) return;
      restoreDraftIntoWriter(currentWriter, draft.value, { announce: true });
    } finally {
      state.draftGuardRunning = false;
    }
  }

  function startDraftGuardian() {
    if (!state.draftEnabled || state.draftGuardTimer) return;
    state.draftGuardTimer = window.setInterval(() => {
      restoreUnexpectedlyClearedDraft().catch(() => {});
    }, DRAFT_GUARD_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") restoreUnexpectedlyClearedDraft().catch(() => {});
    });
  }

  const SUBMIT_FAILURE_TEXT_RE = /도배 방지|게시물 작성이 제한|입력 내용을 확인|보안 정책|금지어|10분 후에 다시 시도|로봇이 아님|로봇인지 확인|사람인지 확인|자동 입력|자동 등록|보안 문자|캡차|captcha|recaptcha/i;
  const ROBOT_CHALLENGE_ATTRIBUTE_RE = /captcha|recaptcha|hcaptcha|turnstile|arkose|robot/i;

  function isSubmitFailureElement(element) {
    if (!(element instanceof Element)) return false;
    const attributes = [
      element.id,
      typeof element.className === "string" ? element.className : "",
      element.getAttribute("title"),
      element.getAttribute("name"),
      element.getAttribute("src"),
      element.getAttribute("aria-label"),
    ].join(" ");
    const isChallengeContainer = /^(IFRAME|OBJECT|EMBED)$/.test(element.tagName)
      || element.matches?.('[role="dialog"], [aria-modal="true"]');
    return SUBMIT_FAILURE_TEXT_RE.test(text(element.textContent))
      || (isChallengeContainer && ROBOT_CHALLENGE_ATTRIBUTE_RE.test(attributes));
  }

  function findSubmitFailureElement(root = document) {
    const candidates = [
      ...$$('[role="dialog"], [aria-modal="true"], .css-ye9ri9.e10kbqtd0, [class~="css-ye9ri9"][class~="e10kbqtd0"], iframe', root),
    ];
    return candidates.find(isSubmitFailureElement) || null;
  }

  function restoreDraftForSubmitFailure() {
    if (!state.draftSubmittedValue.trim() && !readDraft()?.value?.trim()) return false;
    clearDraftSubmitPending();
    window.setTimeout(restoreDraftAfterFailure, 120);
    return true;
  }

  function startDraftFailureWatch() {
    window.clearInterval(state.draftFailureWatchTimer);
    let checks = 0;
    state.draftFailureWatchTimer = window.setInterval(() => {
      checks += 1;
      if (findSubmitFailureElement()) {
        restoreDraftForSubmitFailure();
        return;
      }
      if (checks >= 80 || Date.now() >= state.draftSubmitPendingUntil) {
        window.clearInterval(state.draftFailureWatchTimer);
        state.draftFailureWatchTimer = 0;
      }
    }, 250);
  }

  function offerDraftRestore(writer) {
    restoreDraftOnPageLoad(writer).catch(() => {});
    startDraftGuardian();
    if (state.draftObserver) return;
    writer.dataset.entryLlnkDraftOffered = "1";
    let restoreTimer = 0;
    const scheduleRestore = () => {
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => restoreDraftOnPageLoad().catch(() => {}), 60);
    };
    const hasDialog = (element) => element.matches?.('[role="dialog"], .css-ye9ri9.e10kbqtd0, [class~="css-ye9ri9"][class~="e10kbqtd0"]')
      || Boolean($('[role="dialog"], .css-ye9ri9.e10kbqtd0, [class~="css-ye9ri9"][class~="e10kbqtd0"]', element));
    state.draftObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const changedElements = [];
        if (mutation.target instanceof Element) changedElements.push(mutation.target);
        else if (mutation.target?.parentElement) changedElements.push(mutation.target.parentElement);
        for (const addedNode of mutation.addedNodes || []) {
          const element = addedNode instanceof Element ? addedNode : addedNode.parentElement;
          if (element) changedElements.push(element);
        }
        for (const node of changedElements) {
          if (node.matches?.(WRITER_SELECTOR) || node.querySelector?.(WRITER_SELECTOR)) scheduleRestore();
          const knownFailure = isSubmitFailureElement(node)
            || Boolean(findSubmitFailureElement(node));
          if (!knownFailure && !(Date.now() < state.draftSubmitPendingUntil && hasDialog(node))) continue;
          restoreDraftForSubmitFailure();
          return;
        }
      }
    });
    state.draftObserver.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.setTimeout(scheduleRestore, 180);
  }

  function restoreDraftAfterFailure() {
    clearDraftSubmitPending();
    const draft = readDraft();
    const writer = getWriter();
    if (!draft || !writer) return;
    const current = text(writer.value);
    if (!current.trim() || current.length < draft.value.length) {
      restoreDraftIntoWriter(writer, draft.value, { announce: true });
    }
  }

  function playDraftRestoreAnimation(writer, value) {
    const draftValue = text(value);
    clearDraftRestoreEffects();
    if (!writer?.isConnected || !draftValue) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDraftRestoreValue(writer, draftValue, true);
      return;
    }

    const characters = Array.from(draftValue);
    const textMetrics = measureDraftTextMetrics(writer, draftValue);
    const timing = draftFlightTiming(characters.length, textMetrics);
    const { duration } = timing;
    const flight = document.createElement("span");
    flight.className = "entry-chat-draft-flight";
    flight.dataset.entryLlnkOwned = "1";
    flight.setAttribute("aria-hidden", "true");
    flight.style.setProperty("--entry-chat-draft-flight-duration", `${duration}ms`);

    const ship = document.createElement("span");
    ship.className = "entry-chat-draft-flight-ship";
    const frame = document.createElement("img");
    frame.className = "entry-chat-draft-flight-frame";
    frame.src = chrome.runtime.getURL("assets/draft-restore/entrybot-spaceship-1.svg");
    frame.alt = "";
    frame.draggable = false;
    ship.appendChild(frame);
    const beam = document.createElement("span");
    beam.className = "entry-chat-draft-flight-beam";
    ship.appendChild(beam);
    flight.appendChild(ship);
    document.body.appendChild(flight);

    const currentValue = text(writer.value);
    const initialCount = draftValue.startsWith(currentValue) ? Array.from(currentValue).length : 0;
    let renderedCount = initialCount;
    let animationFrame = 0;
    let finished = false;
    let cleanup = null;
    const startedAt = Date.now();
    setDraftRestoreValue(writer, characters.slice(0, initialCount).join(""));

    const finish = (complete) => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      writer.removeEventListener("beforeinput", interrupt, true);
      writer.removeEventListener("pointerdown", interrupt, true);
      delete writer.dataset.entryLlnkDraftAnimating;
      if (complete && writer.isConnected) setDraftRestoreValue(writer, draftValue, true);
      flight.remove();
      if (state.draftRestoreCleanup === cleanup) state.draftRestoreCleanup = null;
    };
    const interrupt = () => finish(true);
    cleanup = (complete = false) => finish(complete);
    state.draftRestoreCleanup = cleanup;
    writer.dataset.entryLlnkDraftAnimating = "1";
    writer.addEventListener("beforeinput", interrupt, true);
    writer.addEventListener("pointerdown", interrupt, true);
    const renderFrame = () => {
      if (!writer.isConnected) {
        finish(false);
        return;
      }
      const elapsed = Date.now() - startedAt;
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      const typingProgress = Math.max(0, Math.min(1, (elapsed - timing.typingStart) / timing.typingDuration));
      const nextCount = Math.max(initialCount, Math.min(characters.length, Math.floor(characters.length * typingProgress)));
      if (nextCount !== renderedCount) {
        renderedCount = nextCount;
        setDraftRestoreProgress(writer, characters.slice(0, renderedCount).join(""));
      }
      const writingProgress = characters.length ? renderedCount / characters.length : 1;
      const pose = draftFlightPose(writer, progress, timing, writingProgress);
      flight.style.opacity = String(pose.opacity);
      flight.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) perspective(680px) rotateY(${pose.yaw}deg) rotateZ(${pose.rotate}deg) scale(${pose.scale})`;
      ship.style.setProperty("--entry-chat-draft-impact-opacity", String(pose.impact * 0.82));
      ship.style.setProperty("--entry-chat-draft-impact-scale", String(0.72 + pose.impact * 0.52));
      beam.style.height = `${draftBeamHeight(writer, pose)}px`;
      if (elapsed >= duration) {
        finish(true);
        return;
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function clearDraftRestoreEffects() {
    const cleanup = state.draftRestoreCleanup;
    state.draftRestoreCleanup = null;
    cleanup?.(false);
    $$(".entry-chat-draft-flight[data-entry-llnk-owned='1'], .entry-chat-draft-restore-panel[data-entry-llnk-owned='1'], .entry-chat-draft-restore-particles[data-entry-llnk-owned='1'], .entry-chat-draft-restore-message[data-entry-llnk-owned='1']").forEach((element) => element.remove());
    $$(".entry-chat-draft-restore-effect-host").forEach((element) => element.classList.remove("entry-chat-draft-restore-effect-host"));
  }

  function encodePostLineBreaks(value) {
    let breaks = 0;
    return text(value).replace(/\r\n?/g, "\n").replace(/\n/g, () => {
      breaks += 1;
      return breaks <= MAX_LINE_BREAKS ? LINE_BREAK_MARKER : " ";
    });
  }

  function encodedPostValue(value) {
    return encodePostLineBreaks(value).trim();
  }

  function prepareWriterForSubmit(writer) {
    const next = encodePostLineBreaks(writer?.value || "");
    if (!writer || next === writer.value) return;
    writer.value = next;
    writer.dispatchEvent(new Event("input", { bubbles: true }));
    writer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ensureCounter(writer) {
    const holder = writer.closest(".css-11v8s45, [class~='ed0ret11']") || writer.parentElement || writer;
    let counter = $("[data-entry-chat-upload-counter='1']", holder);
    if (!counter) {
      counter = document.createElement("div");
      counter.className = "entry-chat-upload-counter";
      counter.dataset.entryChatUploadCounter = "1";
      counter.dataset.entryLlnkOwned = "1";
      holder.appendChild(counter);
    }
    updateCounter(writer);
  }

  function updateCounter(writer) {
    const holder = writer.closest(".css-11v8s45, [class~='ed0ret11']") || writer.parentElement || writer;
    const counter = $("[data-entry-chat-upload-counter='1']", holder);
    if (!counter) return;
    const count = [...encodedPostValue(writer.value)].length;
    counter.textContent = `${count}/${MAX_POST_LENGTH}`;
    counter.classList.toggle("is-over", count > MAX_POST_LENGTH);
    counter.dataset.entryChatOverLimit = count > MAX_POST_LENGTH ? "1" : "0";
  }

  function chooseImage(writer) {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.hidden = true;
    picker.addEventListener("change", () => {
      const file = picker.files?.[0];
      picker.remove();
      if (!file) return;
      if (!/^image\//i.test(file.type)) {
        return;
      }
      uploadImageThroughEntry(writer, file);
    }, { once: true });
    document.documentElement.appendChild(picker);
    picker.click();
  }

  function normalizeEntryImageUrl(value) {
    let source = text(value).trim();
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
    raw = raw.replace(/&amp;/gi, "&").replace(/[;,]+$/g, "");
    const url = safeHttpUrl(raw, "https://playentry.org");
    if (!url || url.hostname !== "playentry.org" || !url.pathname.startsWith("/uploads/")) return "";
    if (/^\/uploads\/(?:fonts|thumb)\//i.test(url.pathname) || /EmptyImage\.svg$/i.test(url.pathname)) return "";
    return url.href;
  }

  function walkFrameDocuments(doc, callback, depth = 0) {
    if (!doc || depth > 4) return null;
    const result = callback(doc);
    if (result) return result;
    for (const frame of $$('iframe, frame', doc)) {
      try {
        const nested = walkFrameDocuments(frame.contentDocument, callback, depth + 1);
        if (nested) return nested;
      } catch (_) {}
    }
    return null;
  }

  function scanUploadedImage(doc) {
    return walkFrameDocuments(doc, (target) => {
      const roots = $$(".se-component.se-image, .se-section-image, .se-module-image, .__se-module-image", target);
      const candidates = [];
      roots.forEach((root) => {
        $$('[src*="/uploads/"], [src*="playentry.org/uploads/"]', root)
          .forEach((element) => candidates.push(element.getAttribute("src") || ""));
        $$('[srcset*="/uploads/"], [srcset*="playentry.org/uploads/"]', root).forEach((element) => {
          text(element.getAttribute("srcset") || "").split(",")
            .forEach((part) => candidates.push(part.trim().split(/\s+/)[0] || ""));
        });
        $$('[data-src*="/uploads/"], [data-url*="/uploads/"]', root)
          .forEach((element) => candidates.push(element.getAttribute("data-src") || element.getAttribute("data-url") || ""));
        $$('[style*="/uploads/"]', root).forEach((element) => {
          const matches = text(element.getAttribute("style")).match(/url\((['"]?)([^'")]+\/uploads\/[^'")]+)\1\)/gi) || [];
          matches.forEach((item) => candidates.push(item.replace(/^url\((['"]?)/i, "").replace(/(['"]?)\)$/i, "")));
        });
      });
      return candidates.map(normalizeEntryImageUrl).find(Boolean) || "";
    });
  }

  function findImageFileInput(doc, depth = 0) {
    if (!doc || depth > 4) return null;
    const input = $$('input[type="file"]', doc).find((element) => {
      const accept = text(element.getAttribute("accept"));
      const name = text(`${element.name || ""} ${element.id || ""} ${element.className || ""} ${element.getAttribute("aria-label") || ""}`);
      return !element.disabled && (/image|\.(?:png|jpe?g|gif|webp|svg)/i.test(accept) || /image|photo|사진|이미지|file|upload|img/i.test(name));
    });
    if (input) return input;
    for (const frame of $$('iframe, frame', doc)) {
      try {
        const nested = findImageFileInput(frame.contentDocument, depth + 1);
        if (nested) return nested;
      } catch (_) {}
    }
    return null;
  }

  function injectSelectedImageFile(doc, file) {
    const input = findImageFileInput(doc);
    if (!input || input.dataset.entryLlnkInjected === "1") return null;
    try {
      const view = input.ownerDocument?.defaultView || window;
      const Transfer = view.DataTransfer || DataTransfer;
      const transfer = new Transfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dataset.entryLlnkInjected = "1";
      input.dispatchEvent(new view.Event("input", { bubbles: true }));
      input.dispatchEvent(new view.Event("change", { bubbles: true }));
      return input;
    } catch (_) {
      return null;
    }
  }

  function findImageToolbarButton(doc) {
    return walkFrameDocuments(doc, (target) => {
      const selectors = [
        'button.se-image-toolbar-button[data-key="image"]',
        'button.se-image-toolbar-button[data-name="image"]',
        'button[data-logcode="dot.img"]',
        'button[data-key="image"][data-type="basic"]',
        'button[title*="사진"]',
      ];
      const usable = (element) => {
        const style = element && target.defaultView?.getComputedStyle(element);
        return element && !element.disabled && style?.display !== "none" && style?.visibility !== "hidden";
      };
      const button = selectors.map((selector) => $(selector, target)).find(usable) || $$('button, [role="button"]', target).find((element) => {
        const label = `${text(element.textContent)} ${element.title || ""} ${element.getAttribute("aria-label") || ""}`;
        return usable(element) && /사진|이미지|image|photo/i.test(label);
      });
      return button || null;
    });
  }

  function clickImageToolbar(doc) {
    const button = findImageToolbarButton(doc);
    if (!button) return null;
    const now = Date.now();
    if (now - Number(button.dataset.entryLlnkLastClickAt || 0) < 900) return null;
    button.dataset.entryLlnkLastClickAt = String(now);
    try {
      const view = button.ownerDocument?.defaultView || window;
      button.scrollIntoView?.({ block: "center", inline: "center" });
      ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach((type) => {
        const EventClass = type.startsWith("pointer") && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
        button.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true, composed: true, button: 0, view }));
      });
      view.HTMLButtonElement?.prototype?.click?.call(button);
    } catch (_) {
      try { button.click?.(); } catch (_) {}
    }
    return button;
  }

  function uploadImageThroughEntry(writer, file) {
    state.uploadCleanup?.();
    const overlay = document.createElement("div");
    overlay.className = "entry-chat-image-upload-layer entry-chat-image-upload-layer-silent";
    overlay.dataset.entryLlnkOwned = "1";
    const hint = document.createElement("p");
    hint.className = "entry-chat-image-upload-hint";
    hint.textContent = "이미지 업로드를 감지하고 있습니다.";
    const iframe = document.createElement("iframe");
    iframe.className = "entry-chat-image-upload-frame";
    iframe.title = "엔트리 이미지 업로더";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = `/community/tips/write?entry_llnk_image_upload=${Date.now()}`;
    Object.assign(iframe.style, {
      position: "absolute",
      display: "block",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      border: "0",
      background: "#fff",
      opacity: "0.01",
      pointerEvents: "none",
      zIndex: "-1",
    });
    overlay.append(hint, iframe);
    document.body.appendChild(overlay);
    let timer = 0;
    let timeout = 0;
    let frameObserver = null;
    let messageHandler = null;
    let finished = false;
    let registering = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      clearTimeout(timeout);
      frameObserver?.disconnect();
      if (messageHandler) window.removeEventListener("message", messageHandler);
      overlay.remove();
      state.uploadCleanup = null;
      syncImageControlState();
    };
    state.uploadCleanup = cleanup;
    syncImageControlState();
    const finish = async (url) => {
      if (finished || registering) return;
      registering = true;
      clearInterval(timer);
      hint.textContent = "이미지를 적용하고 있습니다.";
      showImageAttachmentPreview(writer, url, "");
      cleanup();
      try {
        const payload = await Ringcl.api("images.php", {
          method: "POST",
          body: { image_url: url },
        });
        const code = text(payload.code || "").trim().toLowerCase();
        if (!/^[a-z0-9]{4}$/.test(code)) throw new Error("이미지 링크를 만들지 못했습니다.");
        showImageAttachmentPreview(writer, payload.image_url || url, code);
      } catch (error) {
        registering = false;
        removeImageAttachment(writer, $("[data-entry-chat-image-preview-panel='1']"));
      }
    };
    const detectUploadedUrl = (value) => {
      const url = normalizeEntryImageUrl(value);
      if (url) finish(url);
      return Boolean(url);
    };
    const inspect = () => {
      let doc;
      try { doc = iframe.contentDocument; } catch (_) { return; }
      if (!doc?.documentElement) return;
      const uploaded = scanUploadedImage(doc);
      if (uploaded) {
        finish(uploaded);
        return;
      }
      if (!injectSelectedImageFile(doc, file)) {
        clickImageToolbar(doc);
        injectSelectedImageFile(doc, file);
      }
    };
    const observeFrame = () => {
      frameObserver?.disconnect();
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) return;
        frameObserver = new MutationObserver(inspect);
        frameObserver.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["src", "srcset", "data-src", "data-url", "style", "class"],
        });
      } catch (_) {
        frameObserver = null;
      }
    };
    messageHandler = (event) => {
      if (event.origin !== "https://playentry.org") return;
      const data = event.data || {};
      if (data.source !== "entry-llnk-image-upload") return;
      detectUploadedUrl(data.imageUrl || "");
    };
    window.addEventListener("message", messageHandler);
    iframe.addEventListener("load", () => {
      observeFrame();
      inspect();
    });
    timer = window.setInterval(inspect, 450);
    timeout = window.setTimeout(() => {
      if (finished) return;
      cleanup();
    }, 30000);
  }

  function getPendingImageCode() {
    const panel = $("[data-entry-chat-image-preview-panel='1'].is-visible");
    const code = text(panel?.dataset.imageCode || "").trim().toLowerCase();
    return /^[a-z0-9]{4}$/.test(code) ? code : "";
  }

  function imageShortLink(code) {
    const normalized = text(code).trim().toLowerCase();
    return /^[a-z0-9]{4}$/.test(normalized) ? `${IMAGE_SHORT_LINK_BASE}${normalized}` : "";
  }

  function getPendingImageShortLink() {
    const panel = $("[data-entry-chat-image-preview-panel='1'].is-visible");
    if (panel?.dataset.imageLinkReady !== "1") return "";
    return imageShortLink(getPendingImageCode());
  }

  function appendPendingImageShortLink(value) {
    const source = text(value);
    const shortLink = getPendingImageShortLink();
    if (!shortLink || source.includes(shortLink)) return source;
    return `${source.trimEnd()} ${shortLink}`;
  }

  function prepareImageSubmit(event, writer = getWriter()) {
    const panel = $("[data-entry-chat-image-preview-panel='1'].is-visible");
    if (!writer || !panel) return false;
    if (!getPendingImageCode()) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return true;
    }
    if (!getPendingImageShortLink()) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return true;
    }
    const nextValue = appendPendingImageShortLink(writer.value);
    if (nextValue !== writer.value) {
      writer.value = nextValue;
      writer.dispatchEvent(new Event("input", { bubbles: true }));
      writer.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return false;
  }

  function showImageAttachmentPreview(writer, url, code) {
    $("[data-entry-chat-image-preview-panel='1']")?.remove();
    const form = writer.closest(".css-1uvivr9.ed0ret1, [class~='css-1uvivr9'][class~='ed0ret1'], .css-cbwem1.e1lgujxn2, [class~='css-cbwem1'][class~='e1lgujxn2']") || writer.parentElement;
    if (!form) return;
    const panel = document.createElement("div");
    panel.className = "entry-chat-image-compose-preview";
    panel.dataset.entryChatImagePreviewPanel = "1";
    panel.dataset.entryLlnkOwned = "1";
    panel.dataset.imageUrl = url;
    const normalizedCode = text(code).trim().toLowerCase();
    panel.dataset.imageCode = normalizedCode;
    if (/^[a-z0-9]{4}$/.test(normalizedCode)) panel.dataset.imageLinkReady = "1";
    const label = document.createElement("strong");
    label.textContent = normalizedCode ? "이미지 첨부됨" : "이미지 저장 중...";
    const quota = document.createElement("span");
    quota.className = "entry-chat-file-quota-line";
    quota.textContent = "이미지 · LLNKKR";
    const image = document.createElement("img");
    image.src = url;
    image.alt = "업로드된 이미지";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "entry-chat-image-preview-remove";
    remove.title = "이미지 첨부 제거";
    remove.setAttribute("aria-label", "이미지 첨부 제거");
    remove.textContent = "×";
    remove.addEventListener("click", () => removeImageAttachment(writer, panel));
    panel.append(label, quota, remove, image);
    const shortLink = imageShortLink(code);
    if (shortLink) {
      panel.dataset.imageShortUrl = shortLink;
    }
    const writerLabel = writer.closest("label") || writer.closest(".css-19sv4op.ed0ret2, [class~='css-19sv4op'][class~='ed0ret2']");
    const controls = $(".css-ljggwk.ed0ret3, [class~='css-ljggwk'][class~='ed0ret3']", form);
    if (writerLabel?.parentElement === form) writerLabel.insertAdjacentElement("afterend", panel);
    else if (controls?.parentElement === form) form.insertBefore(panel, controls);
    else form.appendChild(panel);
    panel.classList.add("is-visible");
    syncImageControlState();
    panel.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function removeImageAttachment(writer = getWriter(), panel = $("[data-entry-chat-image-preview-panel='1']")) {
    if (!panel) return;
    const phrase = panel.dataset.imagePhrase || "";
    const shortLink = panel.dataset.imageShortUrl || imageShortLink(panel.dataset.imageCode || "");
    if (writer && (phrase || shortLink)) {
      writer.value = text(writer.value)
        .replace(phrase, "")
        .replace(shortLink, "")
        .trim();
      writer.dispatchEvent(new Event("input", { bubbles: true }));
      writer.dispatchEvent(new Event("change", { bubbles: true }));
    }
    panel.remove();
    syncImageControlState();
  }

  function syncImageControlState() {
    const panel = $("[data-entry-chat-image-preview-panel='1'].is-visible");
    const active = Boolean(getPendingImageCode());
    const pending = Boolean((panel && !active) || $(".entry-chat-image-upload-layer"));
    $$('[data-entry-chat-image-control="1"]').forEach((control) => {
      const button = $(".entry-chat-image-toggle", control);
      button?.classList.toggle("is-attached", active);
      button?.classList.toggle("is-loading", pending);
      button?.classList.toggle("is-ready", !pending);
      button?.setAttribute("aria-pressed", active ? "true" : "false");
      if (button) button.title = active
        ? "이미지 첨부 제거"
        : pending
          ? "이미지 단축링크를 준비하고 있습니다."
          : "이미지를 첨부합니다.";
    });
  }

  async function fetchLivePosts(signal) {
    const params = new URLSearchParams(location.search);
    const query = `query SELECT_ENTRYSTORY($pageParam: PageParam, $query: String, $category: String, $term: String, $discussType: String, $searchType: String) {
      discussList(pageParam: $pageParam, query: $query, category: $category, term: $term, discussType: $discussType, searchType: $searchType) {
        list { id content created commentsLength likesLength isLike user { id nickname profileImage { filename imageType } } image { filename imageType } sticker { filename imageType } }
      }
    }`;
    const data = await Ringcl.entryGraphql("SELECT_ENTRYSTORY", query, {
      category: "free",
      searchType: "scroll",
      term: text(params.get("term") || "all"),
      discussType: "entrystory",
      query: text(params.get("query") || params.get("q") || "") || undefined,
      pageParam: { display: 10, sort: "created" },
    }, { signal });
    return Array.isArray(data?.discussList?.list) ? data.discussList.list : [];
  }

  function entryAssetUrl(asset) {
    const filename = text(asset?.filename).trim();
    if (!/^[a-z0-9_-]{4,}$/i.test(filename)) return "";
    const extension = /^[a-z0-9]+$/i.test(text(asset?.imageType)) ? `.${asset.imageType}` : "";
    return `/uploads/${filename.slice(0, 2)}/${filename.slice(2, 4)}/${filename}${extension}`;
  }

  function formatLiveDate(value) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return "";
    const part = (number) => String(number).padStart(2, "0");
    return `${part(date.getFullYear() % 100)}.${part(date.getMonth() + 1)}.${part(date.getDate())} ・ ${part(date.getHours())}:${part(date.getMinutes())}`;
  }

  function makeLiveElement(tag, className = "", value = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== "") element.textContent = value;
    return element;
  }

  function updateLivePostElement(element, post) {
    if (!element || !post?.id) return;
    element.entryLlnkPost = post;
    element.dataset.entryLlnkLiveId = text(post.id);
    element.dataset.entryChatLivePostId = text(post.id);
    const profileId = text(post.user?.id).trim();
    const profileHref = /^[a-f0-9]{24}$/i.test(profileId) ? `/profile/${profileId}` : "/";
    $$('[data-entry-chat-live-profile="1"]', element).forEach((link) => {
      link.setAttribute("href", profileHref);
    });
    const avatar = $("[data-entry-chat-live-avatar='1']", element);
    if (avatar) {
      avatar.style.backgroundImage = `url("${entryAssetUrl(post.user?.profileImage) || "/img/EmptyImage.svg"}"), url("/img/EmptyImage.svg")`;
    }
    const nickname = $("[data-entry-chat-live-nickname='1']", element);
    if (nickname) nickname.textContent = text(post.user?.nickname || "엔트리");
    const created = $("[data-entry-chat-live-date='1']", element);
    if (created) created.textContent = formatLiveDate(post.created);
    const body = $("[data-entry-chat-live-body='1']", element);
    const content = text(post.content || "");
    if (body && body.dataset.entryLlnkOriginal !== content) {
      body.dataset.entryLlnkOriginal = content;
      body.replaceChildren(...renderContent(content));
    }
    const like = $("[data-entry-chat-live-like='1']", element);
    if (like) {
      like.textContent = `좋아요 ${Math.max(0, Number(post.likesLength || 0))}`;
      like.classList.toggle("active", Boolean(post.isLike));
    }
    const reply = $("[data-entry-chat-live-reply='1']", element);
    if (reply) reply.textContent = `댓글 ${Math.max(0, Number(post.commentsLength || 0))}`;
    const media = $("[data-entry-chat-live-media='1']", element);
    if (media) {
      media.replaceChildren();
      media.classList.toggle("is-native-reaction", Boolean(post.sticker));
      const asset = post.sticker || post.image || null;
      const assetUrl = entryAssetUrl(asset);
      if (assetUrl) {
        const image = document.createElement("img");
        image.src = assetUrl;
        image.alt = post.sticker ? "sticker" : "image";
        image.loading = "lazy";
        media.appendChild(image);
        media.hidden = false;
      } else {
        media.hidden = true;
      }
    }
    shortenProjectLinks(element);
    applyPromotionFilter(element);
  }

  function renderNativePostFromData(element, post) {
    const body = element instanceof Element ? $(BODY_SELECTOR, element) : null;
    const content = text(post?.content || "").trim();
    if (!body || !content) return;
    renderPostBody(body, content, true);
    shortenProjectLinks(element);
    applyPromotionFilter(element);
  }

  function clickLivePostLike(postId) {
    return new Promise((resolve, reject) => {
      if (!postId) return reject(new Error("글 정보를 찾을 수 없습니다."));
      const iframe = document.createElement("iframe");
      iframe.className = "entry-chat-hidden-entry-story-frame";
      iframe.title = "엔트리이야기 좋아요 처리";
      iframe.src = `/community/entrystory/${encodeURIComponent(text(postId))}?entry_llnk_like=${Date.now()}`;
      let done = false;
      const timeout = window.setTimeout(() => finish(new Error("좋아요 처리 시간이 초과됐습니다.")), 10000);
      const finish = (error = null) => {
        if (done) return;
        done = true;
        window.clearTimeout(timeout);
        iframe.remove();
        if (error) reject(error);
        else resolve();
      };
      iframe.addEventListener("load", () => {
        window.setTimeout(async () => {
          try {
            const doc = iframe.contentDocument;
            const view = iframe.contentWindow;
            if (!doc?.body || !view) throw new Error("엔트리이야기 글을 불러오지 못했습니다.");
            const visible = (element) => {
              if (!element) return false;
              const style = view.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            };
            const like = $$('div[class~="e50391u0"] a.like, div[class~="e50391u0"] [class~="like"], a.like, button[aria-label*="좋아요"]', doc).find(visible);
            if (!like) throw new Error("좋아요 버튼을 찾을 수 없습니다.");
            const before = like.classList.contains("active") || like.getAttribute("aria-pressed") === "true";
            like.scrollIntoView?.({ block: "center", inline: "center" });
            like.focus?.();
            ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
              const EventClass = type.startsWith("pointer") && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
              like.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true, composed: true, view }));
            });
            await new Promise((next) => window.setTimeout(next, 1200));
            const after = like.classList.contains("active") || like.getAttribute("aria-pressed") === "true";
            if (after === before) throw new Error("좋아요를 바꾸지 못했습니다. 엔트리 로그인을 확인해 주세요.");
            finish();
          } catch (error) {
            finish(error instanceof Error ? error : new Error(text(error)));
          }
        }, 900);
      }, { once: true });
      document.body.appendChild(iframe);
    });
  }

  function createLivePost(post) {
    Ringcl.ensureIconFont?.();
    const item = makeLiveElement("li", "css-tasfte eqmdslz0 entry-chat-live-entry-story-post");
    item.dataset.entryLlnkLiveId = text(post.id);
    item.dataset.entryChatLivePostId = text(post.id);
    item.dataset.entryLlnkOwned = "1";
    const profileId = text(post.user?.id).trim();
    const profileHref = /^[a-f0-9]{24}$/i.test(profileId) ? `/profile/${profileId}` : "/";
    const card = makeLiveElement("div", "css-12e6n38 e1uj27uy0");
    const profile = makeLiveElement("a");
    profile.href = profileHref;
    profile.dataset.entryChatLiveProfile = "1";
    const avatar = makeLiveElement("div", "css-1r40lgp ec9h6r90");
    avatar.dataset.entryChatLiveAvatar = "1";
    avatar.style.backgroundImage = `url("${entryAssetUrl(post.user?.profileImage) || "/img/EmptyImage.svg"}"), url("/img/EmptyImage.svg")`;
    avatar.appendChild(makeLiveElement("span", "blind", "유저 썸네일"));
    profile.appendChild(avatar);

    const author = makeLiveElement("div", "css-lz5fzu e143sozh0");
    const nickname = makeLiveElement("a", "", text(post.user?.nickname || "엔트리"));
    nickname.href = profileHref;
    nickname.dataset.entryChatLiveProfile = "1";
    nickname.dataset.entryChatLiveNickname = "1";
    const created = makeLiveElement("em", "", formatLiveDate(post.created));
    created.dataset.entryChatLiveDate = "1";
    author.append(nickname, created);

    const body = makeLiveElement("div", "css-6wq60h eqt5hs60 entry-chat-markdown-rendered");
    body.dataset.entryChatLiveBody = "1";
    body.dataset.entryLlnkOwned = "1";
    body.dataset.entryLlnkOriginal = text(post.content || "");
    renderContent(post.content || "").forEach((child) => body.appendChild(child));
    const media = makeLiveElement("em", "entry-chat-live-entry-story-media");
    media.dataset.entryChatLiveMedia = "1";
    media.classList.toggle("is-native-reaction", Boolean(post.sticker));
    const assetUrl = entryAssetUrl(post.sticker || post.image);
    if (assetUrl) {
      const image = document.createElement("img");
      image.src = assetUrl;
      image.alt = post.sticker ? "sticker" : "image";
      image.loading = "lazy";
      media.appendChild(image);
    } else {
      media.hidden = true;
    }

    const actions = makeLiveElement("div", "css-1dcwahm e50391u0");
    const likeWrap = makeLiveElement("em");
    const like = makeLiveElement("a", `like${post.isLike ? " active" : ""}`, `좋아요 ${Math.max(0, Number(post.likesLength || 0))}`);
    like.role = "button";
    like.dataset.entryChatLiveLike = "1";
    const replyWrap = makeLiveElement("em");
    const reply = makeLiveElement("a", "reply", `댓글 ${Math.max(0, Number(post.commentsLength || 0))}`);
    reply.role = "button";
    reply.dataset.entryChatLiveReply = "1";
    likeWrap.appendChild(like);
    replyWrap.appendChild(reply);
    actions.append(likeWrap, replyWrap);
    like.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (like.dataset.entryChatLiveBusy === "1") return;
      like.dataset.entryChatLiveBusy = "1";
      const wasLiked = like.classList.contains("active");
      try {
        const currentPost = item.entryLlnkPost || post;
        await clickLivePostLike(currentPost.id);
        const nextLiked = !wasLiked;
        const nextCount = Math.max(0, Number(currentPost.likesLength || 0) + (nextLiked ? 1 : -1));
        currentPost.isLike = nextLiked;
        currentPost.likesLength = nextCount;
        like.classList.toggle("active", nextLiked);
        like.textContent = `좋아요 ${nextCount}`;
      } catch (error) {
        console.debug("[LLNKKR] 좋아요 처리 실패", error);
      } finally {
        delete like.dataset.entryChatLiveBusy;
      }
    });
    reply.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      location.reload();
    });

    const menu = makeLiveElement("div", "css-c5zb45 e1omy4ml0");
    const refresh = makeLiveElement("button", "entry-chat-live-entry-story-detail");
    refresh.type = "button";
    refresh.title = "페이지 새로고침";
    refresh.setAttribute("aria-label", "페이지 새로고침");
    refresh.appendChild(createComposeIcon("refresh", ""));
    refresh.addEventListener("click", () => location.reload());
    menu.appendChild(refresh);
    card.append(profile, author, body, media, actions, menu);
    item.append(card, document.createElement("div"));
    updateLivePostElement(item, post);
    return item;
  }

  function normalizeLivePostKey(value) {
    return text(value).replace(/[\u00b7\u30fb\u318d]/g, "\u00b7").replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function getLivePostKeyFromElement(post) {
    if (!(post instanceof Element)) return "";
    const bodyNode = $(BODY_SELECTOR, post);
    const body = text(
      bodyNode?.dataset?.entryChatLiveRaw
      || bodyNode?.dataset?.entryLlnkOriginal
      || bodyNode?.textContent
      || ""
    );
    const author = text($(".css-lz5fzu a[href^='/profile/'], [class~='e143sozh0'] a[href^='/profile/']", post)?.textContent || "");
    const created = text($(".css-lz5fzu em, [class~='e143sozh0'] em", post)?.textContent || "");
    return normalizeLivePostKey(`${author}\n${created}\n${body}`);
  }

  function getLivePostKeyFromData(post) {
    if (!post) return "";
    return normalizeLivePostKey(`${text(post.user?.nickname || "")}\n${formatLiveDate(post.created)}\n${text(post.content || "")}`);
  }

  function getLivePostIdentityFromElement(post) {
    if (!(post instanceof Element)) return "";
    const profileLink = $(".css-lz5fzu a[href^='/profile/'], [class~='e143sozh0'] a[href^='/profile/']", post);
    const profileMatch = text(profileLink?.getAttribute("href") || "").match(/^\/profile\/([a-f0-9]{24})/i);
    const author = text(profileLink?.textContent || "");
    const created = text($(".css-lz5fzu em, [class~='e143sozh0'] em", post)?.textContent || "");
    return normalizeLivePostKey(`${profileMatch?.[1] || author}\n${created}`);
  }

  function getLivePostIdentityFromData(post) {
    if (!post) return "";
    return normalizeLivePostKey(`${text(post.user?.id || post.user?.nickname || "")}\n${formatLiveDate(post.created)}`);
  }

  function maybeClearSubmittedDraft(posts = []) {
    const draft = readDraft();
    if (!draft?.value?.trim()) return;
    const submittedValue = state.draftSubmittedValue || draft.value;
    const submitted = posts.some((post) => isPendingSubmittedPost(post, submittedValue, draft.savedAt));
    if (submitted) resetWriterAfterConfirmedPost(submittedValue);
  }

  function isPendingSubmittedPost(post, submittedValue = state.draftSubmittedValue, savedAt = state.draftSavedAt) {
    const contentKey = normalizeLivePostKey(encodedPostValue(submittedValue));
    if (!post || !contentKey || normalizeLivePostKey(post.content) !== contentKey) return false;
    const ownerEntryUserId = draftOwnerId();
    if (ownerEntryUserId && text(post.user?.id).trim() !== ownerEntryUserId) return false;
    const createdAt = Date.parse(text(post.created));
    return !Number.isFinite(createdAt) || !savedAt || createdAt >= savedAt - 120000;
  }

  function resetWriterAfterConfirmedPost(expectedValue = "") {
    clearDraftSubmitPending();
    const writer = getWriter();
    const currentValue = text(writer?.value);
    const expected = normalizeLivePostKey(encodedPostValue(expectedValue));
    const current = normalizeLivePostKey(encodedPostValue(currentValue));
    if (currentValue.trim() && expected && current !== expected) return false;
    if (writer && !writer.closest(".entry-chat-root")) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(writer, "");
      else writer.value = "";
      writer.dispatchEvent(new Event("input", { bubbles: true }));
      writer.dispatchEvent(new Event("change", { bubbles: true }));
      delete writer.dataset.entryLlnkDraftRestored;
      updateCounter(writer);
      scheduleWriterPreview(0);
    }
    clearDraft();
    removeImageAttachment(null);
    return true;
  }

  function getLiveRows(list = getList()) {
    return list ? [...list.children].filter((element) => element.matches?.(POST_SELECTOR)) : [];
  }

  function bindLiveRows(list, posts) {
    const rows = getLiveRows(list).filter((row) => !row.dataset.entryChatLivePostId);
    const postsByKey = new Map();
    posts.forEach((post) => {
      const key = getLivePostKeyFromData(post);
      if (!key) return;
      if (!postsByKey.has(key)) postsByKey.set(key, []);
      postsByKey.get(key).push(post);
    });
    rows.forEach((row) => {
      const matches = postsByKey.get(getLivePostKeyFromElement(row)) || [];
      if (matches.length !== 1) return;
      const id = text(matches[0]?.id || "").trim();
      if (id) row.dataset.entryChatLivePostId = id;
    });
  }

  function reconcileLiveRows(list = getList(), posts = []) {
    if (!list) return 0;
    const rows = getLiveRows(list);
    const liveRows = rows.filter((row) => row.classList.contains("entry-chat-live-entry-story-post"));
    const nativeRows = rows.filter((row) => !row.classList.contains("entry-chat-live-entry-story-post"));
    if (!liveRows.length && !posts.length) return 0;

    const queueBy = (items, keyFor) => {
      const map = new Map();
      items.forEach((item) => {
        const key = keyFor(item);
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
      });
      return map;
    };
    const nativeById = queueBy(nativeRows, (row) => text(row.dataset.entryChatLivePostId || ""));
    const unboundNativeByKey = queueBy(
      nativeRows.filter((row) => !row.dataset.entryChatLivePostId),
      getLivePostKeyFromElement
    );
    const liveById = queueBy(liveRows, (row) => text(row.dataset.entryChatLivePostId || ""));
    const liveByKey = queueBy(liveRows, getLivePostKeyFromElement);
    let removed = 0;

    const removeLiveRows = (items = []) => {
      items.forEach((row) => {
        if (!row?.isConnected) return;
        row.remove();
        removed += 1;
      });
    };

    posts.forEach((post) => {
      const id = text(post?.id || "").trim();
      if (!id) return;
      let nativeRow = (nativeById.get(id) || []).find((row) => row.isConnected) || null;
      if (!nativeRow) {
        const key = getLivePostKeyFromData(post);
        const candidates = unboundNativeByKey.get(key) || [];
        nativeRow = candidates.find((row) => row.isConnected && !row.dataset.entryChatLivePostId) || null;
      }
      if (nativeRow && !nativeRow.dataset.entryChatLivePostId) {
        nativeRow.dataset.entryChatLivePostId = id;
        if (!nativeById.has(id)) nativeById.set(id, []);
        nativeById.get(id).push(nativeRow);
      }
      if (nativeRow) {
        renderNativePostFromData(nativeRow, post);
        removeLiveRows(liveById.get(id) || []);
      }
    });

    nativeRows.forEach((nativeRow) => {
      if (!nativeRow.isConnected || nativeRow.dataset.entryChatLivePostId) return;
      const key = getLivePostKeyFromElement(nativeRow);
      if (!key) return;
      const keyMatches = (liveByKey.get(key) || []).filter((row) => row.isConnected);
      const liveRow = keyMatches.length === 1 ? keyMatches[0] : null;
      if (!liveRow) return;
      const id = text(liveRow.dataset.entryChatLivePostId || "").trim();
      if (id) nativeRow.dataset.entryChatLivePostId = id;
      removeLiveRows([liveRow]);
    });
    return removed;
  }

  function scheduleLiveDedupe() {
    if (state.liveDedupeQueued || !state.liveTopId) return;
    state.liveDedupeQueued = true;
    queueMicrotask(() => {
      state.liveDedupeQueued = false;
      if (!isEntryStoryListPage()) return;
      reconcileLiveRows(getList(), state.livePosts);
    });
  }

  function applyLivePosts(posts) {
    if (!posts.length) return;
    state.livePosts = posts;
    const pendingDraft = readDraft();
    const pendingValue = state.draftSubmittedValue || pendingDraft?.value || "";
    const locallySubmittedIds = new Set(
      posts
        .filter((post) => isPendingSubmittedPost(post, pendingValue, pendingDraft?.savedAt || 0))
        .map((post) => text(post.id))
        .filter(Boolean)
    );
    maybeClearSubmittedDraft(posts);
    const list = getList();
    if (!list) return;
    if (!state.liveTopId) {
      bindLiveRows(list, posts);
      state.liveTopId = text(posts[0].id);
      return;
    }
    reconcileLiveRows(list, posts);
    posts.forEach((post) => {
      const id = text(post.id);
      const existing = id ? $(`[data-entry-chat-live-post-id="${CSS.escape(id)}"]`, list) : null;
      if (existing?.classList.contains("entry-chat-live-entry-story-post")) updateLivePostElement(existing, post);
    });
    const stopIndex = posts.findIndex((post) => text(post.id) === state.liveTopId);
    const fresh = (stopIndex >= 0 ? posts.slice(0, stopIndex) : posts.slice(0, 3))
      .filter((post) => !locallySubmittedIds.has(text(post.id)))
      .filter((post) => !$(`[data-entry-chat-live-post-id="${CSS.escape(text(post.id))}"]`, list));
    state.liveTopId = text(posts[0].id);
    const anchor = [...list.children].find((element) => element.matches?.(POST_SELECTOR) && element.getBoundingClientRect().bottom > 0) || null;
    const anchorTop = anchor?.getBoundingClientRect().top || 0;
    fresh.slice().reverse().forEach((post) => {
      const firstPost = [...list.children].find((element) => element.matches?.(POST_SELECTOR)) || null;
      list.insertBefore(createLivePost(post), firstPost);
    });
    reconcileLiveRows(list, posts);
    [...list.querySelectorAll(":scope > .entry-chat-live-entry-story-post")].slice(50).forEach((element) => element.remove());
    if (fresh.length && anchor && window.scrollY > 80) window.scrollBy(0, anchor.getBoundingClientRect().top - anchorTop);
    if (fresh.length) {
      const up = $(".entry-chat-entry-story-scroll-top[data-entry-llnk-owned='1']");
      up?.classList.add("has-new-post");
    }
  }

  async function refreshLive() {
    if (!isEntryStoryListPage() || document.visibilityState === "hidden" || state.liveAbort || new URLSearchParams(location.search).get("sort") && new URLSearchParams(location.search).get("sort") !== "created") return;
    const controller = new AbortController();
    state.liveAbort = controller;
    try {
      applyLivePosts(await fetchLivePosts(controller.signal));
    } catch (error) {
      if (error.name !== "AbortError") console.debug("[LLNKKR] 실시간 갱신 실패", error);
    } finally {
      if (state.liveAbort === controller) state.liveAbort = null;
    }
  }

  function startLiveRefresh() {
    if (!state.liveRefreshEnabled || !isEntryStoryListPage() || state.liveTimer) return;
    window.setTimeout(refreshLive, 900);
    state.liveTimer = window.setInterval(refreshLive, LIVE_REFRESH_MS);
  }

  function stopLiveRefresh() {
    state.liveAbort?.abort();
    state.liveAbort = null;
    if (state.liveTimer) window.clearInterval(state.liveTimer);
    state.liveTimer = 0;
    state.liveTopId = "";
    state.livePosts = [];
    state.liveDedupeQueued = false;
  }

  function startObserver() {
    if (state.observer) return;
    const roots = new Set();
    let flushQueued = false;
    const flush = () => {
      flushQueued = false;
      if (!roots.size) return;
      const pendingRoots = [...roots];
      roots.clear();
      pendingRoots.forEach((root, index) => processRoot(root, { skipPageUi: index < pendingRoots.length - 1 }));
      scheduleLiveDedupe();
    };
    const schedule = (mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData" && mutation.target.parentElement) roots.add(mutation.target.parentElement);
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) roots.add(node);
          else if (node.parentElement) roots.add(node.parentElement);
        });
      });
      if (!roots.size || flushQueued) return;
      flushQueued = true;
      window.requestAnimationFrame(flush);
    };
    state.observer = new MutationObserver(schedule);
    state.observer.observe(document.body || document.documentElement, { childList: true, characterData: true, subtree: true });
  }

  async function init() {
    if (!isEntryStoryPage()) return;
    document.documentElement.dataset.entryLlnkActive = "1";
    document.documentElement.classList.add("entry-chat-page-entrystory", "entry-chat-image-spoiler-enabled");
    Ringcl.ensureIconFont?.();
    restoreDraftSubmitPending();
    processRoot(document);
    startObserver();
    startLiveRefresh();
    refreshDraftOwner(true).catch(() => {});
    Ringcl.storageGet(["entryLlnkSettings"]).then((saved) => {
      const settings = saved.entryLlnkSettings || {};
      state.hidePromotions = settings.hidePromotions !== false;
      state.autoMoreEnabled = settings.autoMore !== false;
      state.liveRefreshEnabled = settings.liveRefresh !== false;
      state.imageSpoilerEnabled = settings.imageSpoiler !== false;
      state.draftEnabled = settings.draft !== false;
      document.documentElement.classList.toggle("entry-chat-image-spoiler-enabled", state.imageSpoilerEnabled);
      if (state.liveRefreshEnabled) startLiveRefresh();
      else stopLiveRefresh();
      processRoot(document);
    }).catch(() => {});
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("focus", () => refreshDraftOwner(true).catch(() => {}));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.entryLlnkSettings) return;
      const next = changes.entryLlnkSettings.newValue || {};
      state.hidePromotions = next.hidePromotions !== false;
      state.autoMoreEnabled = next.autoMore !== false;
      state.liveRefreshEnabled = next.liveRefresh !== false;
      state.imageSpoilerEnabled = next.imageSpoiler !== false;
      state.draftEnabled = next.draft !== false;
      document.documentElement.classList.toggle("entry-chat-image-spoiler-enabled", state.imageSpoilerEnabled);
      if (state.liveRefreshEnabled) startLiveRefresh();
      else stopLiveRefresh();
      processRoot(document);
    });
    updateScrollUi();
    window.addEventListener("pagehide", () => {
      state.observer?.disconnect();
      state.draftObserver?.disconnect();
      state.lazyObserver?.disconnect();
      stopLiveRefresh();
      window.clearTimeout(state.writerPreviewTimer);
      window.clearTimeout(state.autoMoreReleaseTimer);
      window.clearTimeout(state.draftPersistTimer);
      if (state.draftGuardTimer) window.clearInterval(state.draftGuardTimer);
      state.draftGuardTimer = 0;
      if (state.draftValue.trim() && draftOwnerId()) {
        Ringcl.storageSet({
          [DRAFT_STORAGE_KEY]: {
            value: state.draftValue,
            savedAt: state.draftSavedAt || Date.now(),
            ownerEntryUserId: draftOwnerId(),
          },
        }).catch(() => {});
      }
      state.uploadCleanup?.();
    }, { once: true });
  }

  init();
})();
