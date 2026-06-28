// main.js
// Init, game loop, and phase transitions. Drives the coarse-graining cascade:
// field → particles → membranes → cell → higher layers.

import * as THREE from "three";
import { C, L } from "./core/Constants.js";
import { GameState } from "./core/GameState.js";
import { Renderer } from "./core/Renderer.js";
import { FieldSystem } from "./systems/FieldSystem.js";
import { ParticleSystem } from "./systems/ParticleSystem.js";
import { MembraneSystem } from "./systems/MembraneSystem.js";
import { LayerManager } from "./systems/LayerManager.js";
import { NutrientSystem } from "./systems/NutrientSystem.js";
import { EcologySystem } from "./systems/EcologySystem.js";
import { CameraController } from "./camera/CameraController.js";
import { InputController } from "./input/InputController.js";
import { UIManager } from "./ui/UIManager.js";
import { Cell } from "./entities/Cell.js";
import { AICell } from "./entities/AICell.js";

const canvas = document.getElementById("c");
const state = new GameState();
const renderer = new Renderer(canvas);
const scene = renderer.scene;

const field = new FieldSystem(scene, state);
const particles = new ParticleSystem(scene, state, field);
const membranes = new MembraneSystem(scene, state, particles);
const layerManager = new LayerManager(state);
const nutrients = new NutrientSystem(scene);
const ecology = new EcologySystem(scene);
const camera = new CameraController(renderer.camera, state);
const input = new InputController(canvas, renderer.camera, state, camera);
const ui = new UIManager(state);

let playerCell = null;
let aiCells = [];

// ---- phase transition: emergence → cell ----
state.on("enterCellStage", () => {
  // fade out the substrate
  field.hide();
  particles.hide();
  membranes.hide();

  ecology.show();
  nutrients.show();

  state.phase = "cell";
  state.cellAlive = true;
  state.cellEnergy = 1;

  playerCell = new Cell(scene, true, 0x38ffaa);
  playerCell.position.set(0, 0, 0);
  input.setPlayerCell(playerCell);

  aiCells = [];
  for (let i = 0; i < C.AI_COUNT; i++) {
    const ai = new AICell(scene, i);
    ai.respawn();
    aiCells.push(ai);
  }

  // delayed transition message handled by UI on layerTransition(6→7);
  // give a beat before the codex text appears
});

// ---- field flat-equilibrium recovery ----
function checkFieldRecovery(dt) {
  if (state.vContrast < 0.05) {
    state.flatTimer += dt;
    if (state.flatTimer >= 30) {
      field.nudge();
      state.flatTimer = 0;
    }
  } else {
    state.flatTimer = 0;
  }
}

// ---- cell-stage higher-layer progress + AI + death ----
function updateCellStage(dt) {
  if (!playerCell) return;

  playerCell.update(dt, nutrients);
  // mirror cell stats to state
  state.cellEnergy = playerCell.energy;
  state.eatings = Math.floor(playerCell.eatings);
  state.cellMorph = playerCell.morph;
  camera.follow(playerCell.position, dt);

  // AI cells
  let liveCount = 0;
  for (const ai of aiCells) {
    if (ai.alive) {
      ai.updateAI(dt, nutrients, playerCell);
      ai.update(dt, nutrients);
      if (ai.alive) liveCount++;
    }
  }
  // respawn when count drops below 5
  if (liveCount < 5) {
    for (const ai of aiCells) {
      if (!ai.alive) {
        ai.respawn();
        liveCount++;
        if (liveCount >= 5) break;
      }
    }
  }

  nutrients.update(dt);
  ecology.update(dt);

  layerManager.updateCellProgress(dt, playerCell, aiCells);

  // death
  if (!playerCell.alive && !state.cellDead) {
    state.cellDead = true;
    state.cellAlive = false;
    state.emit("cellDied");
  }
}

// ---- performance adaptation ----
const fpsBuf = new Array(60).fill(60);
let fpsIdx = 0;
let lowTimer = 0;
let highTimer = 0;

function adaptPerformance(dt, fps) {
  fpsBuf[fpsIdx] = fps;
  fpsIdx = (fpsIdx + 1) % 60;
  let avg = 0;
  for (let i = 0; i < 60; i++) avg += fpsBuf[i];
  avg /= 60;
  state.fps = avg;

  if (avg < 28) {
    lowTimer += dt;
    highTimer = 0;
    if (lowTimer >= 3) {
      lowTimer = 0;
      C.MAX_P = Math.max(40, C.MAX_P - 20);
      C.GS_SUBSTEPS = Math.max(4, C.GS_SUBSTEPS - 1);
    }
  } else if (avg > 50) {
    highTimer += dt;
    lowTimer = 0;
    if (highTimer >= 5) {
      highTimer = 0;
      if (C.MAX_P < C.MAX_P_ORIG) C.MAX_P = Math.min(C.MAX_P_ORIG, C.MAX_P + 20);
      if (C.GS_SUBSTEPS < C.GS_SUBSTEPS_ORIG) C.GS_SUBSTEPS += 1;
    }
  } else {
    lowTimer = 0;
    highTimer = 0;
  }
}

// ---- main loop ----
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // cap
  const fps = dt > 0 ? 1 / dt : 60;

  input.update(dt, field);
  camera.updateAutoZoom(dt, playerCell, aiCells);

  if (!state.paused) {
    state.time += dt;
    if (state.phase === "emergence") {
      field.update(dt);
      particles.update(dt);
      membranes.update(dt);
      layerManager.update(dt);
      checkFieldRecovery(dt);
      camera.update(dt);
    } else {
      updateCellStage(dt);
      camera.update(dt);
    }
  } else {
    camera.update(dt);
  }

  ui.update(dt);
  renderer.render();
  adaptPerformance(dt, fps);
}
requestAnimationFrame(frame);

// expose for debugging / automated verification
window.__rge = {
  state,
  field,
  particles,
  camera,
  nutrients,
  getCells: () => ({ playerCell, aiCells }),
};
