// Cell.js
// A living, morphable cell. Its body shape is determined entirely by behavioral
// history — never by player choice. Behavior shapes bioelectric patterning which
// shapes form (the Friston/Levin synthesis encoded as vertex deformation).

import * as THREE from "three";
import { C } from "../core/Constants.js";

export class Cell {
  constructor(scene, isPlayer = false, color = 0x38ffaa) {
    this.scene = scene;
    this.isPlayer = isPlayer;
    this.alive = true;
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.energy = 1;

    this.morph = {
      sharpness: 0,
      elongation: 0,
      armor: 0,
      flagella: 0,
      cilia: 0,
      size: 0.35,
    };

    // behavior counters
    this.attacks = 0;
    this.flees = 0;
    this.eatings = 0;
    this.explorations = 0;
    this.totalTime = 0.0001;
    this.age = 0;
    this._morphAccum = 0;
    this._lastDeform = 0;

    // geometry
    this.geo = new THREE.SphereGeometry(1, 22, 16);
    this.baseVerts = this.geo.attributes.position.array.slice();
    const c = new THREE.Color(color);
    this.mat = new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    scene.add(this.mesh);

    // glow shell
    this.glowMat = new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.11,
    });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 12), this.glowMat);
    scene.add(this.glow);

    // flagellum line
    const fgeo = new THREE.BufferGeometry();
    this.flagPos = new Float32Array(28 * 3);
    fgeo.setAttribute("position", new THREE.BufferAttribute(this.flagPos, 3));
    this.flagMat = new THREE.LineBasicMaterial({
      color: c,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    });
    this.flag = new THREE.Line(fgeo, this.flagMat);
    this.flag.frustumCulled = false;
    scene.add(this.flag);

    this._deform();
  }

  _clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  _accumulateMorph() {
    const m = this.morph;
    const rate = C.CELL_MORPH_RATE;
    const t = this.totalTime;
    m.sharpness = this._clamp01(
      m.sharpness + ((this.attacks / t) * 100) * rate
    );
    m.elongation = this._clamp01(
      m.elongation + ((this.attacks / t) * 100) * rate * 0.4
    );
    m.armor = this._clamp01(m.armor + ((this.flees / t) * 100) * rate * 0.9);
    m.flagella = this._clamp01(
      m.flagella + ((this.explorations / t) * 100) * rate * 0.7
    );
    m.cilia = this._clamp01(m.cilia + ((this.eatings / t) * 100) * rate * 0.55);
    m.size = Math.max(
      0.25,
      Math.min(2.6, m.size + ((this.eatings / t) * 100) * rate * 0.04)
    );
  }

  _deform() {
    const m = this.morph;
    const base = this.baseVerts;
    const arr = this.geo.attributes.position.array;
    for (let i = 0; i < base.length; i += 3) {
      let bx = base[i],
        by = base[i + 1],
        bz = base[i + 2];
      // base position is already unit-length (sphere radius 1) → normal dir
      const nx = bx,
        ny = by,
        nz = bz;
      let x = bx,
        y = by,
        z = bz;

      // 1. elongation along forward (+x)
      if (m.elongation > 0) {
        const fwd = Math.max(0, nx);
        x = bx * (1 + m.elongation * 0.95 * fwd);
      }
      // 2. sharpness: frontal taper + spike
      if (nx > 0.35) {
        let taper = 1 - m.sharpness * (nx - 0.35) * 1.7;
        taper = taper < 0.05 ? 0.05 : taper > 1 ? 1 : taper;
        y *= taper;
        z *= taper;
        x *= 1 + m.sharpness * 0.6 * nx;
      }
      // 3. armor: lateral bulge
      const lat = Math.sqrt(ny * ny + nz * nz);
      const bulge = 1 + m.armor * 0.38 * lat;
      y *= bulge;
      z *= bulge;
      // 4. cilia: surface noise
      if (m.cilia > 0) {
        const bump = m.cilia * 0.08 * Math.sin(nx * 14 + ny * 9 + nz * 11);
        x += bump * nx;
        y += bump * ny;
        z += bump * nz;
      }
      // 5. global size
      x *= m.size;
      y *= m.size;
      z *= m.size;

      arr[i] = x;
      arr[i + 1] = y;
      arr[i + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  // returns topSpeed for physics callers
  topSpeed() {
    return (3.8 * (1 + this.morph.flagella * 0.85)) / (0.4 + this.morph.size * 0.6);
  }

  eatRadius() {
    return 0.9 * this.morph.size * (1 + this.morph.cilia * 0.65);
  }

  update(dt, nutrients) {
    if (!this.alive) return;
    this.age += dt;
    this.totalTime += dt;
    this._morphAccum += dt;

    // periodic morph accumulation + redeform every 4s
    if (this._morphAccum >= 4) {
      this._morphAccum = 0;
      this._accumulateMorph();
      this._deform();
    }

    // damping + integrate
    const damp = Math.pow(0.04, dt);
    this.velocity.x *= damp;
    this.velocity.y *= damp;
    // speed cap
    const sp = Math.hypot(this.velocity.x, this.velocity.y);
    const top = this.topSpeed();
    if (sp > top) {
      this.velocity.x *= top / sp;
      this.velocity.y *= top / sp;
    }
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    // wall bounce
    const lim = C.WORLD / 2 - 1;
    if (this.position.x > lim) {
      this.position.x = lim;
      this.velocity.x *= -0.6;
    } else if (this.position.x < -lim) {
      this.position.x = -lim;
      this.velocity.x *= -0.6;
    }
    if (this.position.y > lim) {
      this.position.y = lim;
      this.velocity.y *= -0.6;
    } else if (this.position.y < -lim) {
      this.position.y = -lim;
      this.velocity.y *= -0.6;
    }

    // energy drain
    this.energy -= (C.CELL_DRAIN + this.morph.size * 0.045) * dt;

    // eating
    if (nutrients) {
      const eaten = nutrients.consumeNear(
        this.position.x,
        this.position.y,
        this.eatRadius()
      );
      if (eaten > 0) {
        this.eatings += eaten;
        this.energy = Math.min(1.4, this.energy + eaten * 0.18);
      }
    }
    if (this.energy > 1.4) this.energy = 1.4;

    // visual transforms
    this.mesh.position.copy(this.position);
    this.glow.position.copy(this.position);
    const ang = Math.atan2(this.velocity.y, this.velocity.x);
    this.mesh.rotation.z = ang;
    this.glow.rotation.z = ang;

    // flagellum
    const m = this.morph;
    if (m.flagella > 0.02) {
      const t = this.age;
      for (let k = 0; k < 28; k++) {
        const u = k / 27;
        const fx = -u * (1.4 + m.flagella * 3.5) * m.size;
        const fy = Math.sin(t * 5.5 - u * 9) * 0.38 * u * m.flagella;
        this.flagPos[k * 3] = fx;
        this.flagPos[k * 3 + 1] = fy;
        this.flagPos[k * 3 + 2] = 0;
      }
      this.flag.geometry.attributes.position.needsUpdate = true;
      this.flag.position.copy(this.position);
      this.flag.rotation.z = ang;
      this.flagMat.opacity = m.flagella * 0.68;
      this.flag.visible = true;
    } else {
      this.flag.visible = false;
    }

    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
    }
  }

  // apply a steering force toward a target point
  steerToward(tx, ty, strength, dt) {
    const dx = tx - this.position.x;
    const dy = ty - this.position.y;
    const d = Math.hypot(dx, dy) || 1;
    this.velocity.x += (dx / d) * strength * dt;
    this.velocity.y += (dy / d) * strength * dt;
  }

  setColor(hex) {
    this.mat.color.setHex(hex);
    this.glowMat.color.setHex(hex);
    this.flagMat.color.setHex(hex);
  }

  dispose() {
    this.scene.remove(this.mesh, this.glow, this.flag);
    this.geo.dispose();
  }
}
