#!/usr/bin/env node
/**
 * pm_browser_fetch — 真实 Chromium（CDP）取 PDF 的执行体。
 *
 * 定位：`pm_literature_download` 的 OA 链之外的**最后一跳**。它不破解任何挑战：
 * 用真实浏览器渲染页面、复用校园网会话，Cloudflare/Anubis 这类需要真浏览器的
 * 校验会自然通过；遇到需要人机交互的验证或站点给出的低分判定，直接返回
 * MANUAL_REQUIRED 并把 DOI 直链交给用户。
 *
 * 输入（argv[2] 或 stdin 的 JSON）：
 *   { doi?, url?, outDir, outPath?, filename?, port?, profileDir?, chromePath?,
 *     timeoutMs?, waitMs? }
 *   - doi  → 以 https://doi.org/<doi> 为落地页
 *   - url  → 直接给定落地页或 PDF 地址
 *   - outPath → 由调用方算好的最终路径（推荐）；否则写到 outDir/filename
 *
 * 输出（stdout 单行 JSON）：
 *   { ok, status, bytes?, path?, landingUrl, source, reason?, links?, engine }
 *   status ∈ DOWNLOADED | MANUAL_REQUIRED | CLOUDFLARE_CHALLENGE | BROWSER_UNAVAILABLE
 */

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = { t0: Date.now() };
const mark = (name) => { T[name] = Date.now() - T.t0; };

// ---------------------------------------------------------------- input
function readInput() {
  const raw = process.argv[2] ?? "";
  if (raw) return JSON.parse(raw);
  return new Promise((res, rej) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => {
      try { res(JSON.parse(buf)); } catch (e) { rej(e); }
    });
  });
}

// ---------------------------------------------------------------- chrome
function findChrome(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.PM_CHROME_PATH) candidates.push(process.env.PM_CHROME_PATH);
  const local = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  const pw = join(local, "ms-playwright");
  if (existsSync(pw)) {
    for (const dir of ["chromium-1243", "chromium-1242", "chromium-1241"]) {
      candidates.push(join(pw, dir, "chrome-win64", "chrome.exe"));
      candidates.push(join(pw, dir, "chrome-win", "chrome.exe"));
    }
  }
  candidates.push(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  );
  return candidates.find((p) => p && existsSync(p));
}

async function cdpUp(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

async function ensureBrowser({ port, profileDir, chromePath }) {
  if (await cdpUp(port)) return { launched: false, port };
  const exe = findChrome(chromePath);
  if (!exe) return { launched: false, port, error: "NO_CHROME" };
  mkdirSync(profileDir, { recursive: true });
  const child = spawn(exe, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-proxy-server",              // 直连校园网出口；系统代理会绕去境外导致无订阅
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=Translate,MediaRouter",
    "--window-size=1280,900",
    "about:blank",
  ], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  for (let i = 0; i < 50; i += 1) {
    await sleep(500);
    if (await cdpUp(port)) return { launched: true, port, exe };
  }
  return { launched: false, port, error: "BROWSER_START_TIMEOUT" };
}

// ---------------------------------------------------------------- cdp
class Cdp {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.handlers = []; }
  async open() {
    await new Promise((res, rej) => {
      this.ws.addEventListener("open", res, { once: true });
      this.ws.addEventListener("error", () => rej(new Error("ws error")), { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) {
        for (const h of this.handlers) {
          try { h(m); } catch { /* 单个事件处理器不拖垮整条流 */ }
        }
      }
    });
    return this;
  }
  on(fn) { this.handlers.push(fn); }
  send(method, params = {}, timeoutMs = 120000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      // 定时器必须在结算时清掉：残留的 120 s 定时器会把事件循环钉住，进程迟迟不退出
      const timer = setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); rej(new Error(`timeout ${method}`)); }
      }, timeoutMs);
      const done = (fn) => (value) => { clearTimeout(timer); fn(value); };
      this.pending.set(id, { res: done(res), rej: done(rej) });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch { /* 进程退出时的 uv 断言是已知噪声 */ } }
}

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "evaluate failed");
  return r.result?.value;
}

const CHALLENGE = /just a moment|checking your browser|are you a robot|verify you are human|security verification|enable javascript and cookies|请稍候|making sure you.re not a bot|access denied/i;

async function pageState(cdp) {
  const raw = await evaluate(cdp, `JSON.stringify({
    url: location.href,
    title: document.title,
    body: (document.body && document.body.innerText || "").slice(0, 600),
    ct: document.contentType
  })`);
  const state = JSON.parse(raw);
  state.challenge = CHALLENGE.test(`${state.title} ${state.body}`);
  return state;
}

/** 页面候选：meta citation_pdf_url、PDF 类链接、内嵌 PDF、以及页面本身就是 PDF 的情况。 */
async function pdfCandidates(cdp) {
  const raw = await evaluate(cdp, `JSON.stringify((() => {
    const out = [];
    const push = (u) => { if (u && !out.includes(u)) out.push(u); };
    for (const sel of ['meta[name="citation_pdf_url"]', 'meta[name="pdf_url"]', 'meta[property="citation_pdf_url"]']) {
      const m = document.querySelector(sel);
      if (m && m.content) push(m.content);
    }
    const alt = document.querySelector('link[rel="alternate"][type="application/pdf"]');
    if (alt && alt.href) push(alt.href);
    for (const el of document.querySelectorAll("iframe[src], embed[src], object[data]")) {
      const src = el.src || el.data || "";
      if (/\\.pdf($|[?#])/i.test(src)) push(src);
    }
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href || "";
      if (!/(\\/pdf(b|direct)?[?/]|\\/pdfft|\\/epdf|\\.pdf($|[?#])|\\/document($|[?#]))/i.test(href)) continue;
      push(href);
      if (out.length >= 8) break;
    }
    return out;
  })())`);
  return JSON.parse(raw);
}

/** 在页面上下文取字节（同源 + 复用会话），返回 Buffer 或 null。
 *  带硬超时：WAF 对 XHR 只回慢速挑战页时，不能让它把整次调用拖住。 */
async function fetchBytes(cdp, url, capMs = 15000) {
  const raw = await Promise.race([
    evaluate(cdp, `
      (async () => {
        try {
          const r = await fetch(${JSON.stringify(url)}, { credentials: "include", redirect: "follow" });
          const b = await r.arrayBuffer();
          const u8 = new Uint8Array(b);
          let s = ""; const CH = 0x8000;
          for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
          return JSON.stringify({ ok: true, status: r.status, type: r.headers.get("content-type"), len: u8.length, b64: btoa(s) });
        } catch (e) {
          return JSON.stringify({ ok: false, err: String(e) });
        }
      })()
    `),
    sleep(capMs).then(() => JSON.stringify({ ok: false, err: "fetch-timeout" })),
  ]);
  const d = JSON.parse(raw);
  if (!d.ok || d.len < 1024) return null;
  const buf = Buffer.from(d.b64, "base64");
  return buf.subarray(0, 5).toString("latin1") === "%PDF-" ? buf : null;
}

// ---------------------------------------------------------------- main
/**
 * 取一个候选 URL 的字节。
 *
 * 两段式（老文章常见：真实 PDF 在另一个子域）：
 *   1) 落到目标源根，使 fetch 成为同源请求；
 *   2) fetch 拿不到 PDF 时，直接导航到该 URL，读回浏览器最终落点；
 *      若最终落点是 PDF，则以该落点的源为基准再取一次。
 */
/**
 * 网络层截获：导航到 PDF 地址，在响应阶段直接取响应体。
 *
 * 为什么需要它：Wiley/ACS 这类站点对 XHR（`Sec-Fetch-Dest: empty`）返回 403
 * "Just a moment…"，只放行文档级导航。页面内 fetch 因此永远拿不到字节，而
 * Fetch 域工作在网络栈上，与渲染器/页面 JS 的策略无关。
 */
async function captureViaNetwork(cdp, candidate, deadline) {
  const found = [];
  const seen = new Set();

  const keep = (url, buf) => {
    if (buf && buf.subarray(0, 5).toString("latin1") === "%PDF-" && !seen.has(url)) {
      seen.add(url);
      found.push({ url, buf });
    }
  };

  const pdfReqs = new Set();

  cdp.on((m) => {
    if (m.method === "Network.responseReceived") {
      const { requestId, response } = m.params;
      const mime = (response.mimeType || "").toLowerCase();
      if (!(mime.includes("pdf") || /\.pdf($|[?#])/i.test(response.url || ""))) return;
      pdfReqs.add(requestId);
      cdp.send("Network.getResponseBody", { requestId })
        .then((r) => keep(response.url, Buffer.from(r.body, r.base64Encoded ? "base64" : "latin1")))
        .catch(() => {});
      return;
    }
    // 只对已判定为 PDF 的请求补取一次体（逐请求取体会把几百个资源都解码一遍，极慢）
    if (m.method === "Network.loadingFinished" && pdfReqs.has(m.params.requestId)) {
      const rid = m.params.requestId;
      cdp.send("Network.getResponseBody", { requestId: rid })
        .then((r) => keep(`net:${rid}`, Buffer.from(r.body, r.base64Encoded ? "base64" : "latin1")))
        .catch(() => {});
    }
  });

  await cdp.send("Network.enable", {
    maxTotalBufferSize: 200 * 1024 * 1024,
    maxResourceBufferSize: 100 * 1024 * 1024,
  }).catch(() => {});

  await cdp.send("Page.navigate", { url: candidate });
  const until = Math.min(deadline, Date.now() + 45000);
  while (Date.now() < until && found.length === 0) await sleep(1500);
  return found[0] ?? null;
}

async function tryFetch(cdp, candidate) {
  // PDF 型地址：直接走网络层截获。绕开页面 JS（WAF 对 XHR 回 403）与被拖住的渲染线程，
  // 也让整次调用稳定在几秒量级。
  const looksPdf = /(pdfdirect|epdf|\/pdf[?/]|\.pdf($|[?#]))/i.test(candidate);
  if (looksPdf) {
    mark("directCapture");
    const captured = await captureViaNetwork(cdp, candidate, Date.now() + 25000);
    mark("directCaptureDone");
    return captured ? { buf: captured.buf, via: captured.url } : { buf: null, via: null };
  }
  // 非 PDF 地址：只在页面里短试一次（可能本身就是 PDF 端点），拿不到就换下一个候选，
  // 不再花几十秒去导航/等待一个注定是 HTML 的落地页。
  const direct = await fetchBytes(cdp, candidate, 8000);
  mark("fetch1");
  return direct ? { buf: direct, via: candidate } : { buf: null, via: null };
}

async function main() {
  const input = await readInput();
  const port = Number(input.port ?? 9333);
  const profileDir = resolve(input.profileDir ?? join(homedir(), ".dsh", "lit-browser-profile"));
  const waitMs = Number(input.waitMs ?? 20000);
  const timeoutMs = Number(input.timeoutMs ?? 180000);

  const doi = (input.doi ?? "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const landingUrl = input.url ?? (doi ? `https://doi.org/${encodeURIComponent(doi)}` : "");
  if (!landingUrl) {
    console.log(JSON.stringify({ ok: false, status: "MANUAL_REQUIRED", reason: "NO_INPUT", engine: "chromium-cdp" }));
    return;
  }

  const outPath = input.outPath
    ?? (input.outDir ? join(input.outDir, input.filename ?? "download.pdf") : null);
  if (!outPath) {
    console.log(JSON.stringify({ ok: false, status: "MANUAL_REQUIRED", reason: "NO_OUTPUT_PATH", engine: "chromium-cdp" }));
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });

  const browser = await ensureBrowser({ port, profileDir, chromePath: input.chromePath });
  if (browser.error) {
    console.log(JSON.stringify({
      ok: false, status: "BROWSER_UNAVAILABLE", reason: browser.error,
      landingUrl, engine: "chromium-cdp",
      note: "未找到 Chromium/Chrome/Edge 或浏览器启动超时；可用 chromePath 显式指定",
    }));
    return;
  }

  const tabRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(landingUrl)}`, { method: "PUT" });
  const tab = await tabRes.json();
  const cdp = await new Cdp(tab.webSocketDebuggerUrl).open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const finish = async (payload) => {
    cdp.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`).catch(() => {});
    console.log(JSON.stringify({ engine: "chromium-cdp", landingUrl, timings: T, ...payload }));
  };

  const deadline = Date.now() + timeoutMs;
  let state = await pageState(cdp);
  let challenged = state.challenge;

  // 首次等待：给 Cloudflare / Anubis 这类需要真浏览器的校验自然通过的时间
  const settleUntil = Date.now() + Math.min(waitMs, 25000);
  while (Date.now() < settleUntil) {
    await sleep(2500);
    state = await pageState(cdp);
    challenged = state.challenge;
    if (!challenged && state.url && !/^about:blank/.test(state.url)) break;
  }

  mark("settle");

  // 页面本身就是 PDF（直接给了 PDF 地址）
  const isPdfDoc = /application\/pdf/i.test(state.ct ?? "")
    || (/\.pdf($|[?#])/i.test(state.url) && !challenged);
  let links = challenged ? [] : await pdfCandidates(cdp).catch(() => []);
  // 老文章的 citation_pdf_url 可能晚于首屏出现：给它一点时间，但不要拖太久
  if (!challenged && links.length === 0 && !isPdfDoc) {
    const until = Date.now() + 8000;
    while (Date.now() < until && links.length === 0) {
      await sleep(1500);
      links = await pdfCandidates(cdp).catch(() => []);
    }
  }

  if (challenged && isPdfDoc === false && links.length === 0) {
    await finish({
      ok: false,
      status: "MANUAL_REQUIRED",
      reason: "HUMAN_VERIFICATION",
      note: "页面停在人机验证/安全校验页。请在真实浏览器打开该 DOI 完成一次校验，或改用 OA 副本/文献传递。",
      pageUrl: state.url,
      pageTitle: state.title,
    });
    return;
  }

  const attempts = [];
  // 出版社模板（由调用方给出、且已通过 allowlist）排在最前：老文章常不在页面上暴露链接
  const extra = Array.isArray(input.candidates) ? input.candidates.filter((u) => /^https?:/i.test(String(u))) : [];
  const looksLikePdf = (u) => /(pdfdirect|epdf|\/pdf[?/]|\.pdf($|[?#]))/i.test(String(u));
  const queue = [...new Set([...extra, state.url, ...links])]
    .filter((u) => /^https?:/i.test(String(u)))
    .sort((a, b) => Number(looksLikePdf(b)) - Number(looksLikePdf(a)));
  for (const candidate of queue.slice(0, 6)) {
    if (Date.now() > deadline) break;
    let outcome = null;
    try {
      outcome = await tryFetch(cdp, candidate);
    } catch (cause) {
      attempts.push({ url: candidate.slice(0, 160), error: String(cause).slice(0, 120) });
      continue;
    }
    if (!outcome?.buf) { attempts.push({ url: candidate.slice(0, 160), error: "not a pdf payload" }); continue; }
    const buf = outcome.buf;
    await new Promise((res, rej) => {
      const ws = createWriteStream(outPath);
      ws.on("error", rej);
      ws.on("finish", res);
      ws.end(buf);
    });
    await finish({
      ok: true,
      status: "DOWNLOADED",
      path: outPath,
      bytes: statSync(outPath).size,
      source: String(outcome.via ?? candidate).slice(0, 300),
      attempts,
    });
    return;
  }

  await finish({
    ok: false,
    status: challenged ? "CLOUDFLARE_CHALLENGE" : "MANUAL_REQUIRED",
    reason: challenged ? "HUMAN_VERIFICATION" : "NO_PDF_LINK",
    note: challenged
      ? "真浏览器仍停在人机验证页；请在校园网内人工打开该 DOI。"
      : "落地页未暴露可取的 PDF 链接（可能需要订阅登录或仅提供 HTML 全文）。",
    pageUrl: state.url,
    pageTitle: state.title,
    bodyHead: (state.body || "").replace(/\s+/g, " ").slice(0, 240),
    links: links.slice(0, 5),
    attempts,
  });
}

main().catch((cause) => {
  console.log(JSON.stringify({
    ok: false, status: "BROWSER_UNAVAILABLE", engine: "chromium-cdp",
    reason: "SCRIPT_ERROR", note: String(cause?.message ?? cause),
  }));
  process.exitCode = 0; // 结果已经在 stdout，退出码不承载语义
});
