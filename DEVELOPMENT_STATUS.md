# DEVELOPMENT_STATUS

Build 0.1.0. This is a first integrated, playable slice of Living World, not the complete game in the
design. One execution cannot deliver a planet-scale Sims-class game, and this did not. What exists is
one causally connected world you can shape, populate, play and save, with the limits stated below.

## What works (and is covered by passing tests)

- `Living_World.html`: one file, no dependencies, no network, runs from `file://`.
- New World with Quick Start and an Advanced panel whose sliders regenerate the real 3D planet live.
- Planets from 2 km to 20 000 km radius; continuous camera from orbit to 2.5 m in one scene, with
  camera-relative rendering checked on a 6371 km planet (GPU float step near the camera about 0.1 mm,
  against about 0.76 m if planet-space floats were used).
- Sculpting (9 tools), biome and lake painting, sea level, undo/redo, regeneration that keeps
  hand-edited regions exactly.
- Hydrology that reacts to terrain edits and reports why (`river.dried ← terrain.edited`).
- Sterile start; plants seeded by the player grow, spread or die by climate; animals graze, hunt, breed.
- Buildings with rooms, doors, furniture that has real capabilities; people path through doors.
- People with needs, perception-based beliefs (source and confidence), bounded memory, goals, plans,
  failure feedback; direct control with an action queue; release resumes the same individual.
- Autonomous settlement founding and construction; households, partners, births, technology ladder.
- Anonymous cohorts with exact-once promotion; coarse simulation outside the interest region.
- Dig sites: carve and fill real volumes with openings to the surface, underground view.
- Validated atomic commands with receipts; events with cause links; inspector shows chains.
- Autosave with two generations plus a command journal; reload and crash replay give an identical
  world; named snapshots; export/import with integrity and schema checks.
- Phone-sized layout and touch gestures (emulated), keyboard and mouse alternatives.
- Optional Node LAN host: invitations, roles, ordering, leases, owner clock (tested with Node clients).

Numbers and the full list are in TEST_REPORT.md and FEATURE_MATRIX.md.

## Bugs the tests found and that were fixed during this run

- Planet sliders (sea level etc.) were silently rejected by validation.
- Undo/redo were not journaled, so crash replay diverged; they are now commands.
- Journal entries recorded the tick after a command ran, so a replayed `time.advance` ran twice.
- A forced save was skipped while an autosave was in flight, and the "last saved revision" could be
  recorded too new, so a later edit might not be flushed on page hide.
- A tap was dropped when a frame took longer than the tap timeout (now uses input timestamps).
- Nested lists in the inspector rendered as `[object …]`; people could starve mid-conversation;
  sleepers did not wake for thirst; animals slept through lethal thirst.

## Visual pass (second iteration)

At the user's request the feature roadmap was paused and the look moved from the faceted "Chromatic
Tectonics" style toward a smooth, naturalistic life-sim look: per-vertex normals, linear lighting with a
tone curve, a shadow-mapped sun for views within about 900 m, procedural ground detail, rippling water with
sky reflection, 56% more terrain vertices per chunk and one finer LOD level, rounded trees, bushes and
grass, houses with glazed windows, door leaves, chimneys and floorboards, richer furniture, and people
with proportioned bodies, hair, clothing colours and knee/elbow joints. "Physical realism" is limited to
lighting and motion: gait bob scales with the planet's gravity, but there is still no rigid-body physics.
This roughly doubles triangles near the ground (about 300 000 at a settlement) and adds a second render
pass; shadows switch off automatically on the low quality tier. Cost on a real phone is unmeasured.

## Models and materials pass (third iteration)

The user asked for models that read as what they are, with detail and textures. Done procedurally (there
are still no image files):

- **Materials**: thirteen procedural surface materials computed in the fragment shader with relief
  (bump) shading: siding, brick, plaster, shingles, wood grain, bark, leaves, stone, fabric, fur, hair,
  soil, and a ground texture that shows grass blades only where plants actually live. Terrain and objects
  now use separate shader programs, and every material shares three noise lookups, so the cost stays
  bounded on GPUs that evaluate all branches.
- **People and animals** are lofted, continuous surfaces (torso from waist to shoulders, shaped head
  with nose and ears, tapered limbs, shoes, hands, optional skirt and long hair, eyes, brows, mouth;
  animals with a barrel body, neck, muzzle, ears, hooves) instead of stacked ellipsoids.
- **Trees** have flared trunks, real branches and irregular leaf masses; conifers have drooping, jagged
  boughs; rocks are irregular; grass is curved blades; crops grow ears.
- **Houses** gained shutters, planted window boxes, porches with turned posts and awnings, brick
  chimneys, stone footings; furniture gained turned bedposts, quilts, curved chest lids, firewood and flames.
- Three levels of detail for flora keep the triangle count near 400 000 at a settlement.

"Stardew Valley level" was read as a target for charm and density of detail; that game is 2D pixel art,
so there is no polygon count to match, and none of its art was copied.

## Known defects and weak spots

- **Performance is unknown on real hardware.** Only a CPU software renderer was available. There a
  900×560 view of the default planet takes about 40 ms per frame from orbit and 160–200 ms near a
  settlement (see TEST_REPORT.md), and several times longer on an Earth-sized planet at ground level.
  None of that predicts a phone GPU. At ground level on very
  large planets the scene reaches about 300 000 triangles in several hundred draw calls with no
  back-face or occlusion culling; this is the first thing to measure and tune on a device.
- LOD transitions pop; trees are regenerated per chunk and differ between levels.
- Rivers are ribbons between ~600 m cells and can cut through small hills; they do not carve beds.
  Edits much smaller than a cell do not change hydrology. Rain is visual/audio only.
- Outdoor walking is straight-line; people can pass through other buildings' walls. No tunnel pathfinding.
- The start of a new world is local midnight at some longitudes, so first Play can be dark; use
  Menu → "Creator light".
- The inspector is rebuilt every 2.5 s while open, which can interrupt scrolling in long lists.
- Textures are procedural patterns, not painted art: no faces beyond eyes/brows/mouth, no cloth folds,
  no hand-authored props. Shingle and brick courses skew slightly on some roof and wall orientations.
- Shadows cover only the area near the camera focus and fade at its edge; there is no ambient occlusion.
- Four inspector clicks in browser test B07 are dispatched as DOM click events rather than pointer
  presses, because the software renderer's slow frames made pointer-position clicks flaky.
- Conflict, trade, audio and the catch-up dialog have no dedicated automated tests.
- Person cap 400, animal cap 140, 24 dig sites, 20 000 terrain strokes, 600 buildings.

## Divergences from the requirements

| Requirement | Divergence | Why | Path back |
|---|---|---|---|
| LW-113 TypeScript kernel | Kernel is plain JavaScript script files sharing one `LW` namespace | The build must work offline with no compiler or bundler, and this environment could not be assumed to have one | The files are small and already separated by subsystem; add `tsc --checkJs` with JSDoc types first, then convert |
| LW-110 Three.js candidate, choose after device benchmarks | Direct WebGL2 with no library, chosen without device benchmarks | Allowed by the directive ("native WebGL2 … if more reliable"); keeps the file at 290 KB with zero third-party code | Renderer is isolated in `src/ui/10–30`; it can be swapped without touching the kernel |
| LW-106/123 Android installable package | Only unbuilt wrapper source | No Android SDK, Gradle or device here | `android/README.md` lists the exact commands |
| LW-006/118/138 local-model dialogue | Adapter contract only; scripted fallback is labelled | No weights or on-device runtime available | `LW.localAI.register` in a native build |
| LW-021/053–055/141 LAN play | Host only; the game has no join UI | Time | Add a join screen that mirrors host state through `/api/sync` and sends commands to `/api/command` |
| LW-041 vehicles, LW-075 multiple bodies, LW-074 other shapes | Not implemented | Scope | `body.shape`, a body record and era transport names are the extension points |
| LW-062 physics-based motion | Kinematic gait cycles | Scope | `G.creature` takes the species body plan; a physics rig can replace it per plan |
| LW-155 reference phone | Not measured | No device | Run `tests/browser.cjs` B13 logic on the phone via Chrome remote debugging |
| Acceptance cases | The 155 planned cases were not executed; 51 new tests map to requirement IDs instead | `ACCEPTANCE_CASES_v1.1.csv` and the C12 prototype were not attached | Map each planned case to these tests or add it |
| Existing repo files | `package.json` (a Vite/Three.js stub named "rgemergence") was replaced | The project has no dependencies; the old file would have pointed at tools that are not used | Original is in git history (first commit) |

## Next work, in order of impact

1. **Measure on the real phone**, then tune: back-face culling, merging distant chunks, lower prop
   counts, fewer draw calls for creatures (batching), LOD constant per device tier.
2. Geomorphing between LOD levels and stable flora placement across levels.
3. Rivers as carved channels in the canonical height function, and hydrology at finer resolution near
   the camera, so small dams and ditches matter.
4. Obstacle-aware outdoor pathfinding and tunnel navigation.
5. LAN join screen in the game; reconnect and host recovery.
6. Deeper society: ownership, exchange between individuals, institutions, roads and vehicles by era.
7. Build the Android wrapper, validate storage behaviour and performance, then try a small local model.
8. Rain feeding soil moisture, erosion, hazards; long-term climate.
9. Convert the kernel to TypeScript with schema types generated from one definition.
