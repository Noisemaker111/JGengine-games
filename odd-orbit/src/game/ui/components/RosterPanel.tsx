import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { moodOf, NEEDS } from "../../needs/needs";
import { householdStore } from "../../session/store";
import { activeGoalLabel } from "../../sim/simulate";
import { scheduleLabel } from "../../sim/schedule";
import { AlienSwatch, MoodBadge, NeedBar } from "./bits";

export function RosterPanel({ compact = false }: { compact?: boolean }) {
  const household = useStore(householdStore);
  const { commands } = useGame();
  return <section className={`orbit-roster ${compact ? "compact" : ""}`} aria-label="Household"><h2>Household <span>{household.order.length} beings</span></h2><div className="orbit-member-list">{household.order.map(id => {
    const member = household.members[id];
    if (!member) return null;
    const mood = moodOf(member.needs);
    const selected = household.selectedMemberId === id;
    return <button key={id} className={`orbit-member ${selected ? "selected" : ""} ${member.recovering ? "recovering" : ""}`} aria-pressed={selected} onClick={() => commands.run("member.select", { id: selected ? null : id })}>
      <div className="orbit-member-heading"><AlienSwatch plan={member.bodyPlan}/><div><strong>{member.name}</strong><small>{activeGoalLabel(member)}</small></div></div>
      <div className="orbit-member-state"><MoodBadge tier={mood.tier} face={mood.face} label={mood.label}/><span>{member.recovering ? "Recovering" : `${Math.round(member.stress)} stress`}</span></div>
      {!compact && <><p className="orbit-member-schedule">{scheduleLabel(member)}</p><div className="orbit-member-needs">{NEEDS.map(need => <NeedBar key={need} need={need} value={member.needs[need]}/>)}</div></>}
      {member.concern && <small className="orbit-concern">{member.concern}</small>}
    </button>;
  })}</div></section>;
}
