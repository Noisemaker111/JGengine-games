import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { moodOf, NEEDS } from "../../needs/needs";
import { householdStore } from "../../session/store";
import { pairKey } from "../../session/types";
import { activeGoalLabel } from "../../sim/simulate";
import { LIFESTYLES, scheduleLabel, SHIFT_SECONDS, canChangeLifestyle } from "../../sim/schedule";
import { relationLabel } from "../../sim/social";
import { AlienSwatch, MoodBadge, NeedBar } from "./bits";

export function Inspector() {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const id = household.selectedMemberId;
  const member = id ? household.members[id] : null;
  if (!member || !id) return null;
  const mood = moodOf(member.needs);
  const shiftProgress = member.lifestyle === "yield" ? member.workToday : member.shiftProgress;
  const bonds = household.order.filter(other => other !== id).map(other => ({ id: other, name: household.members[other]?.name ?? "?", value: household.relationships[pairKey(id, other)] ?? 0 })).sort((a,b) => b.value - a.value);
  return <section className="orbit-inspector" aria-label={`${member.name} care and schedule`}>
    <header><AlienSwatch plan={member.bodyPlan} size={52}/><div><h2>{member.name}</h2><small>{member.job}</small></div><button className="orbit-close" aria-label="Close member care" onClick={() => commands.run("member.select",{ id:null })}>×</button></header>
    <div className="orbit-member-state"><MoodBadge tier={mood.tier} face={mood.face} label={mood.label}/><span>{activeGoalLabel(member)}</span></div>
    <div className="orbit-stress"><span>{member.recovering ? "Burnout recovery" : "Stress"}</span><meter aria-label="Stress" min={0} max={100} value={member.stress}/><b>{Math.round(member.stress)}</b></div>
    {member.recovering && <p className="orbit-warning">Paid work stops during recovery. Reach 50 Nourish and Rest, then reduce stress below 35.</p>}
    <div className="orbit-full-needs">{NEEDS.map(need => <NeedBar key={need} need={need} value={member.needs[need]}/>)}</div>
    <h3>Daily rhythm</h3><p className="orbit-fine">{scheduleLabel(member)} · {member.completedShifts} completed / {member.missedShifts} missed shifts</p>
    <div className="orbit-lifestyles" role="group" aria-label="Daily schedule">{LIFESTYLES.map(lifestyle => <button key={lifestyle.id} disabled={member.lifestyle !== lifestyle.id && !canChangeLifestyle(member)} aria-pressed={member.lifestyle === lifestyle.id} onClick={() => commands.run("member.lifestyle", { id, lifestyle:lifestyle.id })}><strong>{lifestyle.label}</strong><span>{lifestyle.blurb}</span></button>)}</div>
    {!canChangeLifestyle(member) && <p className="orbit-fine">Today’s paid shift is committed. Change rhythm tomorrow.</p>}
    <div className="orbit-shift"><span>Shift progress</span><progress max={SHIFT_SECONDS} value={shiftProgress}/><span>{Math.round(shiftProgress)} / {SHIFT_SECONDS}s</span></div>
    <p className="orbit-fine">Today: {member.workToday.toFixed(0)} seconds worked · {member.harvestToday} rations grown</p>
    <button className="orbit-release" onClick={() => commands.run("member.release", { id })}>Release direction · let {member.name.split(" ")[0]} choose</button>
    <h3>Relationships</h3><p className="orbit-fine">Conversations ease stress. Two stressed beings may dispute instead.</p>
    <div className="orbit-bonds">{bonds.map(bond => <div key={bond.id}><span><strong>{bond.name}</strong><small>{relationLabel(bond.value)} · {Math.round(bond.value)}</small></span><button onClick={() => commands.run("member.socialize", { id, withId:bond.id })}>Talk</button></div>)}</div>
    <p className="orbit-fine">Select a furnishing in the habitat to direct this being. A Bond Ring used alone can only restore Social to 55.</p>
    {member.concern && <p role="status" className="orbit-warning">{member.concern}</p>}
  </section>;
}
