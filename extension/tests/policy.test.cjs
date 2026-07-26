// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const entry = fs.readFileSync(path.join(root, "src/entrystory.js"), "utf8");
const common = fs.readFileSync(path.join(root, "src/common.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "src/entrystory-loader.js"), "utf8");
const popup = fs.readFileSync(path.join(root, "popup/popup.html"), "utf8");
const darkMode = fs.readFileSync(path.join(root, "src/dark-mode.js"), "utf8");
const darkModeCss = fs.readFileSync(path.join(root, "styles/dark-mode.css"), "utf8");
const entryStoryCss = fs.readFileSync(path.join(root, "styles/entrystory.css"), "utf8");

for (const forbidden of [
  "break7.net",
  "content.php?type=poll",
  "content.php?type=secret",
  "createPollCard",
  "createSecretCard",
  "createMathNode",
  "Lite.graph",
  "isOriginalDisconnectActive",
  "entry-chat-compose-more-toggle",
  "window.DnxLite",
  "data-entry-chat-lite-",
  "dnx_lite_",
  "X-LLNKKR-Device-Token",
  "X-LLNKKR-Client",
  "X-LLNKKR-Entry-Id",
  "X-LLNKKR-Nickname",
  "invite",
  "presence.php",
  "register.php",
]) {
  assert.equal(entry.includes(forbidden) || common.includes(forbidden) || loader.includes(forbidden) || popup.includes(forbidden), false, `${forbidden} 잔여 코드가 없어야 합니다.`);
}

assert.equal(/\\?\{(?:e|enter)\}/i.test(entry), false, "예전 줄바꿈 문법을 해석하면 안 됩니다.");
assert.match(entry, /const disabledLabelLink =/);
assert.match(entry, /appendPlainText\(nodes, disabledLabelLink\[0\]\)/);
assert.match(entry, /const DRAFT_TTL_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(entry, /const LINE_BREAK_MARKER = " "\.repeat\(3\)/);
assert.match(entry, /const breakCount = Math\.floor\(runLength \/ LINE_BREAK_MARKER\.length\)/);
assert.equal(entry.includes("\\*[^*\\n]+\\*"), true);
assert.match(entry, /renderNativePostFromData\(nativeRow, post\)/);
assert.match(entry, /const ownsRenderedBody = body\?\.dataset\?\.entryLlnkOwned === "1"/);
assert.match(entry, /const postsByKey = new Map\(\)/);
assert.match(entry, /if \(matches\.length !== 1\) return/);
assert.doesNotMatch(entry, /posts\.slice\(0, rows\.length\)\.forEach\(\(post, index\)/);
assert.doesNotMatch(entry, /unboundNativeByIdentity/);
assert.doesNotMatch(entry, /liveByIdentity/);
assert.match(loader, /wrapHistoryMethod\("pushState"\)/);
assert.match(loader, /wrapHistoryMethod\("replaceState"\)/);
assert.doesNotMatch(entry, /await refreshDraftOwner\(true\)/);
assert.match(entry, /url\.pathname === "\/redirect"/);
assert.match(entry, /submitArea\.insertBefore\(imageControl, submit\)/);
assert.match(entry, /button\.setAttribute\("aria-label", "이미지 첨부"\)/);
assert.doesNotMatch(entry, /setComposeButtonLabel\(button, "image", "이미지"\)/);
assert.match(entry, /button\.classList\.remove\("has-new-post"\)/);
assert.match(entry, /if \(!isEntryStoryPage\(\)\) \{\s*removeScrollTopButton\(\);/);
assert.match(entry, /if \(!isEntryStoryListPage\(\)\) \{\s*removeScrollTopButton\(\);\s*return;\s*\}\s*const button = \$\("\.entry-chat-entry-story-scroll-top/);
assert.doesNotMatch(entry, /setTimeout\(\(\) => up\?\.classList\.remove\("has-new-post"\)/);
assert.doesNotMatch(entry, /classList\.remove\("entry-chat-page-entrystory"/);
assert.match(common, /const API_BASE = "https:\/\/llnk\.kr\/api\/ringcl"/);
assert.match(entry, /const IMAGE_SHORT_LINK_BASE = "https:\/\/Llnk\.kr\/i"/);
assert.match(entry, /function getBlouplaImageUrl\(value\)/);
assert.match(entry, /const DRAFT_SUBMIT_SESSION_KEY = "entryLlnkEntryStoryDraftSubmitPending"/);
  assert.match(entry, /function rememberDraftSubmitPending\(value\)/);
  assert.match(entry, /function suppressPendingDraftInWriter\(writer = getWriter\(\)\)/);
  assert.match(entry, /window\.setTimeout\(\(\) => suppressPendingDraftInWriter\(writer\), 180\)/);
  assert.match(entry, /restoreDraftSubmitPending\(\);\s*processRoot\(document\);\s*startObserver\(\);/);
  assert.match(entry, /const roots = new Set\(\);\s*let flushQueued = false;/);
  assert.match(entry, /window\.requestAnimationFrame\(flush\)/);
  assert.doesNotMatch(entry, /const schedule = debounce\(\(mutations\) =>/);
  assert.match(entry, /reconcileLiveRows\(getList\(\), state\.livePosts\)/);
assert.match(entry, /function isPendingSubmittedPost\(post, submittedValue = state\.draftSubmittedValue/);
assert.match(entry, /로봇이 아님\|로봇인지 확인\|사람인지 확인/);
assert.match(entry, /function startDraftFailureWatch\(\)/);
assert.match(entry, /characterData: true/);
assert.doesNotMatch(entry, /setTimeout\(\(\) => \{\s*removeImageAttachment\(null\);\s*renderWriterPreview\(\);\s*\}, 1200\)/);
  assert.match(entry, /!locallySubmittedIds\.has\(text\(post\.id\)\)/);
assert.doesNotMatch(entry, /document\.addEventListener\("DOMContentLoaded", init/);
assert.match(entry, /url\.hostname !== "img\.bloupla\.net"/);
assert.match(entry, /url\.searchParams\.set\("raw", "1"\)/);
assert.match(entry, /createImageCard\(\{ directUrl: blouplaImageUrl, source: "bloupla" \}\)/);
assert.match(entry, /function createImageSourceBadge\(source\)/);
assert.match(entry, /const label = isBloupla \? "Bloupla" : "Llnkkr"/);
assert.match(entry, /wrapper\.appendChild\(createImageSourceBadge\(card\.dataset\.entryLlnkSource\)\)/);
assert.match(entry, /function createBlouplaImageHost\(imageUrl\)/);
assert.match(entry, /function sizeImageCardForRatio\(card, ratio\)/);
assert.match(entryStoryCss, /\.entry-chat-bloupla-image-host\s*\{[^}]*max-height:\s*440px/s);
assert.match(entryStoryCss, /\.entry-chat-image-source-badge\.is-bloupla\s*\{[^}]*border:\s*2px solid #2563eb[^}]*border-color:\s*#2563eb[^}]*background:\s*#1c1d1f[^}]*color:\s*#f5f7fb/s);
assert.match(entryStoryCss, /\.entry-chat-image-source-badge\.is-llnk\s*\{[^}]*border:\s*2px solid #bfff00[^}]*border-color:\s*#bfff00[^}]*background:\s*#1c1d1f[^}]*color:\s*#f5f7fb/s);
assert.match(entryStoryCss, /html\.entry-chat-dark-mode\.entry-chat-page-entrystory body \.entry-chat-image-card \.entry-chat-image-spoiler > \.entry-chat-image-source-badge\.is-bloupla/);
assert.match(entryStoryCss, /html\.entry-chat-dark-mode\.entry-chat-page-entrystory body \.entry-chat-image-card \.entry-chat-image-spoiler > \.entry-chat-image-source-badge\.is-llnk/);
assert.match(entryStoryCss, /html\.entry-chat-dark-mode\.entry-chat-page-entrystory body \.entry-chat-image-card \.entry-chat-image-spoiler > \.entry-chat-image-source-badge\.is-llnk\s*\{[^}]*border:\s*2px solid #bfff00[^}]*border-color:\s*#bfff00[^}]*background-color:\s*#1c1d1f[^}]*color:\s*#f5f7fb/s);
assert.match(entry, /attachShadow\(\{ mode: "closed" \}\)/);
assert.match(entry, /chrome\.runtime\.getURL\("src\/bloupla-image-frame\.html"\)/);
assert.match(entry, /function playDraftRestoreAnimation\(writer, value\)/);
assert.match(entry, /assets\/draft-restore\/entrybot-spaceship-1\.svg/);
assert.doesNotMatch(entry, /entrybot-spaceship-\$\{frameNumber\}/);
assert.match(entry, /const characters = Array\.from\(draftValue\)/);
assert.match(entry, /typingProgress/);
assert.match(entry, /writer\.dataset\.entryLlnkDraftAnimating === "1"/);
assert.match(entry, /function measureDraftTextMetrics\(writer, value\)/);
assert.match(entry, /context\.measureText\(character\)\.width/);
assert.match(entry, /function draftFlightTiming\(characterCount, metrics = \{\}\)/);
assert.match(entry, /const travelWidth = Math\.max\(count \* 8, Number\(metrics\.totalWidth\) \|\| 0\)/);
assert.match(entry, /const sweepDistance = Math\.max\(72, Math\.min/);
assert.match(entry, /const typingDuration = Math\.max\(280, Math\.min\(2350, 220 \+ travelWidth \* 0\.22\)\)/);
assert.match(entry, /const sweepDuration = Math\.max\(520, Math\.min\(2700, typingDuration \+ 220\)\)/);
assert.match(entry, /sweepStartX \+ timing\.sweepDistance/);
assert.match(entry, /function draftFlightPose\(writer, progress, timing, writingProgress = 0\)/);
assert.match(entry, /x = mix\(sweepStartX, sweepEndX, writeT\)/);
assert.match(entry, /const writingProgress = characters\.length \? renderedCount \/ characters\.length : 1/);
assert.match(entry, /function draftBeamHeight\(writer, pose\)/);
assert.match(entry, /rect\.bottom - visualBeamTop/);
assert.match(entry, /beam\.style\.height = `\$\{draftBeamHeight\(writer, pose\)\}px`/);
assert.doesNotMatch(entry, /--entry-chat-draft-beam-height", "168px"/);
assert.match(entry, /exitStart: \(entryDuration \+ sweepDuration\) \/ duration/);
assert.match(entry, /const flightY = rect\.top - 82/);
assert.match(entry, /const entryEnd = timing\.entryEnd/);
assert.match(entry, /const exitStart = timing\.exitStart/);
assert.match(entry, /flight\.style\.transform = `translate3d/);
assert.doesNotMatch(entry, /flight\.animate\(/);
assert.doesNotMatch(entryStoryCss, /\.entry-chat-draft-flight-ship::before/);
assert.match(entry, /elapsed - timing\.typingStart/);
assert.doesNotMatch(entry, /holder\.appendChild\(particles\)/);
assert.doesNotMatch(entry, /panel\.className = "entry-chat-draft-restore-panel"/);
assert.match(entryStoryCss, /\.entry-chat-draft-flight-beam/);
assert.doesNotMatch(entryStoryCss, /@keyframes entry-chat-draft-flight\s*\{/);
assert.doesNotMatch(entryStoryCss, /\.entry-chat-draft-restore-(?:particles|message)/);
assert.match(darkMode, /entry-chat-dark-mode/);
for (const routeClass of [
  "entry-chat-page-entrystory",
  "entry-chat-page-project",
  "entry-chat-page-project-list",
  "entry-chat-page-project-edit",
  "entry-chat-page-profile",
  "entry-chat-page-ws",
  "entry-chat-page-home",
]) {
  assert.match(darkMode, new RegExp(routeClass));
}
assert.match(popup, /data-setting="darkMode"/);
assert.match(darkModeCss, /css-8d1p21\.ezvkq1v0/);
assert.match(darkModeCss, /\[class\*="ea7lx0i"\]/);
assert.match(darkModeCss, /e1xq8jz71/);
assert.match(entryStoryCss, /\.entry-chat-md-spoiler:not\(\.is-revealed\) \*/);
assert.match(entryStoryCss, /-webkit-text-fill-color: transparent !important/);
assert.match(entryStoryCss, /background-color: transparent !important/);
assert.match(darkModeCss, /\.entry-chat-md-spoiler:not\(\.is-revealed\) \*/);
assert.doesNotMatch(popup, /엔트리이야기 열기|초대 코드|사용 권한/);

console.log("링클 기능 정책 검사 통과");
