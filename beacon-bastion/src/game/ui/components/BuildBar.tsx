import { useGame, useGameStore } from "@jgengine/react/hooks";
import { AbilitySlotButton } from "@/components/ui/ability-slot";
import { HudLabel } from "@/components/ui/hud-label";
import { GameIcon } from "@jgengine/react/gameIcons";
import { actionLabel } from "@jgengine/core/input/actionBindings";

import { GOLD_CURRENCY } from "../../entities/base/catalog";
import { editorLayers } from "../../../editorLayers";
import { TOWER_IDS, towerDef } from "../../entities/towers/catalog";
import { keybinds } from "../../keybinds";
import { session } from "../../session";
import { BUILD_PLOTS } from "../../world/path";

export function BuildBar() {
  const { commands } = useGame();
  const gold = useGameStore((ctx) =>
    ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY),
  );
  const selected = useGameStore(() => session.selectedTowerId);
  useGameStore(() => [...session.plotOccupant.entries()].map(([id,value])=>`${id}:${value}`).join("|"));

  return (
    <div
      className="bb-frame"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <HudLabel>Build · choose 1 / 2 / 3, then click a stone plot</HudLabel>
      <div style={{ display: "flex", gap: 10 }}>
        {TOWER_IDS.map((id, index) => {
          const def = towerDef(id, editorLayers);
          const affordable =
            gold >= def.cost && !session.gameOver && !session.victory;
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
                cost={`${def.cost}g`}
                keybind={
                  actionLabel(keybinds, `buildTower${index + 1}`) ?? undefined
                }
                state="ready"
                className={affordable ? undefined : "opacity-65"}
                size={50}
                onActivate={() => commands.run(`buildTower${index + 1}`, {})}
              />
              <span
                style={{
                  fontFamily: "var(--jg-font-numeric)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: affordable ? "var(--jg-text)" : "var(--jg-danger)",
                }}
              >
                {def.cost}g
              </span>
              <button type="button" disabled={!affordable} onClick={()=>commands.run(`buildTower${index+1}`,{})} style={{fontSize:10,minHeight:28,padding:"4px 6px"}}>Select {def.label}</button>
            </div>
          );
        })}
      </div>
      <details className="bb-plots">
        <summary><span>Build plots · keyboard & touch</span></summary>
        <div>
          {BUILD_PLOTS.map((plot, index) => (
            <button
              key={plot.id}
              type="button"
              onClick={() =>
                commands.run("tower.build", { point: plot.position })
              }
            >
              Plot {index + 1}
              {session.plotOccupant.get(plot.id) ? " · inspect" : ""}
              {plot.id === "plot-10"
                ? " · Armor bend"
                : plot.id === "plot-11"
                  ? " · Far crossfire"
                  : ""}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
