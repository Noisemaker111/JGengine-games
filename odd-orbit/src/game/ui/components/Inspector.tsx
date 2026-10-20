import { useGame, useGameClock, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { moodOf, NEEDS } from "../../needs/needs";
import { householdStore } from "../../session/store";
import { pairKey } from "../../session/types";
import { activeGoalLabel, waitingForStation } from "../../sim/simulate";
import { LIFESTYLES, scheduleLabel, SHIFT_SECONDS, canChangeLifestyle, yieldShiftLabel } from "../../sim/schedule";
import { bloomHarvest } from "../../sim/bloom";
import { FURNITURE_BY_ID } from "../../objects/catalog";
import { shiftIsOpen } from "../../sim/schedule";
import { relationLabel } from "../../sim/social";
import { AlienSwatch, MoodBadge, NeedBar } from "./bits";
export function Inspector() {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const clock = useGameClock();
  const objects = useSceneObjects();
  const id = household.selectedMemberId;
  const member = id ? household.members[id] : null;
  if (!member || !id) return null;
  const cropLocked = member.shiftProgress > 0 || member.harvestToday > 0;
  const crop = member.bloomCrop ?? "pantry";
  const reward = bloomHarvest(crop, false);
  const hasPaidStation = objects.some(object => member.lifestyle === "bloom" ? object.catalogId === "bloom_planter" : FURNITURE_BY_ID[object.catalogId]?.role === "work");
  const paidReason = !hasPaidStation ? `Add a ${member.lifestyle === "bloom" ? "Bloom Planter" : "Yield Console"} with Furnish` : member.recovering ? "Recover before paid work" : member.shiftDay === household.day ? "Today's paid shift is finished or missed" : !shiftIsOpen(member, clock.now) ? `Paid window: ${scheduleLabel(member)}` : null;
  const care = [{ goal:"hunger", label:"Nourish", detail:"Uses 1 ration" }, { goal:"energy", label:"Rest", detail:"Lowers stress" }, { goal:"fun", label:"Play", detail:"Lowers stress" }] as const;
  const mood = moodOf(member.needs);
  const shiftProgress = member.lifestyle === "yield" ? member.workToday : member.shiftProgress;
  const shiftLabel = yieldShiftLabel(member, waitingForStation(household, member, objects));
  const bonds = household.order.filter(other => other !== id).map(other => ({ id: other, name: household.members[other]?.name ?? "?", value: household.relationships[pairKey(id, other)] ?? 0 })).sort((a,b) => b.value - a.value);
  return <section className="orbit-inspector" aria-label={`${member.name} care and schedule`}>
    <header><AlienSwatch plan={member.bodyPlan} size={52}/><div><h2>{member.name}</h2><small>{member.job}</small></div><button className="orbit-close" aria-label="Close member care" onClick={() => commands.run("member.select",{ id:null })}>×</button></header>
    <div className="orbit-inspector-body">
    <div className="orbit-member-state"><MoodBadge tier={mood.tier} face={mood.face} label={mood.label}/><span>{activeGoalLabel(member)}</span></div>
    <div className="orbit-stress"><span>{member.recovering ? "Burnout recovery" : "Stress"}</span><meter aria-label="Stress" min={0} max={100} value={member.stress}/><b>{Math.round(member.stress)}</b></div>
    {member.recovering && <p className="orbit-warning">Paid work stops during recovery. Reach 50 Nourish and Rest, then reduce stress below 35.</p>}
    <div className="orbit-full-needs">{NEEDS.map(need => <NeedBar key={need} need={need} value={member.needs[need]}/>)}</div>
    <h3>Care now</h3><div className="orbit-care" role="group" aria-label="Direct care">{care.map(action => {
      const available = objects.some(object => FURNITURE_BY_ID[object.catalogId]?.role === action.goal && (action.goal !== "fun" || object.catalogId !== "bloom_planter"));
      const reason = !available ? "Add a station" : action.goal === "hunger" && household.pantry === 0 ? "Pantry empty" : action.detail;
      return <button key={action.goal} disabled={!available || (action.goal === "hunger" && household.pantry === 0)} onClick={() => commands.run("member.direct", { id, goal:action.goal === "fun" ? "play" : action.goal })}>{action.label}<small>{reason}</small></button>;
    })}</div>
    <h3>Daily rhythm</h3><p className="orbit-fine">{scheduleLabel(member)} · {member.completedShifts} completed / {member.missedShifts} missed shifts</p>
    <div className="orbit-lifestyles" role="group" aria-label="Daily schedule">{LIFESTYLES.map(lifestyle => <button key={lifestyle.id} disabled={member.lifestyle !== lifestyle.id && !canChangeLifestyle(member)} aria-pressed={member.lifestyle === lifestyle.id} onClick={() => commands.run("member.lifestyle", { id, lifestyle:lifestyle.id })}><strong>{lifestyle.label}</strong><span>{lifestyle.blurb}</span></button>)}</div>
    {!canChangeLifestyle(member) && <p className="orbit-fine">Today’s paid shift is committed. Change rhythm tomorrow.</p>}
    {member.lifestyle === "bloom" && <><h3>Choose today's crop</h3><div className="orbit-lifestyles" role="group" aria-label="Bloom crop">{(["pantry","export"] as const).map(choice => { const output = bloomHarvest(choice,false); return <button key={choice} aria-pressed={crop === choice} disabled={cropLocked && crop !== choice} onClick={() => commands.run("member.bloomCrop", { id, crop:choice })}><strong>{choice === "pantry" ? "Pantry crop" : "Export crop"}</strong><span>{output.rations} rations · {output.credits} credits</span></button>; })}</div><p className="orbit-fine">Export trades 3 rations for 12 extra credits. Friends tending nearby add 1 ration and 12 credits. {cropLocked ? "Crop committed until tomorrow." : "Choose before tending starts."}</p></>}
    <button className="orbit-paid-action" disabled={paidReason !== null || shiftLabel !== null} onClick={() => commands.run("member.direct", { id, goal: member.lifestyle === "bloom" ? "tend" : "work" })}>{shiftLabel ?? (member.lifestyle === "bloom" ? `Tend ${crop} crop · ${reward.rations} rations + ${reward.credits} credits` : "Start Yield shift · earn up to 100 credits")}</button>
    <p className="orbit-fine">{paidReason ?? (shiftLabel !== null ? "Shift under way. Care needs can interrupt it." : "20 seconds at the station. Care needs can interrupt your shift.")}</p>
    <div className="orbit-shift"><span>Shift progress</span><progress max={SHIFT_SECONDS} value={shiftProgress}/><span>{Math.round(shiftProgress)} / {SHIFT_SECONDS}s</span></div>
    <p className="orbit-fine">Today: {member.workToday.toFixed(0)} seconds worked · {member.harvestToday} rations grown</p>
    <button className="orbit-release" onClick={() => commands.run("member.release", { id })}>Release direction · let {member.name.split(" ")[0]} choose</button>
    <h3>Relationships</h3><p className="orbit-fine">Conversations ease stress. Two stressed beings may dispute instead.</p>
    <div className="orbit-bonds">{bonds.map(bond => <div key={bond.id}><span><strong>{bond.name}</strong><small>{relationLabel(bond.value)} · {Math.round(bond.value)}</small></span><button onClick={() => commands.run("member.socialize", { id, withId:bond.id })}>Talk</button></div>)}</div>
    <p className="orbit-fine">Select a furnishing in the habitat to direct this being. A Bond Ring used alone can only restore Social to 55.</p>
    {member.concern && <p role="status" className="orbit-warning">{member.concern}</p>}
    </div>
  </section>;
}
