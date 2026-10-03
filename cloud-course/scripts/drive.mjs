#!/usr/bin/env node
/**
 * drive.mjs — play and test this JGengine game from the CLI: ordered clicks,
 * key holds, waits, screenshots, agent-bridge RPC, and a bot-playtest
 * softlock verdict. Dependency-free (Chrome/Chromium + Node 22+ or Bun) — the
 * supported way to drive a running game headlessly. Never hand-roll a
 * Playwright/Puppeteer/CDP script for this game; whatever that script would
 * do, a drive invocation (or an engine issue) is the answer.
 *
 *   node scripts/drive.mjs --click "START" --shot menu-cleared
 *   node scripts/drive.mjs --key KeyW:2500 --shot walked
 *   node scripts/drive.mjs --rpc '{"method":"agent_status"}'
 *   node scripts/drive.mjs --rpc '{"method":"debug_snapshot"}'
 *   node scripts/drive.mjs --playtest --key KeyW:4000 --strict
 *
 * The dev server is started for you when it is not already up. RPC talks to
 * window.__jgengineAgent — agent_status, debug_snapshot, editor verbs — on the
 * running page. --playtest samples the game's capture.probe metrics while your
 * --key steps drive input and prints a JSON progress/softlock verdict.
 */
import { join, resolve } from "node:path";
import {
  DEVICES,
  findClickPoint,
  driveInputPointExpr,
  emulateDevice,
  ensureDevServer,
  launchChrome,
  openPage,
  RAF_EXPR,
  screenshotTo,
  shutdown,
  sleep,
  waitForDebugger,
  waitForHonestFrame,
} from "./browser.mjs";

const HELP = [
  "drive.mjs — play/test this JGengine game from the CLI (WebGL-safe, dependency-free)",
  "",
  "Steps run in the order given:",
  '  --click "<text>"    scroll to and click actionable text (case-insensitive)',
  '  --double-click "<text>"  double-click actionable text',
  '  --fill "<label>=<value>" replace a text field by its accessible label',
  "  --key <CODE:ms>     hold a key (e.g. KeyW:2500) for the given milliseconds",
  "  --wait <ms>         pause before the next step",
  "  --shot <name>       screenshot to shots/<name>.png (default step if none given)",
  "  --rpc <json>        call the page's agent/editor bridge with this JSON payload",
  "",
  "Session:",
  "  --url <url>         page to drive (default http://127.0.0.1:<port>)",
  "  --port <n>          dev-server port to use/start (default 5173)",
  "  --device <name>     desktop | mobile | mobile-landscape (default desktop)",
  "  --width/--height    viewport overrides",
  "  --timeout <s>       readiness/capture timeout in seconds (default 60)",
  "",
  "Playtest (softlock/progress rung — game must expose capture.probe):",
  "  --playtest          sample probe metrics while steps run; print JSON verdict",
  "  --strict            exit nonzero on a softlock or missing probe",
  "  --seed <n>          forwarded as ?seed=n and echoed (default 1)",
  "  --sample <ms>       probe sampling interval (default 250)",
  "  --softlock <ms>     flat-progress span under input that counts as a softlock (default 2000)",
  "  --epsilon <n>       smallest metric change that counts as progress (default 0.001)",
  "  --help              show this text",
  "",
  "Needs Chrome/Chromium (set CHROME_PATH if not auto-detected).",
].join("\n");

const parseDriveFill = function parseDriveFill(spec) {
  const split = spec?.indexOf("=") ?? -1;
  if (spec === void 0 || split <= 0 || spec.startsWith("--") || spec.slice(0, split).trim() === "")
    throw Error('--fill expects "<accessible label>=<value>"');
  return { label: spec.slice(0, split), value: spec.slice(split + 1) };
};

function parseArgs(argv) {
  const args = {
    url: undefined,
    port: 5173,
    device: "desktop",
    width: undefined,
    height: undefined,
    timeoutMs: 60_000,
    steps: [],
    playtest: false,
    strict: false,
    seed: 1,
    sampleMs: 250,
    softlockMs: 2000,
    epsilon: 1e-3,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--url") args.url = argv[++i];
    else if (v === "--port") args.port = Number(argv[++i]);
    else if (v === "--device") args.device = argv[++i];
    else if (v === "--width") args.width = Number(argv[++i]);
    else if (v === "--height") args.height = Number(argv[++i]);
    else if (v === "--timeout") args.timeoutMs = Number(argv[++i]) * 1000;
    else if (v === "--click" || v === "--double-click") {
      const text = argv[++i];
      if (!text || text.startsWith("--")) throw new Error(v + " requires target text");
      args.steps.push({ kind: v === "--click" ? "click" : "double-click", text });
    }
    else if (v === "--fill") args.steps.push({ kind: "fill", ...parseDriveFill(argv[++i]) });
    else if (v === "--wait") args.steps.push({ kind: "wait", ms: Number(argv[++i] ?? 500) });
    else if (v === "--key") {
      const spec = argv[++i] ?? "KeyW:1000";
      const colon = spec.lastIndexOf(":");
      const code = colon > 0 ? spec.slice(0, colon) : spec;
      const holdMs = colon > 0 ? Number(spec.slice(colon + 1)) : 1000;
      args.steps.push({ kind: "key", code, holdMs });
    } else if (v === "--shot") args.steps.push({ kind: "shot", name: argv[++i] ?? "drive" });
    else if (v === "--rpc") args.steps.push({ kind: "rpc", json: argv[++i] ?? "{}" });
    else if (v === "--playtest") args.playtest = true;
    else if (v === "--strict") args.strict = true;
    else if (v === "--seed") args.seed = Number(argv[++i] ?? args.seed);
    else if (v === "--sample") args.sampleMs = Number(argv[++i] ?? args.sampleMs);
    else if (v === "--softlock") args.softlockMs = Number(argv[++i] ?? args.softlockMs);
    else if (v === "--epsilon") args.epsilon = Number(argv[++i] ?? args.epsilon);
    else if (v === "--help" || v === "-h") args.help = true;
    else throw new Error("unknown argument: " + v);
  }
  if (!DEVICES[args.device]) {
    throw new Error("--device must be desktop, mobile, or mobile-landscape (got " + args.device + ")");
  }
  if (!args.help && !args.playtest && !args.steps.some((s) => s.kind === "shot" || s.kind === "rpc")) {
    args.steps.push({ kind: "shot", name: "drive" });
  }
  return args;
}

async function click(session, text, count = 1, input = false) {
  await session.send("Page.bringToFront");
  const point = await findClickPoint(session, text, { input });
  for (let clickCount = 1; clickCount <= count; clickCount += 1) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await session.send("Input.dispatchMouseEvent", {
        type, x: point.x, y: point.y, button: "left", clickCount,
      });
    }
  }
}

async function fill(session, label, value) {
  await click(session, label, 1, true);
  if (!await session.evaluate(driveInputPointExpr(label, true, true))) {
    throw new Error('text field "' + label + '" did not receive focus');
  }
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, commands: ["selectAll"] });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  if (value) await session.send("Input.insertText", { text: value });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
}

async function holdKey(session, code, holdMs) {
  const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", code, key });
  await sleep(holdMs);
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", code, key });
}

async function rpc(session, json) {
  JSON.parse(json); // fail fast on malformed payloads, before touching the page
  const value = await session.evaluate(
    "(async function(){var host=globalThis.__jgengineAgent||globalThis.__jgengineEditorHost;" +
      "if(host===undefined)return JSON.stringify({ok:false,error:'no agent bridge or editor host on this page'});" +
      "return JSON.stringify(await host.handle(" + json + "));})()",
    { awaitPromise: true },
  );
  console.log(value ?? JSON.stringify({ ok: false, error: "rpc evaluation returned nothing" }));
}

async function readProbe(session) {
  const value = await session.evaluate(
    "(function(){var probe=globalThis.__jgProbe;" +
      "if(typeof probe!=='function')return null;" +
      "try{var v=probe();if(v===null||typeof v!=='object')return null;" +
      "var out={};for(var k in v){var n=v[k];if(typeof n==='number'&&isFinite(n))out[k]=n;}return out;}" +
      "catch(e){return null;}})()",
  );
  return value ?? null;
}

// Playtest verdict logic, mirroring the engine's playtest rung: progress is any
// probe metric moving beyond epsilon; a span where every metric stays flat
// longer than the softlock threshold, while input is driven, is a softlock.
function metricKeys(samples) {
  const keys = new Set();
  for (const sample of samples) {
    for (const key of Object.keys(sample.metrics)) keys.add(key);
  }
  return [...keys];
}

function progressDelta(samples) {
  const out = {};
  for (const key of metricKeys(samples)) {
    let first;
    let last;
    for (const sample of samples) {
      const value = sample.metrics[key];
      if (value === undefined) continue;
      if (first === undefined) first = value;
      last = value;
    }
    if (first !== undefined && last !== undefined) out[key] = last - first;
  }
  return out;
}

// Longest contiguous span (ms) where every metric's range stays within epsilon.
// A bot that circles back to its start still shows a wide range and reads as
// moving; only a genuinely stuck loop stays flat.
function longestFlatWindowMs(samples, epsilon) {
  if (samples.length < 2) return 0;
  const keys = metricKeys(samples);
  let best = 0;
  for (let start = 0; start < samples.length; start += 1) {
    const min = {};
    const max = {};
    for (let end = start; end < samples.length; end += 1) {
      const metrics = samples[end].metrics;
      for (const key of keys) {
        const value = metrics[key];
        if (value === undefined) continue;
        min[key] = key in min ? Math.min(min[key], value) : value;
        max[key] = key in max ? Math.max(max[key], value) : value;
      }
      let flat = true;
      for (const key of Object.keys(max)) {
        if (max[key] - min[key] > epsilon) {
          flat = false;
          break;
        }
      }
      if (!flat) break;
      const span = samples[end].t - samples[start].t;
      if (span > best) best = span;
    }
  }
  return best;
}

function summarizePlaytest(samples, options) {
  const probed = samples.length > 0;
  const delta = progressDelta(samples);
  const totalProgress = Object.values(delta).reduce((sum, value) => sum + Math.abs(value), 0);
  const softlockWindowMs = longestFlatWindowMs(samples, options.epsilon);
  const durationMs = probed ? samples[samples.length - 1].t - samples[0].t : 0;
  const softlocked =
    probed && durationMs >= options.softlockThresholdMs && softlockWindowMs >= options.softlockThresholdMs;
  return {
    seed: options.seed,
    framesElapsed: samples.length,
    durationMs,
    progressDelta: delta,
    totalProgress,
    softlockWindowMs,
    softlocked,
    probed,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const profile = DEVICES[args.device];
  const width = Number.isFinite(args.width) ? args.width : profile.width;
  const height = Number.isFinite(args.height) ? args.height : profile.height;
  const base = "http://127.0.0.1:" + args.port;
  const target = new URL(args.url ?? base);
  target.searchParams.set("capture", "1");
  if (args.playtest) target.searchParams.set("seed", String(args.seed));
  const url = target.toString();

  const server = await ensureDevServer(args.url ?? base, args.port);
  const debugPort = 9200 + Math.floor(Date.now() % 700);
  const chrome = launchChrome(debugPort, "jg-drive-");

  let exitCode = 0;
  try {
    await waitForDebugger(debugPort, 30_000);
    const session = await openPage(debugPort);
    try {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await emulateDevice(session, profile, width, height);
      await session.send("Page.navigate", { url });
      await waitForHonestFrame(session, url, args.timeoutMs);
      await session.evaluate(RAF_EXPR, { awaitPromise: true });
      await sleep(500);

      const samples = [];
      let sampling = args.playtest;
      const sampleStart = Date.now();
      const sampler = args.playtest
        ? (async () => {
            while (sampling) {
              const metrics = await readProbe(session);
              if (metrics !== null) samples.push({ t: Date.now() - sampleStart, metrics });
              await sleep(args.sampleMs);
            }
          })()
        : Promise.resolve();

      for (const step of args.steps) {
        if (step.kind === "click" || step.kind === "double-click") await click(session, step.text, step.kind === "double-click" ? 2 : 1);
        else if (step.kind === "fill") await fill(session, step.label, step.value);
        else if (step.kind === "key") await holdKey(session, step.code, step.holdMs);
        else if (step.kind === "wait") await sleep(step.ms);
        else if (step.kind === "rpc") await rpc(session, step.json);
        else {
          const outPath = resolve(join("shots", step.name + ".png"));
          await screenshotTo(session, outPath, 10_000, args.timeoutMs);
          console.log(outPath);
        }
      }

      if (args.playtest) {
        sampling = false;
        await sampler;
        const result = summarizePlaytest(samples, {
          seed: args.seed,
          softlockThresholdMs: args.softlockMs,
          epsilon: args.epsilon,
        });
        console.log(JSON.stringify(result));
        if (!result.probed) {
          console.error(
            "drive: no progress probe read — this game exposes no capture.probe (or it returned no metrics). " +
              "Declare capture.probe in defineGame to run the playtest rung.",
          );
          if (args.strict) exitCode = 1;
        } else if (result.softlocked) {
          console.error(
            "drive: SOFTLOCK — progress stayed flat for " + result.softlockWindowMs + "ms under active input " +
              "(threshold " + args.softlockMs + "ms, seed " + args.seed + "). The loop did not advance.",
          );
          if (args.strict) exitCode = 1;
        } else if (args.steps.every((step) => step.kind !== "key")) {
          console.error("drive: --playtest ran with no --key hold — nothing drove input, so progress is unproven.");
        }
      }
    } finally {
      session.close();
    }
  } catch (error) {
    exitCode = 1;
    console.error("drive: " + (error instanceof Error ? error.message : String(error)));
  } finally {
    shutdown(chrome, server);
  }
  return exitCode;
}

try {
  process.exit(await main());
} catch (error) {
  console.error("drive: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
