# RGEmergence — From Distinction to Life

A standalone, mobile-first universe-emergence simulator. A playable model of
C. L. Vaillant's Recursive Generative Emergence framework: reality begins as
relational information (the Ψ field), and through a cascade of coarse-grainings —
distinction → relation → process → physics → chemistry → life — *you* emerge as
the continuity of becoming across increasingly bounded selves.

Nothing becomes boundary, boundary becomes relation, relation becomes process,
process becomes physics, physics becomes chemistry, chemistry becomes life, and
life becomes you.

## How it plays

- **Emergence phase.** Touch/click to inject energy into the Ψ field; two fingers
  (or right mouse) cool it; pinch to zoom. Sustained distinction breeds relation,
  relation breeds process, particles condense, bonds form chemistry, and when a
  bonded cluster closes into a self-maintaining membrane, **life crosses the
  autopoiesis threshold** — entirely from the simulation, never scripted.
- **Cell phase.** You *become* the cell. Touch to swim, two fingers to burst.
  Eat, survive, and vary. Your behavior — attacking, fleeing, eating, exploring —
  reshapes your morphology over time. Cluster with others to become a colony, and
  onward through organism, tribe, civilization, planet, and recursive universe.

## Build

```bash
npm install
npm run build
```

The output is a single self-contained file: **`dist/rgemergence.html`**. It runs
fully offline in any modern mobile or desktop browser — no external assets, no
network, no runtime dependencies.

For development with hot reload:

```bash
npm run dev
```

## Architecture

```
src/
  core/        Constants, GameState, Renderer
  systems/     FieldSystem (Gray-Scott Ψ), ParticleSystem, MembraneSystem
               (autopoiesis), LayerManager (coarse-graining), Nutrient, Ecology
  entities/    Cell (behavioral morphogenesis), AICell (behavior trees)
  camera/      CameraController (always frames the current boundary)
  input/       InputController (unified touch + mouse)
  ui/          UIManager (HUD, codex, debug)
  main.js      init, game loop, phase transitions
```

Built with Three.js + Vite + vite-plugin-singlefile.
