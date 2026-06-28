// InputController.js
// Unified touch + mouse input. Mobile is the primary target. All touch default
// actions are prevented; the canvas uses touch-action:none. Single-pointer
// energizes the field (emergence) or swims the cell (cell stage); two pointers
// cool/burst, pinch zooms, and two-finger drag pans.

import * as THREE from "three";
import { C, L } from "../core/Constants.js";

export class InputController {
  constructor(canvas, camera, state, cameraController) {
    this.canvas = canvas;
    this.camera = camera;
    this.state = state;
    this.cam = cameraController;
    this.playerCell = null;

    this.pointers = new Map(); // id → {x,y}
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._v2 = new THREE.Vector2();
    this._hit = new THREE.Vector3();

    this._prevPinchDist = 0;
    this._prevMid = null;
    this._burstHeld = false;
    this.keys = {};

    this._bind();
  }

  setPlayerCell(c) {
    this.playerCell = c;
  }

  _bind() {
    const c = this.canvas;
    const opt = { passive: false };
    c.addEventListener("pointerdown", (e) => this._down(e), opt);
    c.addEventListener("pointermove", (e) => this._move(e), opt);
    window.addEventListener("pointerup", (e) => this._up(e), opt);
    window.addEventListener("pointercancel", (e) => this._up(e), opt);
    c.addEventListener("wheel", (e) => this._wheel(e), opt);
    c.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      this.keys[e.key.toLowerCase()] = true;
      this._key(e);
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this._v2.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._v2.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this._v2, this.camera);
    this.raycaster.ray.intersectPlane(this.plane, this._hit);
    return this._hit;
  }

  _down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    if (this.pointers.size === 2) {
      this._initTwoFinger();
      if (this.state.phase !== "emergence") this._burstHeld = true;
    }
    // right mouse button → treat as cooling/two-finger intent
    if (e.pointerType === "mouse" && e.button === 2) {
      this._mouseRight = true;
    }
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const p = this.pointers.get(e.pointerId);
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointers.size === 2) {
      this._handleTwoFinger();
    }
  }

  _up(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this._prevPinchDist = 0;
      this._prevMid = null;
      this._burstHeld = false;
      this.cam.releasePan();
    }
    if (e.pointerType === "mouse" && e.button === 2) this._mouseRight = false;
  }

  _initTwoFinger() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    this._prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    this._prevMid = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  _handleTwoFinger() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

    // pinch zoom
    if (this._prevPinchDist > 0) {
      const scale = dist / this._prevPinchDist;
      if (Math.abs(scale - 1) > 0.002) this.cam.pinchDelta(scale);
    }
    // two-finger pan (world-space delta of midpoint)
    if (this._prevMid) {
      const w1 = this.screenToWorld(this._prevMid.x, this._prevMid.y).clone();
      const w2 = this.screenToWorld(mid.x, mid.y).clone();
      this.cam.pan(-(w2.x - w1.x), -(w2.y - w1.y));
    }
    this._prevPinchDist = dist;
    this._prevMid = mid;
  }

  _wheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    this.cam.setPinchZoom(this.cam.tz / factor);
  }

  _key(e) {
    const k = e.key.toLowerCase();
    if (k === "p" || k === " ") {
      this.state.paused = !this.state.paused;
      this.state.emit("togglePause");
      e.preventDefault();
    } else if (k === "d") {
      this.state.emit("toggleDebug");
    } else if (k === "c") {
      this.state.emit("toggleCodex");
    } else if (k === "r") {
      location.reload();
    }
  }

  // continuous per-frame application
  update(dt, field) {
    const st = this.state;
    const n = this.pointers.size;

    // ---- mouse-right cooling (single mouse pointer w/ right button) ----
    if (st.phase === "emergence") {
      if (n === 1 && !this._mouseRight) {
        const p = [...this.pointers.values()][0];
        const w = this.screenToWorld(p.x, p.y);
        field.setInfluence(w.x, w.y, 0.6 * dt, 0);
      } else if (n === 1 && this._mouseRight) {
        const p = [...this.pointers.values()][0];
        const w = this.screenToWorld(p.x, p.y);
        field.setInfluence(w.x, w.y, 0, 0.7 * dt);
      } else if (n === 2) {
        // two-finger cool at midpoint
        const pts = [...this.pointers.values()];
        const mx = (pts[0].x + pts[1].x) / 2;
        const my = (pts[0].y + pts[1].y) / 2;
        const w = this.screenToWorld(mx, my);
        field.setInfluence(w.x, w.y, 0, 0.7 * dt);
      }
    } else if (this.playerCell && this.playerCell.alive) {
      const cell = this.playerCell;
      if (n >= 1) {
        const p = [...this.pointers.values()][0];
        const w = this.screenToWorld(p.x, p.y);
        cell.steerToward(w.x, w.y, cell.topSpeed() * 2.2, dt);
        cell.explorations += dt * 0.4;
      }
      // burst
      if (this._burstHeld) {
        cell.velocity.x *= 1 + 0.45 * Math.min(1, dt * 8);
        cell.velocity.y *= 1 + 0.45 * Math.min(1, dt * 8);
        cell.energy -= 0.35 * dt;
      }
      // keyboard movement (additive)
      let kx = 0,
        ky = 0;
      if (this.keys["a"] || this.keys["arrowleft"]) kx -= 1;
      if (this.keys["d"] || this.keys["arrowright"]) kx += 1;
      if (this.keys["w"] || this.keys["arrowup"]) ky += 1;
      if (this.keys["s"] || this.keys["arrowdown"]) ky -= 1;
      if (kx || ky) {
        const len = Math.hypot(kx, ky) || 1;
        cell.velocity.x += (kx / len) * cell.topSpeed() * 2.2 * dt;
        cell.velocity.y += (ky / len) * cell.topSpeed() * 2.2 * dt;
      }
      if (this.keys["shift"]) {
        cell.velocity.x *= 1 + 0.4 * Math.min(1, dt * 8);
        cell.velocity.y *= 1 + 0.4 * Math.min(1, dt * 8);
        cell.energy -= 0.35 * dt;
      }
    }
  }
}
