// Constants.js
// ALL tunable numbers live here. Mobile/desktop variants are selected at startup
// from navigator.maxTouchPoints. These values are mutated at runtime by the
// performance-adaptation logic (MAX_P, GS_SUBSTEPS), so the object is mutable.

export const MOBILE =
  typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

export const C = {
  MOBILE,

  // ---- Field (Gray-Scott Ψ substrate) ----
  FIELD_W: MOBILE ? 96 : 128,
  FIELD_H: MOBILE ? 96 : 128,
  get FIELD_N() {
    return this.FIELD_W * this.FIELD_H;
  },
  GS_SUBSTEPS: MOBILE ? 6 : 10,
  GS_SUBSTEPS_ORIG: MOBILE ? 6 : 10,
  GS_DU: 0.2,
  GS_DV: 0.05,
  GS_F: 0.0545,
  GS_K: 0.062,

  // ---- Particles ----
  MAX_P: MOBILE ? 200 : 300,
  MAX_P_ORIG: MOBILE ? 200 : 300,
  // P_ATTRACT / P_BOND_PROB tuned up from the design baseline (0.06 / 0.009) so
  // that energized regions actually consolidate into the dense bonded clusters
  // autopoiesis requires — emergence must be reachable, not merely possible.
  P_ATTRACT: 0.18,
  P_REPEL: 0.22,
  P_BOND_DIST: 1.7,
  P_BOND_PROB: 0.02,
  P_DECAY: 0.0008,
  P_FORCE_CUTOFF: MOBILE ? 5 : 7,

  // ---- Emergence thresholds ----
  T_CONTRAST: 0.13,
  T_DIST_DUR: 3.0,
  T_PART: 8,
  T_BOND_R: 0.15,
  T_AUTO: 0.38,
  T_MEM_ENC: 0.35,
  T_MEM_SIZE: 7,

  // ---- Cell stage ----
  WORLD: 42,
  CELL_DRAIN: 0.065,
  CELL_MORPH_RATE: 0.00019,
  AI_COUNT: 7,
  NUTRIENT_BASE: 185,

  // ---- Camera ----
  ZOOM_MULT: 3.6,
  ZOOM_LERP: 4.0,
  ZOOM_PINCH_HOLD: 3.0,
};

// Field parameter presets — hot-swappable mid-game.
export const FIELD_MODES = {
  mitosis: { Du: 0.2, Dv: 0.05, F: 0.0545, k: 0.062 },
  coral: { Du: 0.16, Dv: 0.08, F: 0.062, k: 0.061 },
  zebra: { Du: 0.16, Dv: 0.08, F: 0.022, k: 0.051 },
  chaos: { Du: 0.19, Dv: 0.05, F: 0.026, k: 0.051 },
};

// Layer enumeration (index === layer number).
export const LAYERS = [
  "PRE-DISTINCTION",
  "DISTINCTION",
  "RELATION",
  "PROCESS",
  "PHYSICAL PROCESS",
  "CHEMICAL ORGANIZATION",
  "BIOLOGICAL AUTONOMY",
  "CELL STAGE",
  "COLONIAL",
  "MULTICELLULAR",
  "CREATURE",
  "TRIBAL",
  "CIVILIZATION",
  "PLANETARY",
  "UNIVERSAL",
];

// Named layer constants for readability.
export const L = {
  PRE: 0,
  DIST: 1,
  RELATION: 2,
  PROCESS: 3,
  PHYSICAL: 4,
  CHEMICAL: 5,
  BIOLOGICAL: 6,
  CELL: 7,
  COLONIAL: 8,
  MULTI: 9,
  CREATURE: 10,
  TRIBAL: 11,
  CIV: 12,
  PLANETARY: 13,
  UNIVERSAL: 14,
};
