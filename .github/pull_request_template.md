## What changed

## Engine seam
<!-- Required. One line, one of:
     Engine seam: packages/<pkg>/src/<file> (adopts #1234)
     Engine seam: none - authored content only -->
Engine seam:

## Engine pin
<!-- Only when this lane proved a pinned engine build instead of the published catalog:
     the commit from `bun run engine:status`, e.g. Engine pin: e62f4ae9d2b2.
     `bun run lane:close` writes this line for you. Published lanes leave it out. -->

## Checks
- [ ] `bun run check-types` for the touched games
- [ ] `bun run check:framework` (or why it was allowed)
- [ ] played it in a real GPU Chrome, and a capture is attached or linked

## Numbers
<!-- perf/FPS/draws before -> after, or "no frame-time change" with the command you ran -->
