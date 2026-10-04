import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HeartRow } from "@/components/ui/heart-row";
import { WaveIndicator } from "@/components/ui/wave-indicator";
import { WalletCurrencyDisplay } from "@/components/ui/wallet-currency-display";
import {
  BASE_ENTITY_ID,
  GOLD_CURRENCY,
  STARTING_LIVES,
} from "../../entities/base/catalog";
import { TOTAL_WAVES } from "../../waves/manifest";
import { activeCreepCount, currentWaveNumber, session } from "../../session";

export function Hud() {
  const { commands } = useGame();
  const lives = useGameStore((ctx) =>
    ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives"),
  );
  const gold = useGameStore((ctx) =>
    ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY),
  );
  const wave = useGameStore(() => currentWaveNumber());
  const remaining = useGameStore(() => activeCreepCount());
  useGameStore(() =>
    [
      session.planning,
      session.paused,
      session.reserve,
      session.rallySeconds,
      session.rallyCooldown,
      session.lastReport,
      session.savedMessage,
    ].join("|"),
  );
  const ended = session.gameOver || session.victory;
  return (
    <section className="bb-frame bb-command" aria-label="Keep command desk">
      <h1>Beacon Bastion</h1>
      <p>Build crossfire. Counter armor. Keep a recovery fund.</p>
      <HeartRow
        current={lives?.current ?? 0}
        max={lives?.max ?? STARTING_LIVES}
        size={14}
      />
      <WalletCurrencyDisplay currencyId={GOLD_CURRENCY} name="Gold" />
      <WaveIndicator
        wave={Math.min(wave, TOTAL_WAVES)}
        totalWaves={TOTAL_WAVES}
        remaining={remaining}
        remainingLabel="raiders"
      />
      <strong>
        {session.paused
          ? "Orders & construction paused"
          : session.planning
            ? "Planning · the road is quiet"
            : "Raid in progress"}{" "}
        · Reserve {session.reserve}/100
      </strong>
      <div className="bb-actions">
        <button
          className="bb-primary"
          disabled={ended || !session.planning}
          onClick={() => commands.run("beginWave", {})}
        >
          Send wave · Space
        </button>
        <button
          disabled={ended}
          onClick={() => commands.run("togglePause", {})}
        >
          {session.paused ? "Resume" : "Pause"} · P
        </button>
        <button
          disabled={
            ended ||
            session.planning ||
            session.reserve < 20 ||
            session.rallyCooldown > 0
          }
          onClick={() => commands.run("rally", {})}
        >
          {session.rallySeconds > 0
            ? `Rally ${Math.ceil(session.rallySeconds)}s`
            : session.rallyCooldown > 0
              ? `Rally ready in ${Math.ceil(session.rallyCooldown)}s`
              : "Rally · 20 reserve"}
        </button>
        <button
          disabled={
            !session.planning ||
            gold < 35 ||
            (lives?.current ?? 0) >= (lives?.max ?? STARTING_LIVES)
          }
          onClick={() => commands.run("repairKeep", {})}
        >
          Repair +4 lives · 35g
        </button>
        <button onClick={() => commands.run("saveRun", {})}>Save · K</button>
        <button onClick={() => commands.run("loadRun", {})}>Load · L</button>
      </div>
      <p className="bb-status" role="status">
        {session.lastReport}
      </p>
      <small className="bb-status" role="status">
        {session.savedMessage}
      </small>
      <details open>
        <summary>Field intelligence & controls</summary>
        <p>
          1 / 2 / 3 selects a tower; click a stone plot to build; the Build
          plots list also supports touch. Mousewheel zooms. Click a built tower
          to choose targets, upgrade [U], or sell [X].
        </p>
        <p>
          Brute armor: arrows 45%, cannon 135% damage. Scouts resist frost.
          Combine frost with crossfire; use cannons against armor. Rally [R]
          gives +60% fire rate for 6s.
        </p>
        <p>
          Held gold earns 10% between waves (up to 25g). Repair before sending
          the next raid. Perfect defense earns 10 reserve; kills earn 1. A level
          2 tower can choose one permanent specialization.
        </p>
      </details>
    </section>
  );
}
