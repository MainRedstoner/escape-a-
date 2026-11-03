/* ============================================================
 * Escape A÷ · src/core/diagnostics.js —— 运行期追踪与调试面板
 *
 * 目标：出错时能拿到“最后一个场景 / 最后一个节点 / 最后几条命令”，
 * 而不是只能靠复现和 console.log。
 *
 * 仅依赖浏览器标准 API；不引用 SYS / ART / AUDIO / ENGINE。
 * 其他模块通过 window.EA.core.diag 记录事件，引擎在 boot 时注册探针。
 * URL：?debug=1 或 ?diag=1 打开右下角面板；控制台 EA.diag.dump() 导出。
 * ============================================================ */
"use strict";

window.EA = window.EA || {};
window.EA.core = window.EA.core || {};

window.EA.core.diag = (() => {
  const MAX_EVENTS = 300;
  const events = [];
  const probes = new Map();
  let panel = null;
  let panelBody = null;
  let panelTimer = 0;
  let panelQueued = false;

  function nowIso() {
    return new Date().toISOString();
  }

  function safeClone(value) {
    if (value == null) return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return String(value);
    }
  }

  function trace(channel, data) {
    const ev = {
      at: nowIso(),
      ms: Math.round(performance.now() * 10) / 10,
      channel: String(channel || "event"),
      data: safeClone(data)
    };
    events.push(ev);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    schedulePanel();
    return ev;
  }

  function error(channel, err, data) {
    const payload = Object.assign(
      { error: safeClone(err) },
      data ? safeClone(data) : {}
    );
    return trace(channel || "error", payload);
  }

  function registerProbe(name, fn) {
    if (typeof fn !== "function") return () => {};
    probes.set(String(name), fn);
    schedulePanel();
    return () => probes.delete(String(name));
  }

  function snapshot() {
    const out = {
      at: nowIso(),
      href: location.href,
      ua: navigator.userAgent,
      probes: {},
      events: events.slice()
    };
    for (const [name, fn] of probes) {
      try {
        out.probes[name] = safeClone(fn());
      } catch (e) {
        out.probes[name] = { error: String(e && e.message || e) };
      }
    }
    return out;
  }

  function dump() {
    return JSON.stringify(snapshot(), null, 2);
  }

  async function copyDump() {
    const text = dump();
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      return ok;
    }
  }

  function formatEvent(ev) {
    const data = ev.data == null ? "" : " " + JSON.stringify(ev.data);
    return ev.at.slice(11, 23) + " " + ev.channel + data;
  }

  function renderPanel() {
    if (!panelBody) return;
    const snap = snapshot();
    const lines = [];
    const probeNames = Object.keys(snap.probes);
    if (probeNames.length) {
      for (const name of probeNames) {
        lines.push("[" + name + "] " + JSON.stringify(snap.probes[name]));
      }
    } else {
      lines.push("[probe] (未注册)");
    }
    lines.push("");
    for (const ev of snap.events.slice(-14)) lines.push(formatEvent(ev));
    panelBody.textContent = lines.join("\n");
  }

  function schedulePanel() {
    if (!panel || panelQueued) return;
    panelQueued = true;
    requestAnimationFrame(() => {
      panelQueued = false;
      renderPanel();
    });
  }

  function ensurePanel() {
    if (panel) return panel;
    const qs = new URLSearchParams(location.search);
    if (!qs.has("debug") && !qs.has("diag")) return null;

    panel = document.createElement("aside");
    panel.id = "eaDiag";
    panel.setAttribute("aria-label", "运行期诊断面板");
    panel.style.cssText = [
      "position:fixed",
      "right:10px",
      "bottom:10px",
      "z-index:2147483647",
      "width:min(440px,calc(100vw - 20px))",
      "max-height:46vh",
      "overflow:auto",
      "padding:10px 12px",
      "border:1px solid rgba(217,119,87,.65)",
      "background:rgba(5,7,10,.94)",
      "color:#C9D2DE",
      "font:11px/1.5 ui-monospace,Consolas,monospace",
      "white-space:pre-wrap",
      "overflow-wrap:anywhere",
      "word-break:break-all",
      "pointer-events:none",
      "box-shadow:0 8px 30px rgba(0,0,0,.55)"
    ].join(";");

    const head = document.createElement("div");
    head.textContent = "EA DIAG · EA.diag.dump() / copyDump()";
    head.style.cssText = "color:#D97757;margin-bottom:7px;letter-spacing:.06em;";
    panelBody = document.createElement("div");
    panel.appendChild(head);
    panel.appendChild(panelBody);
    document.body.appendChild(panel);

    // 探针可能随剧情变化；低频重绘，避免每次 trace 都强制布局。
    panelTimer = setInterval(renderPanel, 800);
    renderPanel();
    return panel;
  }

  function stopPanel() {
    if (panelTimer) clearInterval(panelTimer);
    panelTimer = 0;
    if (panel) panel.remove();
    panel = null;
    panelBody = null;
  }

  window.addEventListener("error", ev => {
    error("window.error", ev.error || ev.message, {
      file: ev.filename,
      line: ev.lineno,
      column: ev.colno
    });
  });

  window.addEventListener("unhandledrejection", ev => {
    error("window.unhandledrejection", ev.reason);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensurePanel, { once: true });
  } else {
    ensurePanel();
  }

  return {
    trace,
    error,
    registerProbe,
    snapshot,
    dump,
    copyDump,
    events,
    get panel() { return panel; },
    showPanel: ensurePanel,
    hidePanel: stopPanel
  };
})();

/* 便捷别名：控制台直接 EA.diag.dump()；分层代码仍走 EA.core.diag。 */
window.EA.diag = window.EA.core.diag;
