import { DialogueBox, runDialogueChoice, useOpenDialogueId, type DialogueDef } from "@jgengine/react/components";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { cityOf } from "../../cityRuntime";

/**
 * A conversation is the city talking: the person's current line from the world model, then each job
 * they can offer right now. A new person or job in `city.ts` shows up here with no dialogue file.
 */
export function conversation(ctx: GameContext, dialogueId: string): DialogueDef | null {
  if (!dialogueId.startsWith("person:")) return null;
  const id = dialogueId.slice("person:".length);
  const world = cityOf(ctx);
  const person = world.def.people?.[id];
  if (person === undefined) return null;
  const line = world.says(id)[0] ?? "...";
  const busy = world.missionView() !== null;
  const offers = busy ? [] : world.jobs().filter((job) => job.giver === id && (job.status === "available" || job.status === "failed"));
  return {
    id: `${dialogueId}:${offers.map((job) => job.id).join(",")}:${line}`,
    lines: [
      { speaker: person.name, text: line },
      ...offers.filter((job) => job.pitch !== null).map((job) => ({ speaker: person.name, text: job.pitch! })),
      {
        choices: [
          ...offers.map((job) => ({
            label: job.status === "failed" ? `Try again: ${job.title}` : `Take: ${job.title}`,
            invoke: { command: "city.job.start", args: { id: job.id } },
          })),
          { label: offers.length > 0 ? "Not now." : "Later.", invoke: { command: "dialogue.close", args: {} } },
        ],
      },
    ],
  };
}

export function DialoguePanel() {
  const { commands } = useGame();
  const dialogueId = useOpenDialogueId();
  const dialogue = useGameStore(
    (ctx) => (dialogueId === null ? null : conversation(ctx, dialogueId)),
    (a, b) => a?.id === b?.id,
  );
  if (dialogue === null) return null;
  return (
    <div className="pointer-events-auto w-[28rem] max-w-[90vw]">
      <DialogueBox
        key={dialogue.id}
        dialogue={dialogue}
        onChoice={(choice, result) => runDialogueChoice(commands, choice, result)}
        className="border-2 border-black bg-[#f4e8c8] p-4 text-[#1b1e26] shadow-[6px_6px_0_#000]"
        speakerClassName="text-xs font-black uppercase tracking-widest text-[#c23b3b]"
        lineClassName="text-sm font-semibold"
        choicesClassName="mt-2 flex flex-wrap gap-2"
        choiceClassName="pointer-events-auto -skew-x-6 border-2 border-black bg-[#ffb020] px-3 py-1 text-xs font-black uppercase hover:bg-[#ffc95e]"
      />
    </div>
  );
}
