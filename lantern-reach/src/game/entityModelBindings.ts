import type { ModelAnimationConfig } from "@jgengine/core/game/playableGame";

export const CREATURE_ANIMATIONS: Record<string, ModelAnimationConfig> = {
  wild_boar: {
    states: { idle: "Idle1", walk: "Walk_AnimalArmature", run: "Gallop_AnimalArmature", runSpeed: 6 },
    oneShots: { death: "Dying" },
  },
};
