# Brightway Park artwork

The seaside fairground models, visitor figures, entrance sign and UI in this game
are original artwork authored for Brightway Park. `scripts/author-models.mjs`
reproduces the twenty-three GLB meshes in `public/art/models/` using native geometry.
No third-party models are embedded in those meshes.

The existing published asset catalogs remain configured for editor compatibility.
The existing KayKit and Quaternius catalog references, ambientCG material catalog,
and provisioned asset-pack credits are preserved. The live park uses the local
original meshes and a procedural terrain palette. Park buildables and visitors
load locally; surrounding host scenery still uses the published catalogs.
