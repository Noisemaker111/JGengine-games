import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Group, Mesh, Plane, Raycaster, TextureLoader, Vector2, Vector3 } from "three";
import { session, type PlacedObject } from "../session";
import { BUILDABLES } from "../objects/catalog";
import { operational } from "../sim/operations";
import { canPlace, footprintCells } from "../build/placement";
import { GRID, snapToGrid } from "../catalog";
import { traceNative } from "../evidence";

const rotors: Record<string,string> = {
  ride_carousel: new URL("../../../public/art/models/carousel_rotor.glb",import.meta.url).href,
  ride_ferris: new URL("../../../public/art/models/ferris_rotor.glb",import.meta.url).href,
  ride_dropzone: new URL("../../../public/art/models/drop_carriage.glb",import.meta.url).href,
};
function RideMotion({object}:{object:PlacedObject}) {
  const gltf=useLoader(GLTFLoader,rotors[object.catalogId]!);
  const clock=useGameStore(ctx=>ctx.time);
  const reduced=useGameStore(ctx=>Boolean(ctx.game.store.get("park.reduced-motion")));
  const ref=useRef<Group>(null);
  const animation=useRef<{last:number|null;elapsed:number}>({last:null,elapsed:0});
  const scene=useMemo(()=>{const copy=gltf.scene.clone();copy.traverse(n=>{if(n instanceof Mesh){n.castShadow=true;n.receiveShadow=true;}});return copy;},[gltf]);
  useFrame(()=>{
    const root=ref.current; if(!root)return;
    const now=clock.now(), state=animation.current;
    if(state.last===null)state.elapsed=now;
    else if(operational(object))state.elapsed+=Math.max(0,now-state.last);
    state.last=now;
    const t=reduced?0:state.elapsed;
    if(object.catalogId==="ride_carousel") root.rotation.y=t*.25;
    if(object.catalogId==="ride_ferris") {
      root.rotation.z=t*.09;
      scene.traverse(n=>{if(n.name.startsWith("Cabin_"))n.rotation.z=-root.rotation.z;});
    }
    if(object.catalogId==="ride_dropzone") {const phase=(t%12)/12;root.position.y=1+(phase<.8?phase/.8:Math.pow((1-phase)/.2,3))*8.5;}
  });
  return <group userData={{jgObjectId:object.id}} position={[object.x,object.catalogId==="ride_ferris"?6:0,object.z]}><group ref={ref}><primitive object={scene}/></group></group>;
}
function Entrance() {
  const sign=useLoader(TextureLoader,new URL("../../../public/art/brightway-sign.svg",import.meta.url).href);
  return <group position={[0,0,56]}>
    {[-6,6].map(x=><group key={x}><mesh castShadow position={[x,2.3,0]}><boxGeometry args={[.65,4.6,.65]}/><meshStandardMaterial color="#247f83"/></mesh><mesh position={[x,4.85,0]}><sphereGeometry args={[.4,12,8]}/><meshStandardMaterial color="#edbc5c"/></mesh><mesh castShadow position={[x,1.2,0]}><boxGeometry args={[2,2.4,2.4]}/><meshStandardMaterial color="#ef7059"/></mesh><mesh position={[x,1.65,1.22]}><boxGeometry args={[1.4,.8,.06]}/><meshStandardMaterial color="#77b8c8"/></mesh></group>)}
    <mesh position={[0,4.2,0]}><boxGeometry args={[12,.35,.4]}/><meshStandardMaterial color="#edbc5c"/></mesh>
    <mesh position={[0,4.4,.24]}><planeGeometry args={[9,2.8]}/><meshBasicMaterial map={sign} transparent/></mesh>
    <mesh position={[0,4.4,-.24]} rotation={[0,Math.PI,0]}><planeGeometry args={[9,2.8]}/><meshBasicMaterial map={sign} transparent/></mesh>
  </group>;
}
function Fence() {
  const posts=useMemo(()=>{
    const points:[number,number][]=[];
    for(let i=-60;i<=60;i+=8){points.push([-60,i],[60,i],[i,-60]);if(Math.abs(i)>8)points.push([i,60]);}return points;
  },[]);
  return <group>
    {posts.map(([x,z],i)=><mesh key={i} castShadow position={[x,.8,z]}><boxGeometry args={[.23,1.6,.23]}/><meshStandardMaterial color="#fff1cf"/></mesh>)}
    {[.6,1.2].map(y=><group key={y}>{[-60,60].map(x=><mesh key={x} position={[x,y,0]}><boxGeometry args={[.12,.1,120]}/><meshStandardMaterial color="#ad7960"/></mesh>)}<mesh position={[0,y,-60]}><boxGeometry args={[120,.1,.12]}/><meshStandardMaterial color="#ad7960"/></mesh>{[-35,35].map(x=><mesh key={x} position={[x,y,60]}><boxGeometry args={[50,.1,.12]}/><meshStandardMaterial color="#ad7960"/></mesh>)}</group>)}
    <Entrance/>
  </group>;
}
function Blueprint() {
  const {gl,camera}=useThree(); const [hover,setHover]=useState<[number,number]|null>(null);
  const selected=useGameStore(()=>session.selectedTool);
  useGameStore(()=>`${session.placed.size}:${session.cash}`);
  useEffect(()=>{
    const ray=new Raycaster(),plane=new Plane(new Vector3(0,1,0),0),hit=new Vector3();
    const move=(e:PointerEvent)=>{
      const r=gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
      if(!ray.ray.intersectPlane(plane,hit)){setHover(null);return;}
      const x=snapToGrid(hit.x),z=snapToGrid(hit.z);
      setHover(old=>old?.[0]===x&&old?.[1]===z?old:[x,z]);
    };
    const leave=()=>setHover(null);
    const inspect=(e:PointerEvent)=>traceNative("canvas-pointer",{screen:[e.clientX,e.clientY],camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),viewport:gl.domElement.getBoundingClientRect().toJSON()});
    gl.domElement.addEventListener("pointerdown",inspect);
    gl.domElement.addEventListener("pointermove",move);gl.domElement.addEventListener("pointerleave",leave);
    return()=>{gl.domElement.removeEventListener("pointermove",move);gl.domElement.removeEventListener("pointerleave",leave);gl.domElement.removeEventListener("pointerdown",inspect);};
  },[gl,camera]);
  const def=selected?BUILDABLES[selected]:null;
  if(!def||!hover)return null;
  const valid=canPlace(def.id,...hover).ok&&session.cash>=def.cost;
  const color=valid?"#7cf3c8":"#ef7059";
  return <group>{footprintCells(def,...hover).map(key=>{const [x,z]=key.split(",").map(Number);return <mesh key={key} position={[x!,.22,z!]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}><planeGeometry args={[GRID-.12,GRID-.12]}/><meshBasicMaterial color={color} transparent opacity={.4} depthWrite={false}/></mesh>;})}</group>;
}
export function BrightwayParkWorldOverlay() {
  const selection=useGameStore(()=>session.selectedObject);
  useGameStore(()=>[...session.placed.keys()].join("|"));
  const obj=selection?session.placed.get(selection):null;
  return <group><Fence/><Blueprint/>
    {[...session.placed.values()].filter(o=>rotors[o.catalogId]).map(o=><RideMotion key={o.id} object={o}/>)}
    {obj&&<mesh position={[obj.x,.23,obj.z]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}><ringGeometry args={[Math.max(2,BUILDABLES[obj.catalogId]!.footprint*.65),Math.max(2,BUILDABLES[obj.catalogId]!.footprint*.65)+.18,48]}/><meshBasicMaterial color="#edbc5c"/></mesh>}
  </group>;
}
