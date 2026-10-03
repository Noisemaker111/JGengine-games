import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  throttle: ["KeyW", "ArrowUp", "pad:7"],
  brake: ["KeyS", "ArrowDown", "pad:6"],
  steerLeft: ["KeyA", "ArrowLeft", "padaxis:0-"],
  steerRight: ["KeyD", "ArrowRight", "padaxis:0+"],
  jumpHop: ["Space", "pad:0"],
  plowBrace: ["ShiftLeft", "ShiftRight", "pad:4"],
  restart: ["KeyR", "pad:3"],
  startRun: ["Enter", "pad:9"],
  pauseRun: ["KeyP", "pad:8"],
  keepEngine: ["KeyX", "pad:2"],
};
