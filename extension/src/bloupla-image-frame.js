(() => {
  "use strict";

  const params = new URL(location.href).searchParams;
  const code = String(params.get("code") || "").trim();
  const token = String(params.get("token") || "").trim();
  const image = document.getElementById("image");
  const notify = (payload) => parent.postMessage({
    type: "entry-llnkkR-bloupla-image",
    token,
    ...payload,
  }, "*");

  if (!/^[a-z0-9_-]{4,64}$/i.test(code) || !/^[a-f0-9-]{16,64}$/i.test(token) || !image) {
    notify({ error: true });
    return;
  }

  image.addEventListener("load", () => notify({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }), { once: true });
  image.addEventListener("error", () => notify({ error: true }), { once: true });
  image.src = `https://img.bloupla.net/${encodeURIComponent(code)}?raw=1`;
})();
