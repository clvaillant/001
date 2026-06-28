// ParticleSystem.js
// Particles are the coarse-grained output of the Ψ field: they condense from
// high-gradient regions and interact through local physics. Their clustering and
// bonding eventually produces chemistry, and bounded clusters produce life.
//
// Types: 0 QUANTUM (blue), 1 BONDED (cyan-green), 2 RESOURCE (green), 3 MEMBRANE (purple)

import * as THREE from "three";
import { C, L } from "../core/Constants.js";
import { FIELD_WORLD } from "./FieldSystem.js";

const HALF = FIELD_WORLD / 2;
export const PT = { QUANTUM: 0, BONDED: 1, RESOURCE: 2, MEMBRANE: 3 };

const MAXBONDS = 4;

export class ParticleSystem {
  constructor(scene, state, field) {
    this.scene = scene;
    this.state = state;
    this.field = field;
    const cap = (this.cap = C.MAX_P_ORIG);

    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.energy = new Float32Array(cap);
    this.type = new Int8Array(cap);
    this.alive = new Uint8Array(cap);
    this.bondCount = new Int8Array(cap);
    // adjacency: bondsOf[i*MAXBONDS + s] = partner index or -1
    this.bondsOf = new Int32Array(cap * MAXBONDS).fill(-1);

    this.free = [];
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);

    // bond list: {a,b,str}
    this.bonds = [];

    this.spawnAcc = 0;
    this.resAcc = 0;

    this._buildMeshes();
  }

  _buildMeshes() {
    const cap = this.cap;
    const geo = new THREE.SphereGeometry(0.1, 5, 3);
    const mat = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.inst = new THREE.InstancedMesh(geo, mat, cap);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.count = cap;
    const col = new THREE.Color();
    this._color = new THREE.InstancedBufferAttribute(
      new Float32Array(cap * 3),
      3
    );
    this.inst.instanceColor = this._color;
    this._dummy = new THREE.Object3D();
    // start all hidden (scale 0)
    for (let i = 0; i < cap; i++) {
      this._dummy.position.set(0, 0, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.inst.setMatrixAt(i, this._dummy.matrix);
      this._color.setXYZ(i, 0, 0, 0);
    }
    this.inst.instanceMatrix.needsUpdate = true;
    this._color.needsUpdate = true;
    this.scene.add(this.inst);

    // bond line segments
    const maxSeg = cap * MAXBONDS; // generous
    this.lineGeo = new THREE.BufferGeometry();
    this.linePos = new Float32Array(maxSeg * 2 * 3);
    this.lineCol = new Float32Array(maxSeg * 2 * 3);
    this.lineGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.linePos, 3)
    );
    this.lineGeo.setAttribute(
      "color",
      new THREE.BufferAttribute(this.lineCol, 3)
    );
    const lmat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    });
    this.lines = new THREE.LineSegments(this.lineGeo, lmat);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
  }

  _spawn(x, y, vx, vy, type) {
    if (this.free.length === 0) return -1;
    // respect runtime MAX_P cap
    if (this.cap - this.free.length >= C.MAX_P) return -1;
    const i = this.free.pop();
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.energy[i] = 0.8 + Math.random() * 0.2;
    this.type[i] = type;
    this.alive[i] = 1;
    this.bondCount[i] = 0;
    for (let s = 0; s < MAXBONDS; s++) this.bondsOf[i * MAXBONDS + s] = -1;
    return i;
  }

  _spawnFromField(type) {
    const f = this.field;
    let bestFlow = -1,
      bx = 0,
      by = 0,
      bgx = 0,
      bgy = 0;
    for (let t = 0; t < 10; t++) {
      const gx = Math.floor(Math.random() * f.W);
      const gy = Math.floor(Math.random() * f.H);
      const idx = gy * f.W + gx;
      const fl = f.flow[idx];
      if (fl > bestFlow) {
        bestFlow = fl;
        bx = (gx / f.W) * FIELD_WORLD - HALF;
        by = HALF - (gy / f.H) * FIELD_WORLD;
        bgx = f.gx[idx];
        bgy = -f.gy[idx];
      }
    }
    this._spawn(
      bx + (Math.random() - 0.5) * 0.5,
      by + (Math.random() - 0.5) * 0.5,
      bgx * 6,
      bgy * 6,
      type
    );
  }

  _kill(i) {
    // remove bonds touching i
    for (let s = 0; s < MAXBONDS; s++) {
      const p = this.bondsOf[i * MAXBONDS + s];
      if (p >= 0) this._removeBondEntry(i, p);
    }
    this.alive[i] = 0;
    this.bondCount[i] = 0;
    this.free.push(i);
  }

  _removeBondEntry(a, b) {
    for (let s = 0; s < MAXBONDS; s++) {
      if (this.bondsOf[a * MAXBONDS + s] === b) {
        this.bondsOf[a * MAXBONDS + s] = -1;
        this.bondCount[a]--;
      }
      if (this.bondsOf[b * MAXBONDS + s] === a) {
        this.bondsOf[b * MAXBONDS + s] = -1;
        this.bondCount[b]--;
      }
    }
  }

  _addBond(a, b) {
    let sa = -1,
      sb = -1;
    for (let s = 0; s < MAXBONDS; s++) {
      if (sa < 0 && this.bondsOf[a * MAXBONDS + s] < 0) sa = s;
      if (sb < 0 && this.bondsOf[b * MAXBONDS + s] < 0) sb = s;
    }
    if (sa < 0 || sb < 0) return;
    this.bondsOf[a * MAXBONDS + sa] = b;
    this.bondsOf[b * MAXBONDS + sb] = a;
    this.bondCount[a]++;
    this.bondCount[b]++;
    this.bonds.push({ a, b, str: 1 });
    if (this.type[a] !== PT.MEMBRANE) this.type[a] = PT.BONDED;
    if (this.type[b] !== PT.MEMBRANE) this.type[b] = PT.BONDED;
  }

  _isBonded(a, b) {
    for (let s = 0; s < MAXBONDS; s++)
      if (this.bondsOf[a * MAXBONDS + s] === b) return true;
    return false;
  }

  update(dt) {
    const st = this.state;
    const layer = st.layer;

    // ---- spawning ----
    if (st.vContrast > 0.08) {
      // Spawn rate scales with the emergent layer. Rates are raised over the
      // design baseline (0.025 / 0.1 / 0.35) to build the particle density that
      // bonded membranes require, capped by C.MAX_P inside _spawn().
      let rate;
      if (layer < L.DIST) rate = 0.06;
      else if (layer < L.PROCESS) rate = 0.5;
      else rate = 3.5 + st.vContrast * 2;
      this.spawnAcc += rate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this._spawnFromField(PT.QUANTUM);
      }
    }
    // resource spawns
    if (layer >= L.CHEMICAL) {
      this.resAcc += 0.014 * (dt * 60);
      while (this.resAcc >= 1) {
        this.resAcc -= 1;
        this._spawnFromField(PT.RESOURCE);
      }
    }

    const cap = this.cap;
    const px = this.px,
      py = this.py,
      vx = this.vx,
      vy = this.vy,
      en = this.energy,
      alive = this.alive,
      bc = this.bondCount;
    const cutoff = C.P_FORCE_CUTOFF;
    const cutoff2 = cutoff * cutoff;

    // ---- field gradient force per particle ----
    // The field guides particles toward active (high-gradient) regions but must
    // not scatter them faster than mutual attraction can coalesce them, so the
    // coupling is moderate (0.45) rather than dominating.
    for (let i = 0; i < cap; i++) {
      if (!alive[i]) continue;
      const g = this.field.getGrad(px[i], py[i]);
      vx[i] += g.gx * 0.45 * dt;
      vy[i] += g.gy * 0.45 * dt;
    }

    // ---- pair interactions ----
    // Bonds begin forming during the PHYSICAL layer so that the rising bond ratio
    // can drive the coarse-graining into CHEMICAL organization. (Forming bonds is
    // the very process by which physics becomes chemistry.)
    const canBond = layer >= L.PHYSICAL;
    for (let i = 0; i < cap; i++) {
      if (!alive[i]) continue;
      const xi = px[i],
        yi = py[i];
      for (let j = i + 1; j < cap; j++) {
        if (!alive[j]) continue;
        const dx = px[j] - xi;
        const dy = py[j] - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 > cutoff2) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const nx = dx / d;
        const ny = dy / d;
        const bonded = this._isBonded(i, j);

        // hard repulsion
        if (d < 0.3) {
          const f = (C.P_REPEL / (d * d)) * dt;
          vx[i] -= nx * f;
          vy[i] -= ny * f;
          vx[j] += nx * f;
          vy[j] += ny * f;
        }
        // soft attraction (widened range so particles in a region find each other)
        if (d < 4.5 || bonded) {
          const bondedMult = bonded ? 2.2 : 1.0;
          const f = ((C.P_ATTRACT * bondedMult) / d) * dt;
          vx[i] += nx * f;
          vy[i] += ny * f;
          vx[j] -= nx * f;
          vy[j] -= ny * f;
        }
        // bond formation
        if (
          canBond &&
          !bonded &&
          d < C.P_BOND_DIST &&
          bc[i] < 4 &&
          bc[j] < 4 &&
          this.type[i] !== PT.RESOURCE &&
          this.type[j] !== PT.RESOURCE &&
          Math.random() < C.P_BOND_PROB * dt * 60
        ) {
          this._addBond(i, j);
        }
      }
    }

    // ---- integrate ----
    const damp = Math.pow(0.04, dt);
    for (let i = 0; i < cap; i++) {
      if (!alive[i]) continue;
      vx[i] *= damp;
      vy[i] *= damp;
      // speed cap
      let sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      if (sp > 3.5) {
        const s = 3.5 / sp;
        vx[i] *= s;
        vy[i] *= s;
      }
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      // energy decay
      en[i] -= C.P_DECAY * (dt * 60);
      // extra decay at world edges
      if (Math.abs(px[i]) > 13 || Math.abs(py[i]) > 11)
        en[i] -= C.P_DECAY * 6 * (dt * 60);
      if (en[i] <= 0) this._kill(i);
    }

    // ---- bond maintenance ----
    let bc2 = 0;
    for (let b = this.bonds.length - 1; b >= 0; b--) {
      const bd = this.bonds[b];
      const a = bd.a,
        c = bd.b;
      if (!alive[a] || !alive[c] || !this._isBonded(a, c)) {
        this.bonds.splice(b, 1);
        continue;
      }
      const dx = px[c] - px[a];
      const dy = py[c] - py[a];
      const dist = Math.sqrt(dx * dx + dy * dy);
      bd.str *= Math.pow(0.997, dt * 60);
      if (dist > 5 || bd.str < 0.05) {
        this._removeBondEntry(a, c);
        this.bonds.splice(b, 1);
        continue;
      }
      bc2++;
    }

    // ---- metrics ----
    let pcount = 0;
    for (let i = 0; i < cap; i++) if (alive[i]) pcount++;
    st.particleCount = pcount;
    st.bondCount = bc2;
    st.bondRatio = pcount > 0 ? bc2 / pcount : 0;

    this._render();
  }

  _render() {
    const cap = this.cap;
    const d = this._dummy;
    const col = new THREE.Color();
    for (let i = 0; i < cap; i++) {
      if (!this.alive[i]) {
        d.position.set(0, 0, -1000);
        d.scale.set(0, 0, 0);
        d.updateMatrix();
        this.inst.setMatrixAt(i, d.matrix);
        continue;
      }
      const e = this.energy[i];
      const scale = 0.44 + e * 0.72 + this.bondCount[i] * 0.09;
      d.position.set(this.px[i], this.py[i], 0);
      d.scale.set(scale, scale, scale);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.inst.setMatrixAt(i, d.matrix);
      // color by type x energy
      const t = this.type[i];
      const br = 0.45 + e * 0.65;
      if (t === PT.QUANTUM) col.setRGB(0.25 * br, 0.5 * br, 1.0 * br);
      else if (t === PT.BONDED) col.setRGB(0.3 * br, 1.0 * br, 0.75 * br);
      else if (t === PT.RESOURCE) col.setRGB(0.4 * br, 1.0 * br, 0.3 * br);
      else col.setRGB(0.8 * br, 0.3 * br, 1.0 * br);
      this._color.setXYZ(i, col.r, col.g, col.b);
    }
    this.inst.instanceMatrix.needsUpdate = true;
    this._color.needsUpdate = true;

    // bonds
    const lp = this.linePos;
    const lc = this.lineCol;
    let n = 0;
    for (let b = 0; b < this.bonds.length; b++) {
      const bd = this.bonds[b];
      const a = bd.a,
        c = bd.b;
      const o = n * 6;
      lp[o] = this.px[a];
      lp[o + 1] = this.py[a];
      lp[o + 2] = 0;
      lp[o + 3] = this.px[c];
      lp[o + 4] = this.py[c];
      lp[o + 5] = 0;
      const g = 0.7 + bd.str * 0.3;
      lc[o] = 0.4 * g;
      lc[o + 1] = 1.0 * g;
      lc[o + 2] = 0.7 * g;
      lc[o + 3] = 0.4 * g;
      lc[o + 4] = 1.0 * g;
      lc[o + 5] = 0.7 * g;
      n++;
    }
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.attributes.color.needsUpdate = true;
    this.lineGeo.setDrawRange(0, n * 2);
  }

  // Consume a resource particle (called by membrane/cell capture).
  consumeResource(i, amount) {
    if (this.alive[i] && this.type[i] === PT.RESOURCE) {
      this.energy[i] -= amount;
      if (this.energy[i] <= 0) this._kill(i);
      return true;
    }
    return false;
  }

  hide() {
    this.inst.visible = false;
    this.lines.visible = false;
  }
}
