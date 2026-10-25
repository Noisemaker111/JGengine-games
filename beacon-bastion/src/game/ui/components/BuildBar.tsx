import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { AbilitySlotButton } from "@/components/ui/ability-slot";
import { HudLabel } from "@/components/ui/hud-label";
import { GameIcon } from "@jgengine/react/gameIcons";
import { actionLabel } from "@jgengine/core/input/actionBindings";

import { buildPrompt } from "../../build/prompt";
import { editorLayers } from "../../../editorLayers";
import { TOWER_IDS, towerDef } from "../../entities/towers/catalog";
import { keybinds } from "../../keybinds";
import { buildCost, keep } from "../../keep";
import { session } from "../../session";

export function BuildBar() {
  const { commands } = useGame();
  const gameCtx = useGameContext();
  const gold = useGameStore((ctx) => keep.of(ctx).num("keep.gold"));
  const selected = useGameStore(() => session.selectedTowerId);
  const selectedAffordable = selected !== null && gold >= buildCost(selected);
  // Builds under way, from the keep's build queue: what is rising and how far along it is.
  const building = useGameStore((ctx) =>
    keep.of(ctx).orders("build").map((order) => `Raising ${order.label} ${Math.round(order.progress * 100)}%`).join(" · "),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <HudLabel>{buildPrompt(selected !== null, selectedAffordable)}</HudLabel>
      {building.length > 0 ? <HudLabel>{building}</HudLabel> : null}
      <div style={{ display: "flex", gap: 10 }}>
        {TOWER_IDS.map((id, index) => {
          const def = towerDef(id, editorLayers);
          const cost = buildCost(id);
          const affordable = gold >= cost;
          const isSelected = selected === id;
          return (
            <div
              key={id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: 3,
                borderRadius: 4,
                boxShadow: isSelected ? `0 0 0 2px var(--jg-accent)` : "none",
              }}
            >
              <AbilitySlotButton
                icon={<GameIcon name={def.icon} size={26} />}
                label={def.label}
                cost={`${cost}g`}
                keybind={actionLabel(keybinds, `buildTower${index + 1}`) ?? undefined}
                state={affordable ? "ready" : "noResource"}
                size={50}
                onActivate={() => {
                  commands.run(`buildTower${index + 1}`, {});
                  // The card is already greyed when unaffordable; pressing it anyway plays the denied cue.
                  if (!affordable) gameCtx.game.audio.play("denied");
                }}
              />
              <span
                style={{
                  fontFamily: "var(--jg-font-numeric)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: affordable ? "var(--jg-text)" : "var(--jg-danger)",
                }}
              >
                {cost}g
              </span>
              <span
                style={{
                  fontFamily: "var(--jg-font-display)",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--jg-text)",
                }}
              >
                {def.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
