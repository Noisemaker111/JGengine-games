# Scrap Signal asset provisioning

Scrap Signal serves downloaded assets from its own ignored `public/models` and
`public/materials` directories. Provision them before running the game or its
served-file availability tests. From the repository root on a clean checkout:

```sh
bun install --frozen-lockfile
bun scrap-signal/scripts/provision-assets.mjs
bun scrap-signal/scripts/provision-assets.mjs --verify
bun run --cwd scrap-signal test
bun run --cwd scrap-signal check-types
bun run --cwd scrap-signal dev
```

[`assets.lock.json`](assets.lock.json) pins every source archive's URL, SHA-256
and byte size, plus the SHA-256 and size of each of the 401 served files. The
script uses the published `@jgengine/assets@0.18.1` download and extraction
helpers from the committed dependency lockfile. It checks the source identifiers
against this game's `ASSET_SOURCE_IDS` and the author/license/homepage against the
published catalog. It validates the entire archive and extracted file set before
writing served files. Already matching files require no network access;
`--verify` checks local bytes without downloading. Missing or changed files make
verification fail, preserving the availability assertions in the world tests.

The pinned archives were fetched directly from the credited providers on
2026-10-03. Every extracted file matched the assets used for this game's native
playtest. KayKit archives use immutable Git commit URLs. Quaternius and ambientCG
use provider archive URLs with exact content hashes; a provider replacement fails
provisioning until the manifest is deliberately reviewed and updated. There is no
rolling mirror or other game's public directory in the provisioning path.

| Catalog source | Author and license | Original pack |
| --- | --- | --- |
| `quaternius-modular-scifi` | Quaternius, CC0-1.0 | [Modular SciFi MegaKit](https://quaternius.com/packs/modularscifimegakit.html) |
| `quaternius-stylized-nature` | Quaternius, CC0-1.0 | [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) |
| `kaykit-adventurers` | Kay Lousberg, CC0-1.0 | [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers), commit `672074b73ba276876a19e8816ecdc5241817ab47` |
| `kaykit-space-base` | Kay Lousberg, CC0-1.0 | [KayKit Space Base Bits](https://kaylousberg.itch.io/kaykit-space-base-bits), commit `6dfbcac9927d06283752c4defd4882cfe0d29666` |
| `ambientcg-ground025` | ambientCG, CC0-1.0 | [Ground025](https://ambientcg.com/view?id=Ground025), 1K-JPG |
| `ambientcg-rock022` | ambientCG, CC0-1.0 | [Rock022](https://ambientcg.com/view?id=Rock022), 1K-JPG |
| `ambientcg-metal007` | ambientCG, CC0-1.0 | [Metal007](https://ambientcg.com/view?id=Metal007), 1K-JPG |
| `ambientcg-metalplates001` | ambientCG, CC0-1.0 | [MetalPlates001](https://ambientcg.com/view?id=MetalPlates001), 1K-JPG |

These are the existing credited packs in `src/game/assets.ts`. Gameplay, scene
placement, copper/rust finishes and enemy weapon surrogates remain Scrap Signal's
authored choices. [Repository provenance](../CONTENT-PROVENANCE.md) and the
published asset catalog retain the third-party source names and license notices.
The downloaded bytes remain ignored; this manifest does not claim new ownership.

An optional archive cache avoids repeat network downloads when checking another
clean worktree:

```sh
bun scrap-signal/scripts/provision-assets.mjs --cache /tmp/scrap-signal-archives
```

Each cache entry is `<source-id>.zip`; the same archive hash and extraction checks
apply. To create a cache, use the option during the first provisioning of an empty
public directory. A malformed cache is rejected, so replace its affected archive
with the exact pinned provider download before retrying.
