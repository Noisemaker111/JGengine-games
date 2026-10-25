import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { KeybindBadge } from "@/components/ui/keybind-badge";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";

import { goldCost, keep, MAX_TOWER_LEVEL, sellAction, sellValue, towerStats, upgradeAction } from "../../keep";
import { keybinds } from "../../keybinds";
import { session } from "../../session";

const statStyle = {
  fontFamily: "var(--jg-font-numeric)",
  fontSize: 12,
  color: "var(--jg-text-dim)",
} as const;

/**
 * The inspected tower, read from the keep's world: its level and numbers are facts the upgrade wrote,
 * and its buttons run the declared upgrade and sale (or cancel a build still rising).
 */
export function TowerPanel() {
  const { commands } = useGame();
  const gameCtx = useGameContext();
  const inspectedId = useGameStore(() => session.inspectedTowerId);
  const view = useGameStore((ctx) => {
    if (inspectedId === null) return null;
    const world = keep.of(ctx);
    const tower = world.instance(inspectedId);
    if (tower === null) return null;
    const order = world.orders("build").find((entry) => entry.target === tower.id);
    const upgrade = upgradeAction(tower.kind);
    return {
      tower,
      stats: towerStats(world, tower.id),
      progress: order?.progress ?? 1,
      upgradeCost: goldCost(world, upgrade, tower.id),
      upgradeRefusal: world.canAct(upgrade, tower.id),
      refund: sellValue(world, tower.id, tower.kind),
    };
  });
  if (inspectedId === null || view === null) return null;
  const { tower, stats } = view;

  if (!tower.ready) {
    return (
      <HudSurface data-jg="tower-panel" title={tower.label} padding="10px 12px" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 200 }}>
        <span style={statStyle}>{`Raising · ${Math.round(view.progress * 100)}%`}</span>
        <HudButton size="sm" variant="ghost" onClick={() => commands.run("beacon.remove", { id: tower.id })}>
          Cancel build
        </HudButton>
      </HudSurface>
    );
  }

  const atCap = stats.level >= MAX_TOWER_LEVEL;
  const canUpgrade = view.upgradeRefusal === null;
  const upgradeKey = actionLabel(keybinds, "upgradeTower");
  const sellKey = actionLabel(keybinds, "sellTower");

  return (
    <HudSurface
      data-jg="tower-panel"
      title={tower.label}
      aside={<span style={{ ...statStyle, color: "var(--jg-accent)" }}>Level {stats.level} / {MAX_TOWER_LEVEL}</span>}
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
            // A refused upgrade still runs the command, so its "needs N more gold" reaches the notice feed.
            if (atCap) gameCtx.game.audio.play("denied");
            else commands.run("beacon.act", { action: upgradeAction(tower.kind), target: tower.id });
          }}
        >
          {atCap ? "Max level" : `Upgrade ${view.upgradeCost}g`}
          {atCap || upgradeKey === null ? null : <KeybindBadge label={upgradeKey} size="sm" />}
        </HudButton>
        <HudButton size="sm" variant="danger" onClick={() => commands.run("beacon.act", { action: sellAction(tower.kind), target: tower.id })}>
          {`Sell ${view.refund}g`}
          {sellKey === null ? null : <KeybindBadge label={sellKey} size="sm" />}
        </HudButton>
      </div>
    </HudSurface>
  );
}
