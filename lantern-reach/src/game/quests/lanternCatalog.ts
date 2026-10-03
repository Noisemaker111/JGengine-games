import type { QuestDef } from "@jgengine/core/game/quest";

export const LANTERN_ACCOUNTS = "q_lantern_accounts";
export const LANTERN_WATCH = "q_lantern_watch";
export const LANTERN_CLINIC = "q_lantern_clinic";
export const ROAD_CLEAR = "eastbrook-road-clear";

export const LANTERN_QUESTS: readonly QuestDef[] = [
  {
    id: LANTERN_ACCOUNTS,
    title: "Last Light on the Road",
    description:
      "Eastbrook has one sealed tin of lantern oil. Redbrook needs road lamps; Lin needs warmth for the wounded. Hear Caravan Hand Doss and Apothecary Lin before promising it to either. Return to Redbrook with both accounts.",
    giver: "marshal_redbrook",
    turnIn: "marshal_redbrook",
    objectives: [
      { id: "doss", kind: "talk", target: "wilkes_hand", count: 1 },
      { id: "lin", kind: "talk", target: "apothecary_lin", count: 1 },
    ],
    rewards: { xp: { amount: 50 } },
  },
  {
    id: LANTERN_WATCH,
    title: "A Light for the Watch",
    description:
      "You promised the oil to Redbrook's road lamps. Lin will keep the wounded warm by hand. Patrol the north road: defeat three Forest Wolves, then return to Redbrook. The patrol opens the Old Wolf and Bandits of the Vale bounties earlier.",
    giver: "marshal_redbrook",
    turnIn: "marshal_redbrook",
    requires: [LANTERN_ACCOUNTS],
    objectives: [
      { id: "wolves", kind: "kill", target: "forest_wolf", count: 3 },
    ],
    rewards: {
      xp: { amount: 170 },
      economy: { copper: 30 },
      unlocks: [ROAD_CLEAR],
    },
  },
  {
    id: LANTERN_CLINIC,
    title: "A Light for the Living",
    description:
      "You promised the oil to Lin's clinic. Redbrook must hold the unlit road with soldiers. Bring Lin two Cottage Loaves from your own supplies. Her clinic will reserve two healing potions for you, collected separately when you need them. Road bounties still require Wolves at the Door.",
    giver: "apothecary_lin",
    turnIn: "apothecary_lin",
    requires: [LANTERN_ACCOUNTS],
    objectives: [
      { id: "loaves", kind: "deliver", item: "baked_bread", count: 2 },
    ],
    rewards: { xp: { amount: 120 }, economy: { copper: 12 } },
  },
];

export const LANTERN_OBJECTIVE_LABELS: Readonly<Record<string, string>> = {
  [`${LANTERN_ACCOUNTS}:doss`]: "Hear Caravan Hand Doss near Trader Wilkes",
  [`${LANTERN_ACCOUNTS}:lin`]: "Hear Apothecary Lin in eastern Eastbrook",
  [`${LANTERN_WATCH}:wolves`]: "Patrol the north road: defeat Forest Wolves",
  [`${LANTERN_CLINIC}:loaves`]: "Give Lin two Cottage Loaves from your bags",
};
