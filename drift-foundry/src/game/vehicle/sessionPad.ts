import { resolveGamepadFrame, type GamepadSnapshot, type GamepadCode, type GamepadBindings } from "@jgengine/core/input/gamepadModel";
import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

const actions = ["startRun", "restart", "pauseRun", "keepEngine"] as const;
export type SessionPadAction = typeof actions[number];

/** Menu edges must remain available while the shell correctly gates driving. */
export function createSessionPad() {
  let held = new Set<string>();
  return (pads: ArrayLike<Gamepad | GamepadSnapshot | null>, codes: ActionCodesMap): SessionPadAction[] => {
    const bindings: GamepadBindings = {};
    for (const action of actions) {
      const config = codes[action];
      const modes = config as { hold?: readonly string[]; toggle?: readonly string[] } | undefined;
      const list: readonly string[] = Array.isArray(config) ? config : [...(modes?.hold ?? []), ...(modes?.toggle ?? [])];
      bindings[action] = list.filter((code): code is GamepadCode => /^pad:\d+$|^padaxis:\d+[+-]$/.test(code));
    }
    const next = new Set<string>();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad?.connected) continue;
      const snapshot: GamepadSnapshot = { id: pad.id, connected: true, axes: [...pad.axes], buttons: [...pad.buttons] };
      for (const action of resolveGamepadFrame(snapshot, bindings, { deadzone: { kind: "axial", inner: .12, outer: .95 } }).held) next.add(action);
    }
    const pressed = actions.filter(action => next.has(action) && !held.has(action));
    held = next;
    return pressed;
  };
}
