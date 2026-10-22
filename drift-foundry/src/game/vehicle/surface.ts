import { HAUL_ROAD_HALF_WIDTH } from "../run/constants";
import { zoneAt, type ZoneSurface } from "../zones/catalog";

/** Grip on the dirt shoulders either side of the paved haul strip. */
const SHOULDER_GRIP = 0.84;
/** Metres over which the paved edge fades into the shoulder, so grip does not step in one tick. */
const EDGE_BLEND = 1.2;

export interface SurfaceSample {
  /** The yard surface the kart is over (zone-owned authored data). */
  zone: ZoneSurface;
  /** False once the kart is out on the dirt shoulders. */
  paved: boolean;
  /** Combined grip multiplier handed to the sim. */
  grip: number;
  /** What the HUD/evidence calls this patch of ground. */
  label: string;
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Grip multiplier at a world position - the sim's `surfaceFriction` hook. */
export function surfaceFrictionAt(x: number, z: number): number {
  return surfaceAt(x, z).grip;
}

/**
 * The corridor's ground: an authored haul strip inside `HAUL_ROAD_HALF_WIDTH`, dirt shoulders out to
 * the corridor fence, and each zone's yard surface deciding the base grip. Canyons are oil-slick, the
 * appliance flats are concrete, the gantry run is loose gravel - so the same corner taken a yard later
 * holds differently.
 */
export function surfaceAt(x: number, z: number): SurfaceSample {
  const zone = zoneAt(z).surface;
  const over = Math.abs(x) - HAUL_ROAD_HALF_WIDTH;
  const paved = over <= 0;
  const shoulder = 1 + (SHOULDER_GRIP - 1) * smoothstep(over / EDGE_BLEND);
  return {
    zone,
    paved,
    grip: zone.grip * shoulder,
    label: paved ? zone.label : `${zone.label} SHOULDER`,
  };
}
