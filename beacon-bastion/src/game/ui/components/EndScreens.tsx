import { useGame, useGameStore } from "@jgengine/react/hooks";
import { ResultsScreen } from "@/components/ui/results-screen";

import { keep } from "../../keep";
import { currentWaveNumber } from "../../session";
import { bountyReadout } from "../../waves/bounty";
import { boonDef, carriedRelic, legacy, relicBountyScale } from "../../waves/legacy";
import { TOTAL_WAVES } from "../../waves/manifest";

/**
 * The result card: what the defense paid, what it banked, and the relics the next one may open with.
 * One card for a hold and a fall alike - a fallen keep still has something to carry forward.
 */
export function EndScreens() {
  const { commands } = useGame();
  const gameOver = useGameStore((ctx) => keep.of(ctx).fact("keep.fallen") === true);
  const victory = useGameStore((ctx) => keep.of(ctx).fact("keep.held") === true);
  const bountyEarned = useGameStore((ctx) => keep.of(ctx).num("keep.bounty_earned"));
  const account = useGameStore((ctx) => legacy.read(ctx));

  if (!gameOver && !victory) return null;

  const wave = Math.max(1, Math.min(TOTAL_WAVES, currentWaveNumber()));
  const readout = bountyReadout(wave, bountyEarned, relicBountyScale(account));
  const relic = carriedRelic(account);
  const entries = [
    ...account.offer.map((id) => {
      const boon = boonDef(id);
      return { id: `boon:${id}`, label: boon === null ? id : `${boon.label} · ${boon.detail}` };
    }),
    { id: "restart", label: "Defend again" },
  ];

  return (
    <ResultsScreen
      outcome={victory ? "victory" : "defeat"}
      title={victory ? "The Keep Holds" : "The Keep Has Fallen"}
      lines={[
        { label: "Waves Reached", value: `${wave} / ${TOTAL_WAVES}`, accent: true },
        { label: "Bounties Paid", value: `${readout.earned} gold` },
        {
          label: "Kill Pay",
          value: `${readout.opening}g → ${readout.closing}g a raider (×${readout.scale.toFixed(2)})`,
        },
        { label: "Gold Banked", value: `${account.bankedGold} gold` },
        { label: "Standing", value: account.standing },
        { label: "Relic", value: relic === null ? "none carried" : relic.label },
      ]}
      entries={entries}
      onActivate={(id) => {
        commands.run("legacy.choose", { boon: id.startsWith("boon:") ? id.slice("boon:".length) : null });
      }}
    />
  );
}
