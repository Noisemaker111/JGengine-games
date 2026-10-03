import { useGame, useGameStore } from "@jgengine/react/hooks";
import { guestCap, MILESTONES } from "../../catalog";
import { session } from "../../session";
import { buildableDef } from "../../objects/catalog";
import { currentMetrics } from "../../sim/economy";
import { weatherForDay, policyCost } from "../../sim/operations";

export function ParkDashboard() {
  useGameStore(() =>
    [
      session.cash,
      session.rating,
      session.guests.size,
      session.happinessAvg,
      session.litter,
      session.ticketPrice,
      session.day,
      session.open,
      session.revenueYesterday,
      session.upkeepYesterday,
      session.placed.size,
      session.marketing,
      session.supply,
    ].join("|"),
  );
  const { commands } = useGame();
  const calendar = useGameStore(
    (ctx) =>
      `${String(ctx.time.calendar().hour).padStart(2, "0")}:${String(ctx.time.calendar().minute).padStart(2, "0")}`,
  );
  const m = currentMetrics(),
    next = MILESTONES.find((x) => session.rating < x.rating);
  const net = session.revenueYesterday - session.upkeepYesterday;
  return (
    <>
      <header className="park-header park-surface">
        <div className="park-wordmark">
          <img
            src={
              new URL(
                "../../../../public/art/brightway-sign.svg",
                import.meta.url,
              ).href
            }
            alt="Brightway Park"
          />
          <span>A little seaside. A lot of possibility.</span>
        </div>
        <div className="park-status">
          <span className={session.open ? "park-open" : "park-closed"}>
            {session.open ? "GATES OPEN" : "AFTER HOURS"}
          </span>
          <strong>
            Day {session.day} · {calendar}
          </strong>
        </div>
      </header>
      <section className="park-stats park-surface" aria-label="Park statistics">
        <Stat
          label="Park funds"
          value={`$${Math.round(session.cash).toLocaleString()}`}
          tone={session.cash < 0 ? "bad" : "good"}
        />
        <Stat
          label="Park rating"
          value={`${Math.round(session.rating)} ★`}
          tone="gold"
        />
        <Stat
          label="Visitors"
          value={`${session.guests.size} / ${guestCap(session.rating)}`}
        />
        <Stat
          label="Happiness"
          value={`${Math.round(session.happinessAvg)}%`}
          tone={session.happinessAvg < 50 ? "bad" : "good"}
        />
        <Stat
          label="Cleanliness"
          value={`${Math.round(100 - session.litter)}%`}
          tone={session.litter > 40 ? "bad" : "good"}
        />
        <div className="park-ticket">
          <span>Entry ticket</span>
          <div>
            <button
              aria-label="Lower ticket price"
              onClick={() => commands.run("park.ticket", { delta: -1 })}
            >
              −
            </button>
            <strong>${session.ticketPrice}</strong>
            <button
              aria-label="Raise ticket price"
              onClick={() => commands.run("park.ticket", { delta: 1 })}
            >
              +
            </button>
          </div>
        </div>
      </section>
      <aside className="park-objectives park-surface">
        <div className="park-section-label">
          {session.won ? "BLUE RIBBON PARK" : "YOUR FIRST BLUE RIBBON"}
        </div>
        <h2>
          {session.won
            ? "Keep the good days rolling"
            : "Build a fair worth coming back to"}
        </h2>
        <div className="park-goals">
          <Goal done={m.rides >= 3} label={`Three rides · ${m.rides}/3`} />
          <Goal
            done={session.rating >= 220}
            label={`Rating · ${Math.round(session.rating)}/220`}
          />
          <Goal
            done={session.day > 1 && net >= 0}
            label={
              session.day > 1
                ? `Last day net · ${net < 0 ? "−" : "+"}$${Math.abs(Math.round(net))}`
                : "Finish a profitable day"
            }
          />
          <Goal
            done={session.happinessAvg >= 50 && session.litter <= 40}
            label="Happy 50%+ · clean 60%+"
          />
        </div>
        <p>
          {session.litter > 25
            ? "Hire a janitor before litter takes over."
            : m.stalls < 3
              ? "Add refreshments to keep visitors smiling."
              : "A new ride and a tidy midway will draw a bigger crowd."}
        </p>
        {next && (
          <div className="park-unlock">
            <span>
              Next: {next.label} · {next.rating} ★
            </span>
            <progress max={next.rating} value={session.rating} />
          </div>
        )}
        <details className="park-roster">
          <summary><span>Inspect rides & shops</span></summary>
          <div>
            {[...session.placed.values()]
              .filter((o) => {
                const d = buildableDef(o.catalogId);
                return d.ride || d.stall;
              })
              .map((o, i) => (
                <button
                  key={o.id}
                  onClick={() => commands.run("build.inspect", { id: o.id })}
                >
                  Inspect {buildableDef(o.catalogId).label}
                  {o.catalogId === "stall_food"
                    ? o.x < 0
                      ? " West"
                      : " East"
                    : ""}
                </button>
              ))}
          </div>
        </details>
        <details className="park-policies">
          <summary><span>Operations & tomorrow’s forecast</span></summary>
          <p>
            {weatherForDay(session.day).label}
            <br />
            Tomorrow: {weatherForDay(session.day + 1).label}
          </p>
          <label>
            Marketing
            <select
              value={session.marketing}
              onChange={(e) =>
                commands.run("park.policy", {
                  key: "marketing",
                  value: e.target.value,
                })
              }
            >
              <option value="local">Local · no daily spend</option>
              <option value="festival">Festival · larger crowds</option>
            </select>
          </label>
          <small>
            Festival costs ${180 + session.day * 20}/day. Budget for queues,
            wear and refreshments.
          </small>
          <label>
            Supply
            <select
              value={session.supply}
              onChange={(e) =>
                commands.run("park.policy", {
                  key: "supply",
                  value: e.target.value,
                })
              }
            >
              <option value="lean">Lean · 60% stock</option>
              <option value="buffered">Buffered · 150% stock</option>
            </select>
          </label>
          <small>
            Lean preserves cash; buffered protects busy days. Unsold inventory
            ties up money.
          </small>
        </details>
        <div className="park-ledger">
          <span>Upkeep + marketing</span>
          <strong>${m.dailyUpkeep + policyCost()}</strong>
          <span>Today’s sales</span>
          <strong>${Math.round(session.revenueToday)}</strong>
        </div>
      </aside>
    </>
  );
}
function Stat({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`park-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Goal({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={done ? "park-goal complete" : "park-goal"}>
      <span aria-hidden>{done ? "✓" : "○"}</span>
      {label}
    </div>
  );
}
