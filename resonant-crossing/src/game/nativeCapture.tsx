import { useEffect, useRef } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { controlledHero } from "./runtime";
import { DIR_ORDER } from "./types";
import { duetStore } from "./stores";

export function readDuetProbe(ctx: GameContext): Record<string, number> {
  const state = duetStore.read(ctx);
  const lumen = ctx.scene.entity.get("lumen"), anchor = ctx.scene.entity.get("anchor");
  const active = controlledHero(ctx, ctx.player.userId);
  return {
    room: state.roomIndex,
    status: ({ ready: 0, playing: 1, paused: 2, solved: 3, complete: 4 })[state.status],
    controlledHero: active === "lumen" ? 1 : active === "anchor" ? 2 : 0,
    ownedHeroes: ctx.player.possession.listOwned(ctx.player.userId).filter(id => id === "lumen" || id === "anchor").length,
    lumenX: lumen?.position[0] ?? 0, lumenZ: lumen?.position[2] ?? 0,
    anchorX: anchor?.position[0] ?? 0, anchorZ: anchor?.position[2] ?? 0,
    gates: state.openGates.length, relays: state.latch.completedRelays?.length ?? 0,
    recoveries: state.recoveries, exits: state.exits.length,
    weight: state.latch.anchorCell === null ? 0 : 1,
    weightX: state.latch.anchorCell?.x ?? 0, weightZ: state.latch.anchorCell?.z ?? 0,
    prism: state.latch.prism === null ? 0 : 1,
    prismX: state.latch.prism?.cell.x ?? 0, prismZ: state.latch.prism?.cell.z ?? 0,
    prismDirection: state.latch.prism === null ? -1 : DIR_ORDER.indexOf(state.latch.prism.dir),
    callouts: state.callout?.sequence ?? 0,
  };
}

/** Native capture handshake while the published shell awaits the shared readiness fix (#1825). */
export function NativeCapture() {
  const ctx = useGameContext();
  const status = useStore(duetStore, state => state.status);
  const gl = useThree(state => state.gl);
  const size = useThree(state => state.size);
  const frames = useRef(0);
  useEffect(() => {
    document.documentElement.dataset.jgCapture = "preparing";
    const target = window as typeof window & { __jgProbe?: () => Record<string, number> };
    target.__jgProbe = () => readDuetProbe(ctx);
    return () => {
      delete target.__jgProbe;
      delete document.documentElement.dataset.jgCapture;
    };
  }, [ctx]);
  useEffect(() => {
    if (status !== "playing") return;
    const frame = requestAnimationFrame(() => gl.domElement.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [gl, status]);
  useEffect(() => addAfterEffect(() => {
    if (document.documentElement.dataset.jgCapture === "error") return;
    if (gl.getContext().isContextLost()) {
      document.documentElement.dataset.jgCapture = "error";
      document.documentElement.dataset.jgCaptureError = "Resonant Crossing lost its WebGL context.";
      return;
    }
    if (size.width < 200 || size.height < 200 || gl.info.render.calls === 0 ||
      ctx.scene.entity.get("lumen") === null || ctx.scene.entity.get("anchor") === null) {
      frames.current = 0;
      document.documentElement.dataset.jgCapture = "preparing";
      return;
    }
    if (++frames.current >= 2) document.documentElement.dataset.jgCapture = "ready";
  }), [ctx, gl, size]);
  return null;
}
