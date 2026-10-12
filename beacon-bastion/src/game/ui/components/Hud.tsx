import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HeartRow } from "@/components/ui/heart-row";
import { WaveIndicator } from "@/components/ui/wave-indicator";
import { WalletCurrencyDisplay } from "@/components/ui/wallet-currency-display";
import { HudLabel } from "@/components/ui/hud-label";

import { BASE_ENTITY_ID, GOLD_CURRENCY, STARTING_LIVES } from "../../entities/base/catalog";
import { TOTAL_WAVES } from "../../waves/manifest";
import { activeCreepCount, currentWaveNumber, session } from "../../session";
import { waveOverlapBonus } from "../../waves/director";

export function Hud() {
  const { commands } = useGame();
  const ready = useGameStore(() => session.waveReady && !session.director.done && !session.gameOver && !session.victory);
  const started = useGameStore(() => session.waveStarted);
  const bonus = useGameStore(() => waveOverlapBonus());
  const lives = useGameStore((ctx) => ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives"));
  const wave = useGameStore(() => currentWaveNumber());
  const remaining = useGameStore(() => activeCreepCount());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <HudLabel>Keep</HudLabel>
        <HeartRow current={lives?.current ?? 0} max={lives?.max ?? STARTING_LIVES} size={18} />
      </div>
      <WalletCurrencyDisplay currencyId={GOLD_CURRENCY} name="Gold" />
      <WaveIndicator wave={Math.min(wave, TOTAL_WAVES)} totalWaves={TOTAL_WAVES} remaining={remaining} remainingLabel="raiders" />
      {ready ? <div className="pointer-events-auto max-w-64 rounded border border-amber-400/40 bg-slate-950/95 p-3 text-sm text-amber-50">
        <strong>{started ? "Choose your next assault" : "Prepare the beacon"}</strong>
        <p className="my-2 text-xs">{bonus > 0 ? `Wait for a safer approach, or send the next wave with ${remaining} raiders still alive for +${bonus} gold.` : "Place defenses on the foundation rings, then release the raiders when you are ready."}</p>
        <button className="rounded bg-amber-300 px-3 py-2 font-bold text-slate-950" onClick={() => commands.run("wave.send", {})}>
          {started ? `Send wave ${wave + 1}` : "Begin first assault"}{bonus > 0 ? ` · +${bonus} gold` : ""}
        </button>
      </div> : null}
    </div>
  );
}
