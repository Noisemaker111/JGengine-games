import { useGame, useGameStore } from "@jgengine/react/hooks";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { HudLabel } from "@/components/ui/hud-label";
import { MenuButton } from "@/components/ui/menu-button";

import { GOLD_CURRENCY } from "../../entities/base/catalog";
import { editorLayers } from "../../../editorLayers";
import { towerDef } from "../../entities/towers/catalog";
import { MAX_TOWER_LEVEL, sellValue, towerStats, upgradeCost } from "../../entities/towers/progression";
import { keybinds } from "../../keybinds";
import { session } from "../../session";

const statStyle = {
  fontFamily: "var(--jg-font-numeric)",
  fontSize: 12,
  color: "var(--jg-text-dim)",
} as const;

export function TowerPanel() {
  const { commands } = useGame();
  const gold = useGameStore((ctx) => ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY));
  const inspectedId = useGameStore(() => session.inspectedTowerId);
  const level = useGameStore(() => (inspectedId === null ? 0 : session.towers.get(inspectedId)?.level ?? 0));
  const tower = inspectedId === null ? undefined : session.towers.get(inspectedId);
  if (tower === undefined || level === 0) return null;

  const def = towerDef(tower.catalogId, editorLayers);
  const stats = towerStats(def, tower.level);
  const cost = upgradeCost(def, tower.level);
  const refund = sellValue(def, tower.level);
  const canUpgrade = cost !== null && gold >= cost;

  return (
    <div
      data-jg="tower-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 200,
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--jg-edge-bright)",
        background: "color-mix(in srgb, var(--jg-surface) 88%, transparent)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <HudLabel>{def.label}</HudLabel>
        <span style={{ ...statStyle, color: "var(--jg-accent)" }}>
          Level {tower.level} / {MAX_TOWER_LEVEL}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 14, rowGap: 2 }}>
        <span style={statStyle}>Damage {Math.round(stats.damage)}</span>
        <span style={statStyle}>Range {stats.range.toFixed(1)}</span>
        <span style={statStyle}>Rate {stats.fireRateHz.toFixed(2)}/s</span>
        {stats.splashRadius > 0 ? <span style={statStyle}>Splash {stats.splashRadius.toFixed(1)}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <MenuButton
          label={cost === null ? "Max level" : `Upgrade ${cost}g`}
          keybind={cost === null ? undefined : actionLabel(keybinds, "upgradeTower") ?? undefined}
          variant={canUpgrade ? "primary" : "ghost"}
          onActivate={() => {
            if (canUpgrade) commands.run("upgradeTower", { instanceId: tower.instanceId });
          }}
        />
        <MenuButton
          label={`Sell ${refund}g`}
          keybind={actionLabel(keybinds, "sellTower") ?? undefined}
          variant="danger"
          onActivate={() => commands.run("sellTower", { instanceId: tower.instanceId })}
        />
      </div>
    </div>
  );
}
