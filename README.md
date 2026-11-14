# Living World

An offline planetary creation and life-simulation game in one HTML file. Shape a planet, introduce
plants, animals and people, press Play, and follow or directly control any individual, from orbit
down to the inside of a house.

This is a first playable build, not the finished game described by the full design. Read
[DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) and [FEATURE_MATRIX.md](FEATURE_MATRIX.md) for exactly
what is and is not implemented.

## Play

**Desktop:** double-click `Living_World.html` (Chrome, Edge, or another current browser with WebGL2).
No install, server, account or internet connection. The file makes no network requests; its
Content-Security-Policy forbids them.

**Android (untested on a real device):** copy `Living_World.html` to the phone, then open it in Chrome
through a file manager ("Open with → Chrome"), or type `file:///sdcard/Download/Living_World.html` in
the address bar. If your file manager opens it through a `content://` address, Chrome may not give the
page persistent storage; the title screen then says so, and you should use **Menu → Export world file**
to keep your world. Performance on your phone has not been measured.

## First five minutes

1. **Quick Start** (or **Advanced Planet Setup** to choose seed, size, land share, sea level, relief,
   climate, tilt, star and sky; the planet behind the panel updates as you move the sliders).
2. **Sculpt** – pick a tool and drag on the planet. Brush size follows your zoom. Undo/redo at top right.
3. Zoom toward a river (blue lines). **Life → Plants** and drag to seed vegetation. A new world is
   sterile: the ground colour shows climate, green appears only where plants actually live.
4. **Build → Cottage**, tap the ground. **Life → People**, tap near it.
5. **▶ Play.** People look for water, food, rest and company, found a settlement and build.
6. **Navigate**, tap a person, **Take control**: tap the ground to walk, tap furniture or people to
   interact, or use the action chips. **Release** and the same person carries on with their own life.
7. Raise a mountain range across the river upstream of them and watch the consequences. Tap the land
   or a person's **History** tab to see what caused what.

## Controls

| | Touch | Mouse / keyboard |
|---|---|---|
| Move | drag | left-drag, `W A S D` / arrows |
| Zoom | pinch | wheel, `+` `-`, the + − buttons |
| Rotate | twist | right-drag, `Q` `E` |
| Tilt | two-finger vertical drag | right-drag vertically, `R` `F` |
| Select / place | tap | click |
| Zoom to a point | double-tap | double-click |
| Use the active tool | drag | drag (hold `Shift` to move instead) |
| Pause / resume | speed buttons | `Space` |
| Undo / redo | ↶ ↷ | `Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z` |
| Back to Navigate | ✋ | `Esc` |

The bar under the top row always says whether a drag will **NAVIGATE**, **EDIT** or **PLACE**. With an
editing tool active, two fingers (or right-drag) still move the camera. The **N** button resets north,
tilt and underground view.

Tools: **Sculpt** (raise, lower, smooth, flatten, mountains, valley/riverbed, coastline) · **Paint**
(biomes, lakes) · **Life** (plants, animals, people, anonymous populations, species editor) · **Build**
(cottage, house, workshop, storehouse, well, field, furniture) · **Dig** (dig site, carve, fill,
underground view depth) · **Planet** (sea level, tilt, temperature, atmosphere, star, regenerate
terrain, rules of nature). Dots mark the tools suited to the current zoom; all stay available.

## Time

Creator mode: nothing lives; `☀ env` lets seasons and plant growth run. **Play** starts individual
life. Speeds: pause, 1× (one world day ≈ 48 minutes), 8×, 60×, 600×. Editing stays possible at all times.

Nothing is simulated while the page is closed. When you reopen a world that was in Play, the game
tells you how long it was closed and offers a **bounded** catch-up (at most two world days), or to
resume exactly where it stopped.

## Saving

- Autosave every 20 seconds and when the tab is hidden, into the browser's local storage for this
  file (IndexedDB, falling back to `localStorage`). Two generations are kept; every edit between
  saves is journaled and replayed after a crash.
- **Menu → Snapshots**: named restore points. Restoring one is the only way to rewind history; Undo
  reverts an edit but keeps whatever the world did in the meantime (and warns you).
- **Menu → Export world file** writes a portable `.lwworld` file; **Import** validates and loads one.
  Damaged or newer-format files are refused and your current world is left alone.
- Browser storage belongs to the browser profile and the file's location. Moving the HTML file,
  clearing site data, or private browsing can lose it. **Export anything you care about.**

## Limits you will notice

- Rivers are drawn as ribbons between climate cells (about 600 m apart on the default planet); they do
  not carve their own beds, and a small dam does not stop them. Hydrology reacts to edits roughly the
  size of a cell or larger.
- Level-of-detail changes pop rather than morph, and trees differ between detail levels.
- Caves exist only inside 48 × 48 × 33 m dig sites you create (24 per world). Characters walk on cave
  floors and are blocked by rock, but do not plan routes through tunnels.
- People walk straight lines outdoors (through other buildings' walls if those are in the way) and
  through doors indoors.
- Character speech is scripted from their real state and labelled as such. No language model is
  included; free-text conversation is disabled.
- One planet, spherical only. No vehicles are drawn; era affects travel speed and building colours.
- LAN play: a host program exists and is tested, but the game has no screen to join one yet.
- No APK. `android/` is unbuilt wrapper source.

## Build and test from source

Requires Node 18+. No `npm install` is needed to build or to run the kernel and LAN tests.

    node tools/build.cjs        # regenerates Living_World.html (deterministic, byte-identical)
    node tests/unit.cjs         # 34 kernel tests
    node tests/lan.cjs          # 3 LAN host tests
    node tests/browser.cjs      # browser tests; needs Playwright + Chromium installed
    node tests/run-all.cjs      # everything, then writes test-results.json and TEST_REPORT.md
    node tools/package.cjs      # Living_World_Source.zip

Layout: `src/core` (simulation kernel: no DOM, no clock, no network), `src/ui` (WebGL2 renderer,
input, panels, audio), `src/lan` (optional host), `tools`, `tests`, `android` (unbuilt wrapper source).
The source is plain JavaScript in script files rather than TypeScript modules, so that the build
needs no compiler or bundler and works offline; see DEVELOPMENT_STATUS.md.

## Optional LAN host (trusted networks only)

    node src/lan/host.cjs --world MyWorld.lwworld --port 8787

It prints an owner token, issues single-use invitations, orders and validates every command, enforces
one controller per character and lets only the owner run the clock. Traffic is unencrypted HTTP. See
`tests/lan.cjs` for the API. The single-player game never contacts it.

## Privacy

No telemetry, analytics, accounts or remote requests. Worlds stay on your device unless you export
and share a file yourself.
