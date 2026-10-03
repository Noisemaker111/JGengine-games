/**
 * browser.mjs — shared Chrome/CDP machinery for scripts/shoot.mjs and
 * scripts/drive.mjs. No Playwright, no npm deps — just Chrome/Chromium +
 * Node 22+ (or Bun). If Chrome is not auto-detected, set CHROME_PATH.
 * Not a CLI; run shoot.mjs or drive.mjs instead.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";

export const DEVICES = {
  desktop: { width: 1600, height: 900, dsf: 1, mobile: false },
  mobile: { width: 390, height: 844, dsf: 2, mobile: true },
  "mobile-landscape": { width: 844, height: 390, dsf: 2, mobile: true },
};

export async function emulateDevice(session, profile, width = profile.width, height = profile.height) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: profile.dsf,
    mobile: profile.mobile,
  });
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: profile.mobile,
    maxTouchPoints: profile.mobile ? 5 : 1,
  });
}

export const driveInputPointExpr = function driveInputPointExpr(text, input = !1, focused = !1) {
  return `((needle, input, focused) => {
    if (!needle) return null;
    const selector = input ? 'input:not([type=hidden]), textarea' : 'button, [role=button], [role=switch], a';
    const nodes = Array.from(document.querySelectorAll(input ? selector : selector + ', span, div, h1, h2, h3'));
    const candidates = nodes.flatMap(node => {
      const labelled = (node.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      const accessible = node.getAttribute('aria-label') || labelled ||
        Array.from(node.labels || []).map(label => label.textContent || '').join(' ').trim();
      const names = input ? [accessible] : [(node.textContent || '').trim(), accessible];
      return names.map(name => name.toLowerCase()).filter(name => name && (input ? name === needle : name.includes(needle)))
        .map(name => ({ node: input ? node : node.closest(selector) || node, own: name }));
    });
    candidates.sort((a, b) => a.own.length - b.own.length || Number(b.node.matches(selector)) - Number(a.node.matches(selector)));
    if (!candidates.length) return null;
    const shortest = candidates[0].own.length, interactive = candidates[0].node.matches(selector);
    for (const item of candidates) {
      if (item.own.length !== shortest || item.node.matches(selector) !== interactive) break;
      const node = item.node;
      if (node.matches(':disabled') || node.closest('[aria-disabled="true"], [inert]')) continue;
      if (input && (node.readOnly || !node.matches('textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=tel], input[type=password], input[type=number]'))) continue;
      if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (focused) return document.activeElement === node;
      node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const rect = node.getBoundingClientRect();
      let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, clip.left + parent.clientLeft);
          right = Math.min(right, clip.left + parent.clientLeft + parent.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, clip.top + parent.clientTop);
          bottom = Math.min(bottom, clip.top + parent.clientTop + parent.clientHeight);
        }
      }
      if (right <= left || bottom <= top) continue;
      for (const fy of [0.5, 0.1, 0.9]) for (const fx of [0.5, 0.1, 0.9]) {
        const x = left + (right - left) * fx, y = top + (bottom - top) * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === node || node.contains(hit))) return { x, y };
      }
    }
    return null;
  })(${JSON.stringify(text.toLowerCase())}, ${input}, ${focused})`;
};

export function clickPointExpr(text) {
  return driveInputPointExpr(text);
}

const SETTLE_EPSILON_PX = 0.5;
const SETTLE_SAMPLES = 3;
const SETTLE_INTERVAL_MS = 100;
const SETTLE_TIMEOUT_MS = 15_000;

export async function findClickPoint(session, text, options = {}) {
  const deadline = (options.now || Date.now)() + (options.timeoutMs || SETTLE_TIMEOUT_MS);
  let last = null;
  let stableRuns = 0;
  while ((options.now || Date.now)() < deadline) {
    const point = (await session.evaluate(driveInputPointExpr(text, options.input), { timeoutMs: Math.max(1, deadline - (options.now || Date.now)()) })) ?? null;
    if (
      point !== null &&
      last !== null &&
      Math.abs(point.x - last.x) <= SETTLE_EPSILON_PX &&
      Math.abs(point.y - last.y) <= SETTLE_EPSILON_PX
    ) {
      stableRuns += 1;
      if (stableRuns >= SETTLE_SAMPLES - 1) return point;
    } else {
      stableRuns = 0;
    }
    last = point;
    await (options.sleep || sleep)(SETTLE_INTERVAL_MS);
  }
  if (last === null) throw new Error('no actionable element matching "' + text + '"');
  throw new Error('element matching "' + text + '" did not settle');
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.JG_CHROME,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const c of candidates) {
    if (c !== undefined && c.length > 0 && existsSync(c)) return c;
  }
  // Playwright's bundled Chromium (also present in many CI/agent images).
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (existsSync(root)) {
    const direct = join(root, "chromium");
    if (existsSync(direct) && statSync(direct).isFile()) return direct;
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith("chromium")) continue;
      for (const c of [
        join(root, entry, "chrome-linux", "chrome"),
        join(root, entry, "chrome-linux", "headless_shell"),
      ]) {
        if (existsSync(c)) return c;
      }
    }
  }
  throw new Error("No Chrome/Chromium found. Install Chrome or set CHROME_PATH.");
}

export function launchChrome(port, prefix) {
  const chrome = findChrome();
  const userDataDir = join(tmpdir(), (prefix ?? "jg-shoot-") + process.pid + "-" + port);
  const child = spawn(
    chrome,
    [
      "--remote-debugging-port=" + port,
      "--user-data-dir=" + userDataDir,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--mute-audio",
      "--hide-scrollbars",
      // Software WebGL so the scene renders even with no GPU (headless/CI).
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return child;
}

export async function isUp(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return r.ok || r.status === 404; // a served-but-routed page still means Vite is up
  } catch {
    return false;
  }
}

export async function waitForDebugger(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch("http://127.0.0.1:" + port + "/json/version", { signal: AbortSignal.timeout(500) });
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  throw new Error("Chrome debugger never came up on port " + port);
}

/** Start the game's Vite dev server if nothing is already serving base. */
export async function ensureDevServer(base, port) {
  if (await isUp(base)) return null;
  const bin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  if (!existsSync(bin)) {
    throw new Error(
      "nothing is serving " + base + " and node_modules/.bin/vite is missing.\n" +
        "Start your dev server first (bun dev) or run 'bun install'.",
    );
  }
  const child = spawn(bin, ["--port", String(port), "--host", "127.0.0.1", "--strictPort"], {
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  for (let i = 0; i < 120; i += 1) {
    await sleep(500);
    if (await isUp(base)) return child;
  }
  child.kill();
  throw new Error("dev server failed to start on port " + port);
}

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      if (msg.id === undefined) return;
      const waiter = this.pending.get(msg.id);
      if (waiter === undefined) return;
      this.pending.delete(msg.id);
      clearTimeout(waiter.timer);
      if (msg.error !== undefined) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result ?? {});
    });
    ws.addEventListener("close", () => this.rejectPending("CDP connection closed"));
    ws.addEventListener("error", () => this.rejectPending("CDP connection error"));
  }

  static connect(url, timeoutMs) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        rej(new Error("CDP connect timeout"));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        res(new Cdp(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        rej(new Error("CDP connect error"));
      });
    });
  }

  send(method, params, timeoutMs = 30_000) {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error("CDP " + method + " timed out after " + timeoutMs + "ms"));
      }, timeoutMs);
      this.pending.set(id, { resolve: res, reject: rej, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        rej(error);
      }
    });
  }

  rejectPending(message) {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(message));
    }
    this.pending.clear();
  }

  async evaluate(expression, opts) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      ...(opts && opts.awaitPromise ? { awaitPromise: true } : {}),
    }, opts && opts.timeoutMs !== undefined ? opts.timeoutMs : 30_000);
    return result.result ? result.result.value : undefined;
  }

  close() {
    this.rejectPending("CDP session closed");
    this.ws.close();
  }
}

export async function openPage(debugPort) {
  for (const method of ["PUT", "GET"]) {
    try {
      const r = await fetch("http://127.0.0.1:" + debugPort + "/json/new?about:blank", {
        method,
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) {
        const info = await r.json();
        if (info.webSocketDebuggerUrl) return Cdp.connect(info.webSocketDebuggerUrl, 15_000);
      }
    } catch {
      /* try next */
    }
  }
  const list = await fetch("http://127.0.0.1:" + debugPort + "/json/list", { signal: AbortSignal.timeout(5000) });
  const pages = await list.json();
  const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
  if (!page) throw new Error("no CDP page target available");
  return Cdp.connect(page.webSocketDebuggerUrl, 15_000);
}

// Reads the honesty signals in one round-trip: the optional jgCapture handshake
// (set by some hosts) plus the live canvas element size + backing-store size.
export const HONESTY_EXPR =
  "(function(){var r=document.documentElement;var c=document.querySelector('canvas');" +
  "return {cap:r.dataset.jgCapture||null,err:r.dataset.jgCaptureError||null," +
  "hasCanvas:!!c,cw:c?c.clientWidth:0,ch:c?c.clientHeight:0,bw:c?c.width:0,bh:c?c.height:0};})()";
export const RAF_EXPR =
  "new Promise(function(res){requestAnimationFrame(function(){requestAnimationFrame(function(){res(1);});});})";

export function writePngAtomic(outPath, bytes) {
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = outPath + ".tmp";
  writeFileSync(tmp, bytes);
  if (existsSync(outPath)) unlinkSync(outPath);
  renameSync(tmp, outPath);
}

export async function waitForHonestFrame(session, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  let handshakeSeen = false;
  while (Date.now() < deadline) {
    const s = await session.evaluate(HONESTY_EXPR, { timeoutMs: Math.max(1, deadline - Date.now()) });
    last = s;
    if (s && s.cap !== null && s.cap !== undefined) handshakeSeen = true;
    if (s && s.cap === "error") throw new Error("page reported a capture error: " + (s.err || "unknown"));
    if (s && s.cap === "ready") return s;
    if (!handshakeSeen && s && s.hasCanvas && s.cw > 10 && s.ch > 10 && s.bw > 10 && s.bh > 10) return s;
    await sleep(100);
  }
  throw new Error(
    "timed out after " +
      Math.round(timeoutMs / 1000) +
      "s waiting for an honest frame at " +
      url +
      (handshakeSeen
        ? " — data-jg-capture stayed " + JSON.stringify(last && last.cap) + "; the page must report ready or error."
        : " — no sized <canvas> with a nonempty backing store (last: " + JSON.stringify(last) + "). Is the game being served there?"),
  );
}

/** Decode an 8-bit, non-interlaced PNG (what Page.captureScreenshot emits) into raw pixels. */
export function decodePng(bytes) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[9]] ?? 0;
      if (data[8] !== 8 || data[12] !== 0) channels = 0;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (channels === 0) return null;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? px[row + x - channels] : 0;
      const b = y > 0 ? px[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? px[row - stride + x - channels] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + x] = v & 255;
    }
  }
  return { width, height, channels, px };
}

// A viewport that is one flat fill (a canvas that never drew, a cleared background
// with nothing on it) has almost no luminance spread; any rendered scene has plenty.
export function isBlankFrame(pngBytes) {
  const image = decodePng(pngBytes);
  if (image === null || image.width === 0 || image.height === 0) return false;
  const { width, height, channels, px } = image;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64));
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * channels;
      const lum = channels >= 3 ? 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] : px[i];
      n += 1;
      sum += lum;
      sumSq += lum * lum;
    }
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean)) < 2;
}

/**
 * Capture the current frame to a PNG (atomic write). A blank viewport is retried for
 * up to blankWaitMs, then refused: nothing is written and the capture fails.
 */
export async function screenshotTo(session, outPath, blankWaitMs = 10_000, timeoutMs = 30_000) {
  const deadline = Date.now() + blankWaitMs;
  const captureDeadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() >= captureDeadline) throw new Error("Page.captureScreenshot timed out after " + timeoutMs + "ms");
    const shot = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    }, Math.max(1, captureDeadline - Date.now()));
    if (typeof shot.data !== "string" || shot.data.length === 0) {
      throw new Error("Page.captureScreenshot returned no data");
    }
    const bytes = Buffer.from(shot.data, "base64");
    if (!isBlankFrame(bytes)) {
      writePngAtomic(outPath, bytes);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        "viewport stayed one flat color for " +
          Math.round(blankWaitMs / 1000) +
          "s — the game drew nothing. Check the page console, or raise --settle if it loads slowly.",
      );
    }
    await sleep(500);
  }
}

/** Kill the launched Chrome and (when we started it) the dev server tree. */
export function shutdown(chrome, server) {
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
  if (server) {
    try {
      if (process.platform !== "win32" && server.pid) process.kill(-server.pid, "SIGKILL");
      else server.kill();
    } catch {
      /* ignore */
    }
  }
}
