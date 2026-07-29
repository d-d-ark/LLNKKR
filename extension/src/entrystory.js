(() => {
  "use strict";

  const Ringcl = window.EntryLlnk;
  if (!Ringcl || window.__entryLlnkEntryStoryLoaded || window.self !== window.top) return;
  window.__entryLlnkEntryStoryLoaded = true;

  const { $, $$, text, debounce, isVisible, safeHttpUrl } = Ringcl;
  const POST_SELECTOR = "li.css-tasfte.eqmdslz0, li[class~='eqmdslz0']";
  const BODY_SELECTOR = ".css-6wq60h.eqt5hs60, [class~='eqt5hs60']";
  const LIST_SELECTOR = ".css-1i5jedo.e1lgujxn5, [class~='e1lgujxn5']";
  const METRIC_SELECTOR = "a.like, a.reply, [data-entry-chat-live-like='1'], [data-entry-chat-live-reply='1']";
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
  const DEFAULT_STORY_FILTERS = Object.freeze({
    projectLinks: true,
    entryLinks: false,
    externalLinks: false,
    naverShortLinks: false,
    allLinks: false,
    images: false,
    entryEmoticons: false,
  });
  const STORY_FILTER_OPTIONS = Object.freeze([
    { key: "allLinks", label: "모든 링크", depth: 0, children: ["entryLinks", "externalLinks"] },
    { key: "entryLinks", label: "엔트리 링크", depth: 1, parent: "allLinks", children: ["projectLinks"] },
    { key: "projectLinks", label: "엔트리 작품 링크", depth: 2, parent: "entryLinks" },
    { key: "externalLinks", label: "엔트리 외부 링크", depth: 1, parent: "allLinks", children: ["naverShortLinks"] },
    { key: "naverShortLinks", label: "네이버 단축 링크", depth: 2, parent: "externalLinks" },
    { key: "images", label: "이미지", depth: 0, startsSection: true },
    { key: "entryEmoticons", label: "엔트리 이모티콘", depth: 0 },
  ]);
  const DEFAULT_PAGE_SETTINGS = Object.freeze({
    darkMode: false,
    draft: true,
    liveRefresh: true,
    spaceshipMotion: true,
    autoMore: true,
    imageSpoiler: true,
    shortenProjectLinks: true,
  });
  const STORY_SETTING_OPTIONS = Object.freeze([
    { key: "darkMode", label: "다크모드", icon: "dark_mode" },
    { key: "draft", label: "작성 내용 자동 저장", icon: "edit_note" },
    { key: "liveRefresh", label: "실시간 새 글", icon: "dynamic_feed" },
    { key: "spaceshipMotion", label: "우주선 모션", icon: "rocket_launch" },
    { key: "autoMore", label: "자동 더보기", icon: "expand_circle_down" },
    { key: "imageSpoiler", label: "이미지 스포일러", icon: "hide_image" },
    { key: "shortenProjectLinks", label: "작품 링크 줄이기", icon: "link" },
  ]);
  const STORY_FILTER_OPTION_MAP = new Map(STORY_FILTER_OPTIONS.map((option) => [option.key, option]));
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
    draftSubmittedAt: 0,
    draftFailureWatchTimer: 0,
    draftSubmitClearTimer: 0,
    uploadCleanup: null,
    storyFilters: { ...DEFAULT_STORY_FILTERS },
    pageSettings: { ...DEFAULT_PAGE_SETTINGS },
    storyFilterEventsBound: false,
    storyNativeSortEventsBound: false,
    replyFoldEventsBound: false,
    autoMoreEnabled: true,
    liveRefreshEnabled: true,
    livePosts: [],
    spaceshipMotionEnabled: true,
    liveArrivalCleanups: new Set(),
    liveUpdateLayouts: new Map(),
    liveRowPositions: new Map(),
    nativeRemovalPending: false,
    nativeArrivalPending: 0,
    nativeArrivalSequence: 0,
    nativeArrivalExpiresAt: 0,
    nativeArrivalScrollAnchor: null,
    imageSpoilerEnabled: true,
    shortenProjectLinksEnabled: true,
    draftEnabled: true,
    blouplaFrames: new Map(),
  };
  const metricAnimationTimers = new WeakMap();

  const IMAGE_SHORT_LINK_BASE = "https://Llnk.kr/i";
  const IMAGE_SHORT_LINK_RE = /https:\/\/llnk\.kr\/(?:i[a-z0-9]{4}|i\.php\?c=[a-z0-9]{4})\b/i;

  function isEntryStoryPage() {
    return /^\/community\/entrystory(?:\/|$)/.test(location.pathname)
      || /^\/profile\/[a-f0-9]{24}\/community\/entrystory(?:\/|$)/i.test(location.pathname);
  }

  function isEntryStoryListPage() {
    return /^\/community\/entrystory(?:\/|$)/.test(location.pathname);
  }

  function isLiveEntryStoryPage() {
    if (location.pathname !== "/community/entrystory/list") return false;
    const params = new URLSearchParams(location.search);
    if (params.getAll("sort").length !== 1 || params.getAll("term").length !== 1) return false;
    const keys = [...params.keys()];
    return keys.length === 2
      && keys.every((key) => key === "sort" || key === "term")
      && params.get("sort") === "created"
      && params.get("term") === "all";
  }

  function syncLiveStoryToolbarScope() {
    document.documentElement.classList.toggle("entry-llnk-live-story-toolbar", isLiveEntryStoryPage());
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
      const isNewline = !inCode && (source[index] === "\n" || source[index] === "\r");
      const markerLength = isSpaceMarker
        ? LINE_BREAK_MARKER.length
        : (isNewline && source[index] === "\r" && source[index + 1] === "\n" ? 2 : (isNewline ? 1 : 0));
      if (markerLength) {
        markerCount += 1;
        consecutiveCount += 1;
        if (markerCount <= MAX_LINE_BREAKS && consecutiveCount <= 4) {
          output += source.slice(index, index + markerLength);
        } else {
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
            nodes.push(createImageCard({ code: imageCode, fallbackUrl: url.href, source: "llnk" }));
            if (trailing) appendPlainText(nodes, trailing);
            index += urlMatch[0].length;
            continue;
          }
          const blouplaImageUrl = getBlouplaImageUrl(url);
          if (blouplaImageUrl) {
            nodes.push(createImageCard({ directUrl: blouplaImageUrl, fallbackUrl: url.href, source: "bloupla" }));
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
    card.dataset.entryLlnkFallbackUrl = marker.fallbackUrl || marker.directUrl || "";
    card.dataset.entryLlnkSource = marker.source || "";
    const loading = document.createElement("span");
    loading.className = "entry-chat-image-loading";
    loading.textContent = "이미지 불러오는 중…";
    card.appendChild(loading);
    observeLazyCard(card);
    return card;
  }

  function showImageFallbackLink(card) {
    if (!card) return false;
    const original = text(card.dataset.entryLlnkFallbackUrl).trim();
    const safe = safeHttpUrl(original);
    if (!safe) return false;
    const link = document.createElement("a");
    link.className = "entry-chat-md-link entry-chat-message-link entry-chat-image-fallback-link";
    link.href = safe.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = original;
    link.addEventListener("click", (event) => event.stopPropagation());
    card.className = "entry-chat-image-fallback";
    card.style.removeProperty("width");
    card.replaceChildren(link);
    return true;
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
      if (anchor.dataset.entryLlnkProjectLink === "1") {
        anchor.textContent = anchor.dataset.entryLlnkProjectOriginalText || anchor.getAttribute("href") || anchor.textContent;
      }
    });
    return text(clone.textContent).trim();
  }

  function isExtensionOwnedPostBody(body) {
    return body?.dataset?.entryLlnkOwned === "1"
      || body?.dataset?.entryChatLiveBody === "1";
  }

  function nativePostRenderLayer(body) {
    let layer = body.querySelector(":scope > .entry-llnk-native-render-layer");
    if (layer) return layer;
    const computed = getComputedStyle(body);
    body.style.setProperty("--entry-llnk-native-font-size", computed.fontSize || "14px");
    body.style.setProperty("--entry-llnk-native-line-height", computed.lineHeight === "normal" ? "1.5" : computed.lineHeight);
    body.style.setProperty("--entry-llnk-native-color", computed.color || "currentColor");
    layer = document.createElement("span");
    layer.className = "entry-llnk-native-render-layer";
    layer.dataset.entryLlnkOwned = "1";
    body.appendChild(layer);
    return layer;
  }

  function renderNativePostBody(body, value) {
    const layer = nativePostRenderLayer(body);
    layer.replaceChildren(...renderContent(value));
    body.classList.add("entry-chat-markdown-rendered", "entry-llnk-native-render-host");
  }

  function renderPostBody(body, source, force = false) {
    const value = text(source).trim();
    if (!body || !value) return false;
    const signature = `${value.length}:${value.slice(0, 80)}:${value.slice(-40)}`;
    const ownedBody = isExtensionOwnedPostBody(body);
    const nativeLayer = ownedBody ? null : body.querySelector(":scope > .entry-llnk-native-render-layer");
    if (
      body.dataset.entryLlnkSignature === signature
      && body.dataset.entryChatLiveRaw === value
      && (ownedBody || nativeLayer || !hasRenderableSyntax(value))
    ) return false;
    body.dataset.entryLlnkSignature = signature;
    body.dataset.entryChatLiveRaw = value;
    if (hasRenderableSyntax(value)) {
      body.dataset.entryLlnkOriginal = value;
      if (ownedBody) {
        body.replaceChildren(...renderContent(value));
        body.classList.add("entry-chat-markdown-rendered");
      } else {
        renderNativePostBody(body, value);
      }
    } else if (force) {
      if (ownedBody) {
        body.textContent = value;
        body.classList.remove("entry-chat-markdown-rendered");
        delete body.dataset.entryLlnkOriginal;
      } else {
        renderNativePostBody(body, value);
        body.dataset.entryLlnkOriginal = value;
      }
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
      applyStoryFilters(post);
      return;
    }
    shortenProjectLinks(post);
    applyStoryFilters(post);
  }

  function processRoot(root = document, options = {}) {
    syncLiveStoryToolbarScope();
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
    syncMetricCounters(root);
    if (!options.skipPageUi) {
      ensureWriterTools();
      ensureScrollTopButton();
      ensureStoryFilterMenu();
      if (isEntryStoryListPage()) startLiveRefresh();
      else stopLiveRefresh();
    }
  }

  function isProjectUrl(url) {
    return url?.hostname === "playentry.org" && /^\/project\/[a-f0-9]{24}(?:\/|$)/i.test(url.pathname);
  }

  function shortenProjectLinks(root = document) {
    if (!state.shortenProjectLinksEnabled) {
      $$('a[href]', root).slice(0, 200).forEach((link) => {
        const url = safeHttpUrl(link.getAttribute("href"));
        const wasShortened = link.dataset.entryLlnkProjectLink === "1" || text(link.textContent).trim() === "[작품 링크]";
        if (!isProjectUrl(url) || !wasShortened) return;
        const original = text(link.dataset.entryLlnkProjectOriginalText).trim();
        link.textContent = original && original !== "[작품 링크]" ? original : (url?.href || link.textContent);
        link.classList.remove("entry-chat-short-project-link", "entry-chat-md-link");
        if (link.dataset.entryLlnkProjectHadTarget === "1") link.setAttribute("target", link.dataset.entryLlnkProjectOriginalTarget || "");
        else link.removeAttribute("target");
        if (link.dataset.entryLlnkProjectHadRel === "1") link.setAttribute("rel", link.dataset.entryLlnkProjectOriginalRel || "");
        else link.removeAttribute("rel");
      });
      return;
    }
    $$('a[href]', root).slice(0, 200).forEach((link) => {
      const url = safeHttpUrl(link.getAttribute("href"));
      if (!isProjectUrl(url) || link.querySelector("img, video, canvas, button")) return;
      if (link.dataset.entryLlnkProjectLink === "1") {
        link.textContent = "[작품 링크]";
        link.classList.add("entry-chat-short-project-link", "entry-chat-md-link");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        return;
      }
      const label = text(link.textContent).trim();
      if (label !== "[작품 링크]" && !/(?:https?:\/\/)?(?:www\.)?playentry\.org\/project\//i.test(label) && !/^\/project\//i.test(label)) return;
      link.dataset.entryLlnkProjectLink = "1";
      link.dataset.entryLlnkProjectOriginalText = label === "[작품 링크]" ? url.href : (link.textContent || "");
      link.dataset.entryLlnkProjectHadTarget = link.hasAttribute("target") ? "1" : "0";
      link.dataset.entryLlnkProjectOriginalTarget = link.getAttribute("target") || "";
      link.dataset.entryLlnkProjectHadRel = link.hasAttribute("rel") ? "1" : "0";
      link.dataset.entryLlnkProjectOriginalRel = link.getAttribute("rel") || "";
      link.textContent = "[작품 링크]";
      link.classList.add("entry-chat-short-project-link", "entry-chat-md-link");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  function normalizeStoryFilters(value, legacyHidePromotions = true) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ...DEFAULT_STORY_FILTERS, projectLinks: legacyHidePromotions !== false };
    }
    const filters = Object.fromEntries(STORY_FILTER_OPTIONS.map(({ key }) => [key, value[key] === true]));
    if (filters.allLinks) {
      filters.entryLinks = true;
      filters.projectLinks = true;
      filters.externalLinks = true;
      filters.naverShortLinks = true;
    } else if (filters.entryLinks) {
      filters.projectLinks = true;
    } else if (filters.externalLinks) {
      filters.naverShortLinks = true;
    }
    return filters;
  }

  function hasActiveStoryFilters() {
    return STORY_FILTER_OPTIONS.some(({ key }) => state.storyFilters[key]);
  }

  function normalizePageSettings(value) {
    const settings = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(DEFAULT_PAGE_SETTINGS).map(([key, defaultValue]) => [
      key,
      typeof settings[key] === "boolean" ? settings[key] : defaultValue,
    ]));
  }

  function storyFilterUrlFromAnchor(link) {
    const url = safeHttpUrl(link?.getAttribute?.("href"));
    if (!url) return null;
    if ((url.hostname === "playentry.org" || url.hostname.endsWith(".playentry.org")) && url.pathname === "/redirect") {
      return safeHttpUrl(url.searchParams.get("external")) || url;
    }
    return url;
  }

  function storyFilterContent(post) {
    const body = $(BODY_SELECTOR, post) || $("[data-entry-chat-live-body='1']", post) || post;
    const urls = $$('a[href]', body)
      .filter((link) => !(
        link.matches(".entry-chat-image-link")
        || link.closest(".entry-chat-image-card")
        || link.querySelector("img, .entry-chat-bloupla-image-host")
      ))
      .map(storyFilterUrlFromAnchor)
      .filter(Boolean);
    const hasProjectLink = urls.some(isProjectUrl);
    const hasEntryLink = urls.some((url) => url.hostname === "playentry.org" || url.hostname.endsWith(".playentry.org"));
    const hasExternalLink = urls.some((url) => url.hostname !== "playentry.org" && !url.hostname.endsWith(".playentry.org"));
    const hasNaverShortLink = urls.some((url) => url.hostname === "naver.me" || url.hostname.endsWith(".naver.me"));
    const hasImage = Boolean(
      $(".entry-chat-image-card", body)
      || $("[data-entry-chat-live-media='1']:not(.is-native-reaction) img", post)
      || $(".entry-chat-live-entry-story-media:not(.is-native-reaction) img", post)
    );
    const hasEntryEmoticon = Boolean(
      $("[data-entry-chat-live-media='1'].is-native-reaction img", post)
      || $(".entry-chat-live-entry-story-media.is-native-reaction img", post)
      || $("img[alt='sticker']", post)
    );
    return {
      hasProjectLink,
      hasEntryLink,
      hasExternalLink,
      hasNaverShortLink,
      hasLink: urls.length > 0,
      hasImage,
      hasEntryEmoticon,
    };
  }

  function applyStoryFilters(post) {
    if (!isEntryStoryListPage()) {
      post?.classList?.remove("entry-chat-entry-story-link-filtered");
      return false;
    }
    const content = storyFilterContent(post);
    const shouldHide = Boolean(
      (state.storyFilters.projectLinks && content.hasProjectLink)
      || (state.storyFilters.entryLinks && content.hasEntryLink)
      || (state.storyFilters.externalLinks && content.hasExternalLink)
      || (state.storyFilters.naverShortLinks && content.hasNaverShortLink)
      || (state.storyFilters.allLinks && content.hasLink)
      || (state.storyFilters.images && content.hasImage)
      || (state.storyFilters.entryEmoticons && content.hasEntryEmoticon)
    );
    post.classList.toggle("entry-chat-entry-story-link-filtered", shouldHide);
    $(":scope > .entry-chat-link-filter-placeholder", post)?.remove();
    return shouldHide;
  }

  function isStoryPostFiltered(post) {
    return post?.classList?.contains("entry-chat-entry-story-link-filtered") === true;
  }

  async function saveStoryFilters() {
    const saved = await Ringcl.storageGet(["entryLlnkSettings"]).catch(() => ({}));
    await Ringcl.storageSet({
      entryLlnkSettings: {
        ...(saved.entryLlnkSettings || {}),
        storyFilters: { ...state.storyFilters },
        hidePromotions: state.storyFilters.projectLinks,
      },
    }).catch(() => {});
  }

  function storyFilterDescendants(key) {
    const descendants = [];
    const visit = (parentKey) => {
      const children = STORY_FILTER_OPTION_MAP.get(parentKey)?.children || [];
      children.forEach((childKey) => {
        descendants.push(childKey);
        visit(childKey);
      });
    };
    visit(key);
    return descendants;
  }

  function storyFilterAncestors(key) {
    const ancestors = [];
    let parent = STORY_FILTER_OPTION_MAP.get(key)?.parent || "";
    while (parent) {
      ancestors.push(parent);
      parent = STORY_FILTER_OPTION_MAP.get(parent)?.parent || "";
    }
    return ancestors;
  }

  function setStoryFilterEnabled(key, enabled) {
    state.storyFilters[key] = enabled;
    storyFilterDescendants(key).forEach((childKey) => {
      state.storyFilters[childKey] = enabled;
    });
    if (!enabled) {
      storyFilterAncestors(key).forEach((parentKey) => {
        state.storyFilters[parentKey] = false;
      });
    }
  }

  function setStoryToolbarPanelOpen(panel, button, open) {
    panel.hidden = !open;
    panel.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeStoryToolbarPanels(exceptButton = null) {
    [
      ["[data-entry-llnk-story-filter-panel='1']", "[data-entry-llnk-link-filter='1']"],
      ["[data-entry-llnk-story-settings-panel='1']", "[data-entry-llnk-story-settings='1']"],
    ].forEach(([panelSelector, buttonSelector]) => {
      const panel = $(panelSelector);
      const button = $(buttonSelector);
      if (!panel || !button || button === exceptButton || panel.hidden) return;
      setStoryToolbarPanelOpen(panel, button, false);
    });
  }

  function bindStoryFilterMenuEvents() {
    if (state.storyFilterEventsBound) return;
    state.storyFilterEventsBound = true;
    document.addEventListener("pointerdown", (event) => {
      const insideToolbarMenu = event.target.closest?.(
        "[data-entry-llnk-story-filter-panel='1'], [data-entry-llnk-story-settings-panel='1'], "
        + "[data-entry-llnk-link-filter='1'], [data-entry-llnk-story-settings='1']",
      );
      if (!insideToolbarMenu) closeStoryToolbarPanels();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const openButton = [
        $("[data-entry-llnk-link-filter='1'][aria-expanded='true']"),
        $("[data-entry-llnk-story-settings='1'][aria-expanded='true']"),
      ].find(Boolean);
      if (!openButton) return;
      closeStoryToolbarPanels();
      openButton.focus();
    });
  }

  function syncNativeStorySortOpenState() {
    if (!isEntryStoryListPage()) return;
    const toolbar = $$(".css-wa4axc.e1lgujxn8, [class~='css-wa4axc'][class~='e1lgujxn8']")
      .find((element) => isVisible(element) && !element.closest(".entry-chat-root"));
    if (!toolbar) return;
    $$('[class~="elhpwdj0"]', toolbar).forEach((wrapper) => {
      const button = $(':scope > [class~="elhpwdj1"]', wrapper);
      const panel = $(':scope > [class~="e7o4zqs0"]', wrapper);
      if (!button || !panel) return;
      const panelStyle = window.getComputedStyle(panel);
      const open = !panel.hidden && panelStyle.display !== "none" && panelStyle.visibility !== "hidden";
      wrapper.classList.toggle("entry-llnk-native-sort-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function bindNativeStorySortEvents() {
    if (state.storyNativeSortEventsBound) return;
    state.storyNativeSortEventsBound = true;
    const scheduleSync = () => {
      window.requestAnimationFrame(() => {
        syncNativeStorySortOpenState();
        window.setTimeout(syncNativeStorySortOpenState, 40);
      });
    };
    document.addEventListener("click", scheduleSync, true);
    document.addEventListener("keyup", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") scheduleSync();
    }, true);
  }

  function bindReplyFoldScrollStabilizer() {
    if (state.replyFoldEventsBound) return;
    state.replyFoldEventsBound = true;
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.('a[class~="e1qasnlc3"]');
      const post = button?.closest?.('li[class~="eqmdslz0"]');
      if (!button || !post || !isVisible(button)) return;
      const anchorTop = post.getBoundingClientRect().top;
      const correct = () => {
        if (!post.isConnected) return;
        const delta = post.getBoundingClientRect().top - anchorTop;
        if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
      };
      window.requestAnimationFrame(() => {
        correct();
        window.requestAnimationFrame(correct);
      });
      [80, 180, 320].forEach((delay) => window.setTimeout(correct, delay));
    }, true);
  }

  function createStoryToolbarButton(className, dataKey, label, iconName) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `entry-chat-story-toolbar-toggle ${className}`;
    button.dataset[dataKey] = "1";
    button.dataset.entryLlnkOwned = "1";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined entry-chat-story-toolbar-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconName;
    const textNode = document.createElement("span");
    textNode.className = "entry-chat-story-toolbar-label";
    textNode.textContent = label;
    const caret = document.createElement("span");
    caret.className = "entry-chat-story-toolbar-caret";
    caret.setAttribute("aria-hidden", "true");
    button.append(icon, textNode, caret);
    return button;
  }

  function createStoryFilterPanel() {
    const panel = document.createElement("div");
    panel.className = "entry-chat-story-filter-panel";
    panel.dataset.entryLlnkStoryFilterPanel = "1";
    panel.dataset.entryLlnkOwned = "1";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "게시글 필터");

    const heading = document.createElement("div");
    heading.className = "entry-chat-story-filter-heading";
    const title = document.createElement("strong");
    title.textContent = "게시글 필터";
    heading.appendChild(title);
    panel.appendChild(heading);

    STORY_FILTER_OPTIONS.forEach(({ key, label, depth = 0, startsSection = false }) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "entry-chat-story-filter-option";
      row.classList.toggle("starts-section", startsSection);
      row.classList.add(`is-depth-${Math.max(0, Math.min(2, depth))}`);
      row.dataset.storyFilterKey = key;
      row.dataset.storyFilterDepth = String(depth);
      row.setAttribute("role", "switch");
      const copy = document.createElement("span");
      copy.className = "entry-chat-story-filter-copy";
      const name = document.createElement("strong");
      name.textContent = label;
      copy.appendChild(name);
      const control = document.createElement("span");
      control.className = "entry-chat-story-filter-switch";
      control.setAttribute("aria-hidden", "true");
      control.appendChild(document.createElement("i"));
      row.append(copy, control);
      row.addEventListener("click", async () => {
        setStoryFilterEnabled(key, !state.storyFilters[key]);
        syncStoryFilterMenu();
        $$(POST_SELECTOR).forEach(applyStoryFilters);
        await saveStoryFilters();
      });
      panel.appendChild(row);
    });
    return panel;
  }

  async function saveStorySetting(key, enabled) {
    state.pageSettings[key] = enabled;
    const saved = await Ringcl.storageGet(["entryLlnkSettings"]).catch(() => ({}));
    await Ringcl.storageSet({
      entryLlnkSettings: {
        ...(saved.entryLlnkSettings || {}),
        [key]: enabled,
      },
    }).catch(() => {});
  }

  function createStorySettingsPanel() {
    const panel = document.createElement("div");
    panel.className = "entry-chat-story-filter-panel entry-chat-story-settings-panel";
    panel.dataset.entryLlnkStorySettingsPanel = "1";
    panel.dataset.entryLlnkOwned = "1";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "링클 설정");

    const heading = document.createElement("div");
    heading.className = "entry-chat-story-filter-heading";
    const title = document.createElement("strong");
    title.textContent = "설정";
    heading.appendChild(title);
    panel.appendChild(heading);

    STORY_SETTING_OPTIONS.forEach(({ key, label, icon }) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "entry-chat-story-filter-option entry-chat-story-setting-option";
      row.dataset.storySettingKey = key;
      row.setAttribute("role", "switch");
      const rowIcon = document.createElement("span");
      rowIcon.className = "material-symbols-outlined entry-chat-story-setting-icon";
      rowIcon.setAttribute("aria-hidden", "true");
      rowIcon.textContent = icon;
      const copy = document.createElement("span");
      copy.className = "entry-chat-story-filter-copy";
      const name = document.createElement("strong");
      name.textContent = label;
      copy.appendChild(name);
      const control = document.createElement("span");
      control.className = "entry-chat-story-filter-switch";
      control.setAttribute("aria-hidden", "true");
      control.appendChild(document.createElement("i"));
      row.append(rowIcon, copy, control);
      row.addEventListener("click", async () => {
        const enabled = state.pageSettings[key] !== true;
        state.pageSettings[key] = enabled;
        if (key === "shortenProjectLinks") {
          state.shortenProjectLinksEnabled = enabled;
          shortenProjectLinks(document);
        }
        syncStorySettingsMenu();
        await saveStorySetting(key, enabled);
      });
      panel.appendChild(row);
    });
    return panel;
  }

  function ensureStoryFilterMenu() {
    syncLiveStoryToolbarScope();
    if (!isLiveEntryStoryPage()) {
      $("[data-entry-llnk-link-filter='1']")?.remove();
      $("[data-entry-llnk-story-filter-panel='1']")?.remove();
      $("[data-entry-llnk-story-settings='1']")?.remove();
      $("[data-entry-llnk-story-settings-panel='1']")?.remove();
      return;
    }
    const container = $$(".css-wa4axc.e1lgujxn8, [class~='css-wa4axc'][class~='e1lgujxn8']")
      .find((element) => isVisible(element) && !element.closest(".entry-chat-root"));
    if (!container) return;
    let button = $("[data-entry-llnk-link-filter='1']");
    if (!button) {
      button = createStoryToolbarButton("entry-chat-story-link-filter-toggle", "entryLlnkLinkFilter", "필터", "filter_alt");
      button.addEventListener("click", () => {
        const panel = $("[data-entry-llnk-story-filter-panel='1']");
        if (!panel) return;
        const open = panel.hidden;
        closeStoryToolbarPanels(button);
        setStoryToolbarPanelOpen(panel, button, open);
      });
    }
    if (button.parentElement !== container || button !== container.firstElementChild) container.insertBefore(button, container.firstElementChild);
    let settingsButton = $("[data-entry-llnk-story-settings='1']");
    if (!settingsButton) {
      settingsButton = createStoryToolbarButton("entry-chat-story-settings-toggle", "entryLlnkStorySettings", "설정", "settings");
      settingsButton.addEventListener("click", () => {
        const panel = $("[data-entry-llnk-story-settings-panel='1']");
        if (!panel) return;
        const open = panel.hidden;
        closeStoryToolbarPanels(settingsButton);
        setStoryToolbarPanelOpen(panel, settingsButton, open);
      });
    }
    if (settingsButton.parentElement !== container || settingsButton.previousElementSibling !== button) {
      container.insertBefore(settingsButton, button.nextSibling);
    }
    let panel = $("[data-entry-llnk-story-filter-panel='1']");
    if (!panel) panel = createStoryFilterPanel();
    if (panel.parentElement !== container) container.appendChild(panel);
    let settingsPanel = $("[data-entry-llnk-story-settings-panel='1']");
    if (!settingsPanel) settingsPanel = createStorySettingsPanel();
    if (settingsPanel.parentElement !== container) container.appendChild(settingsPanel);
    panel.style.left = `${button.offsetLeft}px`;
    settingsPanel.style.left = `${settingsButton.offsetLeft}px`;
    bindStoryFilterMenuEvents();
    bindNativeStorySortEvents();
    syncNativeStorySortOpenState();
    syncStoryFilterMenu(button, panel);
    syncStorySettingsMenu(settingsButton, settingsPanel);
  }

  function syncStoryFilterMenu(
    button = $("[data-entry-llnk-link-filter='1']"),
    panel = $("[data-entry-llnk-story-filter-panel='1']"),
  ) {
    if (!button) return;
    const active = hasActiveStoryFilters();
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("aria-expanded", panel && !panel.hidden ? "true" : "false");
    button.title = active ? "필터 사용 중" : "게시글 필터";
    if (!panel) return;
    $$('[data-story-filter-key]', panel).forEach((row) => {
      const enabled = state.storyFilters[row.dataset.storyFilterKey] === true;
      row.classList.toggle("is-active", enabled);
      row.setAttribute("aria-checked", enabled ? "true" : "false");
    });
  }

  function syncStorySettingsMenu(
    button = $("[data-entry-llnk-story-settings='1']"),
    panel = $("[data-entry-llnk-story-settings-panel='1']"),
  ) {
    if (!button) return;
    button.setAttribute("aria-expanded", panel && !panel.hidden ? "true" : "false");
    button.title = "링클 설정";
    if (!panel) return;
    $$('[data-story-setting-key]', panel).forEach((row) => {
      const enabled = state.pageSettings[row.dataset.storySettingKey] === true;
      row.classList.toggle("is-active", enabled);
      row.setAttribute("aria-checked", enabled ? "true" : "false");
    });
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

  function isNewestEntryStoryPostVisible() {
    const firstPost = getLiveRows(getList())[0];
    if (!firstPost) return window.scrollY <= 80;
    const rect = firstPost.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function updateNewPostIndicator(button = $(".entry-chat-entry-story-scroll-top[data-entry-llnk-owned='1']")) {
    if (!button) return;
    if (isNewestEntryStoryPostVisible()) button.classList.remove("has-new-post");
    else button.classList.add("has-new-post");
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
      if (button.classList.contains("has-new-post") && isNewestEntryStoryPostVisible()) {
        button.classList.remove("has-new-post");
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
        if (card && !showImageFallbackLink(card)) {
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
        const fallbackUrl = safeHttpUrl(card.dataset.entryLlnkFallbackUrl);
        const llnkViewerUrl = card.dataset.entryLlnkSource === "llnk"
          && fallbackUrl?.protocol === "https:"
          && fallbackUrl.hostname === "llnk.kr"
          ? fallbackUrl.href
          : "";
        link.href = llnkViewerUrl || imageUrl;
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
          image.addEventListener("error", () => showImageFallbackLink(card), { once: true });
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
        if (!showImageFallbackLink(card)) {
          card.textContent = error.message || "이미지를 불러오지 못했습니다.";
          card.classList.add("is-error");
        }
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
      if (suppressPendingDraftInWriter(writer)) return;
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
        rememberDraftSubmitPending(submittedValue);
        discardStoredDraft();
        startDraftFailureWatch();
        startPendingWriterSuppression(writer);
      }
      prepareWriterForSubmit(writer);
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
      const submittedAt = Number(pending?.submittedAt || expiresAt - 35000 || 0);
      if (!value.trim() || !expiresAt || expiresAt <= Date.now()) {
        sessionStorage.removeItem(DRAFT_SUBMIT_SESSION_KEY);
        return null;
      }
      return { value, ownerEntryUserId, expiresAt, submittedAt };
    } catch (_) {
      try { sessionStorage.removeItem(DRAFT_SUBMIT_SESSION_KEY); } catch (_) {}
      return null;
    }
  }

  function clearDraftSubmitPending() {
    state.draftSubmitPendingUntil = 0;
    state.draftSubmittedValue = "";
    state.draftSubmittedAt = 0;
    window.clearInterval(state.draftFailureWatchTimer);
    state.draftFailureWatchTimer = 0;
    window.clearTimeout(state.draftSubmitClearTimer);
    state.draftSubmitClearTimer = 0;
    try { sessionStorage.removeItem(DRAFT_SUBMIT_SESSION_KEY); } catch (_) {}
  }

  function restoreDraftSubmitPending(ownerEntryUserId = "") {
    const pending = readDraftSubmitPending();
    if (!pending) {
      state.draftSubmitPendingUntil = 0;
      state.draftSubmittedValue = "";
      state.draftSubmittedAt = 0;
      return false;
    }
    const owner = text(ownerEntryUserId).trim();
    if (owner && pending.ownerEntryUserId && pending.ownerEntryUserId !== owner) {
      clearDraftSubmitPending();
      return false;
    }
    state.draftSubmitPendingUntil = pending.expiresAt;
    state.draftSubmittedValue = pending.value;
    state.draftSubmittedAt = pending.submittedAt;
    return true;
  }

  function rememberDraftSubmitPending(value) {
    const submittedValue = text(value);
    if (!submittedValue.trim()) return;
    const submittedAt = Date.now();
    const expiresAt = Date.now() + 35000;
    state.draftSubmitPendingUntil = expiresAt;
    state.draftSubmittedValue = submittedValue;
    state.draftSubmittedAt = submittedAt;
    try {
      sessionStorage.setItem(DRAFT_SUBMIT_SESSION_KEY, JSON.stringify({
        value: submittedValue,
        ownerEntryUserId: draftOwnerId(),
        submittedAt,
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

  function startPendingWriterSuppression(writer = getWriter()) {
    window.clearTimeout(state.draftSubmitClearTimer);
    state.draftSubmitClearTimer = 0;
    const suppress = () => {
      state.draftSubmitClearTimer = 0;
      if (Date.now() >= state.draftSubmitPendingUntil || !text(state.draftSubmittedValue).trim()) return;
      suppressPendingDraftInWriter(writer?.isConnected ? writer : getWriter());
      state.draftSubmitClearTimer = window.setTimeout(suppress, 250);
    };
    state.draftSubmitClearTimer = window.setTimeout(suppress, 180);
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
    const pendingValue = text(state.draftSubmittedValue);
    if (
      Date.now() < state.draftSubmitPendingUntil
      && pendingValue.trim()
      && encodedPostValue(value) === encodedPostValue(pendingValue)
    ) return;
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

  function discardStoredDraft() {
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
  }

  function clearDraft() {
    discardStoredDraft();
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
    const isKnownFailureContainer = isChallengeContainer
      || element.matches?.(".css-ye9ri9.e10kbqtd0, [class~='css-ye9ri9'][class~='e10kbqtd0']");
    if (!isKnownFailureContainer) return false;
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
    const failedValue = text(state.draftSubmittedValue || readDraft()?.value);
    if (!failedValue.trim()) return false;
    clearDraftSubmitPending();
    window.setTimeout(() => restoreDraftAfterFailure(failedValue), 120);
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
          if (!knownFailure) continue;
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

  function restoreDraftAfterFailure(fallbackValue = "") {
    clearDraftSubmitPending();
    const draft = readDraft();
    const writer = getWriter();
    const value = text(draft?.value || fallbackValue);
    if (!value.trim() || !writer) return;
    const current = text(writer.value);
    if (!current.trim() || current.length < value.length) {
      restoreDraftIntoWriter(writer, value, { announce: true });
    }
  }

  function playDraftRestoreAnimation(writer, value) {
    const draftValue = text(value);
    clearDraftRestoreEffects();
    if (!writer?.isConnected || !draftValue) return;
    if (!state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
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
      const initialProgress = characters.length ? initialCount / characters.length : 1;
      const motionWritingProgress = Math.max(initialProgress, typingProgress);
      const pose = draftFlightPose(writer, progress, timing, motionWritingProgress);
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

  function clearDraftRestoreEffects(complete = false) {
    const cleanup = state.draftRestoreCleanup;
    state.draftRestoreCleanup = null;
    cleanup?.(complete);
    $$(".entry-chat-draft-flight[data-entry-llnk-owned='1'], .entry-chat-draft-restore-panel[data-entry-llnk-owned='1'], .entry-chat-draft-restore-particles[data-entry-llnk-owned='1'], .entry-chat-draft-restore-message[data-entry-llnk-owned='1']").forEach((element) => element.remove());
    $$(".entry-chat-draft-restore-effect-host").forEach((element) => element.classList.remove("entry-chat-draft-restore-effect-host"));
  }

  function clearSpaceshipMotionEffects() {
    clearDraftRestoreEffects(true);
    [...state.liveArrivalCleanups].forEach((cleanup) => cleanup());
    state.nativeArrivalPending = 0;
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

  function scanImageUploadError(doc) {
    return walkFrameDocuments(doc, (target) => {
      const nodes = $$('[role="alert"], [role="dialog"], [aria-modal="true"], [aria-live="assertive"], [aria-live="polite"], .css-ye9ri9.e10kbqtd0, [class*="error"], [class*="Error"], [class*="toast"], [class*="Toast"]', target);
      for (const node of nodes) {
        const style = target.defaultView?.getComputedStyle(node);
        if (style?.display === "none" || style?.visibility === "hidden") continue;
        const message = text(node.textContent).replace(/\s+/g, " ").trim();
        if (!message) continue;
        const uploadFailure = /요청을\s*처리하지\s*못했습니다|(?:업로드|파일|이미지).{0,60}(?:실패|오류|초과|불가|지원하지|처리하지|너무\s*(?:크|큽)|제한)|(?:실패|오류|초과|불가|지원하지|처리하지).{0,60}(?:업로드|파일|이미지)|(?:최대|제한).{0,40}(?:MB|KB|GB|용량|크기)/i;
        if (uploadFailure.test(message)) return message.slice(0, 180);
      }
      const invalidInput = $$('input[type="file"]', target).find((input) => input.validity && !input.validity.valid);
      return text(invalidInput?.validationMessage).replace(/\s+/g, " ").trim().slice(0, 180);
    });
  }

  function formatImageUploadError() {
    return "업로드할 수 없는 파일입니다.";
  }

  function showImageUploadError(message) {
    $(".entry-chat-image-upload-error")?.remove();
    const notice = document.createElement("div");
    notice.className = "entry-chat-image-upload-error";
    notice.dataset.entryLlnkOwned = "1";
    notice.setAttribute("role", "alert");

    const ship = document.createElement("img");
    ship.className = "entry-chat-image-upload-error-ship";
    ship.src = chrome.runtime.getURL("assets/draft-restore/entrybot-spaceship-1.svg");
    ship.alt = "";
    ship.setAttribute("aria-hidden", "true");

    const card = document.createElement("div");
    card.className = "entry-chat-image-upload-error-card";
    const title = document.createElement("strong");
    title.className = "entry-chat-image-upload-error-title";
    title.textContent = "이미지 업로드 실패";
    const body = document.createElement("p");
    body.className = "entry-chat-image-upload-error-message";
    body.textContent = formatImageUploadError(message);
    card.append(title, body);
    notice.append(ship, card);
    document.body.appendChild(notice);
    notice.addEventListener("animationend", () => notice.remove(), { once: true });
    window.setTimeout(() => notice.remove(), 7200);
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
    const fail = (message) => {
      if (finished) return;
      cleanup();
      showImageUploadError(message);
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
      const uploadError = scanImageUploadError(doc);
      if (uploadError) {
        fail(uploadError);
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
      if (data.error) {
        fail(data.error);
        return;
      }
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
      fail("업로드할 수 없는 파일입니다.");
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

  function metricParts(value) {
    const source = text(value);
    const match = source.match(/(-?\d+)\s*$/);
    if (!match) return null;
    return {
      count: Math.max(0, Number(match[1]) || 0),
      prefix: source.slice(0, match.index),
    };
  }

  function metricTextNode(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let matched = null;
    let node = walker.nextNode();
    while (node) {
      if (!node.parentElement?.closest(".entry-llnk-metric-dial-layer") && /-?\d+\s*$/.test(node.nodeValue || "")) {
        matched = node;
      }
      node = walker.nextNode();
    }
    return matched;
  }

  function metricBackground(element) {
    let current = element;
    while (current instanceof Element) {
      const color = getComputedStyle(current).backgroundColor;
      const channels = color?.match(/[\d.]+/g)?.map(Number) || [];
      if (color && color !== "transparent" && (channels.length < 4 || channels[3] > 0)) return color;
      current = current.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || "#fff";
  }

  function metricNumberBox(element, previous, next) {
    const node = metricTextNode(element);
    const source = node?.nodeValue || "";
    const match = source.match(/(-?\d+)\s*$/);
    if (!node || !match) return null;
    const range = document.createRange();
    range.setStart(node, match.index);
    range.setEnd(node, match.index + match[1].length);
    const numberRect = range.getBoundingClientRect();
    const hostRect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const canvas = metricNumberBox.canvas || (metricNumberBox.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    if (context) context.font = style.font;
    const measuredWidth = context
      ? Math.max(context.measureText(String(previous)).width, context.measureText(String(next)).width)
      : numberRect.width;
    return {
      top: numberRect.top - hostRect.top,
      left: numberRect.left - hostRect.left,
      width: Math.max(numberRect.width, measuredWidth) + 2,
      height: numberRect.height || hostRect.height,
      background: metricBackground(element),
    };
  }

  function finishMetricDial(element) {
    const timer = metricAnimationTimers.get(element);
    if (timer) window.clearTimeout(timer);
    metricAnimationTimers.delete(element);
    element.querySelector(":scope > .entry-llnk-metric-dial-layer")?.remove();
    element.classList.remove(
      "entry-llnk-metric-dial",
      "entry-llnk-metric-dial-up",
      "entry-llnk-metric-dial-down"
    );
    element.style.removeProperty("--entry-llnk-metric-color");
    element.style.removeProperty("--entry-llnk-metric-top");
    element.style.removeProperty("--entry-llnk-metric-left");
    element.style.removeProperty("--entry-llnk-metric-width");
    element.style.removeProperty("--entry-llnk-metric-height");
    element.style.removeProperty("--entry-llnk-metric-background");
  }

  function animateMetricDial(element, previous, next) {
    if (!(element instanceof Element) || previous === next) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    finishMetricDial(element);
    const box = metricNumberBox(element, previous, next);
    if (!box) return;
    element.style.setProperty("--entry-llnk-metric-color", getComputedStyle(element).color);
    element.style.setProperty("--entry-llnk-metric-top", `${box.top}px`);
    element.style.setProperty("--entry-llnk-metric-left", `${box.left}px`);
    element.style.setProperty("--entry-llnk-metric-width", `${box.width}px`);
    element.style.setProperty("--entry-llnk-metric-height", `${box.height}px`);
    element.style.setProperty("--entry-llnk-metric-background", box.background);
    const layer = document.createElement("span");
    layer.className = "entry-llnk-metric-dial-layer";
    layer.dataset.entryLlnkOwned = "1";
    const oldValue = document.createElement("span");
    oldValue.className = "entry-llnk-metric-dial-old";
    oldValue.textContent = String(previous);
    const nextValue = document.createElement("span");
    nextValue.className = "entry-llnk-metric-dial-next";
    nextValue.textContent = String(next);
    layer.append(oldValue, nextValue);
    element.appendChild(layer);
    element.classList.add(
      "entry-llnk-metric-dial",
      next > previous ? "entry-llnk-metric-dial-up" : "entry-llnk-metric-dial-down"
    );
    const timer = window.setTimeout(() => finishMetricDial(element), 390);
    metricAnimationTimers.set(element, timer);
  }

  function syncMetricElement(element) {
    if (!(element instanceof Element)) return;
    if (element.classList.contains("entry-llnk-metric-dial")) finishMetricDial(element);
    const parts = metricParts(element.textContent);
    if (!parts) return;
    const previous = Number(element.dataset.entryLlnkMetricValue);
    element.dataset.entryLlnkMetricValue = String(parts.count);
    if (Number.isFinite(previous) && previous !== parts.count) {
      animateMetricDial(element, previous, parts.count);
    }
  }

  function syncMetricCounters(root = document) {
    if (root instanceof Element && root.closest(".entry-llnk-metric-dial-layer")) return;
    const counters = [];
    if (root instanceof Element) {
      const ownCounter = root.matches(METRIC_SELECTOR) ? root : root.closest(METRIC_SELECTOR);
      if (ownCounter) counters.push(ownCounter);
    }
    counters.push(...$$(METRIC_SELECTOR, root));
    [...new Set(counters)].forEach(syncMetricElement);
  }

  function setMetricCount(element, count) {
    if (!(element instanceof Element)) return;
    const parts = metricParts(element.textContent);
    if (!parts) return;
    element.textContent = `${parts.prefix}${Math.max(0, Number(count) || 0)}`;
    syncMetricElement(element);
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
    if (like && like.dataset.entryChatLiveBusy !== "1") {
      setMetricCount(like, post.likesLength);
      like.classList.toggle("active", Boolean(post.isLike));
    }
    const reply = $("[data-entry-chat-live-reply='1']", element);
    if (reply) setMetricCount(reply, post.commentsLength);
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
    applyStoryFilters(element);
  }

  function renderNativePostFromData(element, post) {
    const body = element instanceof Element ? $(BODY_SELECTOR, element) : null;
    const content = text(post?.content || "").trim();
    if (!body || !content) return;
    renderPostBody(body, content, true);
    shortenProjectLinks(element);
    applyStoryFilters(element);
  }

  async function toggleLivePostLike(postId, likeId = "") {
    const target = text(postId).trim();
    if (!target) throw new Error("글 정보를 찾을 수 없습니다.");
    const currentLikeId = text(likeId).trim();
    if (currentLikeId) {
      const query = `mutation UNLIKE($id: ID) { unlike(id: $id) { id } }`;
      await Ringcl.entryGraphql("UNLIKE", query, { id: currentLikeId });
      return "";
    }
    const query = `mutation LIKE($target: String, $targetSubject: String, $targetType: String, $groupId: ID) {
      like(target: $target, targetSubject: $targetSubject, targetType: $targetType, groupId: $groupId) { id }
    }`;
    const data = await Ringcl.entryGraphql("LIKE", query, {
      target,
      targetSubject: "discuss",
    });
    const nextLikeId = text(data?.like?.id).trim();
    if (!nextLikeId) throw new Error("좋아요 결과를 확인하지 못했습니다.");
    return nextLikeId;
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
      const currentPost = item.entryLlnkPost || post;
      const previousLikeId = currentPost.isLike || "";
      const previousCount = Math.max(0, Number(currentPost.likesLength || 0));
      const nextLiked = !Boolean(previousLikeId);
      const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));
      currentPost.isLike = nextLiked ? "entry-llnkk-pending-like" : "";
      currentPost.likesLength = nextCount;
      like.classList.toggle("active", nextLiked);
      setMetricCount(like, nextCount);
      try {
        currentPost.isLike = await toggleLivePostLike(currentPost.id, previousLikeId);
      } catch {
        currentPost.isLike = previousLikeId;
        currentPost.likesLength = previousCount;
        like.classList.toggle("active", Boolean(previousLikeId));
        setMetricCount(like, previousCount);
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
    return text(value)
      .replace(/https:\/\/llnk\.kr\//gi, "https://llnk.kr/")
      .replace(/[\u00b7\u30fb\u318d]/g, "\u00b7")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
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
    const submittedValue = state.draftSubmittedValue || draft?.value || "";
    if (!submittedValue.trim()) return;
    const submittedAt = state.draftSubmittedAt || draft?.savedAt || 0;
    const submitted = posts.some((post) => isPendingSubmittedPost(post, submittedValue, submittedAt));
    if (submitted) resetWriterAfterConfirmedPost(submittedValue);
  }

  function isPendingSubmittedPost(post, submittedValue = state.draftSubmittedValue, savedAt = state.draftSubmittedAt || state.draftSavedAt) {
    const contentKey = normalizeLivePostKey(encodedPostValue(submittedValue));
    if (!post || !contentKey || normalizeLivePostKey(post.content) !== contentKey) return false;
    const ownerEntryUserId = draftOwnerId();
    if (ownerEntryUserId && text(post.user?.id).trim() !== ownerEntryUserId) return false;
    const createdAt = Date.parse(text(post.created));
    return !Number.isFinite(createdAt) || !savedAt || createdAt >= savedAt - 120000;
  }

  function isPendingSubmittedRow(row, submittedValue = state.draftSubmittedValue) {
    if (!(row instanceof Element) || !submittedValue.trim() || Date.now() >= state.draftSubmitPendingUntil) return false;
    const body = $(BODY_SELECTOR, row);
    const content = normalizeLivePostKey(postBodySource(body));
    const expected = normalizeLivePostKey(encodedPostValue(submittedValue));
    if (!content || !expected || content !== expected) return false;
    const profileLink = $(".css-lz5fzu a[href^='/profile/'], [class~='e143sozh0'] a[href^='/profile/']", row);
    const profileId = text(profileLink?.getAttribute("href") || "").match(/^\/profile\/([a-f0-9]{24})/i)?.[1] || "";
    const ownerEntryUserId = draftOwnerId();
    return !ownerEntryUserId || !profileId || profileId === ownerEntryUserId;
  }

  function resetWriterAfterConfirmedPost(expectedValue = "") {
    const writer = getWriter();
    const currentValue = text(writer?.value);
    const expected = normalizeLivePostKey(encodedPostValue(expectedValue));
    const current = normalizeLivePostKey(encodedPostValue(currentValue));
    const shouldResetWriter = !currentValue.trim() || !expected || current === expected;
    const runtimeDraftMatchesExpected = expected
      && normalizeLivePostKey(encodedPostValue(state.draftValue)) === expected;
    clearDraftSubmitPending();
    if (!shouldResetWriter) {
      if (runtimeDraftMatchesExpected) discardStoredDraft();
      saveDraft(writer);
      clearDraftRestoreEffects();
      return true;
    }
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
    discardStoredDraft();
    clearDraftRestoreEffects();
    removeImageAttachment(null);
    return true;
  }

  function getLiveRows(list = getList()) {
    return list ? [...list.children].filter((element) => element.matches?.(POST_SELECTOR)) : [];
  }

  function snapshotLiveRowPositions(list = getList()) {
    state.liveRowPositions = new Map(getLiveRows(list).map((row) => [row, row.offsetTop]));
  }

  function captureNativeArrivalScrollAnchor(list = getList()) {
    state.nativeArrivalScrollAnchor = null;
    if (!list || window.scrollY <= 80) return;
    const row = getLiveRows(list).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    if (!row) return;
    state.nativeArrivalScrollAnchor = {
      row,
      top: row.getBoundingClientRect().top,
      expiresAt: performance.now() + 2500,
    };
  }

  function restoreNativeArrivalScrollAnchor(consume = false) {
    const anchor = state.nativeArrivalScrollAnchor;
    if (!anchor) return false;
    if (!anchor.row?.isConnected || performance.now() > anchor.expiresAt || window.scrollY <= 80) {
      state.nativeArrivalScrollAnchor = null;
      return false;
    }
    const delta = anchor.row.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 0.5) {
      window.scrollTo({
        top: window.scrollY + delta,
        left: window.scrollX,
        behavior: "instant",
      });
    }
    if (consume) state.nativeArrivalScrollAnchor = null;
    return true;
  }

  function animateExistingRowsForInsertion(rows = [], list = getList()) {
    const inserted = new Set(rows.filter((row) => !state.liveRowPositions.has(row)));
    if (!inserted.size || !state.liveRowPositions.size) {
      snapshotLiveRowPositions(list);
      return;
    }
    const viewportStabilized = restoreNativeArrivalScrollAnchor(true);
    if (!viewportStabilized && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      getLiveRows(list).forEach((row) => {
        if (inserted.has(row) || row.classList.contains("entry-llnk-live-post-arriving")) return;
        const previousTop = state.liveRowPositions.get(row);
        if (!Number.isFinite(previousTop)) return;
        const offset = previousTop - row.offsetTop;
        if (Math.abs(offset) < 1) return;
        row.animate(
          [{ transform: `translate3d(0, ${offset}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
          { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      });
    }
    snapshotLiveRowPositions(list);
  }

  function animateExistingRowsAfterRemoval(list = getList()) {
    if (!state.nativeRemovalPending || !state.liveRowPositions.size) return;
    state.nativeRemovalPending = false;
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      getLiveRows(list).forEach((row) => {
        const previousTop = state.liveRowPositions.get(row);
        if (!Number.isFinite(previousTop)) return;
        const offset = previousTop - row.offsetTop;
        if (Math.abs(offset) < 1) return;
        row.style.setProperty("--entry-llnk-removal-shift", `${offset}px`);
        row.classList.remove("is-moving-after-removal");
        row.classList.add("entry-llnk-moving-after-removal");
        void row.offsetHeight;
        window.requestAnimationFrame(() => {
          if (!row.isConnected) return;
          row.classList.add("is-moving-after-removal");
          window.setTimeout(() => {
            row.classList.remove("entry-llnk-moving-after-removal", "is-moving-after-removal");
            row.style.removeProperty("--entry-llnk-removal-shift");
          }, 280);
        });
      });
    }
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

  function primeNativeLivePostArrival(detail = {}) {
    const incomingPosts = parseNativeLivePosts(detail);
    if (
      incomingPosts.length
      && Date.now() < state.draftSubmitPendingUntil
      && text(state.draftSubmittedValue).trim()
    ) maybeClearSubmittedDraft(incomingPosts);
    const count = Math.max(0, Number(detail.count) || (Array.isArray(detail.ids) ? detail.ids.length : 0));
    if (count) {
      snapshotLiveRowPositions();
      captureNativeArrivalScrollAnchor();
    }
    getLiveRows().forEach((row) => {
      row.dataset.entryLlnkArrivalDelivered = "1";
    });
    if (!count || !state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      state.nativeArrivalPending = 0;
      return;
    }
    state.nativeArrivalPending = count;
    state.nativeArrivalSequence = 0;
    state.nativeArrivalExpiresAt = performance.now() + 2000;
  }

  function playLivePostArrivalDelivery(row, delay = 0, showShip = true) {
    if (!row?.isConnected || isStoryPostFiltered(row) || !state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let flight = null;
    let beam = null;
    if (showShip) {
      flight = document.createElement("span");
      flight.className = "entry-llnk-live-post-flight";
      flight.dataset.entryLlnkOwned = "1";
      flight.setAttribute("aria-hidden", "true");
      const frame = document.createElement("img");
      frame.src = chrome.runtime.getURL("assets/draft-restore/entrybot-spaceship-1.svg");
      frame.alt = "";
      frame.draggable = false;
      flight.appendChild(frame);
      beam = document.createElement("span");
      beam.className = "entry-llnk-live-post-flight-beam";
      flight.appendChild(beam);
      document.body.appendChild(flight);
    }

    const initialRect = row.getBoundingClientRect();
    const targetDocumentTop = initialRect.top + window.scrollY;
    const targetLeft = initialRect.left;
    const targetWidth = initialRect.width;
    const startOffsetX = -Math.max(360, targetLeft + targetWidth + 140);
    const duration = 980;
    const startsAt = performance.now() + Math.max(0, Number(delay) || 0);
    let animationFrame = 0;
    let finished = false;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const mix = (start, end, amount) => start + (end - start) * amount;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      row.classList.remove("entry-llnk-live-post-arriving");
      row.style.removeProperty("--entry-llnk-live-arrival-delay");
      row.style.removeProperty("opacity");
      row.style.removeProperty("transform");
      flight?.remove();
      state.liveArrivalCleanups.delete(finish);
    };
    state.liveArrivalCleanups.add(finish);
    const renderFrame = (now) => {
      if (!row.isConnected) {
        finish();
        return;
      }
      if (now < startsAt) {
        animationFrame = window.requestAnimationFrame(renderFrame);
        return;
      }
      const progress = clamp((now - startsAt) / duration, 0, 1);
      const targetTop = targetDocumentTop - window.scrollY;
      let cardX = 0;
      let cardY = 0;
      let cardScale = 1;
      let cardOpacity = 1;
      if (progress < 0.68) {
        const local = progress / 0.68;
        const eased = 1 - (1 - local) ** 3;
        cardX = mix(startOffsetX, 0, eased);
        cardY = mix(-92, -13, eased) - Math.sin(local * Math.PI) * 9;
        cardScale = mix(0.94, 0.992, eased);
        cardOpacity = clamp(local / 0.08, 0, 1);
      } else if (progress < 0.84) {
        const local = (progress - 0.68) / 0.16;
        const eased = local * local * (3 - 2 * local);
        cardY = mix(-13, 4, eased);
        cardScale = mix(0.992, 1.003, eased);
      } else {
        const local = (progress - 0.84) / 0.16;
        const eased = local * local * (3 - 2 * local);
        cardY = mix(4, 0, eased);
        cardScale = mix(1.003, 1, eased);
      }
      row.style.opacity = String(cardOpacity);
      row.style.transform = `translate3d(${cardX}px, ${cardY}px, 0) scale(${cardScale})`;

      if (!flight || !beam) {
        if (progress >= 1) {
          finish();
          return;
        }
        animationFrame = window.requestAnimationFrame(renderFrame);
        return;
      }

      const carryEnd = 0.74;
      let shipX;
      let shipY;
      let shipScale;
      let shipRotate;
      let shipOpacity = 1;
      if (progress <= carryEnd) {
        shipX = targetLeft + targetWidth * 0.5 + cardX - 37;
        shipY = targetTop + cardY - 89;
        shipScale = 0.72 + Math.sin((progress / carryEnd) * Math.PI) * 0.05;
        shipRotate = -5 + Math.sin((progress / carryEnd) * Math.PI * 2) * 2.5;
        shipOpacity = clamp(progress / 0.05, 0, 1);
        beam.style.height = `${Math.max(34, targetTop + cardY - (shipY + 57))}px`;
        beam.style.opacity = String(clamp(progress / 0.08, 0, 1) * clamp((carryEnd - progress) / 0.08, 0, 1));
      } else {
        const local = (progress - carryEnd) / (1 - carryEnd);
        const eased = local ** 3;
        shipX = mix(targetLeft + targetWidth * 0.5 - 37, window.innerWidth + 150, eased);
        shipY = mix(targetTop - 89, targetTop - 210, eased) - Math.sin(local * Math.PI) * 14;
        shipScale = mix(0.72, 1.45, eased);
        shipRotate = mix(-5, 32, eased);
        shipOpacity = local > 0.72 ? clamp((1 - local) / 0.28, 0, 1) : 1;
        beam.style.opacity = "0";
      }
      flight.style.opacity = String(shipOpacity);
      flight.style.transform = `translate3d(${shipX}px, ${shipY}px, 0) rotateZ(${shipRotate}deg) scale(${shipScale})`;
      if (progress >= 1) {
        finish();
        return;
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function findLiveRowForPost(id, post = null, list = getList()) {
    const postId = text(id).trim();
    const postKey = getLivePostKeyFromData(post);
    const postIdentity = getLivePostIdentityFromData(post);
    return (postId && list?.querySelector?.(`[data-entry-chat-live-post-id="${CSS.escape(postId)}"]`))
      || getLiveRows(list).find((candidate) => postKey && getLivePostKeyFromElement(candidate) === postKey)
      || getLiveRows(list).find((candidate) => postIdentity && getLivePostIdentityFromElement(candidate) === postIdentity)
      || null;
  }

  function releaseLivePostUpdateLayout(row) {
    const layout = state.liveUpdateLayouts.get(row);
    if (!layout) return;
    window.clearTimeout(layout.cleanupTimer);
    const body = layout.body;
    if (body?.isConnected) {
      body.style.height = layout.height;
      body.style.overflow = layout.overflow;
      body.style.transition = layout.transition;
      body.style.willChange = layout.willChange;
    }
    state.liveUpdateLayouts.delete(row);
  }

  function freezeLivePostUpdateLayout(row, body, height) {
    releaseLivePostUpdateLayout(row);
    const layout = {
      body,
      oldHeight: height,
      height: body.style.height,
      overflow: body.style.overflow,
      transition: body.style.transition,
      willChange: body.style.willChange,
      cleanupTimer: 0,
    };
    body.style.transition = "none";
    body.style.height = `${height}px`;
    body.style.overflow = "hidden";
    body.style.willChange = "height, opacity, filter, transform";
    state.liveUpdateLayouts.set(row, layout);
    return layout;
  }

  function resizeLivePostUpdateLayout(row) {
    const layout = state.liveUpdateLayouts.get(row);
    if (!layout) return;
    const body = $(BODY_SELECTOR, row);
    if (!body) return;
    if (body !== layout.body) {
      if (layout.body?.isConnected) {
        layout.body.style.height = layout.height;
        layout.body.style.overflow = layout.overflow;
        layout.body.style.transition = layout.transition;
        layout.body.style.willChange = layout.willChange;
      }
      layout.body = body;
      layout.height = body.style.height;
      layout.overflow = body.style.overflow;
      layout.transition = body.style.transition;
      layout.willChange = body.style.willChange;
    }
    body.style.transition = "none";
    body.style.height = "auto";
    body.style.overflow = "hidden";
    const targetHeight = body.getBoundingClientRect().height;
    body.style.height = `${layout.oldHeight}px`;
    body.style.willChange = "height, opacity, filter, transform";
    void body.offsetHeight;
    body.style.transition = "height 680ms cubic-bezier(0.22, 1, 0.36, 1)";
    window.requestAnimationFrame(() => {
      if (body.isConnected) body.style.height = `${targetHeight}px`;
    });
    layout.cleanupTimer = window.setTimeout(() => releaseLivePostUpdateLayout(row), 760);
  }

  function playLivePostUpdateRestore(row, delay = 0) {
    if (!row?.isConnected || isStoryPostFiltered(row) || !state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const body = $(BODY_SELECTOR, row);
    if (!body) return;
    const flight = document.createElement("span");
    flight.className = "entry-llnk-live-post-flight entry-llnk-live-post-flight-updating";
    flight.dataset.entryLlnkOwned = "1";
    flight.setAttribute("aria-hidden", "true");
    const frame = document.createElement("img");
    frame.src = chrome.runtime.getURL("assets/draft-restore/entrybot-spaceship-1.svg");
    frame.alt = "";
    frame.draggable = false;
    flight.appendChild(frame);
    const beam = document.createElement("span");
    beam.className = "entry-llnk-live-post-flight-beam";
    flight.appendChild(beam);
    const updateField = document.createElement("span");
    updateField.className = "entry-llnk-live-post-update-field";
    updateField.dataset.entryLlnkOwned = "1";
    updateField.setAttribute("aria-hidden", "true");
    document.body.appendChild(flight);
    document.body.appendChild(updateField);
    row.classList.remove("is-restoring-live-update");
    row.classList.add("entry-llnk-live-post-updating");

    const bodyRect = body.getBoundingClientRect();
    freezeLivePostUpdateLayout(row, body, bodyRect.height);
    let trackedLeft = bodyRect.left;
    let trackedTop = bodyRect.top + window.scrollY;
    let trackedWidth = bodyRect.width;
    let trackedHeight = bodyRect.height;
    const outsideX = window.innerWidth + 150;
    const duration = 2200;
    const startsAt = performance.now() + Math.max(0, Number(delay) || 0);
    let animationFrame = 0;
    let finished = false;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const mix = (start, end, amount) => start + (end - start) * amount;
    const smooth = (value) => value * value * (3 - 2 * value);
    const finish = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      row.classList.remove("entry-llnk-live-post-updating", "is-restoring-live-update");
      releaseLivePostUpdateLayout(row);
      flight.remove();
      updateField.remove();
      state.liveArrivalCleanups.delete(finish);
    };
    state.liveArrivalCleanups.add(finish);
    const renderFrame = (now) => {
      if (!row.isConnected) {
        finish();
        return;
      }
      if (now < startsAt) {
        animationFrame = window.requestAnimationFrame(renderFrame);
        return;
      }
      const progress = clamp((now - startsAt) / duration, 0, 1);
      const activeBody = $(BODY_SELECTOR, row);
      if (activeBody) {
        const activeRect = activeBody.getBoundingClientRect();
        trackedLeft = mix(trackedLeft, activeRect.left, 0.2);
        trackedTop = mix(trackedTop, activeRect.top + window.scrollY, 0.2);
        trackedWidth = mix(trackedWidth, activeRect.width, 0.2);
        trackedHeight = mix(trackedHeight, activeRect.height, 0.2);
      }
      const bodyTop = trackedTop - window.scrollY;
      const hoverX = trackedLeft + trackedWidth * 0.5 - 37;
      let shipX = hoverX;
      let shipY = bodyTop - 94;
      let shipScale = 0.74;
      let shipRotate = -6;
      let shipOpacity = 1;
      let beamOpacity = 0;
      if (progress < 0.28) {
        const local = smooth(progress / 0.28);
        shipX = mix(outsideX, hoverX, local);
        shipY += mix(-48, 0, local) - Math.sin(local * Math.PI) * 11;
        shipScale = mix(1.32, 0.74, local);
        shipRotate = mix(22, -6, local);
        shipOpacity = clamp(local / 0.16, 0, 1);
        beamOpacity = 0;
      } else if (progress < 0.76) {
        const local = (progress - 0.28) / 0.48;
        shipX = hoverX + Math.sin(local * Math.PI * 2) * 5;
        shipY -= Math.sin(local * Math.PI * 3) * 4;
        shipScale = 0.74 + Math.sin(local * Math.PI * 2) * 0.018;
        shipRotate = -6 + Math.sin(local * Math.PI * 2) * 1.8;
        beamOpacity = 0.94 * clamp(local / 0.1, 0, 1) * clamp((1 - local) / 0.12, 0, 1);
      } else {
        const local = smooth((progress - 0.76) / 0.24);
        shipX = mix(hoverX, outsideX, local);
        shipY += mix(0, -78, local) - Math.sin(local * Math.PI) * 11;
        shipScale = mix(0.74, 1.34, local);
        shipRotate = mix(-6, 24, local);
        shipOpacity = local > 0.7 ? clamp((1 - local) / 0.3, 0, 1) : 1;
        beamOpacity = 0;
      }
      beam.style.width = `${Math.max(170, trackedWidth + 34)}px`;
      beam.style.height = `${Math.max(46, trackedHeight + 48)}px`;
      beam.style.opacity = String(beamOpacity);
      beam.style.left = `calc(50% + ${-Math.sin(shipRotate * Math.PI / 180) * 16}px)`;
      updateField.style.left = `${trackedLeft - 12}px`;
      updateField.style.top = `${bodyTop - 10}px`;
      updateField.style.width = `${trackedWidth + 24}px`;
      updateField.style.height = `${trackedHeight + 20}px`;
      updateField.style.opacity = String(beamOpacity * 0.78);
      updateField.style.filter = `brightness(${Math.round(progress * 18) % 2 ? 1.06 : 0.98})`;
      flight.style.opacity = String(shipOpacity);
      flight.style.transform = `translate3d(${shipX}px, ${shipY}px, 0) scale(${shipScale})`;
      frame.style.transform = `rotateZ(${shipRotate}deg)`;
      if (progress >= 1) {
        finish();
        return;
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function parseNativeLivePosts(detail = {}) {
    try {
      const posts = JSON.parse(text(detail.postsJson || "[]"));
      return Array.isArray(posts) ? posts : [];
    } catch {
      return [];
    }
  }

  function primeNativeLivePostUpdate(detail = {}) {
    const ids = Array.isArray(detail.ids) ? detail.ids.map((id) => text(id).trim()).filter(Boolean) : [];
    if (!ids.length || !state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const posts = parseNativeLivePosts(detail);
    const list = getList();
    ids.forEach((id, index) => {
      const post = posts.find((item) => text(item?.id) === id);
      const row = findLiveRowForPost(id, post, list);
      if (row && !row.dataset.entryChatLivePostId) row.dataset.entryChatLivePostId = id;
      if (row) playLivePostUpdateRestore(row, Math.min(index * 45, 135));
    });
  }

  function completeNativeLivePostUpdate(detail = {}) {
    const ids = Array.isArray(detail.ids) ? detail.ids.map((id) => text(id).trim()).filter(Boolean) : [];
    if (!ids.length || !state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const posts = parseNativeLivePosts(detail);
    window.requestAnimationFrame(() => {
      ids.forEach((id) => {
        const post = posts.find((item) => text(item?.id) === id);
        const row = findLiveRowForPost(id, post);
        if (!row) return;
        resizeLivePostUpdateLayout(row);
        row.classList.remove("is-restoring-live-update");
        void row.offsetHeight;
        row.classList.add("is-restoring-live-update");
      });
    });
  }

  function playLivePostRemovalPickup(row, delay = 0) {
    if (!row?.isConnected || isStoryPostFiltered(row) || !state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const flight = document.createElement("span");
    flight.className = "entry-llnk-live-post-flight entry-llnk-live-post-flight-removing";
    flight.dataset.entryLlnkOwned = "1";
    flight.setAttribute("aria-hidden", "true");
    const frame = document.createElement("img");
    frame.src = chrome.runtime.getURL("assets/draft-restore/entrybot-spaceship-1.svg");
    frame.alt = "";
    frame.draggable = false;
    flight.appendChild(frame);
    const beam = document.createElement("span");
    beam.className = "entry-llnk-live-post-flight-beam";
    flight.appendChild(beam);

    const initialRect = row.getBoundingClientRect();
    const targetDocumentTop = initialRect.top + window.scrollY;
    const targetLeft = initialRect.left;
    const targetWidth = initialRect.width;
    const initialShipX = window.innerWidth + 110;
    const initialShipY = initialRect.top - 89;
    flight.style.opacity = "0";
    flight.style.transform = `translate3d(${initialShipX}px, ${initialShipY}px, 0) rotateZ(14deg) scale(1.08)`;
    flight.style.visibility = "hidden";
    document.body.appendChild(flight);
    const duration = 900;
    const startsAt = performance.now() + Math.max(0, Number(delay) || 0);
    let animationFrame = 0;
    let finished = false;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const mix = (start, end, amount) => start + (end - start) * amount;
    const finish = (keepHidden = false) => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      if (!keepHidden) {
        row.style.removeProperty("opacity");
        row.style.removeProperty("transform");
      }
      flight.style.visibility = "hidden";
      flight.remove();
      state.liveArrivalCleanups.delete(finish);
    };
    state.liveArrivalCleanups.add(finish);
    const renderFrame = (now) => {
      if (!row.isConnected) {
        finish();
        return;
      }
      if (now < startsAt) {
        animationFrame = window.requestAnimationFrame(renderFrame);
        return;
      }
      const progress = clamp((now - startsAt) / duration, 0, 1);
      const targetTop = targetDocumentTop - window.scrollY;
      const approach = clamp(progress / 0.3, 0, 1);
      const approachEased = 1 - (1 - approach) ** 3;
      const carry = clamp((progress - 0.3) / 0.7, 0, 1);
      const carryEased = carry ** 3;
      const centerX = targetLeft + targetWidth * 0.5 - 37;
      const cardX = mix(0, -Math.max(390, targetLeft + targetWidth + 130), carryEased);
      const cardY = -Math.sin(Math.min(1, carry / 0.72) * Math.PI * 0.5) * 22 - carryEased * 28;
      const cardScale = mix(1, 0.965, carryEased);
      const cardOpacity = 1 - clamp((carry - 0.78) / 0.22, 0, 1);
      const approachX = mix(initialShipX, centerX, approachEased);
      const carryBlend = clamp((progress - 0.28) / 0.08, 0, 1);
      const shipX = mix(approachX, centerX + cardX, carryBlend);
      const shipY = targetTop - 89 + cardY - Math.sin(progress * Math.PI) * 7;
      const shipScale = mix(1.08, 0.72, approachEased) + carryEased * 0.3;
      const shipRotate = mix(14, -5, approachEased) - carryEased * 14;
      row.style.opacity = String(cardOpacity);
      row.style.transform = `translate3d(${cardX}px, ${cardY}px, 0) scale(${cardScale})`;
      beam.style.height = `${Math.max(34, targetTop - (shipY + 57))}px`;
      beam.style.opacity = String(clamp((progress - 0.12) / 0.14, 0, 1) * clamp((0.84 - progress) / 0.18, 0, 1));
      flight.style.opacity = String(clamp(progress / 0.06, 0, 1) * clamp((1 - progress) / 0.12, 0, 1));
      flight.style.visibility = "visible";
      flight.style.transform = `translate3d(${shipX}px, ${shipY}px, 0) rotateZ(${shipRotate}deg) scale(${shipScale})`;
      if (progress >= 1) {
        row.style.opacity = "0";
        flight.style.visibility = "hidden";
        finish(true);
        return;
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function primeNativeLivePostRemoval(detail = {}) {
    const ids = Array.isArray(detail.ids) ? detail.ids.map((id) => text(id).trim()).filter(Boolean) : [];
    if (!ids.length) return;
    let posts = [];
    try {
      posts = JSON.parse(text(detail.postsJson || "[]"));
    } catch {
      posts = [];
    }
    snapshotLiveRowPositions();
    state.nativeRemovalPending = true;
    if (!state.spaceshipMotionEnabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const list = getList();
    ids.forEach((id, index) => {
      const post = posts.find((item) => text(item?.id) === id);
      const postKey = getLivePostKeyFromData(post);
      const postIdentity = getLivePostIdentityFromData(post);
      const row = list?.querySelector?.(`[data-entry-chat-live-post-id="${CSS.escape(id)}"]`)
        || getLiveRows(list).find((candidate) => postKey && getLivePostKeyFromElement(candidate) === postKey)
        || getLiveRows(list).find((candidate) => postIdentity && getLivePostIdentityFromElement(candidate) === postIdentity);
      if (row && !row.dataset.entryChatLivePostId) row.dataset.entryChatLivePostId = id;
      if (row) playLivePostRemovalPickup(row, Math.min(index * 50, 150));
    });
  }

  function animatePendingNativeRows(node) {
    if (state.nativeArrivalPending && performance.now() > state.nativeArrivalExpiresAt) {
      state.nativeArrivalPending = 0;
    }
    const rows = [];
    if (node instanceof Element) {
      if (node.matches(POST_SELECTOR)) rows.push(node);
      node.querySelectorAll?.(POST_SELECTOR).forEach((row) => rows.push(row));
    }
    const uniqueRows = [...new Set(rows)];
    animateExistingRowsForInsertion(uniqueRows.filter((row) => !isStoryPostFiltered(row)));
    uniqueRows.forEach((row) => {
      if (row.dataset.entryLlnkArrivalDelivered === "1") return;
      const submittedValue = text(state.draftSubmittedValue);
      const isSubmittedRow = isPendingSubmittedRow(row, submittedValue);
      if (isStoryPostFiltered(row)) {
        if (state.nativeArrivalPending) {
          state.nativeArrivalPending -= 1;
        }
        if (isSubmittedRow) resetWriterAfterConfirmedPost(submittedValue);
        row.dataset.entryLlnkArrivalDelivered = "1";
        return;
      }
      if (isSubmittedRow) {
        const showShip = true;
        if (state.nativeArrivalPending) {
          state.nativeArrivalSequence += 1;
          state.nativeArrivalPending -= 1;
        }
        resetWriterAfterConfirmedPost(submittedValue);
        row.dataset.entryLlnkArrivalDelivered = "1";
        if (state.spaceshipMotionEnabled && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          row.style.setProperty("--entry-llnk-live-arrival-delay", "0ms");
          row.classList.add("entry-llnk-live-post-arriving");
          playLivePostArrivalDelivery(row, 20, showShip);
        }
        return;
      }
      if (!state.nativeArrivalPending || row.classList.contains("entry-llnk-live-post-arriving")) return;
      const showShip = state.nativeArrivalSequence === 0;
      state.nativeArrivalSequence += 1;
      state.nativeArrivalPending -= 1;
      row.dataset.entryLlnkArrivalDelivered = "1";
      row.style.setProperty("--entry-llnk-live-arrival-delay", "0ms");
      row.classList.add("entry-llnk-live-post-arriving");
      playLivePostArrivalDelivery(row, 20, showShip);
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
    const pendingSavedAt = state.draftSubmittedAt || pendingDraft?.savedAt || 0;
    const locallySubmittedIds = new Set(
      posts
        .filter((post) => isPendingSubmittedPost(post, pendingValue, pendingSavedAt))
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
      updateNewPostIndicator(up);
    }
  }

  async function refreshLive() {
    if (!isLiveEntryStoryPage() || document.visibilityState === "hidden" || state.liveAbort) return;
    const controller = new AbortController();
    state.liveAbort = controller;
    try {
      applyLivePosts(await fetchLivePosts(controller.signal));
    } catch {
    } finally {
      if (state.liveAbort === controller) state.liveAbort = null;
    }
  }

  function startLiveRefresh() {
    stopLiveRefresh();
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
    const arrivalRoots = new Set();
    let flushQueued = false;
    let removalObserved = false;
    const flush = () => {
      flushQueued = false;
      if (!roots.size) return;
      const shouldAnimateRemoval = removalObserved;
      removalObserved = false;
      const pendingRoots = [...roots];
      const pendingArrivalRoots = [...arrivalRoots];
      roots.clear();
      arrivalRoots.clear();
      pendingRoots.forEach((root, index) => processRoot(root, { skipPageUi: index < pendingRoots.length - 1 }));
      pendingArrivalRoots.forEach(animatePendingNativeRows);
      scheduleLiveDedupe();
      if (shouldAnimateRemoval) animateExistingRowsAfterRemoval();
      snapshotLiveRowPositions();
    };
    const schedule = (mutations) => {
      let arrivalPostAdded = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData" && mutation.target.parentElement) roots.add(mutation.target.parentElement);
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element && (node.matches?.(POST_SELECTOR) || node.querySelector?.(POST_SELECTOR))) {
            arrivalPostAdded = true;
          }
          if (node instanceof Element) arrivalRoots.add(node);
          if (node instanceof Element) roots.add(node);
          else if (node.parentElement) roots.add(node.parentElement);
        });
        mutation.removedNodes.forEach((node) => {
          if (node instanceof Element && (node.matches?.(POST_SELECTOR) || node.querySelector?.(POST_SELECTOR))) {
            removalObserved = true;
            roots.add(mutation.target);
          }
        });
      });
      if (arrivalPostAdded) restoreNativeArrivalScrollAnchor();
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
    snapshotLiveRowPositions();
    startObserver();
    bindReplyFoldScrollStabilizer();
    startLiveRefresh();
    refreshDraftOwner(true).catch(() => {});
    Ringcl.storageGet(["entryLlnkSettings"]).then((saved) => {
      const settings = saved.entryLlnkSettings || {};
      state.pageSettings = normalizePageSettings(settings);
      state.storyFilters = normalizeStoryFilters(settings.storyFilters, settings.hidePromotions);
      state.autoMoreEnabled = settings.autoMore !== false;
      state.liveRefreshEnabled = settings.liveRefresh !== false;
      state.imageSpoilerEnabled = settings.imageSpoiler !== false;
      state.shortenProjectLinksEnabled = settings.shortenProjectLinks !== false;
      state.draftEnabled = settings.draft !== false;
      state.spaceshipMotionEnabled = settings.spaceshipMotion !== false;
      if (!state.spaceshipMotionEnabled) clearSpaceshipMotionEffects();
      document.documentElement.classList.toggle("entry-chat-image-spoiler-enabled", state.imageSpoilerEnabled);
      if (state.liveRefreshEnabled) startLiveRefresh();
      else stopLiveRefresh();
      processRoot(document);
      shortenProjectLinks(document);
    }).catch(() => {});
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("entry-llnk-native-posts-added", (event) => {
      window.requestAnimationFrame(() => {
        restoreNativeArrivalScrollAnchor();
        updateNewPostIndicator();
      });
    });
    window.addEventListener("entry-llnk-native-posts-will-add", (event) => {
      primeNativeLivePostArrival(event.detail || {});
    });
    window.addEventListener("entry-llnk-native-posts-will-remove", (event) => {
      primeNativeLivePostRemoval(event.detail || {});
    });
    window.addEventListener("entry-llnk-native-posts-will-update", (event) => {
      primeNativeLivePostUpdate(event.detail || {});
    });
    window.addEventListener("entry-llnk-native-posts-updated", (event) => {
      completeNativeLivePostUpdate(event.detail || {});
    });
    window.addEventListener("focus", () => refreshDraftOwner(true).catch(() => {}));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.entryLlnkSettings) return;
      const next = changes.entryLlnkSettings.newValue || {};
      state.pageSettings = normalizePageSettings(next);
      state.storyFilters = normalizeStoryFilters(next.storyFilters, next.hidePromotions);
      state.autoMoreEnabled = next.autoMore !== false;
      state.liveRefreshEnabled = next.liveRefresh !== false;
      state.imageSpoilerEnabled = next.imageSpoiler !== false;
      state.shortenProjectLinksEnabled = next.shortenProjectLinks !== false;
      state.draftEnabled = next.draft !== false;
      state.spaceshipMotionEnabled = next.spaceshipMotion !== false;
      if (!state.spaceshipMotionEnabled) clearSpaceshipMotionEffects();
      document.documentElement.classList.toggle("entry-chat-image-spoiler-enabled", state.imageSpoilerEnabled);
      if (state.liveRefreshEnabled) startLiveRefresh();
      else stopLiveRefresh();
      processRoot(document);
      shortenProjectLinks(document);
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
