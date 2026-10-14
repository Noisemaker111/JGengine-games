import { useState } from "react";

/**
 * Starting fresh archives the current save, so it takes a second press. "Keep my park" is focused
 * when the confirmation opens, so pressing Enter by reflex keeps the save.
 */
export function FreshStart({idleLabel,confirmLabel,primary=false,onConfirm}:{idleLabel:string;confirmLabel:string;primary?:boolean;onConfirm:()=>void}) {
  const [confirming,setConfirming]=useState(false);
  if(!confirming) return <button className={primary?"park-button primary":"park-button"} onClick={()=>setConfirming(true)}>{idleLabel}</button>;
  return <>
    <p>Your current park is archived as a backup in this browser before a new one opens.</p>
    <button className="park-button" onClick={onConfirm}>{confirmLabel}</button>
    <button className="park-button primary" autoFocus onClick={()=>setConfirming(false)}>Keep my park</button>
  </>;
}
