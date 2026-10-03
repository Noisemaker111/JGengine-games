import { useGameContext } from "@jgengine/react/provider";
import { handlingView, shotSpreadDeg } from "../../combatFeel";
import { equippedGun } from "../../feel";
import { gunById } from "../../handroll";
import { LevelUpFlash } from "@jgengine/react/components";
import { useEntityStat, useGameStore, usePlayer, useOptionalGamePhase } from "@jgengine/react/hooks";
import { lastHit, lastHurtAtMs, playerShieldSignal } from "../../feel";

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function HitMarker() {
  const ctx = useGameContext();
  const phase = useOptionalGamePhase();
  const nowMs = useNowMs();
  const hit = lastHit();
  const age = nowMs - hit.atMs;
  const visible = age >= 0 && age <= 220;
  const gun = gunById(equippedGun() ?? "");
  const handling = handlingView(ctx);
  const spread = gun ? shotSpreadDeg(gun, handling) : 0;
  const gap = 5 + Math.min(29, spread * 4);
  const color = hit.kill ? "#e23c2e" : hit.shieldBreak ? "#70e8ff" : hit.crit ? "#ffb400" : hit.shield ? "#3bb5e8" : "#f5f0e6";
  const size = hit.crit || hit.kill ? 30 : 22;
  if (phase !== "playing") return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" aria-hidden="true">
      <svg width="180" height="180" viewBox="0 0 120 120" data-scrap-reticle="true" className="absolute" style={{ opacity: handling.sprinting ? 0.25 : 0.9, transform: `translateY(${-handling.climbDeg * 4}px)`, filter: "drop-shadow(0 1px 1px #211810)" }}>
        <path d={`M${60 - gap - 7} 60 h7 M${60 + gap} 60 h7 M60 ${60 - gap - 7} v7 M60 ${60 + gap} v7`} fill="none" stroke="#241b12" strokeWidth="6" />
        <path d={`M${60 - gap - 7} 60 h7 M${60 + gap} 60 h7 M60 ${60 - gap - 7} v7 M60 ${60 + gap} v7`} fill="none" stroke={handling.crouching && handling.aiming ? "#ffd26e" : "#e8e0d1"} strokeWidth="3.2" />
        <rect x="56.5" y="56.5" width="7" height="7" fill="#241b12" />
        <rect x="57.5" y="57.5" width="5" height="5" fill="#f5f0e6" />
      </svg>
      {visible ? <>
        <svg width={size} height={size} viewBox="0 0 24 24" className="scrap-hitmarker">
          <path d="M4 4 L9 9 M20 4 L15 9 M4 20 L9 15 M20 20 L15 15" stroke={color} strokeWidth="2.6" strokeLinecap="square" />
        </svg>
        {hit.kill ? <span className="scrap-hitmarker absolute mt-14 text-xs font-black uppercase tracking-[0.3em] text-rose-400">Kill confirmed</span>
          : hit.shieldBreak ? <span className="absolute mt-14 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Shield broken</span>
          : hit.crit ? <span className="absolute mt-12 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Critical</span> : null}
      </> : null}
    </div>
  );
}

export function DamageVignette() {
  const nowMs = useNowMs();
  const shield = playerShieldSignal();
  const shieldAge = nowMs - shield.atMs;
  const breakAge = nowMs - shield.breakAtMs;
  const shieldActive = shieldAge >= 0 && shieldAge < 420;
  const broke = breakAge >= 0 && breakAge < 1400;
  const hurtAt = lastHurtAtMs();
  const age = nowMs - hurtAt;
  const healthActive = age >= 0 && age <= 450;
  if (!healthActive && !shieldActive && !broke) return null;
  const strength = healthActive ? 1 - age / 450 : shieldActive ? 1 - shieldAge / 420 : 0;
  const rgb = healthActive ? "190, 30, 16" : "20, 153, 205";
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      style={{ boxShadow: `inset 0 0 ${90 + strength * 80}px ${20 + strength * 40}px rgba(${rgb}, ${0.35 * strength})` }}
    >
      {broke ? <div className="absolute inset-x-0 top-[27%] text-center text-sm font-black uppercase tracking-[0.3em] text-cyan-200 drop-shadow-[0_2px_3px_black]">Shield offline · break contact</div> : null}
    </div>
  );
}

export function LevelUpBurst() {
  const { userId } = usePlayer();
  const level = useEntityStat(userId, "level");
  return (
    <LevelUpFlash
      stat="level"
      durationMs={2200}
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
    >
      <div className="scrap-levelup flex flex-col items-center">
        <div className="scrap-levelup-ring" />
        <span className="text-4xl font-black uppercase tracking-[0.25em] text-amber-300 drop-shadow-[0_3px_0_#3a2c10]">
          Level Up!
        </span>
        <span className="mt-1 text-base font-black uppercase tracking-[0.4em] text-stone-100">
          Level {level?.current ?? "?"} · +1 skill point
        </span>
      </div>
    </LevelUpFlash>
  );
}
