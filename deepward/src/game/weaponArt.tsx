import { IsolatedEntityModel } from "@jgengine/shell/render/SceneModels";
import { stationAssets } from "./assets";
import type { Triple } from "./art";
import { RIFLE, SIDEARM, type Dive } from "./state";

export type ServiceWeaponKind = Dive["hand"];
// These are the original Hand muzzle anchors. Barrel, bore and flash all terminate here.
export const WEAPON_MUZZLE: Record<ServiceWeaponKind, Triple> = { sidearm: [0, 0, -0.22], "service-rifle": [0, 0, -0.5] };
/** Pose is a projection of accepted simulation state; it has no local animation clock. */
export function serviceWeaponPose(dive: Pick<Dive, "hand" | "shotCooldown" | "reload" | "hurt" | "flash">) {
  const interval = dive.hand === "sidearm" ? SIDEARM.interval : RIFLE.interval;
  // Equip also sets shotCooldown. Only an accepted shot's flash permits firing recoil.
  const kick = dive.flash > 0 ? Math.max(0, Math.min(1, (dive.shotCooldown / interval - 0.6) / 0.4)) : 0;
  const reload = dive.reload > 0 ? Math.sin(Math.PI * Math.max(0, Math.min(1, dive.reload / 1.3))) : 0;
  const hurt = Math.max(0, Math.min(1, dive.hurt / 0.4));
  return { at: [0, -reload * 0.09 - hurt * 0.012, kick * 0.035] as Triple,
    turn: [kick * 0.07 + reload * 0.13, 0, -reload * 0.24] as Triple,
    kick, magazineOffset: reload * 0.07, flash: dive.flash > 0 };
}
/** Original grip-origin models share the accepted pose and exact gameplay muzzle anchors. */
export function ServiceWeapon({kind,flash=false,kick=0,magazineOffset=0,shadows='both'}:{
 kind:ServiceWeaponKind;flash?:boolean;kick?:number;magazineOffset?:number;shadows?:'none'|'both';
}) {
 const asset=stationAssets.resolve(kind==='sidearm'?'deepward/service-sidearm':'deepward/service-rifle');
 if(!asset)throw Error(`Missing original weapon catalog asset: ${kind}`);
 return <group position-z={kick*0.012} position-y={-magazineOffset*0.2}>
  <IsolatedEntityModel model={{...asset,anchor:'origin',shadows,animation:'none'}} />
  {flash && <group position={WEAPON_MUZZLE[kind]}>
   <mesh position-z={-0.035} rotation-x={-Math.PI/2}><coneGeometry args={[0.055,0.09,6]} /><meshBasicMaterial color='#ffe4a0' /></mesh>
   <mesh position-z={-0.008}><octahedronGeometry args={[0.032]} /><meshBasicMaterial color='#fff6dc' /></mesh>
  </group>}
 </group>;
}
