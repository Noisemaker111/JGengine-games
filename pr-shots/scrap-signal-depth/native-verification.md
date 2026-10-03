# Scrap Signal native verification

All browser input/capture uses the engine repository's native `drive-dev.ts` capture path, materialized in scratch with a standalone server adapter; no Playwright/Puppeteer or game context mutations. `native-adapter.diff` records the exact adapter. Games import published 0.18.1 packages. The compiled game preview at port5177 avoids HMR during verification. Native headless Chromium uses software GL; captures and probes establish controls/state changes, not real-time performance on hardware.

## Baseline

`baseline-menu.png` and `baseline-play.png` inspected: Scrap Signal character selection and desert aesthetic visible. Real combat verification failed on missing `ao.jpg` in the metalplates pack; debug snapshot reported44 model render errors. Keyboard actions also remained unbound after menu phase: W and R did not change state. Neither sequence counts as a passing baseline combat test.

## Inspected current controls

`final-controls.log`, built7696558: R starts real reload; magazine9/10, reserve80, remaining1000ms. Native W moves0.69m and reload progresses to700ms. `scrap-signal-reload-final-half.png` and `scrap-signal-movement-final-half.png` show textured world and HUD reload9% then36%, inspected. Native firing earlier reduced10→9; no enemy hit proven by that sequence.

`reload-checkpoint.log`, built623f2b8: fresh page restores position(-501.73,593.32), magazine9/10, reserve80 and650ms remaining reload, reflecting ordinary autosave after the prior movement session. R cancels that reload without consuming reserve. Screenshot `scrap-signal-reload-checkpoint-half.png` inspected: HUD no longer shows RELOAD. Some tree models were still mounting in that cold screenshot; it is not final art evidence.

`orient-warm.log`, built623f2b8: a genuine mouse click fires9→8; R starts another reload, remaining1000ms. Native mouse movement turns the camera to the relay. `scrap-signal-oriented-ready-half.png` inspected at800x450: fully textured trees, relay beam and authored cover visible.

## Rendering/simulation observations

After AI budget fix, final native debug sample includes cold18ms onTick, average1.7ms; last six warm frames onTick0.1–0.4ms. Previous unbounded update averaged502ms. Current near-spawn Low render394draws/1,428,658triangles vs previous opening Low409draws/2,625,524; camera moved0.69m, so the native pair is approximate. No render fallbacks or texture errors in warm latest debug. Outside simulation remains slow on software GL.

## Explicit outstanding checks

At that early checkpoint, real enemy hit/kill/dodge/counter, contract win/loss, recovery/equipment reward selection, and visible save restoration during reload were not yet established. Later sections record the completed checks. Black viewport cold shots and misleading earlier filenames such as `after-shot-reload` must not be presented as passing reload/combat evidence.

## Recorded combat and actual kill

Native contract activation: `relay-engaged.log` / `scrap-signal-relay-engaged-half.mp4`; ordinary S moves back into3.44m console distance and E starts wave1 with2 hostiles. MP4 inspected through extracted final frame:400x224,20fps,0.6s. This is lockstep capture, not a hardware FPS result.

`first-contact.log` / `scrap-signal-first-contact-half.mp4`: three semiautomatic F presses spend10→7 magazine while the covered northern enemy remains55 health. The open eastern rusher moves6.24m over1.2 simulation seconds. Cover and aim prevented these shots from damaging it.

`flank-rusher.log` / `scrap-signal-flank-rusher-half.mp4`: native mouse turns toward the open eastern rusher; two V+F shots reduce its55→41→27 health and magazine7→6→5. Stills inspected: visible robot, reduced health bar, textured arena. MP4:400x224,20fps,0.8s.

`rusher-counter.log` and `claw-dodge.log`: ordinary W approaches14.18→2.77m; A moves player north3m and enemy closes to1.56m. It then remains at(-498.03,575.78) while D moves the player from(-498.96,574.53) to(-498.88,577.45) and850ms pass. Player shield60/health90 remain intact. The close enemy fell outside the east-facing camera; these clips do not establish visual windup/circle readability. Latest build adds read-only AI phase/target probes for a stronger next check.

`rusher-finish.log` / `scrap-signal-rusher-finish-half.mp4`: actual mouse aim returns to the close husk, two counter shots reduce27→13 then remove it; hostiles2→1, cash50→54, magazine5→4→3. Counter shot/finish stills inspected: close robotic head, muzzle flash, then removed enemy and increasedcash. MP4:400x224,20fps,1.0s.

## Latest build checkpoint restoration

During that live fight, ordinary R starts reload with magazine3/reserve78/1050ms remaining, then Escape and Save checkpoint pause clock at12276.9ms. `final-fight-restore.log` uses a fresh page and latest compiled source: exact playerposition, health/shield90/60, magazine3/78,1050ms reload, cash54, wave1/hostiles1, carrier144.95s and enemy coordinates restored. `scrap-signal-final-fight-reticle-half.png` inspected at800x450: textured visible world, readable reticle and reload23% (time has progressed from1050 to800ms after restore). V correctly cannot aim during reload. `scrap-signal-final-fight-pause-half.png` inspected at800x450: readable pause controls Click/F/V, reload/carrier clock paused. This supersedes prior black cold restoration captures.

## Corrected northern spawn and native counter

Initial native northern movement oscillated behind cover. Actual-world collider queries traced its authored position to an existing barrel; the marker moved from(-511,559) to(-510,565). Fresh origin storage was cleared through the canonical driver, GUNK chosen through the menu, and the corrected contract started by ordinary E near the console. `corrected-relay-start.log`: north enemy moves1.04m over0.2s at5.2m/s. `corrected-claw-approach.log`: it approaches from18.03m to1.37m.

`corrected-claw-counter.log`: live phase1 at6794.9ms, enemy1.368m, locked target(-505.806,574.15), attack until7324.9. Native D350ms moves player3.42m; after400ms, live phase4 until8294.9, same enemyposition and lockedtarget, player90health/60shield unchanged. Raised robot blade/body pose and sidestep stills inspected. The ground circle is occluded close to the player's feet; no claim of circle visibility.

`north-counter-finish.log` is a partially successful shooting ATTEMPT, not a kill: holding V+F1000ms spends one round9→8 and enemy55→41, proving pistol release gating and aim1. Later3rounds miss; northern health stays41 and2hostiles remain. Names `northInterrupted`, `northKilled` and matching filenames are requested capture labels, not passing assertions. Actual enemy attack reduces shield60→48, then next east claw36. Do not publish those labels as kill proof. Earlier `rusher-finish.log` retains actual verified kill/despawn/cash54 proof.

`final-source-checkpoint.log`: ordinaryR starts reload5/79/1050ms at9844.9, then Escape/Save retains both AIrecovery timers/lockedtargets, shield36, health90, cash50 and2hostiles. `final27-restore.log` proves ammo/timers/enemies restored into latest compiled27bba85. After250ms it gains shield36→37.8, exposing a shield recovery delay save/load bug; the loot worker independently reproduced and fixed it, pending native confirmation.

## Final source sprint and shield recovery

`final-sprint-gate.log` source27bba85: after reload completes magazine10/reserve74, actual ShiftLeft+W travels7.57m at probe time13544.9, sprint1. Adding F while sprinting retains10/74. Releasing keys produces sprint0 at13644.9. The inspected400x225 screenshot shows lowered weapon, SPRINT, and shield-offline feedback. Recording400x224 at20fps,1.4s; no hardware FPS claim.

`final4257-checkpoint.log`: ordinary Escape/Save checkpoint preserves time13644.9, health84.48/shield0, magazine10/74, cash50, both hostiles, and attack timers. Screenshot includes literal Checkpoint saved UI. Fresh page loads source4257cc7 with saved shield recovery fix. `final4257-restore.log` exact state restores. Its early grace probe has NO simulated time elapsed and its screenshot is BLACK; neither establishes visual/timing acceptance. `latest-warm.log` subsequently reaches14194.9 (+550ms simulated), shield remains0; this establishes conservative legacy-save grace. `scrap-signal-latest-warm-half.png` is inspected, visibly rendered400x225 terrain/trees/relay/reticle. The supplied original save predates the quietMs row, so positive partially charged profile delay remains context-test verified rather than native verified.

`failure-wait1.log` and `failure-wait2.log` use ordinary nonrecorded RAF simulation, no game mutation: two rushers reach1.37m, health84.48→60.48→36.48, ammo10/74 and cash50 unchanged. Failure/reconstruction testing is ongoing.

## Lethal native failure found before recovery

Final source4257cc7 ordinary RAF attacks continued health36.48→12.48. `failure-downed.log` at20244.9 unexpectedly reports playerposition0/0/0, health0/shieldMax0/reserve0, downed0, phaseplaying1, relaydefend1 and2hostiles. This is a BLOCKER, not a loss/reconstruction pass: published health handling appears to remove the player before the game reserve loop can enter downed. `lethal-observed.log` and inspected800x450 `scrap-signal-lethal-observed-half.png` show visible world, missing player health/shield HUD, pistol10/0, contractstillactive and spurious enemy bars. Readonly debug_snapshot confirms113entities,431objects, emptyfallbacks/textureErrors. SoftwareGL averageoutside-sim2311ms; currentonTick0.1–0.3ms, no real-time FPS acceptance claim. Root and loot worker own fix. The manual prefatal checkpoint was saved at13644.9, but background autosave later overwrote it with the broken state before the failed tab closed. No gameplaystatewrites.

`recovery-replay.log` loads fixed2536f51 but restores the earlier broken autosave at22744.9 with no player. This is not a fixed death replay or recovery pass; background autosave had overwritten the manual prefatal checkpoint. The attempt was stopped and only its own native game tab closed. A fresh contract on2536f51 is being started through canonical origin-storage clearing and character selection, with no gameplay-state writes.

## Final native equipment, failure and recovery acceptance

Runtime game code `d04f15b9fd2113323e72d17fee4b58bf1ed6f4d1`, frozen preview5177 bundle `index-U3APqb_V.js`, published0.18.1 packages. Fresh origin storage was cleared through canonical capture tooling after the unreleased broken autosave, and GUNK selected normally. `scrap-signal-recovery-low-shadow-settled.png` inspected800x450: Low selected, Shadows OFF. Earlier same-command Settings shots captured the previous compositor frame and do not supersede this settled shot.

Ordinary mouse focus plus W moves to(-504.18,584.30), within3.40m console; focus click spends one round10→9. `native-shield-rack.log` and inspected800x450 `scrap-signal-native-shield-rack-half.png` show actual Field5s/Quickcycle2s/Siege7s equipment tradeoffs. `native-quickcycle-selected.log`: actual Quickcycle button changes shield60→42/max42, profile1; ordinary Save checkpoint leaves mag9/reserve80/cash50/health90 unchanged. `scrap-signal-quickcycle-selected-saved-half.png` inspected: equipped Quickcycle + literal Checkpoint saved. Fresh page in `fixed-recovery-fight.log` preserves42/max42/profile1 and9/80, then ordinary E begins wave1.

Both rushers chase to1.368m and attack. `fixed-recovery-fight.log` and `fixed-sky-fight2.log` are ordinary nonrecorded RAF simulation; no game-state writes. Two additional real focus clicks spend9→8→7, with reserve80 unchanged. Second click acquires pointer lock; actual native mouse pitch points toward sky to reduce softwareGL rendering cost during this deliberately passive lethal test. The initial sky attempt failed pointer-lock readiness; it is not a successful camera move. HP90→72→24→1, shield42→0, and at13750ms the actor remains at(-504.18,584.30), downed1, phaseended3, relaylost4, hostiles0, cash50, ammo7/80. `native-carrier-lost.log` and inspected800x450 `scrap-signal-native-carrier-lost-half.png` show Carrier lost / chassis went down,1/03,138s remaining, Quickcycle rack, inventory-retention/7% fee text, and Return to the wastes. This supersedes the earlier failed lethal test.

`native-return-recovery.log`: the actual Return button reconstructs at(-502,594), health90/shield42/max42/profile1, reserveup/downed0, relayidle0, hostiles0, cash50→47, magazine7/reserve80 retained. Ordinary Escape + Save checkpoint pauses at14050ms. Inspected800x450 `scrap-signal-native-reconstructed-half.png` shows90/42,7/80,$47 against the deliberately sky-facing camera; `scrap-signal-reconstructed-saved-half.png` contains literal Checkpoint saved and Quickcycle choice. Native recording `scrap-signal-native-return-recovery-half.mp4` was inspected through actual decoded frame0(Carrier lost),6(recoveredHUD),13(Checkpoint saved). Recorder captured14 logical frames at20Hz; ffprobe reports800x450,VFR15 encodedframes,avg375/19fps,25/1 codec timebase rate,0.760s. This is not a hardware FPS result.

Fresh page `recovered-fresh-load.log` restores actual saved recovery before any focus click: position(-502,594), health90/shield42/max42/profile1, ammo7/80,cash47,downed0,relayidle0/hostiles0. `recovered-final-rendered.log` repeats these values; inspected800x450 `scrap-signal-recovered-final-rendered-half.png` visibly shows authored copper/teal relay, five-cover arena, desert trees/terrain, reticle, ammo7/80,shield42/42,health90/90 and$47. No extra focus-click cartridge spent after recovery reload. Readonly debug_snapshot:205draws,913757triangles,112entities,431objects,emptyfallbacks/textureErrors; current onTick0.1–0.4ms. SwiftShader outside-render cost remains~2.26s average, so no real-time hardware-performance acceptance claim.

Remaining native limits: fullthree-wave victory, contract weapon reward/choice, rifle held-fire, loader burst/shield-break counter and marauder retreat were verified by source/context tests rather than this native run. RMB aim cannot be claimed against published0.18.1; truthful V fallback is native tested. Baseline combat stayed blocked by missingAO/input defects, with inspected baseline world/menu preserved.
