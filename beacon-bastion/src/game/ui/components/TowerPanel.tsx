import { useGame, useGameStore } from "@jgengine/react/hooks";
import { GOLD_CURRENCY } from "../../entities/base/catalog";
import { editorLayers } from "../../../editorLayers";
import { towerDef } from "../../entities/towers/catalog";
import {
  MAX_TOWER_LEVEL,
  sellValue,
  towerStats,
  upgradeCost,
} from "../../entities/towers/progression";
import { session } from "../../session";
export function TowerPanel() {
  const { commands } = useGame();
  const gold = useGameStore((ctx) =>
    ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY),
  );
  const id = useGameStore(() => session.inspectedTowerId);
  useGameStore(() => {
    const t = id ? session.towers.get(id) : null;
    return [t?.level, t?.branch, t?.priority, session.paused].join("|");
  });
  const tower = id ? session.towers.get(id) : null;
  if (!tower) return null;
  const def = towerDef(tower.catalogId, editorLayers),
    stats = towerStats(def, tower.level, tower.branch),
    cost = upgradeCost(def, tower.level),
    refund = sellValue(def, tower.level);

  return (
    <section
      className="bb-frame bb-tower"
      data-jg="tower-panel"
      aria-label={`${def.label} orders`}
    >
      <h2>{def.label}</h2>
      <p>
        Level {tower.level}/{MAX_TOWER_LEVEL} ·{" "}
        {tower.branch ?? "Unspecialized"}
      </p>
      <p>
        Damage {Math.round(stats.damage)} · Range {stats.range.toFixed(1)}
        <br />
        Rate {stats.fireRateHz.toFixed(2)}/s{" "}
        {stats.splashRadius > 0
          ? `· Splash ${stats.splashRadius.toFixed(1)}`
          : ""}
      </p>
      <label className="bb-priority">
        Target priority{" "}
        <select
          value={tower.priority ?? "first"}
          onChange={(e) =>
            commands.run("setTargetPriority", {
              instanceId: tower.instanceId,
              priority: e.target.value,
            })
          }
        >
          <option value="first">First · stop leaks</option>
          <option value="last">Last · thin arrivals</option>
          <option value="strongest">Strongest · break armor</option>
        </select>
      </label>
      <div className="bb-actions">
        <button
          disabled={cost === null || gold < (cost ?? 0)}
          onClick={() =>
            commands.run("upgradeTower", { instanceId: tower.instanceId })
          }
        >
          {cost === null ? "Maximum level" : `Upgrade · ${cost}g [U]`}
        </button>
        <button
          onClick={() =>
            commands.run("sellTower", { instanceId: tower.instanceId })
          }
        >
          Sell · {refund}g [X]
        </button>
      </div>
      {!tower.branch && (
        <>
          <p>
            Permanent specialization · choose once
            <br />
            <small>
              {tower.level < 2
                ? "Upgrade to level 2 first."
                : "Choose your role before the next raid."}
            </small>
          </p>
          <div className="bb-branches">
            <button
              disabled={tower.level < 2}
              onClick={() =>
                commands.run("specializeTower", {
                  instanceId: tower.instanceId,
                  branch: "power",
                })
              }
            >
              <strong>Power</strong>
              <small>+70% damage · −15% range · −20% rate</small>
            </button>
            <button
              disabled={tower.level < 2}
              onClick={() =>
                commands.run("specializeTower", {
                  instanceId: tower.instanceId,
                  branch: "reach",
                })
              }
            >
              <strong>Reach</strong>
              <small>+40% range · −20% damage</small>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
