import { useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { modelLoadIdleMs } from "@jgengine/shell/render/modelLoad";
import { textureErrorsSnapshot } from "@jgengine/core/devtools/textureErrors";

export function CaptureReadiness(): null {
  const scene = useThree(state => state.scene);
  const progress = useProgress();
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const errors = progress.errors.join("\n");
  useEffect(() => {
    if (errors) console.error("Odd Orbit capture blocked by asset loading errors:", errors);
  }, [errors]);
  useEffect(() => {
    delete document.documentElement.dataset.jgCapture;
    const previous = scene.onAfterRender;
    let settledFrames = 0;
    let lastFrame = -1;
    const afterRender: typeof scene.onAfterRender = function (...args) {
      previous.apply(scene, args);
      const renderer = args[0];
      const loading = progressRef.current;
      if (loading.active || loading.errors.length > 0 || loading.loaded < loading.total || modelLoadIdleMs() === 0 || textureErrorsSnapshot().length > 0 || renderer.info.render.calls === 0) {
        settledFrames = 0;
        delete document.documentElement.dataset.jgCapture;
        return;
      }
      if (renderer.info.render.frame === lastFrame) return;
      lastFrame = renderer.info.render.frame;
      settledFrames += 1;
      if (settledFrames >= 2) document.documentElement.dataset.jgCapture = "ready";
    };
    scene.onAfterRender = afterRender;
    return () => {
      if (scene.onAfterRender === afterRender) scene.onAfterRender = previous;
      delete document.documentElement.dataset.jgCapture;
    };
  }, [scene]);
  return null;
}
