import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";

import { goldCost, keep, MAX_TOWER_LEVEL, sellAction, sellValue, towerStats, upgradeAction } from "../../keep";
import { keybinds } from "../../keybinds";
import { session } from "../../session";

/**
 * The inspected tower's mason's tablet, read from the keep's world: its level as carved pips, its
 * numbers beside their glyphs, and the declared upgrade and sale (or cancelling a build still rising).
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
      <GameFrame material="stone" tint="#57524a" cut="chamfer" depth={12} padding="12px 16px" className="bb-mason" data-jg="tower-panel">
        <h3 className="bb-mason-name">{tower.label}</h3>
        <span className="bb-mason-rising">
          <span style={{ width: `${Math.round(view.progress * 100)}%` }} />
        </span>
        <span className="bb-mason-stat">{`Raising · ${Math.round(view.progress * 100)}%`}</span>
        <GameFrame as="button" material="wood" cut="notch" depth={8} padding="6px 14px" className="bb-small-plank" onClick={() => commands.run("beacon.remove", { id: tower.id })}>
          Cancel build
        </GameFrame>
      </GameFrame>
    );
  }

  const atCap = stats.level >= MAX_TOWER_LEVEL;
  const canUpgrade = view.upgradeRefusal === null;
  const upgradeKey = actionLabel(keybinds, "upgradeTower");
  const sellKey = actionLabel(keybinds, "sellTower");

  return (
    <GameFrame material="stone" tint="#57524a" cut="chamfer" depth={12} padding="12px 16px 14px" className="bb-mason" data-jg="tower-panel">
      <h3 className="bb-mason-name">{tower.label}</h3>
      <span className="bb-pips" aria-label={`Level ${stats.level} of ${MAX_TOWER_LEVEL}`}>
        {Array.from({ length: MAX_TOWER_LEVEL }, (_, index) => (
          <i key={index} data-lit={index < stats.level ? "" : undefined} />
        ))}
      </span>
      <div className="bb-mason-stats">
        <span className="bb-mason-stat">
          <GameIcon name="sword" size={14} /> {Math.round(stats.damage)}
        </span>
        <span className="bb-mason-stat">
          <GameIcon name="crosshairIcon" size={14} /> {stats.range.toFixed(1)}
        </span>
        <span className="bb-mason-stat">
          <GameIcon name="hourglass" size={14} /> {stats.fireRateHz.toFixed(2)}/s
        </span>
        {stats.splashRadius > 0 ? (
          <span className="bb-mason-stat">
            <GameIcon name="bomb" size={14} /> {stats.splashRadius.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="bb-mason-acts">
        <GameFrame
          as="button"
          material="wood"
          cut="notch"
          depth={8}
          padding="6px 12px"
          className="bb-small-plank"
          aria-disabled={!canUpgrade}
          data-dim={canUpgrade ? undefined : ""}
          cue={canUpgrade ? "confirm" : undefined}
          onClick={() => {
            // A refused upgrade still runs the command, so its "needs N more gold" reaches the notice feed.
            if (atCap) gameCtx.game.audio.play("denied");
            else commands.run("beacon.act", { action: upgradeAction(tower.kind), target: tower.id });
          }}
        >
          {atCap ? "Max level" : (
            <>
              <GameIcon name="arrowUp" size={13} /> {view.upgradeCost}
            </>
          )}
          {atCap || upgradeKey === null ? null : <kbd>{upgradeKey}</kbd>}
        </GameFrame>
        <GameFrame
          as="button"
          material="enamel"
          tint="#6e1f14"
          edge="#250804"
          cut="notch"
          depth={8}
          padding="6px 12px"
          className="bb-small-plank"
          onClick={() => commands.run("beacon.act", { action: sellAction(tower.kind), target: tower.id })}
        >
          {`Sell ${view.refund}`}
          {sellKey === null ? null : <kbd>{sellKey}</kbd>}
        </GameFrame>
      </div>
    </GameFrame>
  );
}
