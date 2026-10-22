import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { HeartRow } from "@/components/ui/heart-row";
import { WaveIndicator } from "@/components/ui/wave-indicator";
import { WalletCurrencyDisplay } from "@/components/ui/wallet-currency-display";
import { HudLabel } from "@/components/ui/hud-label";

import { BASE_ENTITY_ID, GOLD_CURRENCY, STARTING_LIVES } from "../../entities/base/catalog";
import { TOTAL_WAVES } from "../../waves/manifest";
import { activeCreepCount, currentWaveNumber, session } from "../../session";
import { waveOverlapBonus } from "../../waves/director";
import { waveStatusLine } from "../../waves/status";

export function Hud() {
  const { commands } = useGame();
  const ready = useGameStore(() => session.waveReady && !session.director.done && !session.gameOver && !session.victory);
  const started = useGameStore(() => session.waveStarted);
  const bonus = useGameStore(() => waveOverlapBonus());
  const lives = useGameStore((ctx) => ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives"));
  const wave = useGameStore(() => currentWaveNumber());
  const remaining = useGameStore(() => activeCreepCount());
  const releasing = useGameStore(() => !session.waveReady && !session.director.done);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <HudLabel>Keep</HudLabel>
        <HeartRow current={lives?.current ?? 0} max={lives?.max ?? STARTING_LIVES} size={18} />
      </div>
      <WalletCurrencyDisplay currencyId={GOLD_CURRENCY} name="Gold" />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <WaveIndicator wave={Math.min(wave, TOTAL_WAVES)} totalWaves={TOTAL_WAVES} />
        <HudLabel>{waveStatusLine({ started, releasing, wave: Math.min(wave, TOTAL_WAVES), alive: remaining })}</HudLabel>
      </div>
      <HudSurface open={ready} elevation="overlay" title={started ? "Choose your next assault" : "Prepare the beacon"} width={256}>
        <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.45 }}>{bonus > 0 ? `Wait for a safer approach, or send the next wave with ${remaining} raiders still alive for +${bonus} gold.` : "Place defenses on the foundation rings, then release the raiders when you are ready."}</p>
        <HudButton variant="primary" cue="confirm" onClick={() => commands.run("wave.send", {})}>
          {started ? `Send wave ${wave + 1}` : "Begin first assault"}{bonus > 0 ? ` · +${bonus} gold` : ""}
        </HudButton>
      </HudSurface>
    </div>
  );
}
