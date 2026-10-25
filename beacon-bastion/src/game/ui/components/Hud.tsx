import { useGame, useGameStore } from "@jgengine/react/hooks";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";

import { keep } from "../../keep";
import { TOTAL_WAVES } from "../../waves/manifest";
import { activeCreepCount, currentWaveNumber, session } from "../../session";
import { canSendWave, waveOverlapBonus } from "../../waves/director";
import { bountyScale } from "../../waves/bounty";
import { carriedRelic, legacy, relicBountyScale } from "../../waves/legacy";
import { bossLine, tierLabel, wavePreviewLine, waveStatusLine } from "../../waves/status";
import { Brazier } from "../kit/Brazier";

/**
 * The keep's own signage, top-left: the beacon brazier burns as high as the keep has lives, and
 * the purse hangs beside it on a timber sign. Both step back when nothing changes and hold at full
 * strength once the keep is in danger.
 */
export function KeepSigns() {
  const lives = useGameStore((ctx) => keep.of(ctx).num("keep.lives"));
  const livesMax = useGameStore((ctx) => keep.of(ctx).num("keep.lives_max"));
  const gold = useGameStore((ctx) => keep.of(ctx).num("keep.gold"));
  const wave = useGameStore(() => currentWaveNumber());
  const account = useGameStore((ctx) => legacy.read(ctx));
  const relic = carriedRelic(account);
  const pay = bountyScale(Math.min(wave, TOTAL_WAVES), relicBountyScale(account));
  const ratio = livesMax > 0 ? lives / livesMax : 0;
  const danger = ratio <= 0.3;

  return (
    <div className="bb-signs">
      <HudFade watch={[lives]} hold={danger} dimTo={0.45} idleMs={4000}>
        <div className="bb-beacon" data-danger={danger ? "" : undefined} aria-label={`Keep lives ${lives} of ${livesMax}`}>
          <Brazier size={46} strength={0.15 + ratio * 0.85} />
          <GameFrame material="stone" cut="chamfer" depth={8} padding="4px 12px 5px" className="bb-plinth">
            <span className="bb-plinth-num">{lives}</span>
            <span className="bb-plinth-max">/{livesMax}</span>
          </GameFrame>
        </div>
      </HudFade>
      <HudFade watch={[gold, pay]} dimTo={0.45} idleMs={4000}>
        <div className="bb-purse">
          <span className="bb-chains" aria-hidden />
          <GameFrame material="wood" cut="notch" depth={8} padding="5px 14px 6px 10px" className="bb-purse-sign" aria-label={`${gold} gold`}>
            <GameIcon name="coin" size={20} color="#f6cf5a" />
            <span className="bb-purse-num">{gold}</span>
          </GameFrame>
          <span className="bb-pay" title="Kill pay this wave">
            ×{pay.toFixed(2)} bounty
          </span>
          {relic === null ? null : (
            <span className="bb-relic" title={relic.detail}>
              <GameIcon name="amulet" size={13} /> {relic.label}
            </span>
          )}
        </div>
      </HudFade>
    </div>
  );
}

/**
 * The wave count cut into a timber board at the top edge, with one short line under it saying what
 * the road is doing. A boss on the field hangs a red pennant under the board and holds it lit.
 */
export function WaveBoard() {
  const started = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_started") === true);
  const wave = useGameStore(() => currentWaveNumber());
  const remaining = useGameStore(() => activeCreepCount());
  const releasing = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_ready") !== true && !session.encounter.view().done);
  const boss = useGameStore(() => session.boss);
  const shown = Math.min(wave, TOTAL_WAVES);
  const status = waveStatusLine({ started, releasing, wave: shown, alive: remaining });
  const bossText = bossLine(boss);

  return (
    <HudFade watch={[shown, remaining, started, releasing]} hold={bossText !== null} dimTo={0.4} idleMs={5000}>
      <div className="bb-waveboard">
        <GameFrame material="wood" cut="banner" depth={12} padding="6px 22px 16px" className="bb-board">
          <span className="bb-board-label">Wave</span>
          <span className="bb-board-num">
            {shown}
            <small>/{TOTAL_WAVES}</small>
          </span>
        </GameFrame>
        <span className="bb-road">{status}</span>
        {bossText === null ? null : (
          <GameFrame material="enamel" tint="#7d1d12" edge="#2a0804" cut="banner" depth={8} padding="4px 14px 10px" className="bb-pennant">
            <GameIcon name="skull" size={14} /> {bossText}
          </GameFrame>
        )}
      </div>
    </HudFade>
  );
}

/**
 * The war horn: when the director has the next assault ready, a short preview of who is coming and
 * the button that sends them. Before the first wave it carries one line of instruction.
 */
export function ReleaseHorn() {
  const { commands } = useGame();
  const done = useGameStore(() => session.encounter.view().done);
  const ready = useGameStore((ctx) => canSendWave(ctx));
  const started = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_started") === true);
  const bonus = useGameStore((ctx) => waveOverlapBonus(ctx));
  const wave = useGameStore(() => currentWaveNumber());
  const tier = useGameStore(() => session.pressure.tier);
  const nextIndex = started ? wave : 0;
  const preview = useGameStore(() => wavePreviewLine(session.encounter.waveAt(nextIndex), nextIndex + 1));
  if (!ready || done) return null;

  return (
    <div className="bb-horn">
      <GameFrame material="paper" cut="torn" depth={8} padding="8px 12px 14px" className="bb-orders">
        <span className="bb-orders-line">{preview.replace(/^Next · /, "")}</span>
        <span className="bb-orders-sub">
          {started ? `Director ${tierLabel(tier)}` : "Build on the rings, then sound the horn"}
        </span>
      </GameFrame>
      <GameFrame
        as="button"
        material="enamel"
        tint="#8a2414"
        edge="#2a0804"
        cut="hex"
        depth={14}
        padding="11px 26px"
        glow="rgba(255,140,50,0.5)"
        className="bb-sound"
        cue="confirm"
        onClick={() => commands.run("wave.send", {})}
      >
        <GameIcon name="flag" size={18} />
        <span>{started ? `Send wave ${wave + 1}` : "Begin first assault"}</span>
        {bonus > 0 ? <small>+{bonus} gold</small> : null}
      </GameFrame>
    </div>
  );
}
