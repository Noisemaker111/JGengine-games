import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  crouch: { hold: ["KeyC"] },
  interact: ["KeyE"],
  // Keyboard alternatives remain usable on published shell 0.18.1, whose
  // primary-click fallback fires but does not feed held mouse action edges.
  fire: { hold: ["mouse0", "KeyF"], repeatMs: 30 },
  aim: { hold: ["mouse2", "KeyV"] },
  reload: ["KeyR"],
  throwGrenade: ["KeyG"],
  useHealthVial: ["KeyQ"],
  selectSlot1: ["Digit1"],
  selectSlot2: ["Digit2"],
  selectSlot3: ["Digit3"],
  selectSlot4: ["Digit4"],
  openSkills: ["KeyK"],
};
