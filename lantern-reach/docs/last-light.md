# Last Light on the Road

Eastbrook's opening now has a choice with a cost. Doss salvaged one sealed oil
tin after a raid. Redbrook needs it for road lamps; Lin needs it for the wounded
outrider Doss brought home. Neither can keep a lamp burning with half a tin.
The player hears both accounts and reports to Redbrook before making a promise.

- **Watch:** defeat three existing Forest Wolves and report to Redbrook. This
  grants the road writ for the Old Wolf and Bandits of the Vale bounties sooner.
  Lin later describes warming the outrider by hand.
- **Clinic:** give Lin two Cottage Loaves from the player's supplies. She reserves
  two healing potions, claimed one at a time. Road access still requires the
  original eight-wolf bounty. Doss waits for daylight; Redbrook commits soldiers
  to the unlit road.

The choice cannot be changed. Native keyed storage records the promised route
and successfully claimed reserve; native quest and unlock saves record progress
and road access. Commands check the current conversation and actual distance.
Repeated choices, deliveries and turn-ins reject. A full bag leaves a potion
reserved. Existing completed wolf-bounty saves recover their road writ when
opening a resident's conversation. Legacy quests remain available.

The opening player, Redbrook, Doss, Lin and Wilkes markers were moved from
procedural house footprints to Eastbrook's adjacent open plaza through the
published editor bridge, using `set_transform` and `export_document`. No new
characters or buildings were added. The game passes its authored scene into the
editor; gameplay keeps ownership of spawning logical NPC markers.

Manual play check: choose a calling, enter play, skip the intro, and use E near
Redbrook. Ask about the last oil tin, speak with Doss on the left and Lin on the
right, then return and report. Read the irrevocable choice, choose a route, and
follow its objective in the journal. For the clinic, try delivering without two
loaves and see the rejection message; Wilkes sells replacements. Collect a
potion, reload the saved world, and confirm only one remains. For the watch,
finish the three-wolf patrol and verify the later road bounties become available.

`bun test src/game/quests/lanternStory.test.ts` covers the branch, retry,
inventory and native save-backend boundaries. These checks do not judge the
prose, motivation, fun or visual feel; those require playing and looking at
fresh captures. The arc currently uses published 0.18.x engine APIs.
