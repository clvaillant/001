// EcologySystem.js
// The cell-stage environment: a glowing boundary torus, a deep star field, and
// ambient drift particles. Chemical/temperature gradient data structures are
// present as stubs for future expansion; their visuals are intentionally minimal.

import * as THREE from "three";
import { C } from "../core/Constants.js";

export class EcologySystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // boundary torus
    const torusGeo = new THREE.TorusGeometry(C.WORLD / 2, 0.25, 8, 96);
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0x1a6fa0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.55,
    });
    this.torus = new THREE.Mesh(torusGeo, torusMat);
    this.group.add(this.torus);

    // star field (far behind)
    const starN = 2000;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() * 2 - 1) * 600;
      starPos[i * 3 + 1] = (Math.random() * 2 - 1) * 600;
      starPos[i * 3 + 2] = -200 - Math.random() * 300;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x88aacc,
      size: 1.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.group.add(this.stars);

    // ambient drift particles
    const driftN = (this.driftN = 90);
    this.driftPos = new Float32Array(driftN * 3);
    this.driftVel = new Float32Array(driftN * 2);
    const r = C.WORLD / 2;
    for (let i = 0; i < driftN; i++) {
      this.driftPos[i * 3] = (Math.random() * 2 - 1) * r;
      this.driftPos[i * 3 + 1] = (Math.random() * 2 - 1) * r;
      this.driftPos[i * 3 + 2] = -2;
      this.driftVel[i * 2] = (Math.random() * 2 - 1) * 0.4;
      this.driftVel[i * 2 + 1] = (Math.random() * 2 - 1) * 0.4;
    }
    const driftGeo = new THREE.BufferGeometry();
    driftGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.driftPos, 3)
    );
    const driftMat = new THREE.PointsMaterial({
      color: 0x335577,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.drift = new THREE.Points(driftGeo, driftMat);
    this.group.add(this.drift);
    this.driftGeo = driftGeo;

    // ---- stub data structures for future ecology expansion ----
    this.chemicalGradient = new Float32Array(16 * 16); // resource patch field
    this.temperatureMap = new Float32Array(16 * 16);
  }

  show() {
    this.group.visible = true;
  }

  update(dt) {
    if (!this.group.visible) return;
    const lim = C.WORLD / 2;
    for (let i = 0; i < this.driftN; i++) {
      this.driftPos[i * 3] += this.driftVel[i * 2] * dt;
      this.driftPos[i * 3 + 1] += this.driftVel[i * 2 + 1] * dt;
      if (Math.abs(this.driftPos[i * 3]) > lim) this.driftVel[i * 2] *= -1;
      if (Math.abs(this.driftPos[i * 3 + 1]) > lim)
        this.driftVel[i * 2 + 1] *= -1;
    }
    this.driftGeo.attributes.position.needsUpdate = true;
    this.torus.rotation.z += dt * 0.05;
  }
}
