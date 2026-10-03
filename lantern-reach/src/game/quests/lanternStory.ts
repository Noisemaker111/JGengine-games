import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineKeyedStore } from "@jgengine/core/store/defineKeyedStore";
import type { DialogueChoice, DialogueDef } from "@jgengine/react/components";

import { INTERACT_RANGE } from "../math/combat";
import { classStore, dialogueStore } from "../session/stores";
import {
  LANTERN_ACCOUNTS,
  LANTERN_CLINIC,
  LANTERN_WATCH,
  ROAD_CLEAR,
} from "./lanternCatalog";

export type LanternRoute = "watch" | "clinic";
export const CLINIC_SUPPLIES = 2;
export const lanternStore = defineKeyedStore<{
  route: LanternRoute | null;
  claimed: number;
}>(
  (userId) => `lantern-choice:${userId}`,
  () => ({ route: null, claimed: 0 }),
);

function quest(ctx: GameContext, userId: string, questId: string) {
  return ctx.game
    .quest!.list(userId)
    .find((entry) => entry.questId === questId);
}

function atNpc(ctx: GameContext, npcId: string): { reason: string } | null {
  const userId = ctx.player.userId;
  if (dialogueStore.read(ctx, userId) !== npcId)
    return { reason: "Speak with the right resident first." };
  const player = ctx.scene.entity.get(userId);
  const npc = ctx.scene.entity.get(`npc:${npcId}`);
  if (
    player === null ||
    npc === null ||
    Math.hypot(
      player.position[0] - npc.position[0],
      player.position[2] - npc.position[2],
    ) > INTERACT_RANGE
  ) {
    return { reason: "Move closer to continue this conversation." };
  }
  if (classStore.read(ctx, userId) === null)
    return { reason: "Choose your calling first." };
  return null;
}

export function isLanternQuest(id: string): boolean {
  return (
    id === LANTERN_ACCOUNTS || id === LANTERN_WATCH || id === LANTERN_CLINIC
  );
}

/** Restore the road access earned by saves made before lantern choices existed. */
export function prepareLanternDialogue(ctx: GameContext): void {
  const userId = ctx.player.userId;
  if (quest(ctx, userId, "q_wolves")?.status === "completed")
    ctx.game.unlocks!.grant(userId, ROAD_CLEAR);
}

export function registerLanternCommands(ctx: GameContext): void {
  ctx.game.commands.define("lantern.begin", {
    validate(state) {
      return (
        atNpc(state, "marshal_redbrook") ??
        state.game.quest!.canAccept(state.player.userId, LANTERN_ACCOUNTS)
      );
    },
    apply(state) {
      state.game.quest!.accept(state.player.userId, LANTERN_ACCOUNTS);
    },
  });
  ctx.game.commands.define<{ npcId: string }>("lantern.hear", {
    validate(state, input) {
      if (input?.npcId !== "wilkes_hand" && input?.npcId !== "apothecary_lin")
        return { reason: "Unknown account." };
      const account = quest(state, state.player.userId, LANTERN_ACCOUNTS);
      if (account?.status !== "active")
        return { reason: "Ask Redbrook about the last oil tin first." };
      return atNpc(state, input.npcId);
    },
    apply(state, input) {
      state.game.quest!.progress(
        state.player.userId,
        LANTERN_ACCOUNTS,
        input.npcId === "wilkes_hand" ? "doss" : "lin",
        1,
      );
    },
  });
  ctx.game.commands.define("lantern.report", {
    validate(state) {
      return (
        atNpc(state, "marshal_redbrook") ??
        state.game.quest!.canTurnIn(state.player.userId, LANTERN_ACCOUNTS)
      );
    },
    apply(state) {
      state.game.quest!.turnIn(state.player.userId, LANTERN_ACCOUNTS);
    },
  });
  ctx.game.commands.define<{ route: LanternRoute }>("lantern.choose", {
    validate(state, input) {
      if (input?.route !== "watch" && input?.route !== "clinic")
        return { reason: "Choose the road lamps or the clinic." };
      if (lanternStore.read(state, state.player.userId).route !== null)
        return { reason: "The oil has already been promised." };
      if (
        quest(state, state.player.userId, LANTERN_ACCOUNTS)?.status !==
        "completed"
      )
        return { reason: "Hear both accounts and report to Redbrook first." };
      return (
        atNpc(state, "marshal_redbrook") ??
        state.game.quest!.canAccept(
          state.player.userId,
          input.route === "watch" ? LANTERN_WATCH : LANTERN_CLINIC,
        )
      );
    },
    apply(state, input) {
      const userId = state.player.userId;
      const rejection = state.game.quest!.accept(
        userId,
        input.route === "watch" ? LANTERN_WATCH : LANTERN_CLINIC,
      );
      if (rejection === null)
        lanternStore.write(state, userId, { route: input.route, claimed: 0 });
    },
  });
  ctx.game.commands.define("lantern.deliver", {
    validate(state) {
      const userId = state.player.userId;
      if (
        lanternStore.read(state, userId).route !== "clinic" ||
        quest(state, userId, LANTERN_CLINIC)?.status !== "active"
      ) {
        return { reason: "The clinic delivery is not outstanding." };
      }
      if (!state.player.inventory.has("bags", "baked_bread", 2))
        return {
          reason:
            "Lin needs two Cottage Loaves in your bags. Wilkes sells them if you ate your supplies.",
        };
      return atNpc(state, "apothecary_lin");
    },
    apply(state) {
      const userId = state.player.userId;
      if (state.player.inventory.take("bags", "baked_bread", 2).status !== "ok")
        return;
      state.game.quest!.progress(userId, LANTERN_CLINIC, "loaves", 2);
      state.game.quest!.turnIn(userId, LANTERN_CLINIC);
    },
  });
  ctx.game.commands.define("lantern.patrolReport", {
    validate(state) {
      if (lanternStore.read(state, state.player.userId).route !== "watch")
        return { reason: "You promised the oil to the clinic." };
      return (
        atNpc(state, "marshal_redbrook") ??
        state.game.quest!.canTurnIn(state.player.userId, LANTERN_WATCH)
      );
    },
    apply(state) {
      state.game.quest!.turnIn(state.player.userId, LANTERN_WATCH);
    },
  });
  ctx.game.commands.define("lantern.claim", {
    validate(state) {
      const userId = state.player.userId;
      const choice = lanternStore.read(state, userId);
      if (
        choice.route !== "clinic" ||
        quest(state, userId, LANTERN_CLINIC)?.status !== "completed"
      )
        return { reason: "Finish Lin's delivery first." };
      if (choice.claimed >= CLINIC_SUPPLIES)
        return { reason: "Both reserved potions have been collected." };
      return atNpc(state, "apothecary_lin");
    },
    apply(state) {
      const userId = state.player.userId;
      const result = state.player.inventory.put(
        "bags",
        "minor_healing_potion",
        1,
      );
      if (result.status !== "ok") {
        state.scene.entity.floatText({
          instanceId: userId,
          text: "Make room in your bags. Lin is keeping your potion.",
          kind: "info",
        });
        return;
      }
      lanternStore.update(state, userId, (choice) => ({
        ...choice,
        claimed: choice.claimed + 1,
      }));
    },
  });
}

function choice(
  label: string,
  command: string,
  args: Record<string, string> = {},
): DialogueChoice {
  return { label, invoke: { command, args } };
}

export function lanternDialogue(
  ctx: GameContext,
  userId: string,
  npcId: string,
  base: DialogueDef,
): DialogueDef {
  if (
    npcId !== "marshal_redbrook" &&
    npcId !== "wilkes_hand" &&
    npcId !== "apothecary_lin"
  )
    return base;
  const account = quest(ctx, userId, LANTERN_ACCOUNTS);
  const saved = lanternStore.read(ctx, userId);
  const options: DialogueChoice[] = [];
  const legacy = base.lines.flatMap((line) =>
    "choices" in line ? line.choices : [],
  );
  let speaker: string;
  let text: string;
  if (npcId === "marshal_redbrook") {
    speaker = "Marshal Redbrook";
    if (account === undefined) {
      text =
        "Doss brought one sealed oil tin through the raid. I can light the north-road lamps, or Lin can warm the wounded. Hear them both. I won't make that promise over their heads.";
      options.push(choice("Ask about the last oil tin", "lantern.begin"));
    } else if (account.status === "active") {
      text =
        "Doss knows who is stranded; Lin knows who cannot travel. Hear both accounts, then bring me your answer.";
      if (ctx.game.quest!.canTurnIn(userId, LANTERN_ACCOUNTS) === null)
        options.push(choice("Report both accounts", "lantern.report"));
    } else if (saved.route === null) {
      text =
        "Split the tin and neither lamp lasts the night. The road lamps mean a three-wolf patrol and earlier road bounties. Lin's clinic needs two of your loaves and will reserve two healing potions for you. This promise cannot be changed.";
      options.push(
        choice("Promise the oil to the road watch", "lantern.choose", {
          route: "watch",
        }),
      );
      options.push(
        choice("Promise the oil to Lin's clinic", "lantern.choose", {
          route: "clinic",
        }),
      );
    } else if (saved.route === "watch") {
      const done = quest(ctx, userId, LANTERN_WATCH)?.status === "completed";
      text = done
        ? "The lamps are burning and your patrol held. Greyjaw and the bandit camp are on your writ now. Lin kept her patients warm by hand; this light did not come without a cost."
        : "I have the oil. Patrol the north road and defeat three Forest Wolves before I send carts through it. Lin is working without that lamp; don't waste the night.";
      if (ctx.game.quest!.canTurnIn(userId, LANTERN_WATCH) === null)
        options.push(
          choice("Report the three-wolf patrol", "lantern.patrolReport"),
        );
    } else {
      text =
        "Lin has the oil. I'll put soldiers on the unlit road; they're not spare men. Bring her two loaves. The old wolf bounty still waits until Wolves at the Door is done.";
    }
  } else if (npcId === "wilkes_hand") {
    speaker = "Caravan Hand Doss";
    text =
      "I carried the last tin out myself. Two carts are waiting north of town; the drivers won't move through wolves in the dark. Lin pulled their wounded outrider off my wagon. I need the road, but I owe her more than a thank-you.";
    if (
      account?.status === "active" &&
      !account.objectives.find((objective) => objective.id === "doss")?.complete
    ) {
      options.push(
        choice(
          "Record Doss's account: carts and a wounded outrider",
          "lantern.hear",
          { npcId },
        ),
      );
    } else if (saved.route === "watch")
      text +=
        " You chose the lamps. I can send carts once your patrol returns.";
    else if (saved.route === "clinic")
      text +=
        " You chose the clinic. We'll wait for daylight; that outrider will live to curse the delay.";
  } else {
    speaker = "Apothecary Lin";
    const clinic = quest(ctx, userId, LANTERN_CLINIC);
    text =
      "The outrider has a fever. Oil keeps the warming lamp alive; food gives the body something to fight with. Redbrook is right about the road. He's wrong if he thinks the wounded can wait for it.";
    if (
      account?.status === "active" &&
      !account.objectives.find((objective) => objective.id === "lin")?.complete
    ) {
      options.push(
        choice(
          "Record Lin's account: the wounded cannot wait",
          "lantern.hear",
          { npcId },
        ),
      );
    } else if (saved.route === "clinic" && clinic?.status === "active") {
      text =
        "The warming lamp is lit. Now I need the two loaves you promised. You have to give up some of your own provisions; I won't take that choice for you.";
      options.push(choice("Give Lin two Cottage Loaves", "lantern.deliver"));
    } else if (saved.route === "clinic" && clinic?.status === "completed") {
      const remaining = CLINIC_SUPPLIES - saved.claimed;
      text =
        remaining > 0
          ? `The outrider is eating. I set aside ${remaining} healing potion${remaining === 1 ? "" : "s"} for you. Collect one when you need it; this is a reserve, not an endless cupboard.`
          : "Both reserved potions are yours now. The outrider is sleeping without a fever. Doss can wait for daylight.";
      if (remaining > 0)
        options.push(
          choice("Collect one reserved healing potion", "lantern.claim"),
        );
    } else if (saved.route === "watch")
      text =
        "You gave the road its lamp. I understand why. I am warming the outrider by hand, and I will remember who got the light. My spider-silk work still needs doing.";
  }
  return {
    id: base.id,
    lines: [{ speaker, text }, { choices: [...options, ...legacy] }],
  };
}
