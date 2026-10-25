import { useGame, useGameStore } from "@jgengine/react/hooks";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useMenuNav } from "@jgengine/react/menuNav";

import { keep } from "../../keep";
import { currentWaveNumber } from "../../session";
import { bountyReadout } from "../../waves/bounty";
import { boonDef, carriedRelic, legacy, relicBountyScale } from "../../waves/legacy";
import { TOTAL_WAVES } from "../../waves/manifest";
import { Brazier } from "../kit/Brazier";
import { FIRE } from "../theme";

/**
 * The defense's memorial stone: what it paid, what it banked, and the relics the next keep may open
 * with, each on a sealed writ. One stone for a hold and a fall alike - a fallen keep still has
 * something to carry forward. The field behind is shut out, so nothing on the road runs through it.
 */
export function EndScreens() {
  const gameOver = useGameStore((ctx) => keep.of(ctx).fact("keep.fallen") === true);
  const victory = useGameStore((ctx) => keep.of(ctx).fact("keep.held") === true);
  if (!gameOver && !victory) return null;
  return <Memorial victory={victory} />;
}

function Memorial({ victory }: { victory: boolean }) {
  const { commands } = useGame();
  const bountyEarned = useGameStore((ctx) => keep.of(ctx).num("keep.bounty_earned"));
  const account = useGameStore((ctx) => legacy.read(ctx));
  const wave = Math.max(1, Math.min(TOTAL_WAVES, currentWaveNumber()));
  const readout = bountyReadout(wave, bountyEarned, relicBountyScale(account));
  const relic = carriedRelic(account);
  const offers = account.offer.map((id) => ({ id: `boon:${id}`, boon: boonDef(id), raw: id }));
  const ids = [...offers.map((offer) => offer.id), "restart"];
  const choose = (id: string) => commands.run("legacy.choose", { boon: id.startsWith("boon:") ? id.slice("boon:".length) : null });
  const nav = useMenuNav({ ids, onConfirm: choose });

  const lines: [string, string][] = [
    ["Waves reached", `${wave} / ${TOTAL_WAVES}`],
    ["Bounties paid", `${readout.earned} gold`],
    ["Kill pay", `${readout.opening} → ${readout.closing} gold (×${readout.scale.toFixed(2)})`],
    ["Gold banked", `${account.bankedGold}`],
    ["Standing", String(account.standing)],
    ["Relic carried", relic === null ? "none" : relic.label],
  ];

  return (
    <div className="bb-memorial" data-outcome={victory ? "victory" : "defeat"}>
      <div className="bb-memorial-dark" aria-hidden />
      <GameFrame material="stone" tint="#5a554d" cut="chamfer" depth={22} padding="18px 30px 24px" className="bb-memorial-stone">
        <Brazier size={48} strength={victory ? 1 : 0} className="bb-memorial-fire" />
        <h2 className="bb-memorial-title">{victory ? "The Keep Holds" : "The Keep Has Fallen"}</h2>
        <dl className="bb-ledger">
          {lines.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="bb-memorial-ask">Carry one relic into the next keep</p>
        <nav className="bb-writs" {...nav.containerProps} data-jg-cursor-scope="">
          {offers.map((offer) => (
            <GameFrame
              key={offer.id}
              as="button"
              material="paper"
              cut="torn"
              depth={8}
              padding="10px 12px 16px"
              className="bb-writ"
              {...nav.itemProps(offer.id)}
              onClick={() => choose(offer.id)}
            >
              <i className="bb-wax" aria-hidden>
                <GameIcon name="star" size={14} color="#ffd9b0" />
              </i>
              <strong>{offer.boon === null ? offer.raw : offer.boon.label}</strong>
              <span>{offer.boon === null ? "" : offer.boon.detail}</span>
            </GameFrame>
          ))}
          <GameFrame
            as="button"
            material="wood"
            cut="notch"
            depth={10}
            padding="10px 22px"
            className="bb-plank bb-again"
            {...nav.itemProps("restart")}
            onClick={() => choose("restart")}
          >
            <span className="bb-plank-label" data-text="Defend again">Defend again</span>
          </GameFrame>
          <GameCursor variant="diamond" color={FIRE} arm={16} gap={8} />
        </nav>
      </GameFrame>
    </div>
  );
}
