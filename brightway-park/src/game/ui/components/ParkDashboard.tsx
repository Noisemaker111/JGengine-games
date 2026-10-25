import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useGameContext } from "@jgengine/react/provider";
import { guestCap } from "../../catalog";
import { session } from "../../session";
import { LOAN, parkMetrics } from "../../park";
import { rideBoard } from "../../rides";
import { scenarioView } from "../../parkReset";
import { nextMilestone, nextStepText } from "../nextStep";
import { usePark } from "../usePark";

/** A countdown in the units a park manager thinks in: days and hours on the clock. */
function countdown(seconds: number | null): string {
  if (seconds === null) return "";
  const day = 150;
  const days = Math.floor(seconds / day);
  const hours = Math.floor(((seconds % day) / day) * 24);
  return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
}

/** The park's numbers, every one read from the world (`park.of(ctx)`); buttons run `brightway.act`. */
export function ParkDashboard() {
  useGameStore(() => session.guests.size);
  const w = usePark();
  const ctx = useGameContext();
  const { commands } = useGame();
  const act = (action: string) => commands.run("brightway.act", { action });
  const calendar = useGameStore((c) => `${String(c.time.calendar().hour).padStart(2, "0")}:${String(c.time.calendar().minute).padStart(2, "0")}`);
  const m = parkMetrics(w);
  const rating = w.num("park.rating");
  const peak = w.num("park.peak");
  const mood = w.num("park.mood");
  const litter = w.num("park.litter");
  const cash = w.num("park.cash");
  const day = w.num("park.day");
  const open = w.fact("park.open") === true;
  const won = w.fact("park.won") === true;
  const next = nextMilestone(peak);
  const nextStep = nextStepText(peak);
  const net = w.num("park.revenue_yesterday") - w.num("park.upkeep_yesterday");
  const rides = rideBoard();
  const scenario = scenarioView(ctx);
  const owed = w.num("park.loan_owed");
  return <>
    <HudSurface className="park-header park-surface" as="header">
      <div className="park-wordmark"><img src={new URL("../../../../public/art/brightway-sign.svg", import.meta.url).href} alt="Brightway Park" /><span>A little seaside. A lot of possibility.</span></div>
      <div className="park-status"><span className={open ? "park-open" : "park-closed"}>{open ? "GATES OPEN" : "AFTER HOURS"}</span><strong>Day {day} · {calendar}</strong></div>
    </HudSurface>
    <HudSurface className="park-stats park-surface" as="section" aria-label="Park statistics">
      <Stat label="Park funds" value={`$${Math.round(cash).toLocaleString()}`} tone={cash < 0 ? "bad" : "good"} />
      <Stat label="Park rating" value={`${Math.round(rating)} ★`} tone="gold" />
      <Stat label="Visitors" value={`${session.guests.size} / ${guestCap(rating)}`} />
      <Stat label="Guest mood" value={`${Math.round(mood)}%`} tone={mood < 50 ? "bad" : "good"} />
      <Stat label="Cleanliness" value={`${Math.round(100 - litter)}%`} tone={litter > 40 ? "bad" : "good"} />
      <Stat label="Rides" value={m.rides === 0 ? "none" : `${m.ridesOpen}/${m.rides} up`} tone={m.ridesOpen < m.rides ? "bad" : ""} />
      <div className="park-ticket"><span>Entry ticket</span><div><HudButton size="icon" aria-label="Lower ticket price" onClick={() => act("ticket_down")}>−</HudButton><strong>${w.num("park.ticket")}</strong><HudButton size="icon" aria-label="Raise ticket price" onClick={() => act("ticket_up")}>+</HudButton></div></div>
    </HudSurface>
    <HudSurface className="park-objectives park-surface" as="aside" aria-label="Park goals">
      {scenario !== null ? <>
        <div className="park-section-label">SCENARIO · {scenario.title.toUpperCase()}</div>
        <h2>{scenario.goal}</h2>
        <div className="park-goals">
          <Goal done={scenario.result === "won"} label={`Takings · $${Math.round(scenario.revenue)}`} />
          <Goal done={scenario.result === "won"} label={`Visitors · ${scenario.visitors}`} />
          <Goal done={scenario.cash > 0} label={`Till · $${Math.round(scenario.cash)}`} />
        </div>
        <div className="park-unlock"><span>{scenario.result === "failed" ? `Failed — ${scenario.reason ?? "the goal slipped away"}` : scenario.result === "won" ? "Scenario complete" : countdown(scenario.remaining)}</span>
          {scenario.remaining !== null && scenario.duration !== null && scenario.result === null ? <progress max={scenario.duration} value={scenario.duration - scenario.remaining} /> : null}
        </div>
      </> : <>
        <div className="park-section-label">{won ? "BLUE RIBBON PARK" : "YOUR FIRST BLUE RIBBON"}</div>
        <h2>{won ? "Keep the good days rolling" : "Build a fair worth coming back to"}</h2>
        <div className="park-goals">
          <Goal done={m.rides >= 3} label={`Three rides · ${m.rides}/3`} />
          <Goal done={rating >= 220} label={`Rating · ${Math.round(rating)}/220`} />
          <Goal done={day > 1 && net >= 0} label={day > 1 ? `Last day net · ${net < 0 ? "−" : "+"}$${Math.abs(Math.round(net))}` : "Finish a profitable day"} />
          <Goal done={mood >= 50 && litter <= 40} label="Happy 50%+ · clean 60%+" />
        </div>
        <p>{litter > 25 ? "Hire a janitor before litter takes over." : m.stalls < 3 ? "Add refreshments to keep visitors smiling." : "Mix gentle rides and thrills: families and thrill seekers want different days out."}</p>
        {next && nextStep && <div className="park-unlock"><span>{nextStep}</span><progress max={next.rating} value={peak} /></div>}
      </>}
      <div className="park-ledger">
        <span>Rides &amp; shops upkeep</span><strong>${m.facilitiesUpkeep}/day</strong>
        <span>Staff wages</span><strong>${m.wages}/day</strong>
        <span>Today’s sales</span><strong>${Math.round(w.num("park.revenue_today"))}</strong>
        {rides.rides > 0 && <><span>Ride lines</span><strong>{rides.queued} waiting</strong></>}
        {owed > 0 && <><span>Loan owed</span><strong>${Math.round(owed)} · {Math.ceil(owed / LOAN.payment)}d</strong></>}
      </div>
      <div className="park-finance">
        {owed <= 0
          ? <HudButton size="sm" variant="ghost" onClick={() => act("take_loan")} aria-label="Take a park loan">Take a ${LOAN.principal.toLocaleString()} loan · ${LOAN.payment}/night × {LOAN.nights}</HudButton>
          : <HudButton size="sm" variant="ghost" onClick={() => act("repay_loan")} aria-label="Pay the loan down">Pay an instalment early · ${LOAN.payment}</HudButton>}
      </div>
    </HudSurface>
  </>;
}
function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) { return <div className={`park-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function Goal({ done, label }: { done: boolean; label: string }) { return <div className={done ? "park-goal complete" : "park-goal"}><span aria-hidden>{done ? "✓" : "○"}</span>{label}</div>; }
