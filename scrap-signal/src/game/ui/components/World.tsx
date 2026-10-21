import { useCurrency, useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { ScrapPanel } from "./ScrapPanel";
import { useStore } from "@jgengine/react/store";
import { BLACK_MARKET_UPGRADES, upgradeCost } from "../../commands";
import { QUEST_ECHOES } from "../../quests/catalog";
import {
  blackMarketOpenStore,
  blackMarketStore,
  currentZoneStore,
  discoveredStationsStore,
  echoStore,
  travelOpenStore,
  reactorOpenStore,
} from "../../stores";
import { TRAVEL_STATIONS } from "../../world/sites";
import { FERRALON } from "../../palette";

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function ZoneBanner() {
  const nowMs = useNowMs();
  const zone = useStore(currentZoneStore);
  if (zone === null || nowMs - zone.atMs > 4000) return null;
  return (
    <div key={zone.name} className="scrap-banner pointer-events-none flex flex-col items-center">
      <span className="border-b-2 border-amber-400 px-6 pb-1 text-3xl font-black uppercase tracking-[0.3em] text-stone-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
        {zone.name}
      </span>
      <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
        Recommended level {zone.level}
      </span>
    </div>
  );
}

export function EchoBox() {
  const nowMs = useNowMs();
  const echo = useStore(echoStore);
  if (echo === null || nowMs - echo.atMs > 9000) return null;
  const line = QUEST_ECHOES[echo.questId];
  if (line === undefined) return null;
  return (
    <div className="max-w-[24rem] border-2 border-cyan-400/70 bg-black/80 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">
        ECHO — {line.speaker}
      </div>
      <div className="mt-1 text-xs font-semibold leading-relaxed text-stone-100">{line.line}</div>
    </div>
  );
}

export function CoresPlate() {
  const cores = useCurrency("cores");
  return (
    <div className="flex skew-x-[-8deg] items-baseline gap-1 border-2 border-black/80 bg-black/70 px-3 py-1">
      <span className="text-sm font-black text-fuchsia-400">◆</span>
      <span className="text-lg font-black tabular-nums text-stone-50">{cores}</span>
    </div>
  );
}

export function TravelPanel() {
  const { commands } = useGame();
  const open = useStore(travelOpenStore);
  const discovered = useStore(discoveredStationsStore);
  if (!open) return null;
  return (
    <ScrapPanel title="Fast Travel Network" onClose={() => commands.run("travel.close", {})}>
      <div className="flex flex-col gap-1.5">
        {TRAVEL_STATIONS.map((station) => {
          const known = discovered.includes(station.zoneId);
          return (
            <HudButton
              key={station.zoneId}
              block
              disabled={!known}
              onClick={() => commands.run("travel.go", { zoneId: station.zoneId })}
              className="scrap-row scrap-row-cyan"
            >
              <span className="flex-1 text-sm font-bold uppercase tracking-wider text-stone-100">
                {known ? station.name : "??? — undiscovered"}
              </span>
              {known ? <span className="text-xs font-black text-cyan-300">GO</span> : null}
            </HudButton>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">
        Walk up to a station in the world to register it
      </p>
    </ScrapPanel>
  );
}

export function BlackMarketPanel() {
  const { commands } = useGame();
  const open = useStore(blackMarketOpenStore);
  const cores = useCurrency("cores");
  const counts = useStore(blackMarketStore);
  if (!open) return null;
  return (
    <ScrapPanel title="Switchboard Exchange" onClose={() => commands.run("blackmarket.close", {})}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
        ◆ {cores} cores — elites and bosses drop it
      </div>
      <div className="flex flex-col gap-1.5">
        {BLACK_MARKET_UPGRADES.map((upgrade) => {
          const owned = counts[upgrade.id] ?? 0;
          const cost = upgradeCost(owned);
          const affordable = cores >= cost;
          return (
            <HudButton
              key={upgrade.id}
              block
              disabled={!affordable}
              onClick={() => commands.run("blackmarket.buy", { upgrade: upgrade.id })}
              className="scrap-row scrap-row-fuchsia"
            >
              <span className="flex-1">
                <span className="block text-sm font-bold uppercase tracking-wider text-stone-100">
                  {upgrade.name} <span className="text-stone-500">(owned {owned})</span>
                </span>
                <span className="block text-[11px] text-stone-400">{upgrade.blurb}</span>
              </span>
              <span className="text-sm font-black tabular-nums text-fuchsia-300">◆ {cost}</span>
            </HudButton>
          );
        })}
      </div>
    </ScrapPanel>
  );
}

export function ReactorEnding() {
  const reactor = useStore(reactorOpenStore);
  const nowMs = useNowMs();
  if (reactor === null || nowMs - reactor.atMs > 16000) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 220px 80px ${FERRALON.hudAmber}44` }} />
      <span className="text-5xl font-black uppercase tracking-[0.25em] text-amber-300 drop-shadow-[0_3px_16px_rgba(0,0,0,0.95)]">
        The Colossus Falls
      </span>
      <span className="mt-3 max-w-[30rem] text-center text-sm font-semibold leading-relaxed text-stone-100">
        The Reactor opens. Legendary loot rains onto Ember Gate — Ferralon is yours to keep farming, Reclaimer.
      </span>
    </div>
  );
}
