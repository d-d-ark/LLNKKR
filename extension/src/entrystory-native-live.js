(() => {
  if (window.__entryLlnkNativeLive) return;
  window.__entryLlnkNativeLive = true;

  const INTERVAL = 1000;
  const POST_EVERY = 5;
  const POST_DISPLAY = 20;
  const REMOVED_POST_TTL = 120000;
const CMT_DISPLAY = 10;
const LIST_PATH    = '/community/entrystory/list';
const GOTO_BUTTON  = true;

function isCanonicalListPage() {
  if (location.pathname !== LIST_PATH) return false;
  const params = new URLSearchParams(location.search);
  if (params.getAll('sort').length !== 1 || params.getAll('term').length !== 1) return false;
  const keys = [...params.keys()];
  return keys.length === 2
    && keys.every(key => key === 'sort' || key === 'term')
    && params.get('sort') === 'created'
    && params.get('term') === 'all';
}

function isRuntimeEnabled() {
  return document.documentElement?.dataset.entryLlnkNativeLive === '1'
    && isCanonicalListPage();
}

function rootFiber() {
  const el = document.getElementById('__next');
  if (!el) return null;
  const k = Object.keys(el).find(k => k.startsWith('__reactContainer$'));
  return k ? el[k] : null;
}
function* walkFibers(root) {
  const stack = [root];
  while (stack.length) {
    const f = stack.pop();
    if (!f) continue;
    yield f;
    if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
}
function findQueryClient() {
  const root = rootFiber();
  if (!root) return null;
  for (const f of walkFibers(root)) {
    const v = f.memoizedProps && f.memoizedProps.value;
    if (v && typeof v.getQueryCache === 'function' && typeof v.setQueryData === 'function') return v;
  }
  return null;
}
function findOpenCommentTargets() {
  const root = rootFiber();
  if (!root) return null;
  const open = new Set();
  for (const f of walkFibers(root)) {
    const p = f.memoizedProps;
    if (p && typeof p.visible === 'boolean' && typeof p.target === 'string'
      && typeof p.onClickFold === 'function') {
      if (p.visible) open.add(p.target);
      }
  }
  return open;
}

let qc = null;
let csrf = '';
let knownPostIds = new Set();
const suppressedPostIds = new Map();
let postSyncRunning = false;

function findCsrfToken() {
  try {
    const el = document.getElementById('__NEXT_DATA__');
    const t = el && JSON.parse(el.textContent)?.props?.initialProps?.csrfToken;
    return t || null;
  } catch { return null; }
}

  const IMG = `id name label { ko en ja vn } filename imageType
  dimension { width height } trimmed { filename width height }`;
  const USER = `id nickname profileImage { ${IMG} } status { following follower }
  description role mark { ${IMG} }`;

  async function gql(op, query, variables) {
    const r = await fetch(`/graphql/${op}`, {
      method: 'POST', credentials: 'include', headers: {
        'Content-Type': 'application/json',
        'x-client-type': 'Client',
        'CSRF-Token': csrf
      },
      body: JSON.stringify({ query, variables })
    });
    const j = await r.json();
    if (j.errors) throw new Error(j.errors[0].message);
    return j.data;
  }

  function currentListParams() {
    const p = new URLSearchParams(location.search);
    return {
      sort:  p.get('sort') || 'created',
 term:  p.get('term') || 'all',
 query: p.get('query') || null,
    };
  }

  function findPostQueries() {
    return qc.getQueryCache().findAll()
    .filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'SELECT_ENTRYSTORY');
  }

  function findPostQuery() {
    const { sort, term, query } = currentListParams();
    const qs = findPostQueries();
    return qs.find(q => q.queryKey[1] === sort && q.queryKey[2] === term && (q.queryKey[3] ?? null) === query)
    || qs.find(q => { try { return q.isActive ? q.isActive() : false; } catch { return false; } })
    || qs[0] || null;
  }

  const POST_Q = `query SELECT_ENTRYSTORY($pageParam: PageParam, $query: String, $user: String, $category: String, $term: String, $prefix: String, $progress: String, $discussType: String, $searchType: String, $searchAfter: JSON, $tag: String) {
    discussList(pageParam: $pageParam, query: $query, user: $user, category: $category, term: $term, prefix: $prefix, progress: $progress, discussType: $discussType, searchType: $searchType, searchAfter: $searchAfter, tag: $tag) {
      total
      list {
        id content created commentsLength likesLength isLike
        user { ${USER} }
        image { ${IMG} }
        sticker { ${IMG} }
      }
      searchAfter
    }
  }`;

  async function fetchLatestPosts() {
    const { sort, term, query } = currentListParams();
    const d = await gql('SELECT_ENTRYSTORY', POST_Q, {
      query, category: 'free', discussType: 'entrystory', searchType: 'scroll',
      term, pageParam: { display: POST_DISPLAY, sort } });
    return d.discussList;
  }

  function getIncomingPostIds(queryKey, dl, allowPrepend) {
    if (!allowPrepend) return [];
    const current = qc.getQueryData(queryKey);
    if (!current?.pages?.length) return [];
    const existingIds = new Set(current.pages.flatMap(pg => pg.discussList.list.map(p => p.id)));
    const newestId = [...existingIds].reduce((a, b) => (b > a ? b : a), '');
    return dl.list
      .filter(p => !existingIds.has(p.id) && p.id > newestId)
      .map(p => p.id)
      .filter(Boolean);
  }

  function getRemovedPosts(queryKey, dl, allowPrepend) {
    if (!allowPrepend || dl.list.length < 2) return [];
    const current = qc.getQueryData(queryKey);
    if (!current?.pages?.length) return [];
    const latestIds = new Set(dl.list.map(post => post.id).filter(Boolean));
    const oldestLatestId = dl.list.reduce((oldest, post) => !oldest || post.id < oldest ? post.id : oldest, '');
    return (current.pages[0]?.discussList?.list || [])
      .filter(post => post.id && post.id >= oldestLatestId && !latestIds.has(post.id) && !suppressedPostIds.has(post.id));
  }

  function getContentUpdatedPosts(queryKey, dl) {
    const current = qc.getQueryData(queryKey);
    if (!current?.pages?.length) return [];
    const existingById = new Map(current.pages.flatMap(page => page.discussList?.list || []).map(post => [post.id, post]));
    return dl.list.filter(post => {
      const existing = existingById.get(post.id);
      return existing && String(existing.content || '') !== String(post.content || '');
    });
  }

  function queryPostIds(queryKey) {
    const current = qc.getQueryData(queryKey);
    return new Set(current?.pages?.flatMap(pg => pg.discussList?.list || []).map(post => post.id).filter(Boolean) || []);
  }

  function observeRemovedPostIds(queryKey) {
    const currentIds = queryPostIds(queryKey);
    const now = Date.now();
    for (const id of knownPostIds) {
      if (!currentIds.has(id)) suppressedPostIds.set(id, now + REMOVED_POST_TTL);
    }
    for (const [id, expiresAt] of suppressedPostIds) {
      if (expiresAt <= now) suppressedPostIds.delete(id);
    }
    knownPostIds = currentIds;
  }

  function withoutSuppressedPosts(dl) {
    const list = dl.list.filter(post => !suppressedPostIds.has(post.id));
    return list.length === dl.list.length
      ? dl
      : { ...dl, total: Math.max(0, Number(dl.total || 0) - (dl.list.length - list.length)), list };
  }

  function upsertPosts(queryKey, dl, allowPrepend) {
    let added = 0, updated = 0;
    let addedIds = [];
    qc.setQueryData(queryKey, (old) => {
      if (!old?.pages?.length) return old;
      const freshById = new Map(dl.list.map(p => [p.id, p]));
      let dirty = false;
      const latestIds = new Set(dl.list.map(post => post.id));
      const oldestLatestId = dl.list.reduce((oldest, post) => !oldest || post.id < oldest ? post.id : oldest, '');
      const pages = old.pages.map((pg, pageIndex) => {
        const c = pg.discussList;
        let touched = false;
        let source = c.list;
        if (allowPrepend && pageIndex === 0 && oldestLatestId && dl.list.length >= 2) {
          const pruned = source.filter(post => {
            if (suppressedPostIds.has(post.id)) return false;
            return post.id < oldestLatestId || latestIds.has(post.id);
          });
          if (pruned.length !== source.length) {
            source = pruned;
            touched = true;
          }
        }
        const list = source.map(p => {
          const f = freshById.get(p.id);
          if (!f) return p;
          freshById.delete(p.id);
          const merged = { ...p, ...f };
          if (p.content === merged.content && p.likesLength === merged.likesLength &&
            p.commentsLength === merged.commentsLength && p.isLike === merged.isLike) return p;
          touched = true; updated++;
          return merged;
        });
        if (!touched) return pg;
        dirty = true;
        return { ...pg, discussList: { ...c, list } };
      });
      let out = pages;
      if (allowPrepend) {
        const newestId = old.pages.flatMap(pg => pg.discussList.list.map(p => p.id))
        .reduce((a, b) => (b > a ? b : a), '');
        const fresh = dl.list.filter(p => freshById.has(p.id) && p.id > newestId);
        if (fresh.length) {
          added = fresh.length; dirty = true;
          addedIds = fresh.map(p => p.id).filter(Boolean);
          out = [...pages];
          const d0 = out[0].discussList;
          out[0] = { ...out[0], discussList: { ...d0, list: [...fresh, ...d0.list] } };
        }
      }
      if (out[0].discussList.total !== dl.total) {
        dirty = true;
        if (out === pages) out = [...pages];
        const d0 = out[0].discussList;
        out[0] = { ...out[0], discussList: { ...d0, total: dl.total } };
      }
      return dirty ? { ...old, pages: out } : old;
    });
    return { added, updated, addedIds };
  }

  async function syncPosts() {
    if (!isRuntimeEnabled() || postSyncRunning) return;
    postSyncRunning = true;
    try {
    const pq = findPostQuery();
    if (!pq) return;
    observeRemovedPostIds(pq.queryKey);
    const dl = withoutSuppressedPosts(await fetchLatestPosts());
    const { sort } = currentListParams();
    const allowPrepend = sort === 'created';
    const incomingIds = getIncomingPostIds(pq.queryKey, dl, allowPrepend);
    const removedPosts = getRemovedPosts(pq.queryKey, dl, allowPrepend);
    const removedIds = removedPosts.map(post => post.id).filter(Boolean);
    const contentUpdates = getContentUpdatedPosts(pq.queryKey, dl);
    const contentUpdatedIds = contentUpdates.map(post => post.id).filter(Boolean);
    if (incomingIds.length) {
      const incomingIdSet = new Set(incomingIds);
      const incomingPosts = dl.list.filter(post => incomingIdSet.has(post.id));
      window.dispatchEvent(new CustomEvent('entry-llnk-native-posts-will-add', {
        detail: { count: incomingIds.length, ids: incomingIds, postsJson: JSON.stringify(incomingPosts) }
      }));
    }
    if (removedIds.length) {
      const expiresAt = Date.now() + REMOVED_POST_TTL;
      removedIds.forEach(id => suppressedPostIds.set(id, expiresAt));
      window.dispatchEvent(new CustomEvent('entry-llnk-native-posts-will-remove', {
        detail: { count: removedIds.length, ids: removedIds, postsJson: JSON.stringify(removedPosts) }
      }));
      await new Promise(resolve => setTimeout(resolve, 1080));
    }
    if (contentUpdatedIds.length) {
      window.dispatchEvent(new CustomEvent('entry-llnk-native-posts-will-update', {
        detail: { count: contentUpdatedIds.length, ids: contentUpdatedIds, postsJson: JSON.stringify(contentUpdates) }
      }));
      await new Promise(resolve => setTimeout(resolve, 860));
    }
    const { added, addedIds } = upsertPosts(pq.queryKey, withoutSuppressedPosts(dl), allowPrepend);
    knownPostIds = queryPostIds(pq.queryKey);
    if (added) {
      window.dispatchEvent(new CustomEvent('entry-llnk-native-posts-added', {
        detail: { count: added, ids: addedIds }
      }));
    }
    if (contentUpdatedIds.length) {
      window.dispatchEvent(new CustomEvent('entry-llnk-native-posts-updated', {
        detail: { count: contentUpdatedIds.length, ids: contentUpdatedIds, postsJson: JSON.stringify(contentUpdates) }
      }));
    }
    } finally {
      postSyncRunning = false;
    }
  }

  function updatePostCommentCount(postId, total) {
    for (const q of findPostQueries()) {
      qc.setQueryData(q.queryKey, (old) => {
        if (!old?.pages?.length) return old;
        let dirty = false;
        const pages = old.pages.map(pg => {
          const dl = pg.discussList;
          const i = dl.list.findIndex(p => p.id === postId);
          if (i === -1 || dl.list[i].commentsLength === total) return pg;
          dirty = true;
          const list = [...dl.list];
          list[i] = { ...list[i], commentsLength: total };
          return { ...pg, discussList: { ...dl, list } };
        });
        return dirty ? { ...old, pages } : old;
      });
    }
  }

  const CMT_Q = `query SELECT_COMMENTS($pageParam: PageParam, $target: String, $searchAfter: JSON, $likesLength: Int, $groupId: ID) {
    commentList(pageParam: $pageParam, target: $target, searchAfter: $searchAfter, likesLength: $likesLength, groupId: $groupId) {
      total searchAfter
      list {
        id user { ${USER} } content created removed blamed blamedBy
        commentsLength likesLength isLike hide pinned
        image { ${IMG} } sticker { ${IMG} }
      }
    }
  }`;

  async function fetchComments(postId, variables) {
    return (await gql('SELECT_COMMENTS', CMT_Q, { target: postId, ...variables })).commentList;
  }

  function syncCommentPages(old, { toUpdate, fresh, total, desc }) {
    if (!old?.pages?.length) return { data: old, updatedN: 0, appendedN: 0, overflowN: 0 };
    let updatedN = 0, appendedN = 0, overflowN = 0;
    let dirty = false;
    const byId = new Map(toUpdate.map(c => [c.id, c]));

    let pages = old.pages.map(pg => {
      const cl = pg.commentList;
      let touched = cl.total !== total;
      const list = cl.list.map(c => {
        const f = byId.get(c.id);
        if (!f) return c;
        const merged = { ...c, ...f };
        if (JSON.stringify(c) === JSON.stringify(merged)) return c;
        touched = true; updatedN++;
        return merged;
      });
      if (!touched) return pg;
      dirty = true;
      return { ...pg, commentList: { ...cl, total, list } };
    });

    if (fresh.length) {
      const cur = new Set(pages.flatMap(pg => pg.commentList.list.map(c => c.id)));
      const rf = fresh.filter(c => !cur.has(c.id));
      if (rf.length) {
        dirty = true;
        pages = pages.map(pg => ({ ...pg, commentList: { ...pg.commentList, list: [...pg.commentList.list] } }));
        if (desc) {
          for (const f of rf) {
            pages[0].commentList.list.unshift(f); appendedN++;
            for (let i = 0; pages[i].commentList.list.length > CMT_DISPLAY; i++) {
              const x = pages[i].commentList.list.pop();
              pages[i].commentList.searchAfter = x.id;
              if (pages[i + 1]) pages[i + 1].commentList.list.unshift(x);
              else pages.push({ commentList: { total, searchAfter: null, list: [x] } });
            }
          }
        } else {
          const cl = pages[pages.length - 1].commentList;
          const room = CMT_DISPLAY - cl.list.length;
          const fit = rf.slice(0, Math.max(room, 0));
          if (fit.length) { cl.list.push(...fit); appendedN += fit.length; }
          const overflow = rf.slice(fit.length);
          if (overflow.length) { overflowN = overflow.length; cl.searchAfter = overflow[0].id; }
        }
      }
    }
    return { data: dirty ? { ...old, pages } : old, updatedN, appendedN, overflowN };
  }

  async function syncComments(q) {
    const postId = q.queryKey[1];
    const data = q.state.data;
    if (!data?.pages?.length) return null;
    const loaded = data.pages.flatMap(p => p.commentList.list);
    const desc = q.queryKey[2] === 'created';

    if (!loaded.length) {
      const dl0 = await fetchComments(postId, {
        pageParam: { display: CMT_DISPLAY, sort: 'created', order: desc ? -1 : 1 } });
      if (!dl0.list.length) return null;
      qc.setQueryData(q.queryKey, { pages: [{ commentList: dl0 }], pageParams: [undefined] });
      updatePostCommentCount(postId, dl0.total);
      return { updated: 0, appended: dl0.list.length, overflowN: 0, total: dl0.total, refilled: true };
    }

    const known = new Set(loaded.map(c => c.id));
    const lastLoaded = loaded.reduce((a, c) => (c.id > a.id ? c : a));

    let win, total;
    if (desc) {
      const dl = await fetchComments(postId, { pageParam: { display: CMT_DISPLAY * 2, sort: 'created', order: -1 } });
      win = [...dl.list].reverse();
      total = dl.total;
    } else {
      let dl = await fetchComments(postId, { searchAfter: lastLoaded.id,
        pageParam: { display: CMT_DISPLAY, sort: 'created', order: 1 } });
      if (!dl.list.length) {
        dl = await fetchComments(postId, { pageParam: { display: CMT_DISPLAY, sort: 'created', order: -1 } });
        win = [...dl.list].reverse();
      } else {
        win = dl.list;
      }
      total = dl.total;
    }

    const toUpdate = win.filter(c => known.has(c.id));
    const fresh = win.filter(c => !known.has(c.id) && c.id > lastLoaded.id);

    let res;
    qc.setQueryData(q.queryKey, (old) => {
      res = syncCommentPages(old, { toUpdate, fresh, total, desc });
      return res.data;
    });

    updatePostCommentCount(postId, total);
    return { ...res, total };
  }

  function findCommentQuery(target) {
    const qs = qc.getQueryCache().findAll()
    .filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'SELECT_COMMENTLIST'
    && q.queryKey[1] === target);
    return qs.find(q => { try { return q.isActive && q.isActive(); } catch { return false; } })
    || qs.find(q => q.state.data?.pages?.length)
    || qs[0] || null;
  }

  async function syncOneThread(target) {
    const q = findCommentQuery(target);
    if (!q?.state.data?.pages?.length) return;
    await syncComments(q);
  }

  function postIdOf(el) {
    const k = Object.keys(el).find(x => x.startsWith('__reactFiber$'));
    let f = k ? el[k] : null;
    while (f) {
      const p = f.memoizedProps;
      if (p && typeof p.id === 'string' && /^[0-9a-f]{24}$/.test(p.id)
        && typeof p.commentsLength === 'number' && 'updateItem' in p) return p.id;
        f = f.return;
    }
    return null;
  }
  function findUlUnder(fiber) {
    for (const f of walkFibers(fiber.child ?? fiber)) {
      if (f.stateNode instanceof HTMLUListElement) return f.stateNode;
    }
    return null;
  }
  function menuUls() {
    const root = rootFiber();
    if (!root) return [];
    const uls = new Set();
    for (const f of walkFibers(root)) {
      const p = f.memoizedProps;
      if (p && typeof p.onClickReport === 'function' && typeof p.isDiscussWriter !== 'undefined') {
        const ul = findUlUnder(f);
        if (ul) uls.add(ul);
      }
    }
    return [...uls];
  }
  function injectGotoButtons() {
    if (!GOTO_BUTTON) return;
    for (const ul of menuUls()) {
      if (ul.querySelector(':scope > li[data-esgoto]')) continue;
      const postId = postIdOf(ul);
      if (!postId) continue;
      const li = document.createElement('li');
      li.dataset.esgoto = '1';
      const a = document.createElement('a');
      a.href = `/community/entrystory/${postId}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '게시글로 이동';
      a.addEventListener('click', e => e.stopPropagation());
      li.appendChild(a);
      ul.appendChild(li);
    }
  }

  let tick = 0, rr = 0, syncBusy = false;
  function openTargetsSorted() {
    const open = findOpenCommentTargets();
    if (open) return [...open].sort();
    return [...new Set(qc.getQueryCache().findAll()
    .filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'SELECT_COMMENTLIST')
    .filter(q => { try { return q.isActive ? q.isActive() : false; } catch { return false; } })
    .map(q => q.queryKey[1]))].sort();
  }

  window.__entryLlnkNativeLiveTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible' || syncBusy) return;
    syncBusy = true;
    try {
      if (!isRuntimeEnabled()) {
        tick = 0;
        rr = 0;
        return;
      }
      qc = findQueryClient();
      csrf = findCsrfToken() || '';
      if (!qc || !csrf) return;
      injectGotoButtons();
      const postSlot = tick % POST_EVERY === 0;
      if (!postSlot) {
        const targets = openTargetsSorted();
        if (targets.length) {
          const target = targets[rr % targets.length];
          rr++;
          await syncOneThread(target);
        } else {
          await syncPosts();
        }
      } else {
        await syncPosts();
      }
      tick++;
    } catch {} finally {
      syncBusy = false;
    }
  }, INTERVAL);
})();
