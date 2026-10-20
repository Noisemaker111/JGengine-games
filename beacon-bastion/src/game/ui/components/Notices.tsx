import { useGameStore } from "@jgengine/react/hooks";

import { session } from "../../session";

/** How long a notice stays on screen, in game seconds. */
const NOTICE_SECONDS = 2.5;

export function Notices() {
  // Floored clock: the selector changes once a second, so expired notices drop out without a store write.
  const now = useGameStore((ctx) => Math.floor(ctx.time.now()));
  const notices = useGameStore(() => session.notices);
  const visible = notices.filter((notice) => now - notice.at < NOTICE_SECONDS);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1.5">
      {visible.map((notice) => (
        <div
          key={notice.id}
          className="rounded border border-amber-400/40 bg-slate-950/95 px-4 py-2 text-sm font-bold text-amber-50 shadow-lg"
        >
          {notice.text}
        </div>
      ))}
    </div>
  );
}
