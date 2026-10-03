import type { EnemyDef } from "./catalog";

export interface EnemyTactics {
  role: "rush" | "charge" | "skirmish" | "suppress" | "siege";
  windupMs: number;
  recoveryMs: number;
  burst: number;
  burstGapMs: number;
  counter: string;
}

const rush: EnemyTactics = {
  role: "rush", windupMs: 580, recoveryMs: 950, burst: 1, burstGapMs: 0,
  counter: "Leave the claw marker; fire while its arm resets.",
};
const whelp: EnemyTactics = { ...rush, windupMs: 460, recoveryMs: 800 };
const charge: EnemyTactics = {
  role: "charge", windupMs: 950, recoveryMs: 1700, burst: 1, burstGapMs: 0,
  counter: "Sidestep the charge lane; punish the stalled chassis.",
};
const skirmish: EnemyTactics = {
  role: "skirmish", windupMs: 850, recoveryMs: 1250, burst: 1, burstGapMs: 0,
  counter: "Strafe its locked shot or rush it out of its firing position.",
};
const suppress: EnemyTactics = {
  role: "suppress", windupMs: 1050, recoveryMs: 2300, burst: 3, burstGapMs: 220,
  counter: "Use cover during the burst; break its shield to interrupt, then rush the cooldown.",
};
const siege: EnemyTactics = {
  role: "siege", windupMs: 1500, recoveryMs: 2100, burst: 1, burstGapMs: 0,
  counter: "Leave the blast marker; attack while its launcher cools.",
};

export function enemyTactics(def: EnemyDef): EnemyTactics {
  switch (def.id) {
    case "marauder": case "captain_rusk": return skirmish;
    case "nomad": case "loader_war": case "foundry_heart": return siege;
    case "loader": case "elite_loader": return suppress;
    case "elite_husk": case "elite_ripper": case "wreck_maw": case "bruiser": return charge;
    case "ripper_pup": case "bruiser_brat": return whelp;
    default: return rush;
  }
}

export function enemyCounterHint(catalogId: string): string {
  return enemyTactics({ id: catalogId } as EnemyDef).counter;
}
