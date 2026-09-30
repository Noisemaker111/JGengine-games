# Wayfarer Deck

An original illustrated deckbuilder about crossing a weathered mountain road. Five foes have distinct silhouettes and intent patterns: Pitch Ooze, Cairn Whisperer, Ridge Borer, Iron Sentry and Gate Colossus. The landscape and creature portraits are original SVG geometry in `src/game/ui/RoadArt.tsx`; cards use the existing authored icon set. Existing repository and engine attribution remains applicable.

Run `bun run dev` in this directory. `bun run check-types` and `bun run test` verify the published engine consumer. Vite resolves published `@jgengine/*` packages even when the game is hosted beside engine source.

Click or tap cards, or press 1–9 in hand order. F ends the turn. Escape pauses/resumes. Settings offers larger card text and reduced motion, both saved on this device. The card strip scrolls on narrow screens. Each turn grants three energy and five cards. Read the intent before spending energy; Block resets on your next turn, Weak reduces outgoing damage by 25%, and Vulnerable increases incoming damage by 50%. Strength resets between battles.

After a win, choose a card, recover up to 12 HP instead, or continue without either. The five encounters end in a victory screen; defeat offers a fresh crossing. New crossings require confirmation while another crossing is active.

Runs save after actions to the browser-local key `wayfarer-deck.road-save.v1`. The checkpoint includes ordered card zones, turn pools, health/statuses, reward choices and encounter progression. Reload opens the start screen with Continue; gameplay stays gated until the player resumes. Unreadable saves remain untouched until the player explicitly begins a new crossing. No engine save namespaces, backend records or existing saves are migrated or deleted. Browser storage denial is shown in the HUD. Saving is local to the current browser origin; cross-device/cloud saving is not provided.
