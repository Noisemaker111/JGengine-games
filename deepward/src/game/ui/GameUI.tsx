import { useEffect, useState } from "react";
import { useBrowserSuspension, useDialogBehavior } from "@jgengine/react";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { useSettings } from "@jgengine/react/settings";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { distance, EXIT, roomAt } from "../../world";
import { nearby, storageChanged, viewStore } from "../controls";
import { CACHE, footprint, ITEMS, RIFLE, SIDEARM } from "../state";
import { REFITS, refitMissing, type RefitId } from "../progression";
import { ItemMark } from "./ItemMark";
import { SAVE_KEY } from "../save";

function grab(): void {
  const canvas = document.querySelector("canvas");
  // The published shell receives keys on its focusable canvas wrapper. A menu
  // button can disappear while retaining keyboard focus, so return it to play.
  canvas?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
  try { const request = canvas?.requestPointerLock(); if (request instanceof Promise) void request.catch(() => {}); } catch { /* the player can click the scene */ }
}
export function GameUI() {
  const ctx = useGameContext(), view = useStore(viewStore);
  const at = useGameStore(state => state.scene.entity.get(state.player.userId)?.position ?? [0, 0, 14] as const);
  const target = useGameStore(nearby);
  const [selected, setSelected] = useState<string | null>(null);
  const [credits, setCredits] = useState(false);
  const settings = useSettings();
  const command = (name: string, input: unknown = {}) => ctx.game.commands.run(`deepward.${name}`, input);
  const shiftDialogRef = useDialogBehavior({
    open: view.panel !== null || view.paused || view.mode === "reprinting" || view.mode === "saving" || view.mode === "blocked",
    focusKey: view.panel ?? view.mode,
    onClose: view.mode === "home" || view.mode === "dive" ? () => command("close") : undefined,
  });
  const creditsRef = useDialogBehavior({ open: credits, onClose: () => setCredits(false) });
  useEffect(() => {
    if (view.panel === null && !view.paused && (view.mode === "home" || view.mode === "dive")) {
      document.querySelector("canvas")?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
    }
  }, [view.panel, view.paused, view.mode]);
  useBrowserSuspension(() => {
    const v = viewStore.read(ctx);
    if (!v.paused && v.panel === null && (v.mode === "home" || v.mode === "dive")) ctx.game.commands.run("deepward.pause", { paused: true });
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || event.repeat || settings.isOpen) return;
      const current = viewStore.read(ctx);
      if (credits || current.panel !== null || current.paused || (current.mode !== "home" && current.mode !== "dive")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      ctx.game.commands.run("deepward.pause", {});
    };
    const storage = (event: StorageEvent) => { if (event.key === SAVE_KEY || event.key === null) storageChanged(ctx); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("storage", storage);
    };
  }, [ctx, credits, settings.isOpen]);
  const dive = view.dive;
  const low = dive !== null && dive.oxygen <= 25;
  const weapon = dive?.hand === "service-rifle" ? RIFLE : SIDEARM;
  const chosen = dive?.cache.find(i => i.uid === selected);
  const cells = Array.from({ length: CACHE.w * CACHE.h }, (_, i) => ({ x: i % CACHE.w, y: Math.floor(i / CACHE.w) }));
  const close = () => { command("close"); grab(); };
  return <div className={`dw-ui ${low ? "dw-low" : ""}`} onKeyDown={event => {
    if (event.code === "Tab") event.stopPropagation();
    if ((event.code === "Space" || event.code === "Enter") && event.target instanceof HTMLElement && event.target.closest("button, a, input, select, textarea, [contenteditable=true]")) event.stopPropagation();
  }}>
    <header className="dw-top">
      <div><span className="dw-eyebrow">Halloway municipal print service / 06</span><h1>DEEPWARD<span> / {dive === null ? "MARROW" : "BELLWETHER"}</span></h1>
        <p>{roomAt(at, dive === null ? "home" : "vault")} · Life {view.home.life}</p></div>
      <HudButton disabled={view.mode !== "home" && view.mode !== "dive"} onClick={() => command("pause")} className="dw-small">Pause / Esc</HudButton>
      <HudButton className="dw-small" onClick={() => {
        if (!view.paused && view.panel === null && (view.mode === "home" || view.mode === "dive")) command("pause");
        settings.open();
      }}>Settings & controls</HudButton>
      <HudButton className="dw-small" onClick={() => {
        if (!view.paused && view.panel === null && (view.mode === "home" || view.mode === "dive")) command("pause");
        setCredits(true);
      }}>Credits</HudButton>
    </header>
    {dive !== null && <>
      <HudSurface className="dw-air" as="section" aria-label="Oxygen tank" interactive={false}>
        <span className="dw-eyebrow">Equipment / {dive.tankSeconds > 110 ? "sealed tank" : "issue tank"}</span>
        <div><strong>{Math.ceil(dive.oxygen)}<small>s</small></strong><span>{dive.oxygen === 0 ? "NO AIR / HEALTH BLEED" : low ? "RETRACE TO THE RAIL" : "AIR REMAINING"}</span></div>
        <progress max={dive.tankSeconds} value={dive.oxygen} />
        <p>Return rail · {Math.round(distance(at, EXIT))} m · the way you came in</p>
      </HudSurface>
      <div className="dw-reticle" aria-hidden="true">{dive.flash > 0 ? "+" : "·"}</div>
      {dive.hurt > 0 && <div className="dw-damage" aria-hidden="true" />}
      <HudSurface className="dw-vitals" interactive={false}><span>HEALTH <strong>{Math.ceil(dive.health)}</strong> / 100</span><progress value={dive.health} max={100} />
        <span>ONE HAND / {weapon.label}</span><div className="dw-ammo">{dive.reload > 0 ? `RELOADING ${dive.reload.toFixed(1)}s` : `${dive.magazine} / 6`} <small>{dive.reserve} reserve</small></div>
      </HudSurface>
      <HudSurface className="dw-haul" interactive={false}><span className="dw-eyebrow">Carried / at risk</span><strong>{dive.cache.length} {dive.cache.length === 1 ? "item" : "items"}</strong>
        <p>{dive.cache.map(i => ITEMS[i.kind].name).join(" · ") || "Nothing carried yet"}</p>
        <HudButton onClick={() => command("cache")}>Open cache / Tab</HudButton>
      </HudSurface>
    </>}
    {view.mode === "home" && view.panel === null && <HudSurface className="dw-home" as="aside" aria-label="Marrow departure" interactive={false}>
      <span className="dw-eyebrow">Marrow / rail line 06</span><h2>Rail departure / 06</h2>
      <p>Find supplies in Bellwether. Return to this rail before your air runs out.</p>
      <dl><div><dt>Persistent stash</dt><dd>{view.home.stash.length} {view.home.stash.length === 1 ? "item" : "items"}</dd></div><div><dt>Returns</dt><dd>{view.home.extractions}</dd></div><div><dt>Lives lost</dt><dd>{view.home.deaths}</dd></div></dl>
      <p className="dw-note">Stash / refit bench to the left. Return banks the haul. Death or dive reload loses carried items.</p>
      <p className="dw-note">Next departure: {view.rifleUid === null ? "issue sidearm · 12 free cache squares" : "banked service rifle · 9 free cache squares · rifle at risk"}. Prepare a rifle at the stash bench.</p>
      {view.home.last !== null && <p className={`dw-result ${view.home.last.kind}`}><strong>{view.home.last.kind === "extracted" ? "RETURNED" : "REPRINTED"}</strong> {view.home.last.reason}</p>}
    </HudSurface>}
    <footer className="dw-bottom">
      <HudSurface className="dw-radio" interactive={false}><span>MARROW / RADIO</span><p role="status">{view.hint}</p></HudSurface>
      {dive?.channel !== null && dive?.channel !== undefined ? <div className="dw-prompt"><strong>Searching / keep still</strong><progress max={1.4} value={1.4 - dive.channel.remaining} /><small>E to cancel · movement or damage interrupts</small></div>
        : target !== null && view.panel === null && !view.paused ? <HudButton className="dw-prompt" onClick={() => { command("interact"); const next = viewStore.read(ctx); if (!next.paused && next.panel === null && (next.mode === "home" || next.mode === "dive")) grab(); }}>{target.label}</HudButton> : null}

      {view.error && view.mode !== "saving" && view.mode !== "blocked" && <p role="alert" className="dw-error">{view.error}</p>}
    </footer>
    {view.panel === "stash" && <div className="dw-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet" aria-label="Marrow stash" role="dialog" aria-modal="true" tabIndex={-1}>
      <HudButton className="dw-sheet-close" onClick={close}>Close bench ×</HudButton>
      <span className="dw-eyebrow">Permanent / saved on return</span><h2>Marrow's stash</h2>
      <p>These exact item instances survived the rail journey. They remain here through deaths and reloads.</p>
      <h3>Choose the next shift</h3><p>Travel light with the issue sidearm and twelve free cache squares, or risk a recovered rifle for 30 damage per shot instead of 20. A rifle fills three squares and is lost on death or dive reload. Returning banks the same rifle again.</p>
      <HudButton aria-pressed={view.rifleUid === null} onClick={() => command("prepareRifle", { uid: null })}>Travel light / keep rifles safe</HudButton>
      {view.home.stash.length === 0 ? <p className="dw-empty">Empty shelves. Bring something home from Bellwether.</p> : <div className="dw-stash-list">{view.home.stash.map(item => <article key={item.uid}>
        <ItemMark kind={item.kind} size={38} /><div><strong>{ITEMS[item.kind].name}</strong><p>{ITEMS[item.kind].maker} · {ITEMS[item.kind].rarity} · level {item.level} · {ITEMS[item.kind].found}</p><small>{ITEMS[item.kind].detail}</small><small>Recovered on dive {item.uid.split(":")[0]}</small>{item.kind === "service-rifle" && <HudButton aria-pressed={view.rifleUid === item.uid} onClick={() => command("prepareRifle", { uid: item.uid })}>{view.rifleUid === item.uid ? "Prepared / three squares at risk" : "Prepare this rifle / risk next shift"}</HudButton>}</div>
      </article>)}</div>}
      <h3>Refit the next departure</h3><p>Both refits need a copper spool. Spending it here means another rail journey for the other refit. Installed refits survive every Life.</p>
      {(Object.keys(REFITS) as RefitId[]).map(id => { const refit = REFITS[id], installed = view.home.refits.includes(id), missing = refitMissing(view.home, id); return <article className="dw-refit" key={id}>
        <h4>{refit.name} {installed ? " / installed" : ""}</h4><p>{refit.effect}</p>
        <p>Cost: {refit.recipe.inputs.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>
        <HudButton disabled={installed || missing.length > 0} onClick={() => command("refit", { id })}>{installed ? `${refit.name} installed` : `Install ${refit.name}`}</HudButton>
        {missing.length > 0 && !installed && <p>Still needed: {missing.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>}
      </article>; })}
      <p role="status">{view.hint}</p>{view.error && <p role="alert">{view.error}</p>}
      <div className="dw-actions"><HudButton onClick={close}>Back to Marrow</HudButton><HudButton onClick={() => window.location.reload()}>Reload saved stash</HudButton></div>
    </HudSurface></div>}
    {view.panel === "cache" && dive !== null && <div className="dw-modal dw-cache-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet" aria-label="Carried cache" role="dialog" aria-modal="true" tabIndex={-1}>
      <HudButton className="dw-sheet-close" onClick={close}>Close cache ×</HudButton>
      <span className="dw-eyebrow">Carried cache / 4 × 3 / equipment capacity</span><h2>What fits comes home.</h2><p className="dw-error">The tank and prints keep moving while you pack.</p>
      <div className="dw-cache-grid">
        {cells.map(c => <HudButton className="dw-cache-cell" key={`${c.x}:${c.y}`} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }} aria-label={`Move selected item to column ${c.x + 1}, row ${c.y + 1}`} onClick={() => { if (chosen) command("pack", { uid: chosen.uid, x: c.x, y: c.y }); }} />)}
        {dive.cache.map(i => { const f = footprint(i), item = ITEMS[i.kind]; return <HudButton key={i.uid} className={`dw-cache-item ${selected === i.uid ? "selected" : ""}`} style={{ gridColumn: `${i.x + 1} / span ${f.w}`, gridRow: `${i.y + 1} / span ${f.h}`, borderColor: item.color }} onClick={() => setSelected(i.uid)}><ItemMark kind={i.kind} size={28} /><span style={{ color: item.color }}>{item.name}</span><small>{item.rarity} · Lv 1</small></HudButton>; })}
      </div>
      {chosen ? <div className="dw-pack-controls"><strong>{ITEMS[chosen.kind].name}</strong><p>Select an empty square as its upper-left corner.</p>
        <div className="dw-actions">{([[-1, 0, "←"], [0, -1, "↑"], [0, 1, "↓"], [1, 0, "→"]] as const).map(([dx, dy, label]) => <HudButton key={label} aria-label={`Move ${label}`} onClick={() => command("pack", { uid: chosen.uid, x: chosen.x + dx, y: chosen.y + dy })}>{label}</HudButton>)}
          <HudButton onClick={() => command("pack", { uid: chosen.uid, rotate: true })}>Rotate</HudButton><HudButton onClick={() => { command("discard", { uid: chosen.uid }); setSelected(null); }}>Leave behind</HudButton></div>
      </div> : <p>Select a carried item to repack, rotate or leave it behind.</p>}
      {dive.cache.some(i => i.kind === "service-rifle") && <div className="dw-hand-wheel"><span>ONE HAND</span><HudButton aria-pressed={dive.hand === "sidearm"} onClick={() => command("equip", { hand: "sidearm" })}>Issue sidearm</HudButton><HudButton aria-pressed={dive.hand === "service-rifle"} onClick={() => command("equip", { hand: "service-rifle" })}>Found service rifle</HudButton></div>}
      <HudButton onClick={() => { command("cache"); grab(); }}>Close cache / Tab</HudButton>
    </HudSurface></div>}
    {view.paused && view.panel === null && <div className="dw-modal"><HudSurface ref={shiftDialogRef} elevation="modal" role="dialog" aria-modal="true" aria-label="Shift paused" tabIndex={-1} data-hud-window className="dw-sheet dw-pause"><span className="dw-eyebrow">Shift suspended / simulation paused</span><h2>Shift on hold.</h2><dl className="dw-control-list"><div><dt>Move / sprint</dt><dd>WASD or arrows / Shift</dd></div><div><dt>Look / fire</dt><dd>Click world / left mouse</dd></div><div><dt>Search / reload</dt><dd>E / R</dd></div><div><dt>Carried cache</dt><dd>Tab</dd></div></dl><p>Air and prints are paused. Reloading during a dive ends this Life and loses its haul.</p><HudButton onClick={() => { command("pause"); grab(); }}>Resume / Esc</HudButton><HudButton onClick={settings.open}>Settings & controls</HudButton><HudButton onClick={() => setCredits(true)}>Credits</HudButton><HudButton onClick={() => window.location.reload()}>{dive === null ? "Reload saved Marrow" : "Reload / abandon this Life"}</HudButton></HudSurface></div>}
    {view.mode === "reprinting" && <div className="dw-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet dw-pause" aria-label="Life ended" role="alertdialog" aria-modal="true" tabIndex={-1}>
      <span className="dw-eyebrow">Halloway / reprint docket · Life {view.home.life - 1} ended</span><h2>Bellwether kept the haul.</h2>
      <p>{view.home.last?.reason}</p><p>{view.home.last?.count === null ? "Carried haul lost." : `${view.home.last?.count ?? 0} carried items lost.`} {view.home.stash.length} banked items and {view.home.refits.length} installed refits remain safe in Marrow.</p>
      <p>Halloway has printed Life {view.home.life}. This loss is already saved; reloading cannot restore the expedition.</p>
      {view.error && <p role="alert">{view.error}</p>}
      <HudButton onClick={() => { command("acknowledgeReprint"); if (viewStore.read(ctx).mode === "home") grab(); }}>Accept reprint / return to Marrow</HudButton>
      <HudButton onClick={() => window.location.reload()}>Reload saved Marrow</HudButton>
    </HudSurface></div>}
    {(view.mode === "saving" || view.mode === "blocked") && <div className="dw-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet dw-pause" role="alertdialog" aria-label="Marrow save boundary" aria-modal="true" tabIndex={-1}>
      <span className="dw-eyebrow">Marrow / save boundary</span><h2>{view.mode === "saving" ? "Return pending" : "Marrow is unavailable"}</h2><p>{view.error}</p>
      <p>{view.mode === "saving" ? "The simulation is stopped. This return has not been acknowledged; retry or reload the saved record." : "The saved record has been preserved. No new dive can begin."}</p>
      {view.mode === "saving" && <HudButton onClick={() => command("retrySave")}>Retry saving this return</HudButton>}
      <HudButton onClick={() => window.location.reload()}>Reload saved Marrow</HudButton>
    </HudSurface></div>}
    {credits && <div className="dw-modal"><HudSurface ref={creditsRef} elevation="modal" data-hud-window className="dw-sheet" role="dialog" aria-modal="true" aria-label="Deepward credits" tabIndex={-1}>
      <h2>Deepward / credits</h2>
      <CreditsScreen document={{ sections: [
        { heading: "Original Deepward artwork", entries: [{ label: "Deepward", detail: "Original vault geometry, machinery, Fitter rig, signage, item art and synthesized mechanical sound cues." }] },
        { heading: "Technology", entries: [{ label: "JGengine", detail: "Apache-2.0", href: "https://jgengine.com" }, { label: "React", detail: "MIT" }, { label: "Three.js", detail: "MIT" }] },
      ] }} />
      <HudButton onClick={() => setCredits(false)}>Back to shift</HudButton>
    </HudSurface></div>}
  </div>;
}
