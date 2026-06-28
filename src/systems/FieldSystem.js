// FieldSystem.js
// Two-field Gray-Scott reaction-diffusion on a FIELD_W x FIELD_H toroidal grid.
// This is the pre-geometric Ψ substrate from which all distinction emerges.
//   u = field identity   (starts 1.0, depleted by v activity)
//   v = distinction      (starts 0.0, seeded at scattered patches)
// Each visual frame runs GS_SUBSTEPS internal steps, then derives gradient/flow
// metrics and uploads a DataTexture for rendering.

import * as THREE from "three";
import { C, FIELD_MODES } from "../core/Constants.js";

// World-space extent of the field plane (square). World coords span [-HALF, HALF].
export const FIELD_WORLD = 28;
const HALF = FIELD_WORLD / 2;

export class FieldSystem {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    const W = (this.W = C.FIELD_W);
    const H = (this.H = C.FIELD_H);
    const N = (this.N = W * H);

    this.u = new Float32Array(N);
    this.v = new Float32Array(N);
    this.u2 = new Float32Array(N);
    this.v2 = new Float32Array(N);
    this.gx = new Float32Array(N);
    this.gy = new Float32Array(N);
    this.flow = new Float32Array(N);

    this.mode = "mitosis";
    this.params = { ...FIELD_MODES.mitosis };

    this.vMax = 0;
    this.vMin = 0;

    this.reset();
    this._buildMesh();
  }

  reset() {
    this.u.fill(1.0);
    this.v.fill(0.0);
    this._seed(4);
  }

  _seed(count) {
    const { W, H } = this;
    for (let s = 0; s < count; s++) {
      const cx = Math.floor(Math.random() * W);
      const cy = Math.floor(Math.random() * H);
      const r = 4;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const x = (cx + dx + W) % W;
          const y = (cy + dy + H) % H;
          const i = y * W + x;
          this.v[i] = 0.22;
          this.u[i] = 0.82;
        }
      }
    }
  }

  setMode(name) {
    if (FIELD_MODES[name]) {
      this.mode = name;
      this.params = { ...FIELD_MODES[name] };
    }
  }

  _buildMesh() {
    const { W, H } = this;
    this.tex = new THREE.DataTexture(
      new Uint8Array(W * H * 4),
      W,
      H,
      THREE.RGBAFormat
    );
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(FIELD_WORLD, FIELD_WORLD);
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.z = -7;
    this.scene.add(this.mesh);
  }

  // Convert world coords to grid indices (no wrap clamp). Returns -1 if outside.
  _worldToGrid(wx, wy) {
    const gx = ((wx + HALF) / FIELD_WORLD) * this.W;
    const gy = ((HALF - wy) / FIELD_WORLD) * this.H; // flip Y (texture origin)
    return [gx, gy];
  }

  // Sample gradient & field at a world position (used by particles).
  getGrad(wx, wy) {
    const [gxf, gyf] = this._worldToGrid(wx, wy);
    let ix = Math.round(gxf);
    let iy = Math.round(gyf);
    if (ix < 0 || iy < 0 || ix >= this.W || iy >= this.H)
      return { gx: 0, gy: 0, v: 0, u: 1 };
    const i = iy * this.W + ix;
    // gradient is stored in grid orientation; flip gy to world orientation
    return { gx: this.gx[i], gy: -this.gy[i], v: this.v[i], u: this.u[i] };
  }

  // Player influence: inject v / deplete u (and optionally cool v) in a circle.
  setInfluence(wx, wy, inject, cool) {
    const [cxf, cyf] = this._worldToGrid(wx, wy);
    const cx = Math.round(cxf);
    const cy = Math.round(cyf);
    const r = 9;
    const { W, H } = this;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        const falloff = 1 - Math.sqrt(d2) / r;
        if (inject) {
          this.v[i] = Math.min(1, this.v[i] + inject * falloff);
          this.u[i] = Math.max(0, this.u[i] - inject * 0.6 * falloff);
        }
        if (cool) {
          this.v[i] = Math.max(0, this.v[i] - cool * falloff);
          this.u[i] = Math.min(1, this.u[i] + cool * 0.5 * falloff);
        }
      }
    }
  }

  update(dt) {
    const { W, H, N } = this;
    const { Du, Dv, F, k } = this.params;
    let u = this.u,
      v = this.v,
      u2 = this.u2,
      v2 = this.v2;

    const substeps = C.GS_SUBSTEPS;
    for (let s = 0; s < substeps; s++) {
      for (let y = 0; y < H; y++) {
        const ym = ((y - 1 + H) % H) * W;
        const yp = ((y + 1) % H) * W;
        const yc = y * W;
        for (let x = 0; x < W; x++) {
          const xm = (x - 1 + W) % W;
          const xp = (x + 1) % W;
          const i = yc + x;
          const uu = u[i];
          const vv = v[i];
          const lapU =
            u[yc + xm] + u[yc + xp] + u[ym + x] + u[yp + x] - 4 * uu;
          const lapV =
            v[yc + xm] + v[yc + xp] + v[ym + x] + v[yp + x] - 4 * vv;
          const uvv = uu * vv * vv;
          let nu = uu + Du * lapU - uvv + F * (1 - uu);
          let nv = vv + Dv * lapV + uvv - (F + k) * vv;
          u2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
          v2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
        }
      }
      // swap
      let t = u;
      u = u2;
      u2 = t;
      t = v;
      v = v2;
      v2 = t;
    }
    this.u = u;
    this.v = v;
    this.u2 = u2;
    this.v2 = v2;

    // ---- derive gradient / flow metrics ----
    let vMax = -Infinity,
      vMin = Infinity;
    let totalFlow = 0;
    let patchCount = 0;
    const gx = this.gx,
      gy = this.gy,
      flow = this.flow;
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W;
      const yp = ((y + 1) % H) * W;
      const yc = y * W;
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W;
        const xp = (x + 1) % W;
        const i = yc + x;
        const vh = v[i];
        if (vh > vMax) vMax = vh;
        if (vh < vMin) vMin = vh;
        if (vh > 0.08) patchCount++;
        const dvx = (v[yc + xp] - v[yc + xm]) * 0.5;
        const dvy = (v[yp + x] - v[ym + x]) * 0.5;
        gx[i] = dvx;
        gy[i] = dvy;
        const fl = Math.sqrt(dvx * dvx + dvy * dvy);
        flow[i] = fl;
        totalFlow += fl;
      }
    }
    this.vMax = vMax;
    this.vMin = vMin;
    totalFlow /= N;

    // push metrics to state
    this.state.vContrast = vMax - vMin;
    this.state.flowCoherence = totalFlow;
    this.state.patchCount = patchCount;

    this._updateTexture();
  }

  _updateTexture() {
    const { W, H, N } = this;
    const data = this.tex.image.data;
    const u = this.u,
      v = this.v,
      flow = this.flow;
    for (let i = 0; i < N; i++) {
      const vv = v[i];
      const uu = u[i];
      const fl = flow[i];
      const vp = Math.pow(vv, 0.52);
      const ud = 1 - Math.pow(uu, 2.2);
      const f9 = fl * 9;
      let r = vp * 0.55 + ud * 0.04 + f9 * 0.12;
      let g = vp * 0.88 + ud * 0.1 + f9 * 0.35;
      let b = vp * 1.0 + ud * 0.22 + f9 * 0.08;
      let a = vp * 0.95 + ud * 0.07 + 0.03;
      const o = i * 4;
      data[o] = (r > 1 ? 1 : r < 0 ? 0 : r) * 255;
      data[o + 1] = (g > 1 ? 1 : g < 0 ? 0 : g) * 255;
      data[o + 2] = (b > 1 ? 1 : b < 0 ? 0 : b) * 255;
      data[o + 3] = (a > 1 ? 1 : a < 0 ? 0 : a) * 255;
    }
    this.tex.needsUpdate = true;
  }

  // Recovery: if the field flattens, inject fresh seeds.
  nudge() {
    this._seed(3);
  }

  hide() {
    this.mesh.visible = false;
  }
}
