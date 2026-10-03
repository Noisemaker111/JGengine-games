import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { surveyProbe } from "./survey";

export function CaptureDiagnostics({ ctx }: WorldOverlayProps) {
  const gl = useThree((state) => state.gl);
  const loading = useProgress((state) => state.active);
  const enabled = new URLSearchParams(window.location.search).get("capture") === "1";
  const ready = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const read = () => surveyProbe(ctx);
    const host = window as typeof window & { __jgProbe?: () => Record<string, number> };
    const unregister = devtools.probes.register("field-station", read);
    // Remove this capture-only fallback after the coordinator's shell #1911 package adoption.
    if (host.__jgProbe === undefined) host.__jgProbe = read;
    return () => {
      unregister();
      if (host.__jgProbe === read) delete host.__jgProbe;
      if (ready.current) delete document.documentElement.dataset.jgCapture;
    };
  }, [ctx, enabled]);
  useFrame(() => {
    if (!enabled || loading || ready.current || gl.info.render.frame < 2 || gl.info.render.triangles <= 0) return;
    ready.current = true;
    document.documentElement.dataset.jgCapture = "ready";
  // Read the completed render before the published devtools probe resets counters at -10.
  }, -11);
  return null;
}
