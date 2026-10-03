/** Repository capture fixture: real playable, public staging/diagnostics APIs, no authored writes. */
import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { CameraKeyframe } from "@jgengine/core/game/cameraConfig";
import { cloneEditorDocument } from "@jgengine/core/editor/document";
import { createSettingsStore, SETTING_IDS } from "@jgengine/core/settings/settingsModel";
import { snapshotDevtools } from "@jgengine/core/devtools/devtools";
import { GamePlayerShell } from "@jgengine/shell/GamePlayerShell";

import { game } from "../src/game.config";
import { editorLayers } from "../src/editorLayers";
import { lanternThemeStyle } from "../src/game/ui/theme";
import { launchHunterArrow } from "../src/game/combat/arrows";
import { spawnMobAt } from "../src/game/ai/mobs";
import { mobById } from "../src/game/entities/enemies/catalog";
import "../src/index.css";

// The same persisted player controls available through Settings; this fixture targets software GL.
const settings = createSettingsStore(localStorage);
settings.set(SETTING_IDS.graphicsQuality, "low");
settings.set(SETTING_IDS.graphicsRenderScale, 0.5);
settings.set(SETTING_IDS.graphicsShadows, false);
for (const id of [SETTING_IDS.graphicsPostAo, SETTING_IDS.graphicsPostBloom, SETTING_IDS.graphicsPostDof, SETTING_IDS.graphicsPostSmaa]) settings.set(id, false);

const views = {
  "Torch view": { position: { x: 7, y: 13, z: -293 }, lookAt: { x: -1, y: 10, z: -303.7 } },
  "Funnel view": { position: { x: 67, y: 14, z: 54 }, lookAt: { x: 60, y: 12.1556, z: 45 } },
  "Bird habitat view": { position: { x: 18, y: 19, z: -253 }, lookAt: { x: 12, y: 16, z: -270 } },
} as const;

function frame(ctx: GameContext, view: CameraKeyframe) {
  // A one-keyframe runtime cinematic completes immediately; a repeated loop holds this framing.
  ctx.camera.setCinematic({ keyframes: [view, { ...view, duration: 1 }], loop: true });
}

function CaptureApp() {
  const [ctx, setContext] = useState<GameContext | null>(null);
  const [metrics, setMetrics] = useState("");
  const [mounted, setMounted] = useState(true);
  const [error, setError] = useState("");
  const [flightInspection, setFlightInspection] = useState("");
  const lastContext = useRef<GameContext | null>(null);
  const inspectionStage = useRef<(() => void) | null>(null);
  const stagedTarget = useRef<string | null>(null);
  const ready = useCallback((context: GameContext) => {
    lastContext.current = context;
    void (async () => {
      await context.game.commands.run("class.select", { classId: "warrior", name: "Surveyor" });
      await context.game.commands.run("cinematic.skip", {});
      frame(context, views["Torch view"]);
      setContext(context);
    })().catch(reason => setError(String(reason)));
  }, []);
  return <div className="lantern-game" style={lanternThemeStyle}>
    {mounted ? <GamePlayerShell playable={game} onContextReady={ready} /> : null}
    <aside style={{ position: "fixed", top: 112, left: 14, zIndex: 100, background: "#102619dd", padding: 10, color: "#f3dfa4", font: "12px system-ui" }}>
      <p>Authored environment capture · low quality / 0.5 render scale / no shadows</p>
      {Object.entries(views).map(([label, view]) => <button type="button" key={label} disabled={ctx === null} onClick={() => frame(ctx!, view)} style={{ marginRight: 8, padding: "4px 8px", border: "1px solid #f3dfa4" }}>{label}</button>)}
      <button type="button" disabled={ctx === null} onClick={() => {
        if (ctx === null || ctx.scene.entity.activeProjectiles().length > 0 || inspectionStage.current !== null) return;
        const actor = ctx.scene.entity.get(ctx.player.userId);
        if (actor === null) return;
        if (stagedTarget.current === null) stagedTarget.current = spawnMobAt(ctx, mobById("forest_wolf")!, [actor.position[0] + 16, actor.position[2]], 1, { noRespawn: true });
        const launched = launchHunterArrow(ctx, ctx.player.userId, stagedTarget.current, 24, false);
        if (!launched) return;
        let elapsed = 0;
        inspectionStage.current = ctx.sim.addStage({ id: "capture-arrow-inspection", phase: "afterTick", run(_dt, _tick, gameDt) {
          elapsed += gameDt;
          const flight = ctx.scene.entity.activeProjectiles()[0];
          if (elapsed < 0.2 || flight === undefined) return;
          ctx.time.pause();
          const [x, y, z] = flight.position;
          frame(ctx, { position: { x: x + 0.3, y: y + 0.5, z: z + 3 }, lookAt: { x, y, z } });
          setFlightInspection(`Staged flight paused after ${elapsed.toFixed(2)} game seconds at ${flight.position.map(value => value.toFixed(2)).join(", ")}. Production ability progression is unchanged.`);
          inspectionStage.current?.();
          inspectionStage.current = null;
        } });
        ctx.time.play();
      }}>Stage arrow flight</button>
      <button type="button" disabled={ctx === null} onClick={() => ctx!.time.play()}>Resume staged flight</button>
      {flightInspection === "" ? null : <p>{flightInspection}</p>}
      <button type="button" disabled={ctx === null} onClick={() => {
        const document = cloneEditorDocument(editorLayers);
        document.simulation!.emitters = [];
        ctx!.environment.retune(document);
      }}>Retire cosmetic emitters</button>
      <button type="button" onClick={() => {
        const previous = lastContext.current;
        setMetrics(JSON.stringify({
          mounted,
          diagnostics: snapshotDevtools(),
          watchedSurfaces: previous?.environment.snapshot().watched.length ?? 0,
          flockHabitats: previous?.environment.flocks().length ?? 0,
          namedEmitters: previous?.particles.emitters().length ?? 0,
        }));
        if (!mounted) lastContext.current = null;
      }}>Read capture metrics</button>
      <button type="button" onClick={() => { inspectionStage.current?.(); inspectionStage.current = null; setMounted(false); setContext(null); }}>Unload captured game</button>
      <details><summary>Capture metrics</summary><output data-capture-metrics style={{ display: "block", maxHeight: 160, maxWidth: 560, overflow: "auto", wordBreak: "break-all" }}>{metrics}</output></details>
      {error === "" ? null : <p role="alert">{error}</p>}
    </aside>
  </div>;
}

const root = document.getElementById("root");
if (root === null) throw new Error("Missing capture mount");
createRoot(root).render(<CaptureApp />);
