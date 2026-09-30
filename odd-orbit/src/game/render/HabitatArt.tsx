import type { ReactNode } from "react";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { FURNITURE_BY_ID } from "../objects/catalog";

function Orb({ position, scale = [1,1,1], color }: { position: [number,number,number]; scale?: [number,number,number]; color: string }) {
  return <mesh castShadow receiveShadow position={position} scale={scale}><sphereGeometry args={[1,24,16]} /><meshStandardMaterial color={color} roughness={0.45} metalness={0.12} /></mesh>;
}
function Ring({ y, radius, color, tilt = 0 }: { y: number; radius: number; color: string; tilt?: number }) {
  return <mesh position={[0,y,0]} rotation={[-Math.PI/2+tilt,0,0]}><torusGeometry args={[radius,0.055,8,40]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} /></mesh>;
}
function Base({ color, radius = 1 }: { color: string; radius?: number }) {
  return <><mesh castShadow receiveShadow position={[0,0.16,0]}><cylinderGeometry args={[radius,radius*1.08,0.32,32]} /><meshStandardMaterial color="#28364b" metalness={0.5} roughness={0.45} /></mesh><Ring y={0.33} radius={radius*0.96} color={color} /></>;
}
/** Original habitat appliances, each with a role-specific silhouette and signal color. */
export function renderObject(obj: SceneObject): ReactNode {
  const id = obj.catalogId;
  const color = FURNITURE_BY_ID[id]?.color ?? "#79f0cc";
  if (id === "nutrient_font") return <group><Base color={color} /><Orb position={[0,0.8,0]} scale={[0.66,0.52,0.66]} color="#eee0bf" /><mesh position={[0,1.05,0]}><cylinderGeometry args={[0.5,0.36,0.25,32]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} /></mesh><Orb position={[0,1.38,0]} scale={[0.23,0.32,0.23]} color={color} /><Ring y={1.4} radius={0.45} color={color} /></group>;
  if (id === "sleep_pod") return <group><Base color={color} radius={1.15} /><Orb position={[0,0.62,0]} scale={[0.85,0.34,1.35]} color="#e7d8b9" /><Orb position={[0,0.81,0]} scale={[0.66,0.18,1.13]} color={color} /><Orb position={[0,0.98,-0.82]} scale={[0.68,0.65,0.55]} color="#30485d" /><Orb position={[0,1.0,-0.57]} scale={[0.48,0.42,0.2]} color={color} /></group>;
  if (id === "chat_ring") return <group><Base color={color} radius={1.45} /><Ring y={0.56} radius={1.1} color={color} />{[0,1,2,3,4].map(i => <Orb key={i} position={[Math.sin(i*Math.PI*2/5)*1.05,0.62,Math.cos(i*Math.PI*2/5)*1.05]} scale={[0.42,0.25,0.42]} color="#efbece" />)}<Orb position={[0,0.9,0]} scale={[0.19,0.42,0.19]} color={color} /></group>;
  if (id === "holo_arcade" || id === "work_console") return <group><Base color={color} /><Orb position={[0,0.75,0]} scale={[0.68,0.5,0.48]} color="#d8dacb" /><mesh castShadow position={[0,1.28,-0.2]} rotation={[-0.22,0,0]}><boxGeometry args={[1.2,0.78,0.16]} /><meshStandardMaterial color="#28364b" /></mesh><mesh position={[0,1.29,-0.1]} rotation={[-0.22,0,0]}><planeGeometry args={[1.02,0.6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} /></mesh>{[0,1,2].map(i=><mesh key={i} position={[-0.28+i*0.28,1.28,0.02]}><octahedronGeometry args={[0.09]} /><meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.4} /></mesh>)}{id === "holo_arcade" && <><Ring y={1.98} radius={0.5} color={color} tilt={0.3} /><mesh position={[0,1.98,0]}><icosahedronGeometry args={[0.25,0]} /><meshStandardMaterial color={color} wireframe /></mesh></>}</group>;
  if (id === "bloom_planter" || id.startsWith("decor_frond")) return <group><Base color="#79f0cc" radius={0.65} /><mesh castShadow position={[0,0.62,0]}><cylinderGeometry args={[0.52,0.34,0.6,12]} /><meshStandardMaterial color="#de9f82" /></mesh>{[0,1,2,3,4].map(i=><group key={i} rotation={[0,i*Math.PI*2/5,0]}><Orb position={[0.26,1.1+i%2*0.24,0]} scale={[0.22,0.68,0.1]} color={id.endsWith("tan")?"#eabf78":"#67d8b3"} /><Orb position={[0.17,1.68+i%2*0.24,0]} scale={[0.15,0.2,0.15]} color="#f0a8de" /></group>)}</group>;
  if (id === "decor_crystal" || id === "decor_spire") return <group>{[0,1,2].map(i=><mesh key={i} castShadow position={[(i-1)*0.4,id==="decor_spire"?1.8:0.75,0]} rotation={[0,0,(i-1)*0.17]}><cylinderGeometry args={[0,0.35,id==="decor_spire"?3.6:1.5,5]} /><meshStandardMaterial color={i===1?"#aedee0":"#907abd"} metalness={0.4} roughness={0.2} /></mesh>)}</group>;
  if (id === "decor_boulder") return <Orb position={[0,0.5,0]} scale={[0.95,0.65,0.7]} color="#625571" />;
  if (id.startsWith("hab_")) return <group><mesh castShadow receiveShadow position={[0,0.55,0]}><boxGeometry args={[id==="hab_gate"?1.1:3,1.1,0.55]} /><meshStandardMaterial color="#d6c8b6" roughness={0.65} /></mesh><mesh position={[0,1.12,0]}><boxGeometry args={[id==="hab_gate"?1.2:3.06,0.09,0.58]} /><meshStandardMaterial color="#79d9cf" emissive="#79d9cf" emissiveIntensity={0.25} /></mesh>{id==="hab_wall_window" && <mesh position={[0,0.7,0.285]}><planeGeometry args={[1.9,0.48]} /><meshStandardMaterial color="#40576d" metalness={0.5} /></mesh>}</group>;
  return null;
}

export function HabitatDeck({ ctx }: WorldOverlayProps) {
  const y = ctx.world.groundHeightAt(0,0);
  return <group position={[0,y,0]}>
    <mesh receiveShadow position={[0,0.015,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[25,19]} /><meshStandardMaterial color="#637684" roughness={0.82} /></mesh>
    {Array.from({length:9},(_,i)=><mesh key={i} position={[-12+i*3,0.025,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[0.035,18]} /><meshStandardMaterial color="#a5b5ad" /></mesh>)}
    {Array.from({length:7},(_,i)=><mesh key={i} position={[0,0.026,-9+i*3]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[24,0.035]} /><meshStandardMaterial color="#a5b5ad" /></mesh>)}
    <mesh position={[0,0.03,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[3.8,3.86,64]} /><meshStandardMaterial color="#f7d5a1" /></mesh>
    {[-1,1].map(side=><mesh key={side} position={[side*12.4,0.04,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[0.12,19]} /><meshStandardMaterial color="#79f0cc" emissive="#79f0cc" emissiveIntensity={0.3} /></mesh>)}
  </group>;
}
