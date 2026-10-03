import { useEffect, useState } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { useGameStore } from "@jgengine/react/hooks";
import { distance, EXIT, roomAt } from "../../world";
import { nearby, storageChanged, viewStore } from "../controls";
import { CACHE, footprint, ITEMS, RIFLE, SIDEARM } from "../state";
import { REFITS, refitMissing, type RefitId } from "../progression";
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
  const command = (name: string, input: unknown = {}) => ctx.game.commands.run(`deepward.${name}`, input);
  useEffect(() => {
    if (view.panel === null && !view.paused && (view.mode === "home" || view.mode === "dive")) {
      document.querySelector("canvas")?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
    }
  }, [view.panel, view.paused, view.mode]);
  useEffect(() => {
    const pauseIfLive = () => {
      const v = viewStore.read(ctx);
      if (!v.paused && v.panel === null && (v.mode === "home" || v.mode === "dive")) ctx.game.commands.run("deepward.pause", {});
    };
    const key = (event: KeyboardEvent) => {
      if (event.code === "Tab") {
        const v = viewStore.read(ctx);
        const control = event.target instanceof HTMLElement && event.target.closest("button, a, input, select, textarea, [contenteditable=true]");
        if (v.panel !== null || v.paused || control || (v.mode !== "home" && v.mode !== "dive")) {
          // Native focus traversal belongs to menus; it must not toggle the carried cache.
          event.stopImmediatePropagation();
        } else event.preventDefault();
      }
      if (event.code !== "Escape" || event.repeat) return;
      event.preventDefault(); event.stopImmediatePropagation();
      ctx.game.commands.run("deepward.pause", {});
    };
    let locked = document.pointerLockElement !== null;
    const lock = () => { const next = document.pointerLockElement !== null; if (locked && !next) pauseIfLive(); locked = next; };
    const visibility = () => { if (document.hidden) pauseIfLive(); };
    const storage = (event: StorageEvent) => { if (event.key === SAVE_KEY || event.key === null) storageChanged(ctx); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", pauseIfLive);
    window.addEventListener("storage", storage);
    document.addEventListener("pointerlockchange", lock);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", pauseIfLive);
      window.removeEventListener("storage", storage);
      document.removeEventListener("pointerlockchange", lock);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [ctx]);
  const dive = view.dive;
  const low = dive !== null && dive.oxygen <= 25;
  const weapon = dive?.hand === "service-rifle" ? RIFLE : SIDEARM;
  const chosen = dive?.cache.find(i => i.uid === selected);
  const cells = Array.from({ length: CACHE.w * CACHE.h }, (_, i) => ({ x: i % CACHE.w, y: Math.floor(i / CACHE.w) }));
  const close = () => { command("close"); grab(); };
  return <div className={`dw-ui ${low ? "dw-low" : ""}`} onKeyDown={event => {
    if ((event.code === "Space" || event.code === "Enter") && event.target instanceof HTMLElement && event.target.closest("button, a, input, select, textarea, [contenteditable=true]")) event.stopPropagation();
  }}>
    <header className="dw-top">
      <div><span className="dw-eyebrow">One of the last lit vaults</span><h1>DEEPWARD<span> / {dive === null ? "MARROW" : "BELLWETHER"}</span></h1>
        <p>{roomAt(at, dive === null ? "home" : "vault")} · Life {view.home.life}</p></div>
      <button disabled={view.mode !== "home" && view.mode !== "dive"} onClick={() => command("pause")} className="dw-small">Pause / Esc</button>
    </header>
    {dive !== null && <>
      <section className="dw-air" aria-label="Oxygen tank">
        <span className="dw-eyebrow">Equipment / {dive.tankSeconds > 110 ? "sealed tank" : "issue tank"}</span>
        <div><strong>{Math.ceil(dive.oxygen)}<small>s</small></strong><span>{dive.oxygen === 0 ? "NO AIR / HEALTH BLEED" : low ? "RETRACE TO THE RAIL" : "AIR REMAINING"}</span></div>
        <progress max={dive.tankSeconds} value={dive.oxygen} />
        <p>Return rail · {Math.round(distance(at, EXIT))} m · the way you came in</p>
      </section>
      <div className="dw-reticle" aria-hidden="true">{dive.flash > 0 ? "+" : "·"}</div>
      {dive.hurt > 0 && <div className="dw-damage" aria-hidden="true" />}
      <section className="dw-vitals"><span>HEALTH <strong>{Math.ceil(dive.health)}</strong> / 100</span><progress value={dive.health} max={100} />
        <span>ONE HAND / {weapon.label}</span><div className="dw-ammo">{dive.reload > 0 ? `RELOADING ${dive.reload.toFixed(1)}s` : `${dive.magazine} / 6`} <small>{dive.reserve} reserve</small></div>
      </section>
      <section className="dw-haul"><span className="dw-eyebrow">Carried / at risk</span><strong>{dive.cache.length} {dive.cache.length === 1 ? "item" : "items"}</strong>
        <p>{dive.cache.map(i => ITEMS[i.kind].name).join(" · ") || "Nothing carried yet"}</p>
        <button onClick={() => command("cache")}>Open cache / Tab</button>
      </section>
    </>}
    {view.mode === "home" && view.panel === null && <aside className="dw-home">
      <span className="dw-eyebrow">Marrow / rail line 06</span><h2>Last shift at Bellwether</h2>
      <p>The staff kept printing after the lights went out. Take their supplies. Come back before your tank is empty.</p>
      <dl><div><dt>Persistent stash</dt><dd>{view.home.stash.length} {view.home.stash.length === 1 ? "item" : "items"}</dd></div><div><dt>Returns</dt><dd>{view.home.extractions}</dd></div><div><dt>Lives lost</dt><dd>{view.home.deaths}</dd></div></dl>
      <p className="dw-note">Garage ahead · stash on your left. Returning stores the haul immediately. Death or reload during a dive loses what you carry.</p>
      {view.home.last !== null && <p className={`dw-result ${view.home.last.kind}`}><strong>{view.home.last.kind === "extracted" ? "RETURNED" : "REPRINTED"}</strong> {view.home.last.reason}</p>}
    </aside>}
    <footer className="dw-bottom">
      <div className="dw-radio"><span>MARROW / RADIO</span><p role="status">{view.hint}</p></div>
      {dive?.channel !== null && dive?.channel !== undefined ? <div className="dw-prompt"><strong>Searching / keep still</strong><progress max={1.4} value={1.4 - dive.channel.remaining} /><small>E to cancel · movement or damage interrupts</small></div>
        : target !== null && view.panel === null && !view.paused ? <button className="dw-prompt" onClick={() => { command("interact"); const next = viewStore.read(ctx); if (!next.paused && next.panel === null && (next.mode === "home" || next.mode === "dive")) grab(); }}>{target.label}</button> : null}
      <p className="dw-keys">Click the vault to look · WASD / arrows move · Shift sprint · E interact · LMB fire · R reload · Tab cache · Esc pause</p>
      {view.error && view.mode !== "saving" && view.mode !== "blocked" && <p role="alert" className="dw-error">{view.error}</p>}
    </footer>
    {view.panel === "stash" && <div className="dw-modal"><section className="dw-sheet" aria-label="Marrow stash">
      <span className="dw-eyebrow">Permanent / saved on return</span><h2>Marrow's stash</h2>
      <p>These exact item instances survived the rail journey. They remain here through deaths and reloads.</p>
      {view.home.stash.length === 0 ? <p className="dw-empty">Empty shelves. Bring something home from Bellwether.</p> : <div className="dw-stash-list">{view.home.stash.map(item => <article key={item.uid}>
        <span className="dw-swatch" style={{ background: ITEMS[item.kind].color }} /><div><strong>{ITEMS[item.kind].name}</strong><p>{ITEMS[item.kind].maker} · {ITEMS[item.kind].rarity} · level {item.level} · {ITEMS[item.kind].found}</p><small>{ITEMS[item.kind].detail}</small><small>Recovered on dive {item.uid.split(":")[0]}</small></div>
      </article>)}</div>}
      <h3>Refit the next departure</h3><p>Both refits need a copper spool. Spending it here means another rail journey for the other refit. Installed refits survive every Life.</p>
      {(Object.keys(REFITS) as RefitId[]).map(id => { const refit = REFITS[id], installed = view.home.refits.includes(id), missing = refitMissing(view.home, id); return <article key={id}>
        <h4>{refit.name} {installed ? " / installed" : ""}</h4><p>{refit.effect}</p>
        <p>Cost: {refit.recipe.inputs.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>
        <button disabled={installed || missing.length > 0} onClick={() => command("refit", { id })}>{installed ? `${refit.name} installed` : `Install ${refit.name}`}</button>
        {missing.length > 0 && !installed && <p>Still needed: {missing.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>}
      </article>; })}
      <p role="status">{view.hint}</p>{view.error && <p role="alert">{view.error}</p>}
      <div className="dw-actions"><button onClick={close}>Back to Marrow</button><button onClick={() => window.location.reload()}>Reload saved stash</button></div>
    </section></div>}
    {view.panel === "cache" && dive !== null && <div className="dw-modal dw-cache-modal"><section className="dw-sheet" aria-label="Carried cache">
      <span className="dw-eyebrow">Carried cache / 4 × 3 / equipment capacity</span><h2>What fits comes home.</h2><p className="dw-error">The tank and prints keep moving while you pack.</p>
      <div className="dw-cache-grid">
        {cells.map(c => <button className="dw-cache-cell" key={`${c.x}:${c.y}`} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }} aria-label={`Move selected item to column ${c.x + 1}, row ${c.y + 1}`} onClick={() => { if (chosen) command("pack", { uid: chosen.uid, x: c.x, y: c.y }); }} />)}
        {dive.cache.map(i => { const f = footprint(i), item = ITEMS[i.kind]; return <button key={i.uid} className={`dw-cache-item ${selected === i.uid ? "selected" : ""}`} style={{ gridColumn: `${i.x + 1} / span ${f.w}`, gridRow: `${i.y + 1} / span ${f.h}`, borderColor: item.color }} onClick={() => setSelected(i.uid)}><span style={{ color: item.color }}>{item.name}</span><small>{item.rarity} · Lv 1</small></button>; })}
      </div>
      {chosen ? <div className="dw-pack-controls"><strong>{ITEMS[chosen.kind].name}</strong><p>Select an empty square as its upper-left corner.</p>
        <div className="dw-actions">{([[-1, 0, "←"], [0, -1, "↑"], [0, 1, "↓"], [1, 0, "→"]] as const).map(([dx, dy, label]) => <button key={label} aria-label={`Move ${label}`} onClick={() => command("pack", { uid: chosen.uid, x: chosen.x + dx, y: chosen.y + dy })}>{label}</button>)}
          <button onClick={() => command("pack", { uid: chosen.uid, rotate: true })}>Rotate</button><button onClick={() => { command("discard", { uid: chosen.uid }); setSelected(null); }}>Leave behind</button></div>
      </div> : <p>Select a carried item to repack, rotate or leave it behind.</p>}
      {dive.cache.some(i => i.kind === "service-rifle") && <div className="dw-hand-wheel"><span>ONE HAND</span><button aria-pressed={dive.hand === "sidearm"} onClick={() => command("equip", { hand: "sidearm" })}>Issue sidearm</button><button aria-pressed={dive.hand === "service-rifle"} onClick={() => command("equip", { hand: "service-rifle" })}>Found service rifle</button></div>}
      <button onClick={() => { command("cache"); grab(); }}>Close cache / Tab</button>
    </section></div>}
    {view.paused && view.panel === null && <div className="dw-modal"><section className="dw-sheet dw-pause"><span className="dw-eyebrow">Simulation paused</span><h2>Hold your breath.</h2><p>Air and prints are paused. Reloading during a dive ends this Life and loses its haul.</p><button onClick={() => { command("pause"); grab(); }}>Resume / Esc</button><button onClick={() => window.location.reload()}>{dive === null ? "Reload saved Marrow" : "Reload / abandon this Life"}</button></section></div>}
    {view.mode === "reprinting" && <div className="dw-modal"><section className="dw-sheet dw-pause" aria-label="Life ended" role="alert">
      <span className="dw-eyebrow">Signal lost / Life {view.home.life - 1} ended</span><h2>Bellwether kept the haul.</h2>
      <p>{view.home.last?.reason}</p><p>{view.home.last?.count === null ? "Carried haul lost." : `${view.home.last?.count ?? 0} carried items lost.`} {view.home.stash.length} banked items and {view.home.refits.length} installed refits remain safe in Marrow.</p>
      <p>Halloway has printed Life {view.home.life}. This loss is already saved; reloading cannot restore the expedition.</p>
      {view.error && <p role="alert">{view.error}</p>}
      <button onClick={() => { command("acknowledgeReprint"); if (viewStore.read(ctx).mode === "home") grab(); }}>Accept reprint / return to Marrow</button>
      <button onClick={() => window.location.reload()}>Reload saved Marrow</button>
    </section></div>}
    {(view.mode === "saving" || view.mode === "blocked") && <div className="dw-modal"><section className="dw-sheet dw-pause" role="alert">
      <span className="dw-eyebrow">Marrow / save boundary</span><h2>{view.mode === "saving" ? "Return pending" : "Marrow is unavailable"}</h2><p>{view.error}</p>
      <p>{view.mode === "saving" ? "The simulation is stopped. This return has not been acknowledged; retry or reload the saved record." : "The saved record has been preserved. No new dive can begin."}</p>
      {view.mode === "saving" && <button onClick={() => command("retrySave")}>Retry saving this return</button>}
      <button onClick={() => window.location.reload()}>Reload saved Marrow</button>
    </section></div>}
  </div>;
}
