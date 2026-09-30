import { useEffect, useMemo } from "react";
import { IndustrialBox as Box, IndustrialCasing as Case, IndustrialCylinder as Cylinder, PALETTE as C, signTexture } from "./art";
import type { Dive } from "./state";
import { ServiceWeapon } from "./weaponArt";
import { surfaceMaterial } from "./industrialMaterials";

function Joint({ radius = 0.08 }: { radius?: number }) {
  return <>
    <Cylinder at={[0, 0, 0]} turn={[0, 0, Math.PI / 2]} radius={radius} length={radius * 2.4} surface="rubber" />
    {[-1, 1].map(side => <Cylinder key={side} at={[side * radius * 1.3, 0, 0]} turn={[0, 0, Math.PI / 2]} radius={radius * 0.7} length={0.018} surface="brass" />)}
  </>;
}
function Leg({ side, winding }: { side: number; winding: boolean }) {
  return <group position={[side * 0.19, 0.82, 0]} rotation-x={winding ? side * 0.09 : 0}>
    <Joint radius={0.095} />
    <Case at={[0, -0.17, 0]} size={[0.2, 0.28, 0.22]} surface="printed" />
    <Cylinder at={[side * 0.11, -0.2, -0.065]} radius={0.024} length={0.25} surface="steel" />
    <group position={[0, -0.35, 0]} rotation-x={winding ? -side * 0.18 : 0}>
      <Joint />
      <Case at={[0, -0.165, 0.014]} size={[0.16, 0.28, 0.2]} surface="paint" />
      <Cylinder at={[0, -0.16, -0.11]} radius={0.022} length={0.26} surface="brass" />
      <Box at={[0, -0.15, 0.122]} size={[0.09, 0.23, 0.024]} surface="printed" />
      <group position={[0, -0.34, 0]}><Joint radius={0.055} />
        <Case at={[0, -0.035, 0.085]} size={[0.24, 0.13, 0.38]} surface="steel" />
        <Box at={[0, -0.1, 0.085]} size={[0.245, 0.035, 0.38]} surface="rubber" />
      </group>
    </group>
  </group>;
}
function MaintenanceArm({ winding }: { winding: boolean }) {
  return <group position={[-0.36, 1.3, 0]} rotation-z={winding ? -0.32 : -0.12}>
    <Joint radius={0.1} />
    <Case at={[0, -0.16, 0]} size={[0.17, 0.27, 0.2]} surface="paint" />
    <Cylinder at={[-0.1, -0.17, 0.05]} radius={0.023} length={0.24} surface="brass" />
    <group position={[0, -0.32, 0]} rotation-x={winding ? -0.8 : -0.22}>
      <Joint radius={0.07} />
      <Cylinder at={[0, -0.145, 0]} radius={0.09} tip={0.065} length={0.23} surface="printed" />
      {[-0.09, -0.14, -0.19].map(y => <Cylinder key={y} at={[0, y, 0]} radius={0.092} length={0.012} surface="rubber" />)}
      <Cylinder at={[0, -0.32, 0]} radius={0.038} length={0.17} surface="steel" />
      {/* The Fitter's integral open-jaw spanner, with an insulated cable reel behind it. */}
      <mesh position={[0, -0.42, 0]} rotation-z={Math.PI / 4}><torusGeometry args={[0.073, 0.025, 6, 12, Math.PI * 1.5]} /><meshStandardMaterial {...surfaceMaterial("steel")} /></mesh>
      <Cylinder at={[-0.09, -0.13, -0.04]} turn={[0, 0, Math.PI / 2]} radius={0.07} length={0.05} surface="brass" />
    </group>
  </group>;
}
/** Rendered inside the actual SDK entity transform; no actor placement or motion is owned here. */
export function FitterModel({ print, hit = false }: { print: Dive["print"]; hit?: boolean }) {
  const winding = print.mode === "winding";
  const wind = winding ? 1 - Math.max(0, Math.min(1, print.attack / 0.7)) : 0;
  const label = useMemo(() => signTexture("FITTER / 406", "BW PRINT / MAINTENANCE", C.amber), []);
  useEffect(() => () => label.dispose(), [label]);
  return <group>
    {[-1, 1].map(side => <Leg key={side} side={side} winding={winding} />)}
    <Case at={[0, 0.85, 0]} size={[0.5, 0.17, 0.29]} surface="steel" />
    <Cylinder at={[0, 1, 0]} radius={0.16} length={0.19} surface="rubber" />
    {[0.94, 0.99, 1.04].map(y => <Cylinder key={y} at={[0, y, 0]} radius={0.164} length={0.022} surface="brass" />)}
    <group position={[0, 1.26, 0]} rotation-x={winding ? -0.08 : 0}>
      <Case at={[0, 0, 0]} size={[0.58, 0.4, 0.34]} surface="printed" />
      <Case at={[0, 0.005, 0.177]} size={[0.43, 0.3, 0.047]} surface="paint" />
      {[-1, 1].map(side => <group key={side}>
        <Box at={[side * 0.2, 0.015, 0.211]} size={[0.045, 0.26, 0.017]} surface="brass" />
        <Cylinder at={[side * 0.22, -0.22, -0.08]} radius={0.032} length={0.23} surface="steel" />
        <Cylinder at={[side * 0.16, 0.035, -0.235]} radius={0.064} length={0.33} surface="brass" />
      </group>)}
      <mesh position={[0, 0.058, 0.206]}><planeGeometry args={[0.31, 0.103]} /><meshStandardMaterial map={label} roughness={0.8} metalness={0} /></mesh>
      {[0, 1, 2, 3].map(i => <Box key={i} at={[-0.105 + i * 0.07, -0.075, 0.215]} size={[0.046, 0.025, 0.012]} surface="printed"
        color={hit ? C.danger : print.health > i * 20 ? C.cyan : C.black} emission={hit || print.health > i * 20 ? 0.7 : 0} />)}
      <Box at={[0, -0.13, -0.19]} size={[0.32, 0.065, 0.035]} surface="rubber" />
      {[-0.11, -0.055, 0, 0.055, 0.11].map(x => <Box key={x} at={[x, -0.13, -0.213]} size={[0.014, 0.055, 0.012]} surface="steel" />)}
    </group>
    <Cylinder at={[0, 1.52, 0]} radius={0.075} length={0.12} surface="brass" />
    <group position={[0, 1.69, 0]} rotation-x={winding ? 0.15 : 0}>
      <Case at={[0, 0, 0]} size={[0.39, 0.29, 0.34]} surface="printed" />
      <Box at={[0, -0.035, 0.181]} size={[0.32, 0.105, 0.027]} surface="rubber" />
      <Box at={[0, -0.035, 0.199]} size={[0.27, 0.058, 0.016]} surface="printed" color={winding ? C.amber : C.danger} emission={0.8} />
      <Case at={[0, -0.035, 0.212]} size={[0.315, 0.093, 0.016]} surface="glass" />
      <Case at={[0, 0.11, 0.055]} size={[0.41, 0.07, 0.35]} surface="paint" />
      <Cylinder at={[0.22, 0.02, 0]} turn={[0, 0, Math.PI / 2]} radius={0.063} length={0.04} surface="steel" />
      <Box at={[-0.12, 0.028, -0.182]} size={[0.04, 0.12, 0.023]} surface="brass" />
    </group>
    <MaintenanceArm winding={winding} />
    {/* Shoulder/elbow pivots lift the actual held rifle into a readable butt-strike windup. */}
    <group position={[0.36, 1.3, 0]} rotation={[winding ? -1.45 - wind * 0.25 : -0.4, 0, winding ? -0.2 : 0.1]}>
      <Joint radius={0.1} />
      <Case at={[0, -0.145, 0]} size={[0.18, 0.23, 0.22]} surface="paint" />
      <Cylinder at={[0.11, -0.14, -0.02]} radius={0.026} length={0.22} surface="steel" />
      <group position={[0, -0.29, 0]} rotation-x={winding ? -0.55 : -1.05}>
        <Joint radius={0.072} />
        <Case at={[0, -0.13, 0]} size={[0.16, 0.21, 0.19]} surface="printed" />
        <Box at={[0, -0.258, 0.015]} size={[0.13, 0.095, 0.14]} surface="rubber" />
        <group position={[0, -0.26, 0.07]} rotation={[Math.PI / 2, Math.PI, 0]} scale={1.35}><ServiceWeapon kind="service-rifle" /></group>
      </group>
    </group>
  </group>;
}
