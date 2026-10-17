/* ============================================================
 * Escape A÷ · src/save.js —— 存档抽象层（本地 / 本机服务双后端）
 *
 * 引擎只调 SAVE.*，不直接碰 localStorage，也不直接 fetch。
 *   · LocalBackend ：localStorage（file:// 直开，或本机服务不可用时）；
 *   · ServerBackend：页面经 http:// 打开且 GET /api/ping 成功（api >= 1）时启用。
 *     接口契约见 SAVE_API.md；后端只认 key 与字节，存档格式全归本文件。
 *
 * 约定：
 *   · 一条存档 = 一份信封 { format, version, slot, ts, chapter, payload }，
 *     localStorage 存的、导出的 .json、PUT 的 body 是同一份字节，迁移只写在本文件。
 *   · init() 时把全部槽位拉进内存缓存，UI 用 meta() / hasAny() / latest() 同步渲染；
 *     只有 read / write / remove / importFile 是异步的。
 *   · 失败一律抛 SaveError（带 code），由调用方提示玩家；本文件不吞异常、不谎报成功。
 * ============================================================ */
"use strict";

const SAVE = (() => {

  const FORMAT = "escape-a-save";
  const VERSION = 1;
  const SLOTS = ["auto", "1", "2", "3"];
  const LOCAL_PREFIX = "ea_blob:";      // localStorage 里新信封的 key 前缀
  const LEGACY_PREFIX = "ea_save_";     // v0 旧档（无信封、无版本）的 key 前缀
  const keyOf = slot => "save-" + slot;

  /* ---------------- 错误 ---------------- */
  class SaveError extends Error {
    constructor(code, message, extra) {
      super(message);
      this.name = "SaveError";
      this.code = code;
      Object.assign(this, extra || {});
    }
  }

  const MESSAGES = {
    empty: "该槽位是空的",
    corrupt: "存档文件已损坏，无法读取",
    bad_format: "这不是 Escape A÷ 的存档文件",
    too_new: "该存档来自更新版本的游戏，当前版本无法读取",
    bad_payload: "存档内容与当前剧本不匹配",
    conflict: "存档已被其它窗口改动，请重新打开存档界面后再试",
    too_large: "存档体积超过本机服务的上限",
    quota: "浏览器本地存储空间不足",
    network: "连接不上本机存档服务",
    server: "本机存档服务返回了错误"
  };
  function describe(err) {
    if (err && err.code && MESSAGES[err.code]) return MESSAGES[err.code];
    return (err && err.message) || "未知错误";
  }

  /* ---------------- 本地后端：localStorage ----------------
   * 与服务端同形的异步接口；etag 恒为 null（本地不做并发控制）。
   * 新信封存在 ea_blob:<key>；若只有 v0 旧档（ea_save_<slot>），读出旧档交给 decode 迁移。
   * 旧档原样保留，直到玩家对该槽位写入新档或删除。 */
  const LocalBackend = {
    kind: "local",
    label: "浏览器本地",
    maxBytes: Infinity,
    legacyKey(key) { return key.startsWith("save-") ? LEGACY_PREFIX + key.slice(5) : null; },
    raw(key) {
      const v = localStorage.getItem(LOCAL_PREFIX + key);
      if (v !== null) return v;
      const lk = this.legacyKey(key);
      return lk ? localStorage.getItem(lk) : null;
    },
    async list() {
      return SLOTS.map(keyOf).filter(k => this.raw(k) !== null).map(k => ({ key: k, etag: null }));
    },
    async get(key) {
      const text = this.raw(key);
      return text === null ? { status: 404 } : { status: 200, text, etag: null };
    },
    async put(key, text) {
      try { localStorage.setItem(LOCAL_PREFIX + key, text); }
      catch (e) { throw new SaveError("quota", MESSAGES.quota, { cause: e }); }
      const lk = this.legacyKey(key);
      if (lk) localStorage.removeItem(lk);
      return { etag: null };
    },
    async del(key) {
      localStorage.removeItem(LOCAL_PREFIX + key);
      const lk = this.legacyKey(key);
      if (lk) localStorage.removeItem(lk);
    }
  };

  /* ---------------- 本机服务后端：SAVE_API.md ---------------- */
  async function request(method, path, opts) {
    let res;
    try { res = await fetch(path, Object.assign({ method, cache: "no-store" }, opts || {})); }
    catch (e) { throw new SaveError("network", MESSAGES.network, { cause: e }); }
    return res;
  }
  async function failFrom(res) {
    let body = null;
    try { body = await res.json(); } catch (e) { /* 非 JSON 错误体 */ }
    if (res.status === 409) throw new SaveError("conflict", MESSAGES.conflict, { etag: body && body.etag });
    if (res.status === 413) throw new SaveError("too_large", MESSAGES.too_large);
    const msg = (body && body.message) || `HTTP ${res.status}`;
    throw new SaveError("server", `${MESSAGES.server}：${msg}`, { status: res.status });
  }

  const ServerBackend = {
    kind: "server",
    label: "本机存档服务",
    maxBytes: 0,
    async list() {
      const res = await request("GET", "/api/blobs");
      if (!res.ok) await failFrom(res);
      const data = await res.json();
      return (data.items || []).map(it => ({ key: it.key, etag: it.etag }));
    },
    async get(key, etag) {
      const headers = etag ? { "If-None-Match": etag } : {};
      const res = await request("GET", "/api/blobs/" + encodeURIComponent(key), { headers });
      if (res.status === 304) return { status: 304, etag };
      if (res.status === 404) return { status: 404 };
      if (!res.ok) await failFrom(res);
      return { status: 200, text: await res.text(), etag: res.headers.get("ETag") };
    },
    async put(key, text, ifMatch) {
      const bytes = new TextEncoder().encode(text);
      if (this.maxBytes && bytes.length > this.maxBytes) throw new SaveError("too_large", MESSAGES.too_large);
      const headers = { "Content-Type": "application/octet-stream" };
      if (ifMatch) headers["If-Match"] = ifMatch;
      const res = await request("PUT", "/api/blobs/" + encodeURIComponent(key), { headers, body: bytes });
      if (!res.ok) await failFrom(res);
      const data = await res.json();
      return { etag: data.etag };
    },
    async del(key) {
      const res = await request("DELETE", "/api/blobs/" + encodeURIComponent(key));
      if (res.status !== 204 && !res.ok) await failFrom(res);
    }
  };

  /* 只在 http: 下探测；file:// 绝不请求 127.0.0.1（跨源 + 安全面），直接用本地。 */
  async function probe() {
    if (location.protocol !== "http:" || typeof fetch !== "function") return null;
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 1500) : null;
    try {
      const res = await fetch("/api/ping", { cache: "no-store", signal: ctl ? ctl.signal : undefined });
      if (!res.ok) return null;
      const info = await res.json();
      if (!(info && info.api >= 1)) return null;
      ServerBackend.maxBytes = info.maxBytes || 0;
      return ServerBackend;
    } catch (e) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---------------- 信封：编码 / 解码 / 迁移 ---------------- */
  /* 每个版本一个迁移函数：MIGRATE[n] 把 vn 的信封升到 v(n+1)。 */
  const MIGRATE = {
    /* v0：旧引擎直接存的快照 { cur, hintKey, state, ts, chapter }，没有信封 */
    0(old, slot) {
      return {
        format: FORMAT, version: 1, slot: slot || null,
        ts: old.ts || 0, chapter: old.chapter || (old.state && old.state.chapter) || "",
        payload: { cur: old.cur, hintKey: old.hintKey || "", state: old.state }
      };
    }
  };

  let validatePayload = () => null;   // 引擎在 init 时注入：返回错误说明字符串或 null

  function decode(text, slot) {
    let obj;
    try { obj = JSON.parse(text); }
    catch (e) { throw new SaveError("corrupt", MESSAGES.corrupt); }
    if (!obj || typeof obj !== "object") throw new SaveError("corrupt", MESSAGES.corrupt);

    let env;
    if (obj.format === undefined && obj.version === undefined && obj.cur && obj.state) {
      env = MIGRATE[0](obj, slot);
    } else {
      if (obj.format !== FORMAT) throw new SaveError("bad_format", MESSAGES.bad_format);
      if (!Number.isInteger(obj.version) || obj.version < 1) throw new SaveError("corrupt", MESSAGES.corrupt);
      if (obj.version > VERSION) throw new SaveError("too_new", MESSAGES.too_new, { version: obj.version });
      env = obj;
      for (let v = env.version; v < VERSION; v++) env = MIGRATE[v](env, slot);
    }
    const p = env.payload;
    if (!p || typeof p !== "object" || !p.cur || !p.state || typeof p.state !== "object") {
      throw new SaveError("corrupt", MESSAGES.corrupt);
    }
    const why = validatePayload(p);
    if (why) throw new SaveError("bad_payload", `${MESSAGES.bad_payload}（${why}）`);
    return env;
  }

  function encode(slot, payload, meta) {
    return {
      format: FORMAT, version: VERSION, slot,
      ts: Date.now(), chapter: (meta && meta.chapter) || "",
      payload
    };
  }

  /* ---------------- 内存缓存 ----------------
   * cache[slot] = { env, etag, error }：env 为已迁移的信封；读不出来的槽位记 error，
   * 让 UI 能如实显示"损坏 / 来自新版本"，而不是假装是空槽。 */
  let backend = LocalBackend;
  const cache = {};
  let ready = false;

  async function fetchSlot(slot) {
    const r = await backend.get(keyOf(slot), null);
    if (r.status === 404) { delete cache[slot]; return; }
    try { cache[slot] = { env: decode(r.text, slot), etag: r.etag, error: null }; }
    catch (e) { cache[slot] = { env: null, etag: r.etag, error: e }; }
  }

  async function init(opts) {
    if (opts && typeof opts.validate === "function") validatePayload = opts.validate;
    backend = (await probe()) || LocalBackend;
    for (const k in cache) delete cache[k];
    const items = await backend.list();
    const keys = new Set(items.map(it => it.key));
    await Promise.all(SLOTS.filter(s => keys.has(keyOf(s))).map(fetchSlot));
    ready = true;
    return { backend: backend.kind, label: backend.label };
  }

  /* ---------------- 同步查询（UI 渲染用） ---------------- */
  function meta(slot) {
    const c = cache[slot];
    if (!c) return null;
    if (c.error) return { slot, error: c.error.code, message: describe(c.error) };
    const st = c.env.payload.state;
    return {
      slot, ts: c.env.ts, chapter: c.env.chapter,
      tokens: st.tokens, trust: st.trust, wanted: st.wanted
    };
  }
  function hasAny() { return SLOTS.some(s => cache[s] && cache[s].env); }
  function latest() {
    let best = null;
    for (const s of SLOTS) {
      const c = cache[s];
      if (c && c.env && (!best || c.env.ts > cache[best].env.ts)) best = s;
    }
    return best;
  }

  /* ---------------- 异步读写 ----------------
   * 同一槽位的写入串行排队：连续两次自动存档不会拿同一个旧 etag 互相 409。 */
  const queues = {};
  function enqueue(slot, job) {
    const prev = queues[slot] || Promise.resolve();
    const next = prev.catch(() => {}).then(job);
    queues[slot] = next;
    return next;
  }

  async function read(slot) {
    const c = cache[slot];
    const r = await backend.get(keyOf(slot), c && c.env ? c.etag : null);
    if (r.status === 404) { delete cache[slot]; throw new SaveError("empty", MESSAGES.empty); }
    if (r.status === 304) return JSON.parse(JSON.stringify(c.env.payload));
    let env;
    try { env = decode(r.text, slot); }
    catch (e) { cache[slot] = { env: null, etag: r.etag, error: e }; throw e; }
    cache[slot] = { env, etag: r.etag, error: null };
    return JSON.parse(JSON.stringify(env.payload));
  }

  function writeEnvelope(slot, env) {
    return enqueue(slot, async () => {
      const c = cache[slot];
      if (c && c.error && c.error.code === "too_new") throw c.error;   // 绝不覆盖新版本存档
      const text = JSON.stringify(env);
      try {
        const r = await backend.put(keyOf(slot), text, c ? c.etag : null);
        cache[slot] = { env, etag: r.etag, error: null };
      } catch (e) {
        if (e.code === "conflict") await fetchSlot(slot).catch(() => {});
        throw e;
      }
      return meta(slot);
    });
  }

  function write(slot, payload, metaInfo) {
    return writeEnvelope(slot, encode(slot, JSON.parse(JSON.stringify(payload)), metaInfo));
  }

  function remove(slot) {
    return enqueue(slot, async () => {
      await backend.del(keyOf(slot));
      delete cache[slot];
    });
  }

  /* ---------------- 导出 / 导入存档文件 ----------------
   * 导出的文件就是该槽位的信封原样（v0 旧档导出时已升到当前版本）。 */
  function exportSlot(slot) {
    const c = cache[slot];
    if (!c || !c.env) throw new SaveError(c ? c.error.code : "empty", c ? describe(c.error) : MESSAGES.empty);
    const blob = new Blob([JSON.stringify(c.env, null, 2)], { type: "application/json" });
    const d = new Date(c.env.ts);
    const pad = n => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `escape-a-${keyOf(slot)}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* 先完整解码 + 校验，全部通过才写入；坏文件不会碰现有存档。 */
  async function importFile(file, slot) {
    const text = await file.text();
    const env = decode(text, slot);
    return writeEnvelope(slot, Object.assign({}, env, { slot }));
  }

  return {
    SLOTS, VERSION, SaveError,
    init, meta, hasAny, latest,
    read, write, remove,
    exportSlot, importFile, describe,
    get ready() { return ready; },
    get backend() { return backend.kind; },
    get label() { return backend.label; }
  };
})();
