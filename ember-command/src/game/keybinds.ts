import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

/** RTS command-card bindings, laid out to match the console grid (1 2 3 R · B G T F · Z X C V). No
 * movement actions are bound — there is no avatar; the "rts" camera rig owns WASD/arrow panning,
 * edge-scroll, and zoom. */
export const keybinds: ActionCodesMap = {
  // Recruit
  trainPeasant: ["Digit1"],
  trainFootman: ["Digit2"],
  trainRifleman: ["Digit3"],
  attackMove: ["KeyR"],
  // Construct
  buildBarracks: ["KeyB"],
  buildFarm: ["KeyG"],
  buildTower: ["KeyT"],
  rally: ["KeyF"],
  hold: ["KeyV"],
  // Powers
  researchWeapons: ["KeyZ"],
  researchArmor: ["KeyX"],
  heroAbility: ["KeyC"],
};
