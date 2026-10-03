# Odd Orbit

A small alien household simulation about making room for different needs and rhythms. Four named household members share six furnishing types, a pantry, credits, debt and reciprocal bonds. The existing orbital habitat and body plans remain the game's canon; interface portraits are original SVG artwork.

Run `bun run dev`, `bun run check-types` and `bun run test` here. Vite resolves published `@jgengine/*` packages. On a clean checkout, provision the catalog's CC0 packs with the installed asset CLI before playing:

```sh
bunx --no-install assets pull quaternius-modular-scifi --dir public
bunx --no-install assets pull quaternius-stylized-nature --dir public
bunx --no-install assets pull kaykit-adventurers --dir public
bunx --no-install assets pull kaykit-furniture --dir public
bunx --no-install assets pull kaykit-space-base --dir public
bunx --no-install assets pull ambientcg-metalplates001 --dir public
```

Quaternius, KayKit and ambientCG supply the existing CC0 models/materials through the engine catalog. Remote pack bytes remain ignored. The floor pack has no downloaded AO map, so the game ships an original white neutral map under `public/materials/imported/odd-orbit` to express no baked occlusion.

Choose New household or Continue. Select a member to inspect needs, stress, schedule and bonds; direct activities through the inspector or let members choose. Build opens the furnishing palette: choose an affordable item, then select vacant ground. Occupied placement is rejected without spending. Sell returns half the purchase price and releases users. Escape pauses. Guide, settings, credits, speed controls and the household ledger are available in the HUD.

Households start at 09:00 with 640 credits and 12 rations. A Yield career shift uses a console during 08–14 for 20 seconds and earns up to 100 credits. A Bloom shift uses a planter during 14–18 for 20 seconds and earns four rations and 48 credits; friends tending together earn a bonus. Furnishing capacity matters. Productive progress locks that member's rhythm for the rest of the day. Three completed shifts unlock the wider 08–18 window. Late assignments lose their remaining shift rather than creating overtime.

The pantry supplies meals. Six rations cost 36 credits, subject to a 40-ration capacity. Nightly upkeep is 80 credits plus each furnishing's running cost. Relief requires fewer than four rations and fewer than 36 credits; it supplies four rations and adds 40 debt once per day. Up to 40 debt is repaid with the next bill. Poor needs and overload stop work. Food, torpor and lower stress restore agency. Shared conversations build reciprocal bonds; interruption can damage them. The bounded event feed and daily ledger show consequences.

Actions and each game second checkpoint to the browser-local key `odd-orbit.household-save.v1`. Saves include the household, clock, entities, furniture poses, stats, economy cursor and next event deadline. Reload opens the paused menu; Continue resumes the saved moment without offline event bursts or duplicate bills. Invalid/newer data stays untouched until explicit New household; unavailable storage is shown honestly. Saving stays on the current browser origin.
