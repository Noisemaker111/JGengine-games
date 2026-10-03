# Lantern Reach

Lantern-lit frontier adventure through Eastbrook Vale, Mirefen Marsh and
Thornpeak Heights. Choose a calling, speak with town residents, and follow the
road toward the Hollow Crypt.

Run `bun install --frozen-lockfile` from the repository root, then provision this
game's existing art before `bun run dev:lantern-reach`:

```sh
cd lantern-reach
bun scripts/provision-models.ts
```

The script verifies 25 models (18,188,420 bytes) against the checked-in
[`model-provenance.json`](scripts/model-provenance.json) SHA-256 hashes and writes
only ignored `public/models/lantern-reach` files. It fetches this game's
historical art from a pinned JGengine revision. These converted/renamed models
are third-party **CC0-1.0 KayKit and Quaternius** assets, credited in that
revision's [CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/612c174c7fa7b082450139c74ef87f4f5bb336ab/CREDITS.md#world-of-claudecraft).
They are the assets already named in `src/game/models.ts`.

For an offline copy of that same historical artifact, use
`bun scripts/provision-models.ts --from <directory>` where the directory contains
`players`, `enemies` and `creatures`. Hash checks are identical. This route does
not substitute another game's artwork or import engine source.

The published assets CLI can pull indexed KayKit packs. Its current Quaternius
animated-animal and monster sources are marked unpulled and cannot reproduce
these historical converted GLBs; use the pinned artifact above for this game.
The script reuses verified files on later runs. A missing model produces an
obstructive magenta loader placeholder, so provisioning is part of startup.

Controls: WASD movement, E nearby interaction, 1–9 abilities, T auto-attack,
Tab targets, L quest journal, B bags. Click **Skip Intro** or press Escape to
leave the opening camera sequence. Settings are available from the gear button.
