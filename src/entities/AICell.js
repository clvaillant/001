// AICell.js
// Competitor cells with a simple behavior tree re-evaluated at random intervals.
// They accumulate behavior stats and morph through the same system as the player,
// so aggressive AIs grow spikier and cautious ones grow armored.

import * as THREE from "three";
import { Cell } from "./Cell.js";
import { C } from "../core/Constants.js";

const AI_COLORS = [0xff6a3a, 0xff8a3a, 0xff5a5a, 0xffae4a, 0xff7a6a, 0xff4a8a, 0xffa060];

export class AICell extends Cell {
  constructor(scene, index) {
    super(scene, false, AI_COLORS[index % AI_COLORS.length]);
    this.index = index;
    this._decisionTimer = 0;
    this._decisionInterval = 1.5 + Math.random() * 2.5;
    this._mode = "wander";
    this._target = new THREE.Vector2(0, 0);
    // randomize starting morph/size so they differ
    this.morph.size = 0.3 + Math.random() * 0.4;
    this._deform();
  }

  respawn() {
    const r = C.WORLD / 2 - 4;
    this.position.set(
      (Math.random() * 2 - 1) * r,
      (Math.random() * 2 - 1) * r,
      0
    );
    this.velocity.set(0, 0, 0);
    this.energy = 1;
    this.alive = true;
    this.mesh.visible = true;
    this.glow.visible = true;
  }

  updateAI(dt, nutrients, playerCell) {
    if (!this.alive) return;
    this._decisionTimer -= dt;
    if (this._decisionTimer <= 0) {
      this._decisionTimer = this._decisionInterval = 1.5 + Math.random() * 2.5;
      this._decide(nutrients, playerCell);
    }

    const speed = this.topSpeed() * 0.85;
    if (this._mode === "flee" && playerCell) {
      const dx = this.position.x - playerCell.position.x;
      const dy = this.position.y - playerCell.position.y;
      const d = Math.hypot(dx, dy) || 1;
      this.steerToward(
        this.position.x + (dx / d) * 10,
        this.position.y + (dy / d) * 10,
        speed,
        dt
      );
    } else if (this._mode === "seek") {
      this.steerToward(this._target.x, this._target.y, speed, dt);
    } else {
      this.steerToward(this._target.x, this._target.y, speed * 0.6, dt);
    }
  }

  _decide(nutrients, playerCell) {
    // 1. FLEE
    if (
      playerCell &&
      playerCell.alive &&
      this.morph.size < playerCell.morph.size * 0.75
    ) {
      const dx = this.position.x - playerCell.position.x;
      const dy = this.position.y - playerCell.position.y;
      if (Math.hypot(dx, dy) < 14) {
        this._mode = "flee";
        this.flees++;
        return;
      }
    }
    // 2. SEEK_FOOD
    if (nutrients) {
      const n = nutrients.nearest(this.position.x, this.position.y, 22);
      if (n) {
        this._mode = "seek";
        this._target.set(n.x, n.y);
        this.explorations += 0.2;
        // larger AIs sometimes hunt → counts as attack behavior
        if (playerCell && this.morph.size > playerCell.morph.size * 1.1) {
          this.attacks += 0.3;
        }
        return;
      }
    }
    // 3. WANDER
    this._mode = "wander";
    this.explorations++;
    const r = C.WORLD / 2 - 3;
    this._target.set(
      (Math.random() * 2 - 1) * r,
      (Math.random() * 2 - 1) * r
    );
  }
}
