import { iconForItemId } from "@jgengine/react/gameIcons";
import { useEntityStat, useGame, useInventory, usePlayer } from "@jgengine/react/hooks";
import { IconTreatment, schoolForItem } from "@jgengine/react/iconTreatment";
import { actionGlyph, useInputDevice } from "@jgengine/react/inputDevice";
import { useStore } from "@jgengine/react/store";
import { KitButton } from "@jgengine/react/uiKitRoot";
import { slotStore } from "../../commands";
import { ITEM_LABELS } from "../../content";
import { AMMO_STAT_IDS, weaponById } from "../../items/weapons/catalog";
import { keybinds } from "../../keybinds";

/** What you carry: filled slots only, the held one pressed in, tappable on touch. */
export function Hotbar() {
  const { userId } = usePlayer();
  const { commands } = useGame();
  const device = useInputDevice();
  const slots = useInventory("hotbar");
  const selected = useStore(slotStore, (v) => v ?? 0);
  const ammo = { ammo_9mm: useEntityStat(userId, "ammo_9mm")?.current, ammo_shell: useEntityStat(userId, "ammo_shell")?.current };
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {slots.slice(0, 4).map((slot, index) => {
        const itemId = slot?.itemId;
        if (itemId == null) return null;
        const weapon = weaponById(itemId);
        const rounds = weapon === undefined || weapon.ammo === "none" ? undefined : ammo[AMMO_STAT_IDS[weapon.ammo] as keyof typeof ammo];
        const action = `selectSlot${index + 1}`;
        return (
          <KitButton key={index} size="sm" variant={index === selected ? "primary" : "secondary"} pressed={index === selected} icon={<IconTreatment icon={iconForItemId(itemId) ?? "gun"} school={schoolForItem(itemId)} size={22} />} glyph={device === "touch" ? undefined : (actionGlyph(keybinds, action, device) ?? undefined)} onClick={() => commands.run(action, {})}>
            {ITEM_LABELS[itemId] ?? itemId}{rounds === undefined ? "" : ` · ${rounds}`}
          </KitButton>
        );
      })}
    </div>
  );
}
