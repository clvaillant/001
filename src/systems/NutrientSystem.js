// NutrientSystem.js
// Cell-stage food particles rendered as a single InstancedMesh. Drift slowly,
// bounce at world edges, respawn toward a baseline. Hidden during emergence.

import * as THREE from "three";
import { C } from "../core/Constants.js";

export class NutrientSystem {
  constructor(scene) {
    this.scene = scene;
    const cap = (this.cap = Math.ceil(C.NUTRIENT_BASE * 1.3));
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.alive = new Uint8Array(cap);

    const geo = new THREE.SphereGeometry(0.2, 6, 5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbfff70,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
    });
    this.inst = new THREE.InstancedMesh(geo, mat, cap);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.visible = false;
    this.inst.frustumCulled = false;
    this.scene.add(this.inst);
    this._dummy = new THREE.Object3D();

    this._respawnAcc = 0;
    for (let i = 0; i < C.NUTRIENT_BASE; i++) this._spawn();
    this._render();
  }

  _spawn() {
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) {
        const r = C.WORLD / 2 - 2;
        this.px[i] = (Math.random() * 2 - 1) * r;
        this.py[i] = (Math.random() * 2 - 1) * r;
        this.vx[i] = (Math.random() * 2 - 1) * 0.28;
        this.vy[i] = (Math.random() * 2 - 1) * 0.28;
        this.alive[i] = 1;
        return i;
      }
    }
    return -1;
  }

  _count() {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.alive[i]) n++;
    return n;
  }

  show() {
    this.inst.visible = true;
  }

  update(dt) {
    const lim = C.WORLD / 2 - 1;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      if (this.px[i] > lim || this.px[i] < -lim) this.vx[i] *= -1;
      if (this.py[i] > lim || this.py[i] < -lim) this.vy[i] *= -1;
    }
    // respawn toward baseline
    this._respawnAcc += dt;
    if (this._respawnAcc >= 1.5) {
      this._respawnAcc = 0;
      if (this._count() < C.NUTRIENT_BASE) this._spawn();
    }
    this._render();
  }

  // consume nutrients within radius of (x,y); returns number eaten.
  consumeNear(x, y, r) {
    const r2 = r * r;
    let eaten = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const dx = this.px[i] - x;
      const dy = this.py[i] - y;
      if (dx * dx + dy * dy <= r2) {
        this.alive[i] = 0;
        eaten++;
      }
    }
    return eaten;
  }

  nearest(x, y, maxR) {
    const maxR2 = maxR * maxR;
    let best = -1,
      bestD = Infinity;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const dx = this.px[i] - x;
      const dy = this.py[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD && d2 <= maxR2) {
        bestD = d2;
        best = i;
      }
    }
    if (best < 0) return null;
    return { x: this.px[best], y: this.py[best] };
  }

  _render() {
    const d = this._dummy;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) {
        d.position.set(0, 0, -1000);
        d.scale.set(0, 0, 0);
      } else {
        d.position.set(this.px[i], this.py[i], 0);
        d.scale.set(1, 1, 1);
      }
      d.updateMatrix();
      this.inst.setMatrixAt(i, d.matrix);
    }
    this.inst.instanceMatrix.needsUpdate = true;
  }
}
