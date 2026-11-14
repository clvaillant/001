# WORLD_FORMAT — Living World schema 1.0

One world = one JSON object. The kernel (`src/core`) is its only writer. Meshes, panels and sound are
derived from it and never stored. The same format is used by the browser game, the LAN host and the
(unbuilt) Android wrapper, because all three run the same kernel files.

## Archive (`.lwworld`)

```json
{ "format": "living-world-archive", "archiveVersion": 1,
  "schema": {"major": 1, "minor": 0}, "app": "0.1.0",
  "tick": 12345, "revision": 678,
  "checksum": "16 hex chars over the canonical JSON of `world`",
  "world": { ... } }
```

`LW.save.parse(text)` is the only way in. In order, it rejects:

| Code | When |
|---|---|
| `too_large` | text longer than 96 MB |
| `not_json` | not parseable JSON |
| `bad_format` | wrong `format`, missing schema or world |
| `future_version` | `schema.major` newer than this build (stored data is never altered) |
| `invalid_structure` | forbidden keys (`__proto__`, `constructor`, `prototype`), nesting deeper than 48, more than 6 million nodes, a string over 200 000 chars, or any schema check below |
| `checksum_mismatch` | checksum differs from the canonical JSON of `world` |

An archive contains data only: no code, credentials, tokens or device identifiers. Player-authored
activities are declarative graphs (validated node by node); nothing in a world is ever evaluated.
The UI writes world strings with `textContent` only.

The checksum is a fast 64-bit integrity hash against accidental damage. It is not a signature and
does not prove who made a file.

## Versioning and migration

- `schema.major` changes when old readers cannot load new files. Newer major → refused.
- `schema.minor` changes for additive fields. `LW.save.MIGRATIONS['major.minor']` holds one function
  per source version, applied in a chain before validation. Schema 1.0 is the first; the table is empty.
- `generatorVersion` (1) pins the terrain generator. A world whose generator version is newer than the
  build is refused, so a code change can never silently reshape saved terrain. A future generator must
  keep version 1 available.
- Terrain is never stored as heights. It is `seed + generator parameters + ordered edit list`, sampled on demand.

## Units and conventions

- Lengths in metres, temperatures in °C, angles in radians (except `axialTilt`, degrees).
- Position on the planet is a **unit direction** `n = [x,y,z]` in the planet-fixed frame; `+Y` is the
  rotational north pole. The surface point is `(radius + h(n)) · n` with `h` in metres above the datum.
- Local offsets (building rooms, furniture, dig sites) are metres in the anchor's tangent frame:
  `x` east, `z` north (both rotated by the anchor's `yaw`), `y` altitude above the datum.
- Time is an integer `tick`. One tick is 15 simulated seconds; 240 ticks per hour; 5760 per day;
  `body.yearDays` days per year. There is no wall-clock time anywhere in a world.
- All randomness comes from `world.rng` (mulberry32 state). Same world + same commands at the same
  ticks ⇒ same result, which is what crash replay relies on.

## Identifiers

`prefix_base36counter`, allocated from `world.nextId`, unique within a world and never reused:
`w_` world, `te_` terrain edit, `vol_` volume, `b_` building, `c_` component, `o_` organism,
`p_` person, `co_` cohort, `s_` settlement, `h_` household, `g_` goal, `act_` activity,
`pw_` pending work, `e…` event. Species ids are `sp_name`. Relationships are keyed `idA|idB` (sorted).

## Top level of `world`

| Field | Meaning |
|---|---|
| `format`, `schema`, `generatorVersion` | `"living-world"`, version, terrain generator version |
| `id`, `name`, `seed`, `rng` | identity, seed, RNG state |
| `revision`, `tick`, `nextId` | command counter, logical time, id allocator |
| `mode` | `create` (environment only) or `play` (individual life runs) |
| `rules` | `envInCreate, spread, reproduction, aging, conflict, hazards, maxAnimals` |
| `body` | **Body**: `shape:"sphere"`, `radius`, `gravity`, `seaLevel`, `axialTilt`, `yearDays`, `star{color,lum}`, `atmosphere{density,baseTemp,color}`, `gen{seed,landFraction,relief,roughness,continentScale,ridges,terrace,moisture,minerals}`, `envN` |
| `genEpoch`, `protectedGens[]` | number of regenerations and the generator parameters each earlier epoch used |
| `terrainEdits[]` | **TerrainEdit** `{id,seq,g,gid,tool,n,r,s,level?,biome?,ev}`; `g` = epoch it was made in |
| `editSeq`, `colorEpoch` | change counters used to invalidate derived data |
| `volumes{}` | **VoxelVolume** `{id,n,yaw,nx,ny,nz,cell,top,h0,ops[{t:'c'|'f',x,y,z,r,gid}]}` |
| `env` | `{N, veg[6N²], vsp[6N²], plants[], river[6N²]|null, chg{cell:eventId}, dirty{pending,causes[]}, mined{}}` |
| `species{}` | **Species** configuration (anatomy, senses, movement, diet, lifecycle, climate, voice, capabilities) |
| `organisms{}` | **Organism** `{id,speciesId,n,face,born,sex,needs,health,st,alive,named,lf,home,preg}` |
| `persons{}` | **Person** (below) |
| `cohorts{}` | **PopulationCohort** `{id,speciesId,cell,count,acc,settlement,promoted}` |
| `buildings{}` | **Building** `{id,kind,tpl,name,n,yaw,rooms[],doors[],comps[],progress,need,mat,stock,settlement,household,era,built,flooded,growth,by}` |
| `settlements{}` | **Settlement** `{id,name,n,members[],buildings[],stock,know,techs[],era,founded,labor,lore,tension,by,ev}` |
| `households{}` | `{id,members[],home,settlement}` |
| `relationships{}` | **Relationship** `{a,b,aff,fam,kind,t}` |
| `activities{}` | declarative graph `{id,name,start,nodes[]}` |
| `events[]`, `eventArchive` | **Event** `{id,t,type,d,c[causeIds],r{n?,cell?,e?[]}}`; archive = counts of summarised events |
| `receipts{}`, `receiptOrder[]` | **CommandReceipt** `{id,h,rev,tick,type,result}` (last 3000) |
| `pending[]` | **PendingWork** `{id,due,type,...}` |
| `undo[]`, `redo[]` | `{label,tick,gid,undo:{type,payload}}` |
| `interest` | `{n,r}` region simulated at individual detail |

Where the directive's object list differs: `Region` is the environment cell index (0 … 6N²−1);
`ClimateCell`, `WaterCell` and `BiomeSuitability` are **derived** per cell from terrain + body + edits
(only vegetation, water class and depletion are stored); `KnowledgeAssertion` is a person's `beliefs`
entry; `Component` is a building's `comps` entry; `Snapshot` is a stored archive (see Storage).

### Person

`{id, speciesId, name, sex, born, alive, died?, n, y, face, needs{hunger,thirst,energy,social},
health, mood, traits{}, traitBase{}, values{}, skills{}, inv{}, home, household, settlement,
control{mode,by}, queue[], act, plan, suspended, goals[], schedule[], beliefs{}, mem{ep[],sum{}},
anomalies, hypo, lf, hist[eventIds], parents[], children[], partner, fails{}, lastFail, origin,
lod, posture, explored}`

- A **belief** is `{p:'water'|'food'|'wood'|'hypothesis', v:bool, c:confidence, s:'observation'|'told'|'taught'|'inference', f:fromId?, t:tick, n?, cell?, ref?}`. World truth lives in `env`/`buildings`; beliefs can be wrong and are revised by observation.
- `mem.ep` holds at most 70 episodes `{t,k,x,s,ev}`; older low-salience ones are folded into counts in `mem.sum`.
- `origin.unknownPast` marks someone promoted from a cohort: no earlier memories are invented.
- A dead person stays in `persons` with `alive:false`.

## Commands

Every state change is a command:

```json
{ "worldId": "w_…", "commandId": "unique string", "expectedRevision": 678,
  "payloadVersion": 1, "type": "terrain.edit", "payload": { … },
  "preconditions": {"exactRevision": true} }
```

The actor `{id, role}` is supplied by the authority (local player = owner; LAN host = session), never
by the command. `LW.dispatch(world, cmd, actor)`:

1. checks world id, id shape, payload version, command type;
2. **receipt lookup** — same `commandId` and identical canonical payload returns the stored receipt and changes nothing; same id with different content fails `command_id_reuse`;
3. optional strict revision check (`revision_conflict`) only when `preconditions.exactRevision` is set — otherwise ordering is last-valid-edit-wins;
4. role check (`forbidden`); roles are owner > editor > visitor;
5. `validate` — all rule checks, no mutation;
6. `apply` — mutation, events, then `revision++` and the receipt, in one synchronous step.

Command types: `world.setMode|setRules|rename|setBody|regenerate|regenRevert`, `view.interest`,
`time.advance`, `history.undo|redo`, `terrain.edit|removeGroup|restore`,
`volume.create|remove|restore|carve|truncate|append`, `env.settle`, `life.seedPlants|setVeg|defineSpecies|spawn|spawnCohort|promote|remove|name`,
`build.place|remove|restore|move|addComp|removeComp|restoreComp|moveComp|addRoom|popRoom`,
`person.control|enqueue|clearQueue|setGoal|setSchedule|edit|pin|dialogue`, `activity.define|remove`.

Undo is a compensating command. It reverts the edit, not what the simulation did afterwards; the UI
warns when time has passed. Rewinding history is only possible by restoring a snapshot.

## Events and provenance

`LW.emit(world, type, data, causes, refs)`. `c` lists the event ids that caused this one;
`LW.causalChain` walks them for the inspector. Example chain produced by test U13:
`person.failed(dry) ← river.dried ← terrain.edited`. At most 5000 events are kept; older ordinary
events become counts in `eventArchive.byType`, while births, deaths, foundings, discoveries and
water changes are kept longer.

## Storage (browser)

Keys in IndexedDB (or `localStorage`, or memory with a visible warning):

- `w:<id>:g0`, `w:<id>:g1` — two snapshot generations `{seq, jseq, name, tick, wall, text}`. A save
  always overwrites the **older** one, so an interrupted write cannot damage the newest good save.
  Loading parses both and takes the valid one with the highest `seq`.
- `w:<id>:j:<n>` — journal of every acknowledged command since the snapshot `{n, tick, cmd, actor}`.
  Recovery loads the snapshot, advances to each entry's tick and re-dispatches it. Time simulated
  after the last journaled command and before a crash is lost (at most 20 s of autosave interval).
- `w:<id>:s:<n>` — manual named snapshots.

`wall` is used only to tell the player how long the world was closed; it is not part of the world.
