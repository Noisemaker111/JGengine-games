import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useStore } from "@jgengine/react/store";
import { bodyColor, type AlienBodyPlan } from "../creatures/bodyPlan";
import { householdStore } from "../session/store";

/** Original seed-shaped moon slugs: shells, signal stalks, padded feet and luminous eyes. */
export function AlienMesh({ entity }: { entity: SceneEntity }) {
  const household = useStore(householdStore);
  const member = household.members[entity.id];
  const plan = (entity.meta as { bodyPlan?: AlienBodyPlan } | null)?.bodyPlan;
  const body = useRef<Group>(null);
  const feet = useRef<Group>(null);
  const moving = member?.action.kind === "seek" || member?.action.kind === "wander";
  useFrame(({ clock }) => {
    if (household.orbit?.phase === "welcome") return;
    const t = clock.elapsedTime;
    if (body.current) { body.current.position.y = Math.sin(t * (moving ? 8 : 2)) * (moving ? 0.07 : 0.025); body.current.rotation.z = moving ? Math.sin(t * 8) * 0.07 : 0; }
    if (feet.current) feet.current.children.forEach((foot, i) => { foot.position.y = moving ? Math.max(0, Math.sin(t * 8 + i * Math.PI)) * 0.14 : 0; });
  });
  if (!plan) return null;
  const color = bodyColor(plan, 62);
  const tall = plan.shape === "tall";
  const wide = plan.shape === "blob";
  const selected = household.selectedMemberId === entity.id;
  return <group scale={plan.size}>
    <group ref={body}>
      <mesh castShadow position={[0, 0.9, 0]} scale={[wide ? 0.7 : 0.5, tall ? 0.95 : 0.65, 0.48]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
      <mesh castShadow position={[0, 0.95, -0.18]} scale={[0.46, tall ? 0.8 : 0.55, 0.42]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={bodyColor(plan, 32)} metalness={0.2} roughness={0.4} /></mesh>
      {[0,1,2].map(i => <mesh key={i} position={[0, 0.68 + i * 0.2, -0.54]} rotation={[0,0,Math.PI/2]}><torusGeometry args={[0.24 + i * 0.03, 0.035, 6, 20, Math.PI]} /><meshStandardMaterial color="#f9e8bc" /></mesh>)}
      {Array.from({length:plan.eyeCount}, (_,i) => {
        const x = (i - (plan.eyeCount-1)/2) * 0.24;
        return <group key={i} position={[x, tall ? 1.6 : 1.35, 0.3]}>
          <mesh position={[0,0.1,0]}><capsuleGeometry args={[0.045,0.23,4,8]} /><meshStandardMaterial color={color} /></mesh>
          <mesh position={[0,0.28,0.04]}><sphereGeometry args={[0.14,16,12]} /><meshStandardMaterial color="#fff2cf" /></mesh>
          <mesh position={[0,0.28,0.16]}><sphereGeometry args={[0.075,12,8]} /><meshStandardMaterial color="#17314a" /></mesh>
          <mesh position={[0.025,0.31,0.22]}><sphereGeometry args={[0.026,8,8]} /><meshBasicMaterial color="#ffffff" /></mesh>
        </group>;
      })}
      <mesh position={[0,0.75,0.47]} rotation={[0,0,Math.PI]}><torusGeometry args={[0.12,0.025,6,16,Math.PI]} /><meshStandardMaterial color="#26314b" /></mesh>
      {[-1,1].map(side => <group key={side} position={[side*0.35,tall?1.6:1.38,-0.1]} rotation={[0,0,side*-0.35]}>
        <mesh position={[0,0.2,0]}><cylinderGeometry args={[0.025,0.05,0.4,8]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0,0.42,0]}><sphereGeometry args={[0.085,12,8]} /><meshStandardMaterial color="#79f0cc" emissive="#79f0cc" emissiveIntensity={0.7} /></mesh>
      </group>)}
    </group>
    <group ref={feet}>{Array.from({length: plan.limbCount},(_,i) => {
      const side = i%2 ? 1 : -1;
      const z = (Math.floor(i/2)-(plan.limbCount/2-1)/2)*0.25;
      return <group key={i}><mesh castShadow position={[side*0.43,0.2,z]} rotation={[0,0,side*-0.4]}><capsuleGeometry args={[0.09,0.25,4,8]} /><meshStandardMaterial color={bodyColor(plan,45)} /></mesh><mesh castShadow position={[side*0.52,0.09,z+0.1]} scale={[1,0.5,1.4]}><sphereGeometry args={[0.15,12,8]} /><meshStandardMaterial color={color} /></mesh></group>;
    })}</group>
    {selected && <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.035,0]}><ringGeometry args={[0.8,0.89,40]} /><meshBasicMaterial color="#79f0cc" side={2} /></mesh>}
  </group>;
}
