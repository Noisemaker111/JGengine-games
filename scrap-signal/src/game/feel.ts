export interface HitSignal {
  atMs: number;
  crit: boolean;
  kill: boolean;
  shield?: boolean;
  shieldBreak?: boolean;
}

/**
 * "This has not happened yet." Zero cannot mean it: game time also starts at zero, so on the first
 * frames of a run `now - 0` is a few milliseconds and every age-gated cue — muzzle flash, recoil,
 * hitmarker, damage vignette — fires at spawn before the player has done anything. A negative
 * infinity sentinel makes the age infinite instead, so a consumer that forgets to special-case
 * "never" still gets the right answer.
 */
export const NEVER_MS = Number.NEGATIVE_INFINITY;

const signals = {
  lastShotAtMs: NEVER_MS,
  lastShotFamily: "pistol",
  lastHit: { atMs: NEVER_MS, crit: false, kill: false } as HitSignal,
  lastHurtAtMs: NEVER_MS,
  lastLevelUpAtMs: NEVER_MS,
};

export function noteShot(atMs: number, family: string): void {
  signals.lastShotAtMs = atMs;
  signals.lastShotFamily = family;
}

export function lastShot(): { atMs: number; family: string } {
  return { atMs: signals.lastShotAtMs, family: signals.lastShotFamily };
}

/** How long the muzzle flash stays on screen after a shot. */
export const MUZZLE_FLASH_MS = 70;
/** How long the viewmodel's recoil kick runs after a shot. */
export const RECOIL_MS = 140;

/** Whether the muzzle flash should be drawn right now. False for a run that has not fired yet. */
export function muzzleFlashVisible(nowMs: number): boolean {
  const since = nowMs - signals.lastShotAtMs;
  return since >= 0 && since < MUZZLE_FLASH_MS;
}

/** Recoil curve 0..1 for the viewmodel rig. Zero for a run that has not fired yet. */
export function recoilAt(nowMs: number): number {
  const since = nowMs - signals.lastShotAtMs;
  if (since < 0 || since >= RECOIL_MS) return 0;
  return Math.sin((since / RECOIL_MS) * Math.PI);
}

export function noteHit(atMs: number, crit: boolean, kill: boolean, shield = false, shieldBreak = false): void {
  const previous = signals.lastHit;
  // Pellet batches share a time: the strongest confirmed result must survive later nonlethal hits.
  const sameShot = previous.atMs === atMs;
  signals.lastHit = { atMs, crit: crit || (sameShot && previous.crit), kill: kill || (sameShot && previous.kill), shield, shieldBreak: shieldBreak || (sameShot && previous.shieldBreak === true) };
}

export function lastHit(): HitSignal {
  return signals.lastHit;
}

export function noteHurt(atMs: number): void {
  signals.lastHurtAtMs = atMs;
}

export function lastHurtAtMs(): number {
  return signals.lastHurtAtMs;
}

let lastHealth: number | null = null;
let lastShield: number | null = null;
let shieldHurtAt = NEVER_MS;
let shieldBreakAt = NEVER_MS;
export function notePlayerShield(nowMs: number, shield: number | null): void {
  if (lastShield !== null && shield !== null && shield < lastShield) {
    shieldHurtAt = nowMs;
    if (lastShield > 0 && shield <= 0) shieldBreakAt = nowMs;
  }
  lastShield = shield;
}
export function playerShieldSignal(): { atMs: number; breakAtMs: number } {
  return { atMs: shieldHurtAt, breakAtMs: shieldBreakAt };
}

/**
 * Feed the player's current health once per tick; a drop from the previous reading counts as a hurt.
 * Reading the stat covers every damage source — bullets, auras, burn ticks — without each one
 * remembering to call {@link noteHurt}.
 */
export function notePlayerHealth(nowMs: number, health: number | null): void {
  if (lastHealth !== null && health !== null && health < lastHealth) noteHurt(nowMs);
  lastHealth = health;
}

export function noteLevelUp(atMs: number): void {
  signals.lastLevelUpAtMs = atMs;
}

export function lastLevelUpAtMs(): number {
  return signals.lastLevelUpAtMs;
}

let gameNowMs = 0;

export function noteGameNow(nowMs: number): void {
  gameNowMs = nowMs;
}

export function gameNow(): number {
  return gameNowMs;
}

let equippedGunId: string | null = null;

export function noteEquipped(gunId: string | null): void {
  equippedGunId = gunId;
}

export function equippedGun(): string | null {
  return equippedGunId;
}

export function resetFeel(): void {
  equippedGunId = null;
  lastHealth = null;
  lastShield = null;
  shieldHurtAt = NEVER_MS;
  shieldBreakAt = NEVER_MS;
  gameNowMs = 0;
  signals.lastShotAtMs = NEVER_MS;
  signals.lastHit = { atMs: NEVER_MS, crit: false, kill: false };
  signals.lastHurtAtMs = NEVER_MS;
  signals.lastLevelUpAtMs = NEVER_MS;
}
