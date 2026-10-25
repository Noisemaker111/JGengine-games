import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { HeartRow } from "@/components/ui/heart-row";
import { WaveIndicator } from "@/components/ui/wave-indicator";
import { CurrencyDisplay } from "@/components/ui/currency-display";
import { HudLabel } from "@/components/ui/hud-label";

import { keep } from "../../keep";
import { TOTAL_WAVES } from "../../waves/manifest";
import { activeCreepCount, currentWaveNumber, session } from "../../session";
import { canSendWave, waveOverlapBonus } from "../../waves/director";
import { bountyScale } from "../../waves/bounty";
import { carriedRelic, legacy, relicBountyScale } from "../../waves/legacy";
import { bossLine, nextWaveIndex, tierLabel, waveCompositionLine, wavePreviewLine, waveStatusLine } from "../../waves/status";

export function Hud() {
  const { commands } = useGame();
  const done = useGameStore(() => session.encounter.view().done);
  // Purse, walls and the wave flags are the keep's world facts; the director and raiders are the live sim.
  const ready = useGameStore((ctx) => canSendWave(ctx));
  const started = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_started") === true);
  const bonus = useGameStore((ctx) => waveOverlapBonus(ctx));
  const lives = useGameStore((ctx) => keep.of(ctx).num("keep.lives"));
  const livesMax = useGameStore((ctx) => keep.of(ctx).num("keep.lives_max"));
  const gold = useGameStore((ctx) => keep.of(ctx).num("keep.gold"));
  const wave = useGameStore(() => currentWaveNumber());
  const remaining = useGameStore(() => activeCreepCount());
  const releasing = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_ready") !== true && !session.encounter.view().done);
  const composition = useGameStore(() => session.openingComposition);
  const tier = useGameStore(() => session.pressure.tier);
  const boss = useGameStore(() => session.boss);
  // The plate previews the wave the release button would send: this one before any release, the
  // next one once a wave is open (its release clears this one and opens that).
  const nextIndex = started ? wave : 0;
  const preview = useGameStore(() => wavePreviewLine(session.encounter.waveAt(nextIndex), nextIndex + 1));
  const account = useGameStore((ctx) => legacy.read(ctx));
  const relic = carriedRelic(account);
  const pay = bountyScale(Math.min(wave, TOTAL_WAVES), relicBountyScale(account));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <HudLabel>Keep</HudLabel>
        <HeartRow current={lives} max={livesMax} size={18} />
      </div>
      <CurrencyDisplay amount={gold} name="Gold" />
      <HudSurface interactive={false} elevation="raised" padding="8px 10px" width={480} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
        <WaveIndicator wave={Math.min(wave, TOTAL_WAVES)} totalWaves={TOTAL_WAVES} />
        <HudLabel>{waveStatusLine({ started, releasing, wave: Math.min(wave, TOTAL_WAVES), alive: remaining })}</HudLabel>
        {started && composition.length > 0 ? <HudLabel>{waveCompositionLine(composition, tier)}</HudLabel> : null}
        {ready ? <HudLabel>{preview}</HudLabel> : null}
        {boss === null ? null : <HudLabel>{bossLine(boss)}</HudLabel>}
        <HudLabel>{`Kill pay ×${pay.toFixed(2)} · standing ${account.standing}`}</HudLabel>
        {relic === null ? null : <HudLabel>{`Relic · ${relic.label} — ${relic.detail}`}</HudLabel>}
      </HudSurface>
      <HudSurface open={ready && !done} elevation="overlay" title={started ? "Choose your next assault" : "Prepare the beacon"} width={256}>
        <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.45 }}>{bonus > 0 ? `Wait for a safer approach, or send the next wave with ${remaining} raiders still alive for +${bonus} gold.` : "Place defenses on the foundation rings, then release the raiders when you are ready."}</p>
        <HudButton variant="primary" cue="confirm" onClick={() => commands.run("wave.send", {})}>
          {started ? `Send wave ${wave + 1}` : "Begin first assault"}{bonus > 0 ? ` — +${bonus} gold` : ""}
        </HudButton>
        <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.7 }}>{`Director ${tierLabel(tier)} · tier ${tier} of 2`}</p>
      </HudSurface>
    </div>
  );
}
