import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { formatSavePlaytime } from "@jgengine/core/game/saveSlotIndex";
import { decodeSave, SAVE_KEY } from "./persistence";
import { parkProfile } from "./parkProfile";

export { bindParkCapture, captureParkThumb, parkProfile } from "./parkProfile";
/** Brightway keeps one park; the card is that document. */
export const parkSlots = createSaveSlots({
  capacity: 1,
  slots: [{ id: "park", empty: true, meta: {} }],
});

/** Read the saved park back into the card, so Continue and the slot grid show what is on disk. */
export function refreshParkSlot(): void {
  if (typeof localStorage === "undefined") return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    raw = null;
  }
  const save = raw === null ? null : decodeSave(raw);
  if (save === null) {
    parkSlots.clear("park");
    return;
  }
  parkProfile.name = save.parkName ?? parkProfile.name;
  parkProfile.thumbnail = save.thumbnail ?? parkProfile.thumbnail;
  const playtime = typeof save.playtime === "number" ? save.playtime : 0;
  parkSlots.write("park", {
    name: save.parkName ?? "Brightway Park",
    savedAt: Date.now(),
    meta: {
      day: save.stats.day,
      guests: Math.round(save.stats.guestsToday),
      cash: `$${Math.round(save.stats.cash).toLocaleString()}`,
      playtime: formatSavePlaytime(playtime),
      ...(typeof save.thumbnail === "string" && save.thumbnail.length > 0 ? { thumbnail: save.thumbnail } : {}),
    },
  });
}


/** The park card's newest slot, for a Continue pane. */
export function parkSlot(): ReturnType<typeof parkSlots.mostRecent> {
  refreshParkSlot();
  return parkSlots.mostRecent();
}






