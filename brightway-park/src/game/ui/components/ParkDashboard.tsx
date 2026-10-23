import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { guestCap } from "../../catalog";
import { session } from "../../session";
import { currentMetrics } from "../../sim/economy";
import { loanSummary } from "../../loan";
import { rideBoard } from "../../rides";
import { scenarioView } from "../../scenarios";
import { nextMilestone, nextStepText } from "../nextStep";

/** A countdown in the units a park manager thinks in: days and hours on the clock. */
function countdown(seconds: number | null): string {
  if (seconds === null) return "";
  const day = 150;
  const days = Math.floor(seconds / day);
  const hours = Math.floor(((seconds % day) / day) * 24);
  return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
}

export function ParkDashboard() {
  useGameStore(() => [session.cash,session.rating,session.guests.size,session.happinessAvg,session.litter,session.ticketPrice,session.day,session.open,session.revenueYesterday,session.upkeepYesterday,session.placed.size,session.loan?.outstanding ?? 0,session.scenario?.id ?? "",session.scenario?.result ?? "",session.scenarioVisitors,session.scenarioRevenue].join("|"));
  const {commands}=useGame();
  const calendar=useGameStore(ctx=>`${String(ctx.time.calendar().hour).padStart(2,"0")}:${String(ctx.time.calendar().minute).padStart(2,"0")}`);
  const m=currentMetrics(), next=nextMilestone(session.rating), nextStep=nextStepText(session.rating);
  const net=session.revenueYesterday-session.upkeepYesterday;
  const rides=rideBoard();
  const scenario=scenarioView();
  const loan=session.loan===null?null:loanSummary(session.loan);
  return <>
    <HudSurface className="park-header park-surface" as="header">
      <div className="park-wordmark"><img src={new URL("../../../../public/art/brightway-sign.svg",import.meta.url).href} alt="Brightway Park" /><span>A little seaside. A lot of possibility.</span></div>
      <div className="park-status"><span className={session.open?"park-open":"park-closed"}>{session.open?"GATES OPEN":"AFTER HOURS"}</span><strong>Day {session.day} · {calendar}</strong></div>
    </HudSurface>
    <HudSurface className="park-stats park-surface" as="section" aria-label="Park statistics">
      <Stat label="Park funds" value={`$${Math.round(session.cash).toLocaleString()}`} tone={session.cash<0?"bad":"good"}/>
      <Stat label="Park rating" value={`${Math.round(session.rating)} ★`} tone="gold"/>
      <Stat label="Visitors" value={`${session.guests.size} / ${guestCap(session.rating)}`}/>
      <Stat label="Guest mood" value={`${Math.round(session.happinessAvg)}%`} tone={session.happinessAvg<50?"bad":"good"}/>
      <Stat label="Cleanliness" value={`${Math.round(100-session.litter)}%`} tone={session.litter>40?"bad":"good"}/>
      <Stat label="Rides" value={rides.rides===0?"none":`${rides.online}/${rides.rides} up`} tone={rides.broken>0?"bad":""}/>
      <div className="park-ticket"><span>Entry ticket</span><div><HudButton size="icon" aria-label="Lower ticket price" onClick={()=>commands.run("park.ticket",{delta:-1})}>−</HudButton><strong>${session.ticketPrice}</strong><HudButton size="icon" aria-label="Raise ticket price" onClick={()=>commands.run("park.ticket",{delta:1})}>+</HudButton></div></div>
    </HudSurface>
    <HudSurface className="park-objectives park-surface" as="aside" aria-label="Park goals">
      {scenario!==null ? <>
        <div className="park-section-label">SCENARIO · {scenario.title.toUpperCase()}</div>
        <h2>{scenario.goal}</h2>
        <div className="park-goals">
          <Goal done={scenario.result==="won"} label={`Takings · $${Math.round(scenario.facts.revenue)}`}/>
          <Goal done={scenario.result==="won"} label={`Visitors · ${scenario.facts.visitors}`}/>
          <Goal done={scenario.facts.cash>0} label={`Till · $${Math.round(scenario.facts.cash)}`}/>
        </div>
        <div className="park-unlock"><span>{scenario.result==="failed"?`Failed — ${scenario.reason ?? "the goal slipped away"}`:scenario.result==="won"?"Scenario complete":countdown(scenario.remaining)}</span>
          {scenario.remaining!==null&&scenario.duration!==null&&scenario.result===null?<progress max={scenario.duration} value={scenario.duration-scenario.remaining}/>:null}
        </div>
      </> : <>
        <div className="park-section-label">{session.won?"BLUE RIBBON PARK":"YOUR FIRST BLUE RIBBON"}</div>
        <h2>{session.won?"Keep the good days rolling":"Build a fair worth coming back to"}</h2>
        <div className="park-goals">
          <Goal done={m.rides>=3} label={`Three rides · ${m.rides}/3`}/>
          <Goal done={session.rating>=220} label={`Rating · ${Math.round(session.rating)}/220`}/>
          <Goal done={session.day>1&&net>=0} label={session.day>1?`Last day net · ${net<0?"−":"+"}$${Math.abs(Math.round(net))}`:"Finish a profitable day"}/>
          <Goal done={session.happinessAvg>=50&&session.litter<=40} label="Happy 50%+ · clean 60%+"/>
        </div>
        <p>{session.litter>25?"Hire a janitor before litter takes over.":m.stalls<3?"Add refreshments to keep visitors smiling.":"Mix gentle rides and thrills: families and thrill seekers want different days out."}</p>
        {next&&nextStep&&<div className="park-unlock"><span>{nextStep}</span><progress max={next.rating} value={session.rating}/></div>}
      </>}
      <div className="park-ledger">
        <span>Rides &amp; shops upkeep</span><strong>${m.facilitiesUpkeep}</strong>
        <span>Staff wages</span><strong>${m.wages}</strong>
        <span>Today’s sales</span><strong>${Math.round(session.revenueToday)}</strong>
        {rides.rides>0&&<><span>Ride lines</span><strong>{rides.queued} waiting</strong></>}
        {loan!==null&&<><span>Loan owed</span><strong>${Math.round(loan.owed)} · ${loan.daysLeft}d</strong></>}
      </div>
      <div className="park-finance">
        {loan===null
          ? <HudButton size="sm" variant="ghost" onClick={()=>commands.run("park.loan",{})} aria-label="Take a park loan">Take a $6,000 loan · 3%/day</HudButton>
          : <HudButton size="sm" variant="ghost" onClick={()=>commands.run("park.repay",{})} aria-label="Pay the loan down">Pay loan · $${Math.round(loan.payment)}/day</HudButton>}
      </div>
    </HudSurface>
  </>;
}
function Stat({label,value,tone=""}:{label:string;value:string;tone?:string}) { return <div className={`park-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function Goal({done,label}:{done:boolean;label:string}) { return <div className={done?"park-goal complete":"park-goal"}><span aria-hidden>{done?"✓":"○"}</span>{label}</div>; }
