import type { CSSProperties, ReactNode } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitObjective, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitActionPrompt, KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { continueGame, newGame } from "../flow";
import { idea } from "../idea";
import { campView, prompts } from "../prompts";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

function useCamp() {
  return useGameStore(campView, same);
}

function useHealth(id: string): { current: number; max: number } {
  return useGameStore((ctx) => {
    const stat = ctx.scene.entity.stats.get(id, "health");
    return stat === null ? { current: 0, max: 1 } : { current: Math.round(stat.current), max: stat.max };
  }, same);
}

const corner = (place: CSSProperties): CSSProperties => ({ position: "absolute", pointerEvents: "none", ...place });

function Vitals(): ReactNode {
  const ctx = useGameContext();
  const hero = useHealth(ctx.player.userId);
  const home = useHealth("home");
  return (
    <div style={corner({ left: 20, top: 20, width: 280 })}>
      <KitPanel variant="hud" eyebrow={idea.name}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <KitMeter label="You" value={hero.current} max={hero.max} tone={hero.current < hero.max * 0.35 ? "bad" : "good"} readout />
          <KitMeter label={idea.home.label} value={home.current} max={home.max} tone={home.current < home.max * 0.35 ? "bad" : "accent"} readout variant="segments" segments={12} />
        </div>
      </KitPanel>
    </div>
  );
}

function Stockpile(): ReactNode {
  const camp = useCamp();
  return (
    <div style={corner({ right: 20, top: 72 })}>
      <KitPanel variant="strip">
        <div style={{ display: "flex", gap: 18, alignItems: "baseline" }}>
          {camp.resources.map((resource) => (
            <span key={resource.id} data-resource={resource.id} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ fontSize: "var(--jg-type-xl, 22px)", fontWeight: 800 }}>{resource.amount}</span>
              <span style={{ opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 }}>{resource.label}</span>
            </span>
          ))}
          {idea.allies.length > 0 ? (
            <span style={{ opacity: 0.75, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{camp.tamed} tamed</span>
          ) : null}
        </div>
      </KitPanel>
    </div>
  );
}

function WaveClock(): ReactNode {
  const camp = useCamp();
  const text = camp.raiding ? `${idea.wave} ${camp.wave} - ${camp.alive} left` : `${idea.wave} ${camp.wave + 1} in ${camp.duskIn}s`;
  return (
    <div style={corner({ left: "50%", top: 18, transform: "translateX(-50%)" })}>
      <KitPanel variant="strip" tone={camp.raiding ? "bad" : "neutral"}>
        <span data-wave-clock="" style={{ fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {text}
        </span>
        <span style={{ marginLeft: 14, opacity: 0.7, fontSize: 12 }}>{camp.raiding ? `held ${camp.held}` : "N - call it early"}</span>
      </KitPanel>
      <KitBanner cue={camp.raiding ? camp.wave : null} title={`${idea.wave} ${camp.wave}`} subtitle={`Hold ${idea.home.label}`} tone="bad" />
    </div>
  );
}

function Story(): ReactNode {
  const camp = useCamp();
  const beat = idea.beats.find((entry) => entry.id === camp.mission?.missionId) ?? null;
  if (beat === null && camp.next === null) return null;
  return (
    <div style={corner({ left: 20, top: 168, width: 340 })}>
      <KitObjective
        eyebrow={idea.guide.name}
        title={beat?.title ?? camp.next?.text ?? ""}
        steps={beat === null ? [] : [{ id: beat.id, label: beat.goal }]}
        hint={beat?.pitch}
        hintAfter={0}
        progressKey={beat?.id}
      />
    </div>
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const camp = useCamp();
  const have = Object.fromEntries(camp.resources.map((resource) => [resource.id, resource.amount]));
  return (
    <div style={corner({ left: "50%", bottom: 22, transform: "translateX(-50%)", pointerEvents: "auto" })}>
      <KitPanel variant="strip">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {idea.structures.map((structure, index) => {
            const short = Object.entries(structure.cost).some(([id, amount]) => (have[id] ?? 0) < amount);
            const cost = Object.entries(structure.cost)
              .map(([id, amount]) => `${amount} ${idea.resources.find((resource) => resource.id === id)?.label ?? id}`)
              .join(" + ");
            return (
              <KitButton key={structure.id} data-build={structure.id} size="sm" variant={short ? "ghost" : "secondary"} glyph={String(index + 1)} onClick={() => ctx.game.commands.run(`build${index + 1}`, {})}>
                {structure.label} <span style={{ opacity: 0.7, marginLeft: 6 }}>{cost}</span>
              </KitButton>
            );
          })}
          {camp.building.map((order) => (
            <KitMeter key={order.id} label={order.label} value={order.progress} max={1} size="sm" style={{ width: 120 }} />
          ))}
        </div>
      </KitPanel>
    </div>
  );
}

function Prompt(): ReactNode {
  const active = useGameStore((ctx) => {
    const me = ctx.scene.entity.get(ctx.player.userId);
    if (me === null) return null;
    const hit = resolveActivePrompt({ x: me.position[0], z: me.position[2] }, prompts(ctx));
    return hit === null || hit.prompt.display.kind !== "keybind" ? null : (hit.prompt.display.label ?? null);
  });
  if (active === null) return null;
  return (
    <div style={corner({ left: "50%", bottom: 104, transform: "translateX(-50%)" })}>
      <KitActionPrompt action="interact" label={active} fallbackGlyph="E" />
    </div>
  );
}

function Ending(): ReactNode {
  const ctx = useGameContext();
  const camp = useCamp();
  return (
    <KitResultScreen
      open={camp.fallen}
      tone="bad"
      eyebrow={`${idea.wave} ${camp.wave}`}
      title={`${idea.home.label} has fallen`}
      summary={`You held ${camp.held} ${idea.wave.toLowerCase()}${camp.held === 1 ? "" : "s"}.`}
      stats={[
        { label: `${idea.wave}s held`, value: camp.held },
        { label: "Tamed", value: camp.tamed },
      ]}
      actions={[
        { id: "retry", label: "Back to the last save", primary: true },
        { id: "new", label: "New game" },
      ]}
      onAction={(id) => {
        if (id === "retry") void continueGame(ctx);
        else void newGame(ctx);
      }}
    />
  );
}

/** Everything on screen while playing. */
export function Hud(): ReactNode {
  return (
    <>
      <Vitals />
      <WaveClock />
      <Stockpile />
      <Story />
      <Prompt />
      <BuildBar />
      <Ending />
    </>
  );
}
