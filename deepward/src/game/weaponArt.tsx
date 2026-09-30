import { IndustrialBox as Box, IndustrialCasing as Case, IndustrialCylinder as Cylinder, PALETTE as C, type Triple } from "./art";
import { RIFLE, SIDEARM, type Dive } from "./state";
import { surfaceMaterial } from "./industrialMaterials";

export type ServiceWeaponKind = Dive["hand"];
// These are the original Hand muzzle anchors. Barrel, bore and flash all terminate here.
export const WEAPON_MUZZLE: Record<ServiceWeaponKind, Triple> = { sidearm: [0, 0, -0.22], "service-rifle": [0, 0, -0.5] };
const BARREL_TURN: Triple = [Math.PI / 2, 0, 0];
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
function Bore({ kind }: { kind: ServiceWeaponKind }) {
  const at = WEAPON_MUZZLE[kind];
  return <group position={at}>
    <mesh><torusGeometry args={[0.021, 0.007, 6, 12]} /><meshStandardMaterial {...surfaceMaterial("steel")} /></mesh>
    <mesh position-z={0.003} rotation-y={Math.PI}><circleGeometry args={[0.015, 12]} /><meshStandardMaterial {...surfaceMaterial("rubber", C.black)} /></mesh>
  </group>;
}
function Grip({ rifle, magazineOffset }: { rifle: boolean; magazineOffset: number }) {
  return <>
    <Case at={[0, -0.125, 0.075]} turn={[-0.22, 0, 0]} size={[0.087, 0.205, 0.105]} surface="rubber" />
    {[-0.19, -0.16, -0.13, -0.1].map(y => <Box key={y} at={[0, y, 0.13]} size={[0.09, 0.012, 0.012]} surface="printed" />)}
    <Box at={[0, -0.235 - magazineOffset, rifle ? -0.12 : 0.07]} size={[rifle ? 0.085 : 0.082, rifle ? 0.18 : 0.018, rifle ? 0.13 : 0.1]} surface="paint" color={C.panel} />
    {/* Open trigger guard: no opaque block filling the finger aperture. */}
    <Box at={[0, -0.095, -0.015]} size={[0.055, 0.018, 0.13]} surface="steel" />
    <Box at={[0, -0.063, -0.073]} size={[0.055, 0.07, 0.015]} surface="steel" />
    <Box at={[0, -0.055, -0.01]} size={[0.014, 0.04, 0.015]} surface="brass" />
  </>;
}
/** Kessler's common receiver/grip language is shared by equipped, carried and dropped rifles. */
export function ServiceWeapon({ kind, flash = false, kick = 0, magazineOffset = 0 }: {
  kind: ServiceWeaponKind; flash?: boolean; kick?: number; magazineOffset?: number;
}) {
  const rifle = kind === "service-rifle";
  return <group>
    <Grip rifle={rifle} magazineOffset={magazineOffset} />
    {rifle ? <>
      <Case at={[0, 0, -0.075]} size={[0.105, 0.13, 0.33]} surface="paint" />
      <Case at={[0, -0.002, -0.325]} size={[0.09, 0.105, 0.19]} surface="rubber" />
      <Cylinder at={[0, 0, -0.46]} turn={BARREL_TURN} radius={0.025} length={0.08} surface="steel" />
      <Case at={[0, -0.035, 0.24]} size={[0.095, 0.16, 0.22]} surface="printed" />
      <Box at={[0, -0.035, 0.355]} size={[0.1, 0.17, 0.025]} surface="rubber" />
      {[-0.39, -0.355, -0.32, -0.285].map(z => <Box key={z} at={[0, 0.045, z]} size={[0.1, 0.014, 0.018]} surface="steel" />)}
      <Box at={[0.056, 0.017, -0.06 + kick * 0.035]} size={[0.016, 0.042, 0.07]} surface="steel" />
      <Cylinder at={[0.07, 0.015, 0.015]} turn={[0, 0, Math.PI / 2]} radius={0.012} length={0.04} surface="brass" />
    </> : <>
      <Case at={[0, -0.025, 0.008]} size={[0.096, 0.065, 0.285]} surface="printed" />
      <Case at={[0, 0.025, -0.01 + kick * 0.025]} size={[0.105, 0.09, 0.32]} surface="steel" />
      <Cylinder at={[0, 0, -0.18]} turn={BARREL_TURN} radius={0.025} length={0.08} surface="steel" />
      {[-0.004, 0.016, 0.036, 0.056].map(z => <Box key={z} at={[0.055, 0.025, z + kick * 0.025]} size={[0.007, 0.065, 0.005]} surface="rubber" />)}
      <Box at={[0.055, 0.025, -0.083 + kick * 0.025]} size={[0.007, 0.038, 0.045]} surface="brass" />
    </>}
    <Box at={[0, rifle ? 0.085 : 0.084, rifle ? -0.385 : -0.15]} size={[0.014, 0.028, 0.018]} surface="printed" color={C.cyan} />
    {[-1, 1].map(side => <Box key={side} at={[side * 0.025, 0.086, 0.105]} size={[0.014, 0.032, 0.024]} surface="steel" />)}
    <Box at={[-0.055, 0.006, rifle ? -0.04 : 0.02]} size={[0.008, 0.027, 0.06]} surface="brass" />
    <Bore kind={kind} />
    {flash && <group position={WEAPON_MUZZLE[kind]}>
      <mesh position-z={-0.035} rotation-x={-Math.PI / 2}><coneGeometry args={[0.055, 0.09, 6]} /><meshBasicMaterial color="#ffe4a0" /></mesh>
      <mesh position-z={-0.008}><octahedronGeometry args={[0.032]} /><meshBasicMaterial color="#fff6dc" /></mesh>
    </group>}
  </group>;
}
