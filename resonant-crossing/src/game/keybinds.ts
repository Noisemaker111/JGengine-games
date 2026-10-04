import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  "duet.north": ["KeyW", "ArrowUp"],
  "duet.south": ["KeyS", "ArrowDown"],
  "duet.west": ["KeyA", "ArrowLeft"],
  "duet.east": ["KeyD", "ArrowRight"],
  swap: ["KeyQ", "ShiftLeft"],
  ability: ["KeyE", "Space"],
  reset: ["KeyR"],
};
