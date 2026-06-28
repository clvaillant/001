// LayerManager.js
// Monitors GameState metrics and advances layers when emergence conditions are
// met. Each transition is a coarse-graining: the new layer compresses the
// statistical patterns of the layer below into a new bounded entity. All
// thresholds are genuine metric crossings, never scripted timelines — except
// the two intrinsically temporal transitions (biological settling, dwell times).

import { C, L, LAYERS } from "../core/Constants.js";

export class LayerManager {
  constructor(state) {
    this.state = state;
    this.cooldown = 0;
  }

  _advance(to) {
    const st = this.state;
    const from = st.layer;
    st.layer = to;
    st.layerDwell = 0;
    st.unlockedCodex.add(to);
    this.cooldown = 1.8;
    st.emit("layerTransition", from, to);
  }

  // Emergence-phase transitions (layers 0 → 7 trigger).
  update(dt) {
    const st = this.state;
    st.layerDwell += dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      // still let timers run, but no new transition
    }

    // distinction timer (sustained contrast)
    if (st.vContrast > C.T_CONTRAST) st.distTimer += dt;
    else st.distTimer = Math.max(0, st.distTimer - dt * 0.4);

    // biological settling timer toward cell stage
    if (st.layer === L.BIOLOGICAL && st.biologicalTimer >= 0) {
      st.biologicalTimer += dt;
      if (st.biologicalTimer >= 4.5) {
        this._advance(L.CELL);
        st.emit("enterCellStage");
        return;
      }
    }

    if (this.cooldown > 0) return;

    switch (st.layer) {
      case L.PRE: // 0 → 1 DISTINCTION
        if (st.distTimer >= C.T_DIST_DUR) this._advance(L.DIST);
        break;
      case L.DIST: // 1 → 2 RELATION
        if (
          st.vContrast > 0.26 &&
          (st.patchCount > C.FIELD_N * 0.015 ||
            st.flowCoherence > 0.0012)
        )
          this._advance(L.RELATION);
        break;
      case L.RELATION: // 2 → 3 PROCESS
        if (st.flowCoherence > 0.0035) this._advance(L.PROCESS);
        break;
      case L.PROCESS: // 3 → 4 PHYSICAL
        if (st.particleCount > C.T_PART) this._advance(L.PHYSICAL);
        break;
      case L.PHYSICAL: // 4 → 5 CHEMICAL
        if (st.bondRatio > C.T_BOND_R) this._advance(L.CHEMICAL);
        break;
      case L.CHEMICAL: // 5 → 6 BIOLOGICAL
        if (st.autopoiesis > C.T_AUTO) {
          this._advance(L.BIOLOGICAL);
          st.biologicalTimer = 0;
          st.emit("biologicalAchieved");
        }
        break;
    }
  }

  // Cell-stage progression (layers 7 → 14). Derived from accumulated behavior.
  updateCellProgress(dt, playerCell, aiCells) {
    const st = this.state;
    st.layerDwell += dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return;
    }
    if (!playerCell || st.cellDead) return;

    // colonial proximity tracking: 2+ AI cells within radius 2.8
    if (st.layer === L.CELL) {
      let near = 0;
      for (const ai of aiCells) {
        if (!ai.alive) continue;
        const dx = ai.position.x - playerCell.position.x;
        const dy = ai.position.y - playerCell.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < 2.8) near++;
      }
      if (near >= 2) st.colonyProximityTimer += dt;
      else st.colonyProximityTimer = Math.max(0, st.colonyProximityTimer - dt);
      if (st.colonyProximityTimer >= 3.5) this._advance(L.COLONIAL);
      return;
    }

    switch (st.layer) {
      case L.COLONIAL: // 8 → 9 MULTICELLULAR
        if (st.layerDwell >= 50 && playerCell.morph.size > 0.72)
          this._advance(L.MULTI);
        break;
      case L.MULTI: // 9 → 10 CREATURE
        if (st.layerDwell >= 70) this._advance(L.CREATURE);
        break;
      case L.CREATURE: // 10 → 11 TRIBAL
        if (st.layerDwell >= 90 && st.eatings > 30) this._advance(L.TRIBAL);
        break;
      case L.TRIBAL: // 11 → 12 CIVILIZATION
        if (st.layerDwell >= 120) this._advance(L.CIV);
        break;
      case L.CIV: // 12 → 13 PLANETARY
        if (st.layerDwell >= 150) this._advance(L.PLANETARY);
        break;
      case L.PLANETARY: // 13 → 14 UNIVERSAL
        if (st.layerDwell >= 180) this._advance(L.UNIVERSAL);
        break;
    }
  }
}
