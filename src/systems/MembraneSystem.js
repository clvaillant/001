// MembraneSystem.js
// Detects autopoietic closure: the moment a bonded particle cluster becomes a
// self-maintaining bounded system. This is the only threshold that matters for
// life. Runs every frame once layer >= BIOLOGICAL precondition is allowed.

import * as THREE from "three";
import { C, L } from "../core/Constants.js";
import { PT } from "./ParticleSystem.js";

const MAXBONDS = 4;
const TWO_PI = Math.PI * 2;

export class MembraneSystem {
  constructor(scene, state, particles) {
    this.scene = scene;
    this.state = state;
    this.P = particles;
    this.rings = []; // pool of THREE.Line ring objects
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this._visited = new Uint8Array(particles.cap);
    this._member = new Uint8Array(particles.cap);
  }

  _getRing(index) {
    if (this.rings[index]) return this.rings[index];
    const segs = 64;
    const pos = new Float32Array((segs + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    });
    const line = new THREE.LineLoop(geo, mat);
    line.frustumCulled = false;
    this.group.add(line);
    this.rings[index] = { line, geo, pos, segs };
    return this.rings[index];
  }

  update(dt) {
    const st = this.state;
    // Only meaningful once chemistry exists. Allow detection from CHEMICAL on so
    // that the BIOLOGICAL threshold (autopoiesis) can actually be crossed.
    if (st.layer < L.CHEMICAL) {
      this._hideRingsFrom(0);
      st.autopoiesis = 0;
      return;
    }

    const P = this.P;
    const cap = P.cap;
    const visited = this._visited;
    visited.fill(0);

    let maxAuto = 0;
    let largestSize = 0;
    let largestStability = 0;
    let largestInt = 0;
    let ringCount = 0;

    const stack = [];

    for (let s = 0; s < cap; s++) {
      if (!P.alive[s] || visited[s]) continue;
      if (P.bondCount[s] === 0) {
        visited[s] = 1;
        continue;
      }
      // BFS/DFS this component
      const comp = [];
      stack.length = 0;
      stack.push(s);
      visited[s] = 1;
      while (stack.length) {
        const cur = stack.pop();
        comp.push(cur);
        for (let b = 0; b < MAXBONDS; b++) {
          const p = P.bondsOf[cur * MAXBONDS + b];
          if (p >= 0 && !visited[p] && P.alive[p]) {
            visited[p] = 1;
            stack.push(p);
          }
        }
      }
      if (comp.length < C.T_MEM_SIZE) continue;

      // mark this component's membership for fast interior exclusion
      const member = this._member;
      for (const m of comp) member[m] = 1;

      // centroid
      let cx = 0,
        cy = 0;
      for (const m of comp) {
        cx += P.px[m];
        cy += P.py[m];
      }
      cx /= comp.length;
      cy /= comp.length;

      // angular coverage
      const angles = [];
      let r = 0;
      for (const m of comp) {
        const dx = P.px[m] - cx;
        const dy = P.py[m] - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) r = dist;
        angles.push(Math.atan2(dy, dx));
      }
      angles.sort((a, b) => a - b);
      let maxGap = 0;
      for (let a = 0; a < angles.length; a++) {
        const next = a === angles.length - 1 ? angles[0] + TWO_PI : angles[a + 1];
        const gap = next - angles[a];
        if (gap > maxGap) maxGap = gap;
      }
      let enclosure = 1 - maxGap / TWO_PI;
      enclosure = enclosure < 0 ? 0 : enclosure > 1 ? 1 : enclosure;
      if (enclosure < C.T_MEM_ENC) {
        for (const m of comp) member[m] = 0;
        continue;
      }

      // interior analysis
      const innerR = r * 0.68;
      const innerR2 = innerR * innerR;
      let intEnergy = 0;
      let resourceCapture = 0;
      for (let p = 0; p < cap; p++) {
        if (!P.alive[p]) continue;
        if (member[p]) continue; // skip this membrane's own members
        const dx = P.px[p] - cx;
        const dy = P.py[p] - cy;
        if (dx * dx + dy * dy <= innerR2) {
          intEnergy += P.energy[p];
          if (P.type[p] === PT.RESOURCE) {
            resourceCapture += 1;
            P.consumeResource(p, 0.4 * dt);
          }
        }
      }
      intEnergy = Math.min(1, intEnergy * 0.1);
      resourceCapture = Math.min(1, resourceCapture * 0.25);

      const repairRate = Math.min(1, comp.length / 13);
      const replicationReadiness = enclosure * intEnergy * repairRate;
      const autopoiesis =
        enclosure * 0.28 +
        intEnergy * 0.28 +
        resourceCapture * 0.22 +
        repairRate * 0.12 +
        replicationReadiness * 0.1;

      // mark members as membrane type and clear membership flags
      for (const m of comp) {
        P.type[m] = PT.MEMBRANE;
        member[m] = 0;
      }

      if (autopoiesis > maxAuto) maxAuto = autopoiesis;
      if (comp.length > largestSize) {
        largestSize = comp.length;
        largestStability = enclosure;
        largestInt = intEnergy;
      }

      // draw ring
      this._drawRing(ringCount++, cx, cy, r, enclosure);
    }

    this._hideRingsFrom(ringCount);

    st.autopoiesis = maxAuto;
    st.membraneStability = largestStability;
    st.intEnergy = largestInt;
  }

  _drawRing(index, cx, cy, r, enclosure) {
    const ring = this._getRing(index);
    const { pos, segs, line, geo } = ring;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TWO_PI;
      pos[i * 3] = cx + Math.cos(a) * r;
      pos[i * 3 + 1] = cy + Math.sin(a) * r;
      pos[i * 3 + 2] = 0;
    }
    geo.attributes.position.needsUpdate = true;
    // hue rotates with enclosure
    const hue = enclosure; // 0..1 → full hue wheel
    line.material.color.setHSL(hue, 0.85, 0.6);
    line.material.opacity = 0.18 + enclosure * 0.5;
    line.visible = true;
  }

  _hideRingsFrom(index) {
    for (let i = index; i < this.rings.length; i++) {
      if (this.rings[i]) this.rings[i].line.visible = false;
    }
  }

  hide() {
    this.group.visible = false;
  }
}
