import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { HudLabel } from "@/components/ui/hud-label";
import { KeybindBadge } from "@/components/ui/keybind-badge";
import { HudButton } from "@jgengine/react/hudButton";
import { HudPanel } from "@jgengine/react/hudPanel";

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
  const gameCtx = useGameContext();
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
  const upgradeKey = actionLabel(keybinds, "upgradeTower");
  const sellKey = actionLabel(keybinds, "sellTower");

  return (
    <HudPanel
      data-jg="tower-panel"
      title={def.label}
      aside={<span style={{ ...statStyle, color: "var(--jg-accent)" }}>Level {tower.level} / {MAX_TOWER_LEVEL}</span>}
      padding="10px 12px"
      style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 200 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 14, rowGap: 2 }}>
        <span style={statStyle}>Damage {Math.round(stats.damage)}</span>
        <span style={statStyle}>Range {stats.range.toFixed(1)}</span>
        <span style={statStyle}>Rate {stats.fireRateHz.toFixed(2)}/s</span>
        {stats.splashRadius > 0 ? <span style={statStyle}>Splash {stats.splashRadius.toFixed(1)}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <HudButton
          size="sm"
          variant={canUpgrade ? "primary" : "ghost"}
          aria-disabled={!canUpgrade}
          cue={canUpgrade ? "confirm" : undefined}
          onClick={() => {
            if (canUpgrade) commands.run("upgradeTower", { instanceId: tower.instanceId });
            else gameCtx.game.audio.play("denied");
          }}
        >
          {cost === null ? "Max level" : `Upgrade ${cost}g`}
          {cost === null || upgradeKey === null ? null : <KeybindBadge label={upgradeKey} size="sm" />}
        </HudButton>
        <HudButton size="sm" variant="danger" onClick={() => commands.run("sellTower", { instanceId: tower.instanceId })}>
          {`Sell ${refund}g`}
          {sellKey === null ? null : <KeybindBadge label={sellKey} size="sm" />}
        </HudButton>
      </div>
    </HudPanel>
  );
}
