// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, "엔트리 링클 - LLNKKR");
assert.equal(manifest.version, "0.1.16");
assert.deepEqual(manifest.permissions, ["storage"]);
assert.deepEqual(manifest.host_permissions, ["https://llnk.kr/*"]);
assert.equal(manifest.background, undefined);
assert.equal(manifest.action.default_popup, "popup/popup.html");

for (const relative of [
  ...Object.values(manifest.icons),
  manifest.action.default_popup,
  "popup/popup.css",
  "popup/popup.js",
  "src/dark-mode.js",
  "styles/dark-mode.css",
]) {
  assert.ok(fs.existsSync(path.join(root, relative)), `${relative} 파일이 필요합니다.`);
}

for (const script of manifest.content_scripts) {
  for (const relative of [...(script.js || []), ...(script.css || [])]) {
    assert.ok(fs.existsSync(path.join(root, relative)), `${relative} 파일이 필요합니다.`);
  }
}

for (const group of manifest.web_accessible_resources || []) {
  for (const relative of group.resources || []) {
    assert.ok(fs.existsSync(path.join(root, relative)), `${relative} 파일이 필요합니다.`);
  }
}

for (const removed of ["vendor", "src/graph.js", "src/math-runtime.js", "src/markers.js", "src/identity-decorations.js"]) {
  assert.equal(fs.existsSync(path.join(root, removed)), false, `${removed}는 패키지에 없어야 합니다.`);
}

console.log("링클 패키지 구조 검사 통과");
