#!/usr/bin/env node
/**
 * shoot.mjs — dependency-free WebGL/R3F screenshot for this JGengine game.
 *
 * Why this exists: generic "screenshot this tab" tools routinely fail on a
 * WebGL canvas. They grab a frame before the GPU has drawn, and
 * React-Three-Fiber's canvas stays stuck at its 300x150 default whenever its
 * parent never reports a real size. This script drives your own Vite dev
 * server through Chrome's DevTools Protocol instead: it forces a real viewport
 * (so the canvas sizes correctly), waits for an honestly-painted frame, then
 * pulls pixels with Page.captureScreenshot. No Playwright, no npm deps — just
 * Chrome/Chromium + Node 22+ (or Bun).
 *
 *   node scripts/shoot.mjs                          # 1600x900 -> shots/shot.png
 *   node scripts/shoot.mjs --device mobile          # 390x844
 *   node scripts/shoot.mjs --out shots/hud.png --settle 1500
 *   node scripts/shoot.mjs --url http://127.0.0.1:5173/?mode=editor
 *
 * Runs under 'bun scripts/shoot.mjs' too. If Chrome is not auto-detected, set
 * CHROME_PATH. The dev server is started for you when it is not already up.
 * To drive the game (clicks, key holds, RPC, playtest), use scripts/drive.mjs.
 */
import { join, resolve } from "node:path";
import {
  DEVICES,
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
  "shoot.mjs — screenshot this JGengine game (WebGL-safe, dependency-free)",
  "",
  "  --url <url>       page to capture (default http://127.0.0.1:<port>)",
  "  --port <n>        dev-server port to use/start (default 5173)",
  "  --device <name>   desktop | mobile | mobile-landscape (default desktop)",
  "  --width <n>       viewport width override",
  "  --height <n>      viewport height override",
  "  --out <path>      output PNG (default shots/shot.png)",
  "  --settle <ms>     extra wait after first honest frame (default 2000)",
  "  --timeout <s>     readiness/capture timeout in seconds (default 60)",
  "  --help            show this text",
  "",
  "Needs Chrome/Chromium (set CHROME_PATH if not auto-detected).",
  "To play/test the game from the CLI, see scripts/drive.mjs (bun run drive).",
].join("\n");

function parseArgs(argv) {
  const args = {
    url: undefined,
    port: 5173,
    device: "desktop",
    width: undefined,
    height: undefined,
    out: undefined,
    settle: 2000,
    timeoutMs: 60_000,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--url") args.url = argv[++i];
    else if (v === "--port") args.port = Number(argv[++i]);
    else if (v === "--device") args.device = argv[++i];
    else if (v === "--width") args.width = Number(argv[++i]);
    else if (v === "--height") args.height = Number(argv[++i]);
    else if (v === "--out") args.out = argv[++i];
    else if (v === "--settle") args.settle = Number(argv[++i]);
    else if (v === "--timeout") args.timeoutMs = Number(argv[++i]) * 1000;
    else if (v === "--help" || v === "-h") args.help = true;
    else throw new Error("unknown argument: " + v);
  }
  if (!DEVICES[args.device]) {
    throw new Error("--device must be desktop, mobile, or mobile-landscape (got " + args.device + ")");
  }
  return args;
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
  target.searchParams.set("capture", "1"); // honored by hosts that set data-jg-capture; ignored otherwise
  const url = target.toString();
  const outPath = resolve(args.out ?? join("shots", "shot.png"));

  const server = await ensureDevServer(args.url ?? base, args.port);
  const debugPort = 9200 + Math.floor(Date.now() % 700);
  const chrome = launchChrome(debugPort, "jg-shoot-");

  let exitCode = 0;
  try {
    await waitForDebugger(debugPort, 30_000);
    const session = await openPage(debugPort);
    try {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      // The fix for R3F's 300x150 default: give the page a real viewport BEFORE it lays out.
      await emulateDevice(session, profile, width, height);
      await session.send("Page.navigate", { url });
      const frame = await waitForHonestFrame(session, url, args.timeoutMs);
      if (frame && frame.bw === 300 && frame.bh === 150) {
        console.error(
          "shoot: warning — canvas backing store is 300x150 (React-Three-Fiber's unsized default). " +
            "Its parent has no real size; ensure html/body/#root have height:100%.",
        );
      }
      // Let the scene paint a couple of frames, then settle for late assets.
      await session.evaluate(RAF_EXPR, { awaitPromise: true });
      await sleep(Number.isFinite(args.settle) ? args.settle : 2000);
      await screenshotTo(session, outPath, 10_000, args.timeoutMs);
      console.log(outPath + " (" + width + "x" + height + " " + args.device + ")");
    } finally {
      session.close();
    }
  } catch (error) {
    exitCode = 1;
    console.error("shoot: " + (error instanceof Error ? error.message : String(error)));
  } finally {
    shutdown(chrome, server);
  }
  return exitCode;
}

try {
  process.exit(await main());
} catch (error) {
  console.error("shoot: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
