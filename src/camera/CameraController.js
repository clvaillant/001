// CameraController.js
// Each layer is a coarse-graining of the previous, so the camera must always
// frame the *boundary* of the current bounded system — not the detail inside,
// not the void outside. It tracks a smoothly-lerped system radius and derives
// the camera distance from it, while allowing manual pinch/pan override.

import * as THREE from "three";
import { C, L } from "../core/Constants.js";

// Emergence-phase reference diameters by layer 0–6.
const ZOOM_BY_LAYER = [48, 44, 40, 36, 32, 28, 22];

export class CameraController {
  constructor(camera, state) {
    this.camera = camera;
    this.state = state;
    this.sysRadius = 24;
    this.targetRadius = 24;
    this.tz = this.sysRadius * C.ZOOM_MULT;
    this.focus = new THREE.Vector2(0, 0);
    this.offset = new THREE.Vector2(0, 0);
    this.pinchHold = 0;
    this.panning = false;
  }

  // Called every frame to choose the target framing radius.
  updateAutoZoom(dt, playerCell, aiCells) {
    const st = this.state;
    let target;

    if (st.phase === "emergence") {
      const lyr = Math.min(st.layer, 6);
      target = ZOOM_BY_LAYER[lyr] / 2;
    } else {
      switch (st.layer) {
        case L.CELL:
          target = 4 + (playerCell ? playerCell.morph.size * 5 : 1);
          break;
        case L.COLONIAL: {
          // max spread of live cells
          let maxR = 4;
          if (playerCell) {
            for (const ai of aiCells) {
              if (!ai.alive) continue;
              const dx = ai.position.x - playerCell.position.x;
              const dy = ai.position.y - playerCell.position.y;
              const d = Math.hypot(dx, dy);
              if (d > maxR) maxR = d;
            }
          }
          target = maxR + 4;
          break;
        }
        case L.MULTI:
          target = 18;
          break;
        case L.CREATURE:
          target = 28;
          break;
        case L.TRIBAL:
          target = 44;
          break;
        case L.CIV:
          target = 70;
          break;
        case L.PLANETARY:
          target = 105;
          break;
        case L.UNIVERSAL:
          target = 130;
          break;
        default:
          target = 22;
      }
    }
    this.targetRadius = target;
    this.sysRadius += (target - this.sysRadius) * Math.min(1, 2.5 * dt);

    if (this.pinchHold > 0) {
      this.pinchHold -= dt;
    } else {
      this.tz = this.sysRadius * C.ZOOM_MULT;
    }
  }

  // Cell-stage focus follow.
  follow(pos, dt) {
    this.focus.x += (pos.x - this.focus.x) * Math.min(1, 5.5 * dt);
    this.focus.y += (pos.y - this.focus.y) * Math.min(1, 5.5 * dt);
  }

  // Manual pinch zoom (sets distance directly).
  setPinchZoom(z) {
    this.tz = Math.max(4, Math.min(700, z));
    this.pinchHold = C.ZOOM_PINCH_HOLD;
  }

  pinchDelta(scale) {
    // scale > 1 → zoom in (closer)
    this.setPinchZoom(this.tz / scale);
  }

  pan(dx, dy) {
    this.offset.x += dx;
    this.offset.y += dy;
    this.panning = true;
  }

  releasePan() {
    this.panning = false;
  }

  // Final per-frame application of position + zoom.
  update(dt) {
    // emergence keeps focus at origin
    if (this.state.phase === "emergence") {
      this.focus.x += (0 - this.focus.x) * Math.min(1, 4 * dt);
      this.focus.y += (0 - this.focus.y) * Math.min(1, 4 * dt);
    }
    // slowly relax pan offset when not actively panning
    if (!this.panning) {
      const k = Math.min(1, 0.6 * dt);
      this.offset.x += (0 - this.offset.x) * k;
      this.offset.y += (0 - this.offset.y) * k;
    }

    const cam = this.camera;
    cam.position.x = this.focus.x + this.offset.x;
    cam.position.y = this.focus.y + this.offset.y;
    cam.position.z += (this.tz - cam.position.z) * Math.min(1, C.ZOOM_LERP * dt);
    cam.lookAt(cam.position.x, cam.position.y, 0);
  }
}
