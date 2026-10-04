import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { BASE, expedition, STATIONS } from "./expedition";

type V3 = [number, number, number];
const INK = "#243d3c", IVORY = "#e7dec2", COPPER = "#c67543";
function Part({ at = [0, 0, 0], size, color = INK, rotate = [0, 0, 0], glow = false }: { at?: V3; size: V3; color?: string; rotate?: V3; glow?: boolean }) {
  return <mesh position={at} rotation={rotate} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.72} metalness={0.15} emissive={glow ? color : "#000000"} emissiveIntensity={glow ? 0.5 : 0} /></mesh>;
}
function Tube({ at = [0, 0, 0], radius = 0.06, height = 1, color = INK, rotate = [0, 0, 0] }: { at?: V3; radius?: number; height?: number; color?: string; rotate?: V3 }) {
  return <mesh position={at} rotation={rotate} castShadow><cylinderGeometry args={[radius, radius, height, 10]} /><meshStandardMaterial color={color} roughness={0.6} metalness={0.3} /></mesh>;
}
function Ring({ at, radius, color }: { at: V3; radius: number; color: string }) {
  return <mesh position={at} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[radius, 0.035, 5, 48]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} /></mesh>;
}
function Marker({ number, color }: { number: number; color: string }) {
  // The tally mark on each pennant matches the station number; no remote fonts or textures.
  return <group position={[0.8, 0, 0]}>
    <Tube at={[0, 1.9, 0]} height={3.8} radius={0.045} color={IVORY} />
    <Part at={[0.4, 3.45, 0]} size={[0.8, 0.44, 0.045]} color={color} />
    {Array.from({ length: number }, (_, i) => <Part key={i} at={[0.18 + i * 0.18, 3.45, 0.029]} size={[0.065, 0.23, 0.015]} color={INK} />)}
  </group>;
}
function Tripod({ color }: { color: string }) {
  return <group>
    {[0, 1, 2].map(i => <group key={i} rotation={[0, i * Math.PI * 2 / 3, 0]}><Tube at={[0, 0.64, 0.29]} height={1.4} rotate={[0.43, 0, 0]} /><Part at={[0, 0.05, 0.58]} size={[0.2, 0.1, 0.26]} /></group>)}
    <Tube at={[0, 1.28, 0]} radius={0.2} height={0.22} color={COPPER} />
    <Part at={[0, 1.55, 0]} size={[0.72, 0.36, 0.52]} color={IVORY} />
    <Part at={[0, 1.57, 0.27]} size={[0.5, 0.17, 0.03]} color={INK} />
    <Part at={[0.18, 1.57, 0.29]} size={[0.07, 0.09, 0.02]} color={color} glow />
    <Tube at={[-0.22, 1.87, 0]} height={0.3} radius={0.035} color={COPPER} />
  </group>;
}
function WindHead() {
  const rotor = useRef<Group>(null);
  useFrame((_state, dt) => { if (rotor.current !== null) rotor.current.rotation.y += dt * 1.8; });
  return <group position={[0, 2.9, 0]} ref={rotor}>
    {[0, 1, 2].map(i => <group rotation={[0, i * Math.PI * 2 / 3, 0]} key={i}><Tube at={[0.32, 0, 0]} radius={0.028} height={0.65} rotate={[0, 0, Math.PI / 2]} color={IVORY} /><mesh position={[0.67, 0, 0]} rotation={[0, 0, Math.PI / 2]}><sphereGeometry args={[0.17, 12, 6, 0, Math.PI]} /><meshStandardMaterial color={COPPER} side={2} /></mesh></group>)}
  </group>;
}
function ShoreDock() {
  return <group position={[-12, 0, 6]}>
    {Array.from({ length: 11 }, (_, i) => <Part key={i} at={[-i * 0.43, 0.28, 0]} size={[0.4, 0.12, 2.1]} color={i % 2 ? "#958261" : "#ad9872"} />)}
    {[0, -4.3].map(x => <group key={x}>{[-0.9, 0.9].map(z => <Tube key={z} at={[x, 0.34, z]} radius={0.09} height={1.9} color={COPPER} />)}</group>)}
    <Tube at={[-3.5, 0.64, 0]} radius={0.36} height={0.14} color={IVORY} />
    <Tube at={[-3.5, 0.74, 0]} radius={0.22} height={0.1} color={INK} />
  </group>;
}
function Vent() {
  return <group position={[14, 0, 12]}>
    {Array.from({ length: 9 }, (_, i) => { const a = i * Math.PI * 2 / 9; return <mesh key={i} position={[Math.sin(a) * 1.1, 0.2, Math.cos(a) * 1.1]} rotation={[i * 0.4, a, 0.1]} scale={[0.5, 0.3, 0.42]} castShadow><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color={i % 2 ? "#685a46" : "#343e38"} roughness={1} /></mesh>; })}
    <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.9, 24]} /><meshStandardMaterial color="#392b25" emissive="#b75128" emissiveIntensity={0.6} /></mesh>
    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i * Math.PI / 4; return <group key={i} position={[Math.sin(a) * 3.5, 0, Math.cos(a) * 3.5]}><Tube at={[0, 0.5, 0]} height={1} radius={0.055} color={COPPER} /><Part at={[0, 0.87, 0]} size={[0.15, 0.11, 0.15]} color="#ffd078" /></group>; })}
    <Ring at={[0, 0.16, 0]} radius={3.5} color="#f29652" />
  </group>;
}
function BaseCamp() {
  return <group position={[BASE.x, 0, BASE.z + 4.5]}>
    <Part at={[0, 0.15, 0]} size={[6, 0.3, 3.8]} color="#9c967b" />
    <Part at={[0, 1.35, -1.5]} size={[5.4, 2.4, 0.18]} color={IVORY} />
    {[-2.6, 2.6].map(x => <Tube key={x} at={[x, 1.6, 1.35]} height={3.2} radius={0.09} color={COPPER} />)}
    <Part at={[0, 2.94, 0]} size={[6.2, 0.17, 4.1]} color={INK} rotate={[0.1, 0, 0]} />
    {[-1.7, 0, 1.7].map(x => <group key={x} position={[x, 3.08, 0]} rotation={[0.1, 0, 0]}><Part size={[1.5, 0.07, 2.9]} color="#314f62" />{[-0.8, 0, 0.8].map(z => <Part key={z} at={[0, 0.045, z]} size={[1.48, 0.015, 0.03]} color="#8da6a8" />)}</group>)}
    <Part at={[0, 1.28, 0.4]} size={[3.4, 0.13, 1.1]} color={COPPER} />
    {[-1.45, 1.45].map(x => <Part key={x} at={[x, 0.75, 0.4]} size={[0.09, 1, 0.09]} />)}
    <Part at={[0.5, 1.7, 0.14]} size={[1.1, 0.7, 0.15]} color={INK} rotate={[-0.2, 0, 0]} />
    <Part at={[0.5, 1.71, 0.25]} size={[0.9, 0.46, 0.015]} color="#70d8df" glow />
    <Part at={[-0.95, 1.4, 0.4]} size={[0.65, 0.16, 0.5]} color={IVORY} />
    <Part at={[-1.9, 0.68, -0.8]} size={[0.9, 1, 0.7]} color={INK} />
    {[0.43, 0.68, 0.93].map(y => <Part key={y} at={[-1.9, y, -0.43]} size={[0.7, 0.035, 0.02]} color={IVORY} />)}
    <Tube at={[2, 2.2, -1]} height={3.8} radius={0.035} color={IVORY} />
    <Tube at={[2, 3.9, -1]} height={0.85} radius={0.025} color={COPPER} rotate={[0, 0, Math.PI / 2]} />
    <Ring at={[0, 0.18, -4.5]} radius={2.8} color="#70d8df" />
  </group>;
}
export function FieldEquipment({ ctx }: WorldOverlayProps) {
  const collected = useGameStore(c => expedition.read(c).collected);
  return <group>
    <BaseCamp /><ShoreDock /><Vent />
    {STATIONS.map((station, i) => <group key={station.id} position={[station.x, ctx.world.groundHeightAt(station.x, station.z), station.z]}>
      <Tripod color={collected.includes(station.id) ? "#84e5a4" : station.color} />
      <Marker number={i + 1} color={station.color} />
      <Ring at={[0, 0.07, 0]} radius={2.2} color={collected.includes(station.id) ? "#84e5a4" : station.color} />
      {station.id === "wind" ? <><Tube at={[0, 2.25, 0]} height={1.45} color={IVORY} /><WindHead /></> : null}
      {station.id === "water" ? <Tube at={[0, 2.1, 0]} height={0.4} radius={0.17} color={station.color} /> : null}
      {station.id === "soil" ? <Part at={[0, 1.83, 0]} size={[0.42, 0.15, 0.32]} color={COPPER} /> : null}
    </group>)}
  </group>;
}
export function Surveyor({ entity }: { entity: SceneEntity }) {
  const ctx = useGameContext();
  const legs = useRef<Group>(null);
  const arms = useRef<Group>(null);
  useFrame(({ clock }) => {
    const current = ctx.scene.entity.get(entity.id);
    const speed = current === null ? 0 : Math.hypot(current.velocity[0], current.velocity[2]);
    const swing = Math.sin(clock.elapsedTime * 9) * Math.min(speed / 8, 0.35);
    if (legs.current) { legs.current.children[0]!.rotation.x = swing; legs.current.children[1]!.rotation.x = -swing; }
    if (arms.current) { arms.current.children[0]!.rotation.x = -swing; arms.current.children[1]!.rotation.x = swing; }
  });
  return <group>
    <group ref={legs}>{[-0.17, 0.17].map(x => <group key={x} position={[x, 0.8, 0]}><Part at={[0, -0.27, 0]} size={[0.24, 0.54, 0.26]} color={INK} /><Part at={[0, -0.66, 0.06]} size={[0.27, 0.25, 0.4]} color="#3c332b" /></group>)}</group>
    <Part at={[0, 1.15, 0]} size={[0.64, 0.66, 0.37]} color={COPPER} />
    <Part at={[0, 1.23, 0.2]} size={[0.6, 0.09, 0.025]} color={IVORY} />
    <Part at={[0, 1.12, -0.3]} size={[0.5, 0.55, 0.24]} color="#668777" />
    {[-0.22, 0.22].map(x => <Part key={x} at={[x, 1.22, 0.205]} size={[0.055, 0.51, 0.025]} color={INK} />)}
    <group ref={arms}>{[-0.43, 0.43].map(x => <group key={x} position={[x, 1.37, 0]}><Part at={[0, -0.2, 0]} size={[0.19, 0.43, 0.23]} color={COPPER} /><Part at={[0, -0.47, 0]} size={[0.18, 0.17, 0.19]} color={IVORY} /></group>)}</group>
    <mesh position={[0, 1.65, 0]} castShadow><sphereGeometry args={[0.23, 12, 8]} /><meshStandardMaterial color="#bb9672" roughness={0.9} /></mesh>
    <mesh position={[0, 1.83, 0]} castShadow><sphereGeometry args={[0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={IVORY} roughness={0.7} /></mesh>
    <Tube at={[0, 1.79, 0.04]} radius={0.32} height={0.065} color={IVORY} />
    <Part at={[0, 1.67, 0.22]} size={[0.34, 0.08, 0.04]} color={INK} />
  </group>;
}
