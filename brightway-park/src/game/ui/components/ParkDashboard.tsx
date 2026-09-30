import { useGame, useGameStore } from "@jgengine/react/hooks";
import { guestCap, MILESTONES } from "../../catalog";
import { session } from "../../session";
import { currentMetrics } from "../../sim/economy";

export function ParkDashboard() {
  useGameStore(() => [session.cash,session.rating,session.guests.size,session.happinessAvg,session.litter,session.ticketPrice,session.day,session.open,session.revenueYesterday,session.upkeepYesterday,session.placed.size].join("|"));
  const {commands}=useGame();
  const calendar=useGameStore(ctx=>`${String(ctx.time.calendar().hour).padStart(2,"0")}:${String(ctx.time.calendar().minute).padStart(2,"0")}`);
  const m=currentMetrics(), next=MILESTONES.find(x=>session.rating<x.rating);
  const net=session.revenueYesterday-session.upkeepYesterday;
  return <>
    <header className="park-header park-surface">
      <div className="park-wordmark"><img src={new URL("../../../../public/art/brightway-sign.svg",import.meta.url).href} alt="Brightway Park" /><span>A little seaside. A lot of possibility.</span></div>
      <div className="park-status"><span className={session.open?"park-open":"park-closed"}>{session.open?"GATES OPEN":"AFTER HOURS"}</span><strong>Day {session.day} · {calendar}</strong></div>
    </header>
    <section className="park-stats park-surface" aria-label="Park statistics">
      <Stat label="Park funds" value={`$${Math.round(session.cash).toLocaleString()}`} tone={session.cash<0?"bad":"good"}/>
      <Stat label="Park rating" value={`${Math.round(session.rating)} ★`} tone="gold"/>
      <Stat label="Visitors" value={`${session.guests.size} / ${guestCap(session.rating)}`}/>
      <Stat label="Happiness" value={`${Math.round(session.happinessAvg)}%`} tone={session.happinessAvg<50?"bad":"good"}/>
      <Stat label="Cleanliness" value={`${Math.round(100-session.litter)}%`} tone={session.litter>40?"bad":"good"}/>
      <div className="park-ticket"><span>Entry ticket</span><div><button aria-label="Lower ticket price" onClick={()=>commands.run("park.ticket",{delta:-1})}>−</button><strong>${session.ticketPrice}</strong><button aria-label="Raise ticket price" onClick={()=>commands.run("park.ticket",{delta:1})}>+</button></div></div>
    </section>
    <aside className="park-objectives park-surface">
      <div className="park-section-label">{session.won?"BLUE RIBBON PARK":"YOUR FIRST BLUE RIBBON"}</div>
      <h2>{session.won?"Keep the good days rolling":"Build a fair worth coming back to"}</h2>
      <div className="park-goals">
        <Goal done={m.rides>=3} label={`Three rides · ${m.rides}/3`}/>
        <Goal done={session.rating>=220} label={`Rating · ${Math.round(session.rating)}/220`}/>
        <Goal done={session.day>1&&net>=0} label={session.day>1?`Last day net · ${net<0?"−":"+"}$${Math.abs(Math.round(net))}`:"Finish a profitable day"}/>
        <Goal done={session.happinessAvg>=50&&session.litter<=40} label="Happy 50%+ · clean 60%+"/>
      </div>
      <p>{session.litter>25?"Hire a janitor before litter takes over.":m.stalls<3?"Add refreshments to keep visitors smiling.":"A new ride and a tidy midway will draw a bigger crowd."}</p>
      {next&&<div className="park-unlock"><span>Next: {next.label} · {next.rating} ★</span><progress max={next.rating} value={session.rating}/></div>}
      <div className="park-ledger"><span>Daily upkeep</span><strong>${m.dailyUpkeep}</strong><span>Today’s sales</span><strong>${Math.round(session.revenueToday)}</strong></div>
    </aside>
  </>;
}
function Stat({label,value,tone=""}:{label:string;value:string;tone?:string}) { return <div className={`park-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function Goal({done,label}:{done:boolean;label:string}) { return <div className={done?"park-goal complete":"park-goal"}><span aria-hidden>{done?"✓":"○"}</span>{label}</div>; }
