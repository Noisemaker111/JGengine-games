import { useEffect, useRef } from "react";

/** Touch buttons feed the published RTS rig's existing DOM input boundary. */
export function CameraPad() {
  const held=useRef(new Set<string>());
  const pulse=useRef<ReturnType<typeof setTimeout>|null>(null);
  const release=()=>{
    if(pulse.current!==null){clearTimeout(pulse.current);pulse.current=null;}
    for(const code of held.current) window.dispatchEvent(new KeyboardEvent("keyup",{code}));
    held.current.clear();
  };
  const press=(code:string)=>{
    release();held.current.add(code);
    window.dispatchEvent(new KeyboardEvent("keydown",{code}));
  };
  useEffect(()=>{
    window.addEventListener("blur",release);
    return ()=>{release();window.removeEventListener("blur",release);};
  },[]);
  const key=(label:string,glyph:string,code:string)=><button key={code} aria-label={label}
    onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);press(code);}}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onClick={e=>{if(e.detail===0){press(code);pulse.current=setTimeout(release,180);}}}>{glyph}</button>;
  const zoom=(deltaY:number)=>{
    const canvas=document.querySelector("canvas");
    canvas?.dispatchEvent(new WheelEvent("wheel",{deltaY,bubbles:true,cancelable:true}));
  };
  return <nav className="park-camera park-surface" aria-label="Camera navigation">
    <span>LOOK AROUND</span>
    <div>{key("Rotate camera left","↶","KeyQ")}{key("Pan camera up","↑","ArrowUp")}{key("Rotate camera right","↷","KeyE")}
    {key("Pan camera left","←","ArrowLeft")}<button aria-label="Zoom camera in" onClick={()=>zoom(-100)}>＋</button>{key("Pan camera right","→","ArrowRight")}
    <button aria-label="Zoom camera out" onClick={()=>zoom(100)}>−</button>{key("Pan camera down","↓","ArrowDown")}</div>
  </nav>;
}
