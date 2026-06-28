// GameState.js
// Single mutable state object shared across all systems. Holds the layer index,
// emergence metrics, cell stats, timers, and the codex texts. Also provides a
// minimal event bus used for layer transitions.

import { L } from "./Constants.js";

export const CODEX = {
  0: "Before anything can exist for a system, difference must become possible.",
  1: "A boundary appears. Inside and outside begin.",
  2: "Distinctions do not remain alone. They attract, repel, compare, and depend.",
  3: "Relation moves. Pattern becomes change through time.",
  4: "Energy, field, motion, and force make stable interaction possible.",
  5: "Particles remember relation as bond. Bonds become pathways. Pathways become reaction.",
  6: "Life begins when chemistry becomes bounded, self-maintaining, repairing, and capable of variation.",
  7: "You are the bounded. Swim. Eat. Survive. Vary.",
  8: "Others follow. The self extends beyond a single membrane.",
  9: "Many become one. The boundary is now the organism.",
  10: "The organism moves through the world and learns the shape of survival.",
  11: "Groups form. Stories emerge. The boundary becomes culture.",
  12: "Cities rise. Knowledge accumulates. The boundary becomes civilization.",
  13: "Civilization touches the stars. The boundary becomes planetary.",
  14: "The system models itself. The boundary becomes recursive.",
};

export class GameState {
  constructor() {
    // Phase: 'emergence' until the cell stage, then 'cell'.
    this.phase = "emergence";
    this.layer = L.PRE;
    this.paused = false;
    this.time = 0; // total elapsed sim seconds
    this.fps = 60;

    // ---- Field metrics ----
    this.vContrast = 0;
    this.flowCoherence = 0;
    this.patchCount = 0;

    // ---- Particle metrics ----
    this.particleCount = 0;
    this.bondCount = 0;
    this.bondRatio = 0;

    // ---- Membrane / autopoiesis metrics ----
    this.autopoiesis = 0;
    this.membraneStability = 0;
    this.intEnergy = 0;

    // ---- Emergence timers ----
    this.distTimer = 0; // sustained distinction timer
    this.biologicalTimer = -1; // counts up after biological autonomy reached
    this.flatTimer = 0; // tracks field flat-equilibrium for recovery

    // ---- Layer dwell timers (cell stage progression) ----
    this.layerDwell = 0; // time spent in current layer
    this.colonialTimer = 0;
    this.colonyProximityTimer = 0;

    // ---- Cell stats ----
    this.cellEnergy = 1;
    this.cellAlive = false;
    this.cellDead = false;
    this.eatings = 0;
    this.cellMorph = {
      sharpness: 0,
      elongation: 0,
      armor: 0,
      flagella: 0,
      cilia: 0,
      size: 0.35,
    };

    // ---- Codex ----
    this.unlockedCodex = new Set([0]);

    // ---- event bus ----
    this._listeners = {};
  }

  on(evt, fn) {
    (this._listeners[evt] || (this._listeners[evt] = [])).push(fn);
  }

  emit(evt, ...args) {
    const ls = this._listeners[evt];
    if (ls) for (const fn of ls) fn(...args);
  }
}
