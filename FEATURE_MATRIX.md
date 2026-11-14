# FEATURE_MATRIX

Statuses: `WORKING_TESTED` (behaviour exercised by a passing automated test in this delivery) · `WORKING_NOT_DEVICE_VALIDATED` (tested in desktop Chromium only; needs a real phone) · `PARTIAL` (a real but limited implementation; limits stated) · `SPECIFIED_ONLY` (not implemented beyond data fields or scaffolding) · `BLOCKED` (could not be done in this environment).

A status describes this build, not the full design. `WORKING_TESTED` means the stated behaviour works, not that the requirement is finished to production depth. A ✗ after a test id means that test failed in the last run.

## Features

| Feature | Status | Works now | Missing / next |
|---|---|---|---|
| Single self-contained offline HTML game | `WORKING_NOT_DEVICE_VALIDATED` | One 290 KB file, no dependencies, CSP `connect-src none`, opened from file:// with network denied. | Not run on a physical phone or in Firefox/Safari. |
| New World: Quick Start + Advanced setup with live 3D preview | `WORKING_TESTED` | Seed, radius 2 km–20 000 km, gravity, tilt, year, land share, sea level, relief, ridges, roughness, terracing, temperature, atmosphere, moisture, minerals, star and sky colour, six presets. | Gravity is stored but only cosmetic (no physics uses it yet). |
| Canonical terrain + manual override layers | `WORKING_TESTED` | Height = seeded generator + ordered edit strokes in canonical directions; identical at every LOD; 9 tools incl. mountains, valley, coastline, lake, biome. | No erosion; no per-stroke editing after the fact; 20 000 stroke cap. |
| Undo/redo, protected regeneration with preview | `WORKING_TESTED` | Stroke-level undo/redo as journaled commands; regeneration keeps hand-edited regions exactly; warning when consequences cannot be undone. | Undo stack capped at 80. |
| Continuous orbit-to-ground camera, quadtree LOD, floating origin | `WORKING_NOT_DEVICE_VALIDATED` | One camera model and one scene from 6 radii out to 2.5 m; cube-sphere chunks down to <1 m quads; camera-relative rendering verified on a 6371 km planet. | LOD changes pop (no geomorphing); no predictive loading; flora differs between levels. |
| Hydrology, climate, biomes, seasons | `PARTIAL` | Priority-flood drainage, flow accumulation, rivers/lakes/sea classes, sea-level and painted water, latitude/altitude/season temperature, 11 biomes, painted biome overrides climate. | Cell resolution (~600 m on the default planet); rivers are ribbons, do not carve beds; rain field does not yet feed soil moisture; no long-term climate drift, storms or erosion. |
| Life is never spontaneous; plants, succession | `WORKING_TESTED` | Sterile start; ground colour = climate, green only where plants live; seeding, growth by suitability, spread, die-off, grazing consumption. | One dominant plant species per cell. |
| Animals: needs, grazing, predation, reproduction, death | `PARTIAL` | Individuals with hunger/thirst/energy, water-seeking, herds, hunting, pregnancy/birth, old age; 5 default species + editor. | No migration planning, no learning; simple state machine. |
| Species editor / anatomy | `PARTIAL` | Parametric body plans (biped, quadruped, hexapod, winged, serpent, amorphous), size, limbs, colours, diet, speed, senses, lifecycle, climate tolerance; artificial life preset. | No body sculpting, clothing or equipment. |
| People: needs, perception, beliefs with source and confidence, memory | `WORKING_TESTED` | Beliefs come only from observation, being told, being taught or inference; hearsay discounted; episodic memory bounded and consolidated. | No language/culture model beyond settlement lore. |
| Goals, plans, failure feedback, replanning | `PARTIAL` | Need-driven arbitration with personality weights, self-generated long-term goals, multi-step plans, urgent-need interruption, failures recorded with causes and revise beliefs. | Plans are short templates, not a general planner; schedules have no UI yet. |
| Direct control and release of the same individual | `WORKING_TESTED` | Take control, tap-to-walk, contextual object/person actions, action queue, release resumes suspended plan with memory and needs intact. | One controlled character at a time in the UI. |
| Buildings, rooms, doors, furniture with capabilities | `WORKING_TESTED` | 6 templates, add rooms, place/move/rotate/delete furniture, door-graph navigation, occupancy, stores; structures follow sculpted terrain; flooding consequence. | Rectangular rooms only; no free-form walls, stairs or multi-storey; outdoor paths ignore other buildings. |
| Interior view | `PARTIAL` | Roof hidden and walls lowered near the camera focus; people visibly lie, sit, walk through doors. | Cutaway is distance-based, not per-wall; no first-person interior camera. |
| Subsurface volumes (caves) | `PARTIAL` | Up to 24 dig sites of 48×48×33 m in planetary coordinates; carve/fill spheres; real openings to the surface; strata materials; collision; underground cutaway view. | Blocky voxel look; no path planning through tunnels; no mining economy; fixed site size. |
| Settlements, households, construction, economy | `PARTIAL` | Autonomous founding near water, house/well/field/storehouse/workshop projects, material gathering, stock, harvests; player-built and autonomous buildings share rules. | Economy is a shared stockpile; no prices, ownership or trade routes beyond simple surplus swaps. |
| Technology, eras, culture | `PARTIAL` | 14 technologies from fire to spaceflight accumulate from knowledge; era changes building palette and travel speed; discoverer remembered. | Technologies have few gameplay effects; no vehicles, institutions, laws or distinct cultures. |
| Conflict | `PARTIAL` | Scarcity raises tension between nearby settlements; disputes and (rule-gated) raids move stock and sour relationships. | Not covered by a dedicated test; no combat. |
| Population cohorts and promotion | `WORKING_TESTED` | Anonymous cohorts with daily dynamics; exact-once promotion to persistent individuals; unknown past is recorded as unknown; bands can found settlements. | Named individuals are never demoted (by design); person cap 400, animal cap 140. |
| Interest-based detail | `WORKING_TESTED` | People outside the interest region update coarsely; identity, memory and relationships persist; time away recorded as a count. | Coarse mode does not move people or model distant conversations. |
| Commands, receipts, idempotency, events with provenance | `WORKING_TESTED` | Validated atomic commands, durable receipts, duplicate/reuse semantics, causal chains shown in the inspector. | Receipts kept for the last 3000 commands; events for the last 5000. |
| Persistence: autosave, two generations, journal replay, snapshots, export/import | `WORKING_TESTED` | Byte-identical reload and crash replay; damaged newest save falls back; corrupted/hostile/future archives refused. | Simulation time since the last journaled command is lost on a crash; no storage-quota test on a device. |
| Touch-first interface | `WORKING_NOT_DEVICE_VALIDATED` | Drag/pinch/twist/tilt gestures, large targets, phone layout verified at 360×640, mode indicator, contextual tool suggestions, hints. | Emulated touch only. No haptics, no landscape-specific layout pass, no screen-reader pass. |
| Visual style (changed at the user’s request from faceted “Chromatic Tectonics” to a smooth, naturalistic life-sim look) | `PARTIAL` | Smooth vertex normals, linear-light shading with tone mapping, shadow-mapped sun (near views), procedural surface detail, rippling reflective water, rounded trees, bushes and grass, houses with windows, doors, chimneys and floorboards, detailed furniture, proportioned people with hair, clothes and jointed limbs. | No textures or ambient occlusion; no indoor lights; shadows only within ~900 m and off on the low quality tier; not measured on a phone. |
| Procedural creature motion | `PARTIAL` | Two-segment legs and arms with knee/elbow bend, body bob scaled by the planet’s gravity, per body plan; wing flapping; lying/sitting postures; simplified distant figures. | Kinematic, not physics-based: no rigid-body or collision physics. |
| Procedural audio | `PARTIAL` | Wind, surf, rain, settlement murmur, hammering, species voices from voice parameters; master and voice mute. | Not covered by automated tests (no audio capture); first-pass sound design. |
| Custom activities | `WORKING_TESTED` | Visual step editor; bounded validated graphs; executed by the same action system; assignable as goals. | No drag-and-drop canvas; small node vocabulary. |
| Dialogue | `PARTIAL` | Scripted, labelled replies built from the character’s real state; free text disabled; local-model adapter contract tested. | No local model, weights or runtime included. |
| Genuine local-model conversation | `BLOCKED` | — | Blocked: no model weights or on-device runtime were available in this environment. |
| LAN host | `PARTIAL` | Node host with single-use invitations, roles, ordered validated commands, receipts on retry, controller leases with expiry, owner clock, bounded interest sync, portable snapshot. | No join screen in the game; no reconnection UI; plain HTTP; tested with Node clients only. |
| Android package | `SPECIFIED_ONLY` | Capacitor wrapper source and instructions in `android/`. | Not built; no SDK or device available. No APK exists. |
| Real-device performance (30 FPS target) | `BLOCKED` | Adaptive resolution/LOD exists. | Blocked: no physical Android device. Only software-renderer timings exist. |
| Other celestial bodies / non-spherical shapes | `SPECIFIED_ONLY` | `body.shape` field and a body record exist. | Only one spherical body is implemented. |
| Vehicles and transport | `SPECIFIED_ONLY` | Era gives a travel-speed multiplier and a named transport mode. | No vehicles, roads or infrastructure. |
| ChatGPT wrapper | `SPECIFIED_ONLY` | Not needed for play. | Not implemented (optional by requirement). |

## All 155 requirements

Counts: `WORKING_NOT_DEVICE_VALIDATED` 6 · `PARTIAL` 79 · `WORKING_TESTED` 63 · `BLOCKED` 5 · `SPECIFIED_ONLY` 2.

| Req | Status | Tests | Note |
|---|---|---|---|
| LW-001 | `WORKING_NOT_DEVICE_VALIDATED` | U31 B01 | single file, offline |
| LW-002 | `PARTIAL` | B03 | planet→home in one world; city/economy depth thin |
| LW-003 | `WORKING_TESTED` | U12 B07 |  |
| LW-004 | `PARTIAL` | U28 | parameters and presets; spheres only |
| LW-005 | `PARTIAL` | — | simplified models throughout |
| LW-006 | `BLOCKED` | U26 | no local model available |
| LW-007 | `WORKING_TESTED` | U33 |  |
| LW-008 | `PARTIAL` | — | first-pass style |
| LW-009 | `WORKING_TESTED` | U09 |  |
| LW-010 | `PARTIAL` | — | full spec kept in docs; this is an increment |
| LW-011 | `WORKING_TESTED` | U31 B01 |  |
| LW-012 | `WORKING_TESTED` | U01 B02 |  |
| LW-013 | `WORKING_TESTED` | B04 |  |
| LW-014 | `WORKING_NOT_DEVICE_VALIDATED` | U04 B03 | pops between LODs |
| LW-015 | `PARTIAL` | U02 B07 | placed life yes; spread/reproduction yes; no abiogenesis |
| LW-016 | `PARTIAL` | — | tech ladder with thin effects |
| LW-017 | `PARTIAL` | U24 |  |
| LW-018 | `PARTIAL` | U33 | bounded catch-up implemented; dialog not browser-tested |
| LW-019 | `WORKING_TESTED` | U13 U29 B08 |  |
| LW-020 | `PARTIAL` | U11 B07 | templates + furniture; no free-form |
| LW-021 | `PARTIAL` | L01 | host only |
| LW-022 | `WORKING_TESTED` | U24 U28 |  |
| LW-023 | `PARTIAL` | U28 B14 | no sculpting/clothing |
| LW-024 | `PARTIAL` | — | temperament/values/mood |
| LW-025 | `PARTIAL` | — | small drifts from experience |
| LW-026 | `PARTIAL` | U14 | episodic/semantic/skills/social present, simple |
| LW-027 | `WORKING_TESTED` | U14 |  |
| LW-028 | `PARTIAL` | — |  |
| LW-029 | `WORKING_TESTED` | U12 B07 |  |
| LW-030 | `WORKING_TESTED` | U26 | free text disabled without model |
| LW-031 | `PARTIAL` | U23 | households, partners, kin; no institutions |
| LW-032 | `PARTIAL` | U23 |  |
| LW-033 | `PARTIAL` | U22 U28 | span/maturity/repro types incl. assembly |
| LW-034 | `PARTIAL` | U23 | domestic, study, building; little creative/societal |
| LW-035 | `PARTIAL` | U12 B07 | follow camera + queue |
| LW-036 | `WORKING_TESTED` | U14 |  |
| LW-037 | `PARTIAL` | U15 U16 |  |
| LW-038 | `WORKING_TESTED` | B05 B07 |  |
| LW-039 | `PARTIAL` | U11 | authored capabilities; little general physics |
| LW-040 | `PARTIAL` | U12 | queues and goals in UI; schedules command-only |
| LW-041 | `SPECIFIED_ONLY` | — | speed multiplier only |
| LW-042 | `WORKING_TESTED` | U25 B14 |  |
| LW-043 | `WORKING_TESTED` | U23 |  |
| LW-044 | `PARTIAL` | U23 | stockpile economy |
| LW-045 | `PARTIAL` | — | untested disputes/raids |
| LW-046 | `PARTIAL` | U23 |  |
| LW-047 | `PARTIAL` | U13 | flood/dry consequences; no storms |
| LW-048 | `WORKING_TESTED` | U15 |  |
| LW-049 | `PARTIAL` | B05 |  |
| LW-050 | `PARTIAL` | U13 B07 B08 | needs, memory, beliefs, history, causes; few statistics |
| LW-051 | `WORKING_TESTED` | U25 |  |
| LW-052 | `WORKING_NOT_DEVICE_VALIDATED` | B05 | emulated touch |
| LW-053 | `PARTIAL` | U27 L01 | host only |
| LW-054 | `PARTIAL` | U27 L02 | host only |
| LW-055 | `PARTIAL` | L03 | host only |
| LW-056 | `WORKING_TESTED` | U17 U18 U19 U21 B10 B11 B12 |  |
| LW-057 | `PARTIAL` | — |  |
| LW-058 | `PARTIAL` | — |  |
| LW-059 | `PARTIAL` | — | era palettes, seasonal/snow colours |
| LW-060 | `WORKING_NOT_DEVICE_VALIDATED` | U04 B03 |  |
| LW-061 | `PARTIAL` | U11 |  |
| LW-062 | `PARTIAL` | — | kinematic gait, not physics |
| LW-063 | `WORKING_TESTED` | U05 B04 |  |
| LW-064 | `PARTIAL` | — | untested |
| LW-065 | `PARTIAL` | — | untested |
| LW-066 | `WORKING_TESTED` | B01 |  |
| LW-067 | `PARTIAL` | B07 | contextual hints only |
| LW-068 | `WORKING_TESTED` | B03 |  |
| LW-069 | `PARTIAL` | U34 B13 | adaptive quality exists; effect unmeasured on device |
| LW-070 | `WORKING_TESTED` | U31 B01 |  |
| LW-071 | `WORKING_TESTED` | U26 |  |
| LW-072 | `WORKING_TESTED` | U01 B02 |  |
| LW-073 | `WORKING_TESTED` | U01 B02 |  |
| LW-074 | `PARTIAL` | B03 | sphere only |
| LW-075 | `PARTIAL` | — | one body |
| LW-076 | `WORKING_TESTED` | U05 B04 |  |
| LW-077 | `WORKING_TESTED` | U09 B04 |  |
| LW-078 | `PARTIAL` | U13 B08 | cell-scale flow |
| LW-079 | `WORKING_TESTED` | U09 U24 B04 |  |
| LW-080 | `PARTIAL` | U10 | strata + per-cell minerals |
| LW-081 | `PARTIAL` | U10 B09 | inside dig sites |
| LW-082 | `PARTIAL` | B04 | mountain, valley, coast tools; rivers follow terrain only at cell scale |
| LW-083 | `WORKING_TESTED` | B04 |  |
| LW-084 | `PARTIAL` | U24 | seasons only |
| LW-085 | `WORKING_TESTED` | U11 U29 |  |
| LW-086 | `WORKING_TESTED` | U03 U05 B04 |  |
| LW-087 | `PARTIAL` | B10 | all but the Android test |
| LW-088 | `WORKING_TESTED` | U07 U08 |  |
| LW-089 | `PARTIAL` | B14 |  |
| LW-090 | `WORKING_TESTED` | U12 U17 B10 |  |
| LW-091 | `WORKING_TESTED` | U16 U22 |  |
| LW-092 | `PARTIAL` | U13 U22 B08 | dirty cells + cause lists |
| LW-093 | `WORKING_TESTED` | U03 U17 U31 |  |
| LW-094 | `WORKING_TESTED` | U12 |  |
| LW-095 | `PARTIAL` | U16 | active vs coarse only |
| LW-096 | `WORKING_TESTED` | U13 U14 |  |
| LW-097 | `PARTIAL` | U14 |  |
| LW-098 | `PARTIAL` | — |  |
| LW-099 | `WORKING_TESTED` | U13 |  |
| LW-100 | `PARTIAL` | U14 | talk, teaching, settlement lore |
| LW-101 | `PARTIAL` | U15 U16 |  |
| LW-102 | `PARTIAL` | U15 U16 |  |
| LW-103 | `WORKING_TESTED` | U07 U19 U20 U21 B10 |  |
| LW-104 | `WORKING_TESTED` | U30 |  |
| LW-105 | `WORKING_TESTED` | — |  |
| LW-106 | `PARTIAL` | U31 | browser track done; Android not built |
| LW-107 | `WORKING_TESTED` | — | standalone first |
| LW-108 | `SPECIFIED_ONLY` | — |  |
| LW-109 | `PARTIAL` | U20 L03 B10 | local pause/restore tested; LAN disconnect via lease expiry |
| LW-110 | `PARTIAL` | — | direct WebGL2 chosen without device benchmarking |
| LW-111 | `BLOCKED` | B13 | no device |
| LW-112 | `PARTIAL` | U04 B03 | fallback to parent chunk; no morph |
| LW-113 | `PARTIAL` | — | JavaScript, not TypeScript (see status) |
| LW-114 | `WORKING_TESTED` | B01 |  |
| LW-115 | `WORKING_TESTED` | U33 |  |
| LW-116 | `PARTIAL` | L02 | host only |
| LW-117 | `WORKING_TESTED` | U34 |  |
| LW-118 | `PARTIAL` | U26 | adapter only |
| LW-119 | `PARTIAL` | U26 | budgets declared; nothing to enforce yet |
| LW-120 | `PARTIAL` | L01 | host only |
| LW-121 | `PARTIAL` | U07 U08 L02 | host only |
| LW-122 | `PARTIAL` | — | browser acceptance reported; no ChatGPT deployment |
| LW-123 | `PARTIAL` | U17 U32 B11 | no installable app package |
| LW-124 | `WORKING_TESTED` | B01 |  |
| LW-125 | `WORKING_TESTED` | U03 B02 |  |
| LW-126 | `WORKING_NOT_DEVICE_VALIDATED` | B05 B06 |  |
| LW-127 | `WORKING_TESTED` | B04 B05 |  |
| LW-128 | `WORKING_TESTED` | U06 B04 |  |
| LW-129 | `WORKING_TESTED` | U06 U19 U20 U21 B10 |  |
| LW-130 | `WORKING_TESTED` | B03 B06 |  |
| LW-131 | `PARTIAL` | B03 |  |
| LW-132 | `PARTIAL` | — |  |
| LW-133 | `WORKING_TESTED` | U04 B10 |  |
| LW-134 | `PARTIAL` | U10 B09 |  |
| LW-135 | `PARTIAL` | U09 U24 | water, biomes, seasons; weather is visual/audio |
| LW-136 | `WORKING_TESTED` | U11 B07 |  |
| LW-137 | `WORKING_TESTED` | U12 B07 |  |
| LW-138 | `BLOCKED` | U26 | no model |
| LW-139 | `WORKING_TESTED` | U16 B07 |  |
| LW-140 | `WORKING_TESTED` | U23 |  |
| LW-141 | `PARTIAL` | U27 L02 | two Node clients, not two browsers |
| LW-142 | `BLOCKED` | B13 | no device |
| LW-143 | `PARTIAL` | U32 B12 | evidence exists for tested items only |
| LW-144 | `WORKING_TESTED` | U02 |  |
| LW-145 | `WORKING_TESTED` | U05 U29 |  |
| LW-146 | `WORKING_TESTED` | U06 |  |
| LW-147 | `WORKING_TESTED` | U28 B02 |  |
| LW-148 | `WORKING_NOT_DEVICE_VALIDATED` | B03 |  |
| LW-149 | `PARTIAL` | U11 |  |
| LW-150 | `PARTIAL` | U10 B09 |  |
| LW-151 | `WORKING_TESTED` | U01 U02 B02 |  |
| LW-152 | `WORKING_TESTED` | U17 U18 B11 |  |
| LW-153 | `PARTIAL` | U27 L03 | host only |
| LW-154 | `WORKING_TESTED` | U31 B01 |  |
| LW-155 | `BLOCKED` | — | no device |
