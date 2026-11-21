import * as THREE from 'three';

import { disposeObject3D } from './rendererSetup';

interface ActiveVfxEffect {
  group: THREE.Group;
  age: number;
  duration: number;
  update: (dt: number, progress: number) => void;
}

export interface CalloutItem {
  id: number;
  text: string;
  color: string;
  worldX: number;
  worldY: number;
  age: number;
  duration: number;
}

/**
 * Real-time Three.js 3D particle & mesh VFX manager for impacts, block waves,
 * Blue Striker frost charge/shatter, Bayasaa's 3D flaming triangle choke ring,
 * Mongol Bokh Eagle Slam shockwaves, and Tornado/Weapon Ultimate trails.
 */
export class Vfx3DManager {
  private readonly scene: THREE.Scene;
  private readonly active: ActiveVfxEffect[] = [];
  private readonly callouts: CalloutItem[] = [];
  private nextCalloutId = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  addCallout(worldX: number, worldY: number, text: string, color = '#facc15', duration = 0.75): void {
    this.callouts.push({
      id: this.nextCalloutId++,
      text,
      color,
      worldX,
      worldY,
      age: 0,
      duration
    });
  }

  getCallouts(): readonly CalloutItem[] {
    return this.callouts;
  }

  spawnHitSpark(x: number, y: number, colorHex: number, heavy = false): void {
    const group = new THREE.Group();
    group.position.set(x, y, 0.25);

    const shardCount = heavy ? 16 : 9;
    const velocities: THREE.Vector3[] = [];
    const shards: THREE.Mesh[] = [];
    const geo = new THREE.OctahedronGeometry(heavy ? 0.095 : 0.06, 0);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });

    for (let i = 0; i < shardCount; i += 1) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / shardCount) * Math.PI * 2 + Math.random() * 0.4;
      const spd = (heavy ? 5.2 : 3.4) + Math.random() * 2.4;
      velocities.push(new THREE.Vector3(Math.cos(a) * spd, Math.sin(a) * spd, (Math.random() - 0.5) * 3.0));
      shards.push(m);
      group.add(m);
    }

    // Tekken-style crisp cross flash + double impact rings
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.036, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.024, 6, 22),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 })
    );
    const coreFlash = new THREE.Mesh(
      new THREE.SphereGeometry(heavy ? 0.24 : 0.15, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    group.add(ring, outerRing, coreFlash);
    this.scene.add(group);

    this.active.push({
      group,
      age: 0,
      duration: heavy ? 0.46 : 0.3,
      update: (dt, p) => {
        shards.forEach((s, idx) => {
          s.position.addScaledVector(velocities[idx], dt);
          s.scale.setScalar(Math.max(0.01, 1 - p));
        });
        ring.scale.setScalar(1 + p * (heavy ? 4.4 : 2.6));
        outerRing.scale.setScalar(1 + p * (heavy ? 5.4 : 3.2));
        coreFlash.scale.setScalar(Math.max(0.01, 1.4 - p * 1.4));
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p);
        (outerRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - p));
        (coreFlash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p * 1.6);
        mat.opacity = Math.max(0, 1 - p);
      }
    });
  }

  spawnBlockRipple(x: number, y: number): void {
    const group = new THREE.Group();
    group.position.set(x, y, 0.3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 22), mat);
    ring.rotation.y = Math.PI * 0.35;
    group.add(ring);
    this.scene.add(group);

    this.active.push({
      group,
      age: 0,
      duration: 0.26,
      update: (_dt, p) => {
        ring.scale.setScalar(1 + p * 1.9);
        mat.opacity = Math.max(0, 0.85 * (1 - p));
      }
    });
  }

  spawnDashDust(x: number, direction: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.08, 0.15);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.55 });
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i += 1) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat);
      p.position.set(-direction * i * 0.16, i * 0.04, (Math.random() - 0.5) * 0.2);
      puffs.push(p);
      group.add(p);
    }
    this.scene.add(group);

    this.active.push({
      group,
      age: 0,
      duration: 0.32,
      update: (dt, prog) => {
        puffs.forEach((m) => {
          m.position.x -= direction * dt * 1.1;
          m.position.y += dt * 0.45;
          m.scale.setScalar(1 + prog * 1.3);
        });
        mat.opacity = Math.max(0, 0.55 * (1 - prog));
      }
    });
  }

  /** Blue Striker 0.8s pale icy frost dome + swirling ice crystals. */
  spawnFrostCharge(x: number, durationSec = 0.8): void {
    const group = new THREE.Group();
    group.position.set(x, 1.0, 0);

    const domeMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.28,
      wireframe: true
    });
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), domeMat);
    group.add(dome);

    const crystals: THREE.Mesh[] = [];
    const cMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 8; i += 1) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), cMat);
      crystals.push(c);
      group.add(c);
    }
    this.scene.add(group);

    this.active.push({
      group,
      age: 0,
      duration: durationSec,
      update: (_dt, p) => {
        dome.rotation.y += 0.08;
        dome.scale.setScalar(1.2 - p * 0.35);
        crystals.forEach((c, idx) => {
          const a = p * Math.PI * 4 + (idx / crystals.length) * Math.PI * 2;
          const r = 0.95 * (1 - p * 0.4);
          c.position.set(Math.cos(a) * r, Math.sin(p * 6 + idx) * 0.45, Math.sin(a) * r);
        });
        cMat.opacity = Math.max(0, 1 - p * 0.6);
      }
    });
  }

  /**
   * Bayasaa's L Triangle Choke 3D Flaming Triangle Ring wrapping around the
   * opponent's head & Bayasaa's lock arm with rising ember flames.
   */
  spawnFlamingTriangleRing(x: number, y: number, facing: 1 | -1, durationSec = 1.45): () => void {
    const group = new THREE.Group();
    group.position.set(x, y, 0.22);

    const outerMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.92 });
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.95 });

    // Triangular tube-like ring formed with CylinderSegments around opponent head & Bayasaa arms
    const vertices = [
      new THREE.Vector3(-facing * 0.38, 0.36, 0),
      new THREE.Vector3(facing * 0.44, 0.02, 0.14),
      new THREE.Vector3(-facing * 0.28, -0.34, -0.1)
    ];

    const addEdge = (a: THREE.Vector3, b: THREE.Vector3): void => {
      const dist = a.distanceTo(b);
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, dist, 8), outerMat);
      bar.position.copy(mid);
      bar.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().subVectors(b, a).normalize()
      );
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, dist, 6), innerMat);
      core.position.copy(mid);
      core.quaternion.copy(bar.quaternion);
      group.add(bar, core);
    };

    addEdge(vertices[0], vertices[1]);
    addEdge(vertices[1], vertices[2]);
    addEdge(vertices[2], vertices[0]);

    // Orbiting 3D flames around the triangle perimeter
    const flames: THREE.Mesh[] = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 9; i += 1) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), flameMat);
      flames.push(f);
      group.add(f);
    }

    this.scene.add(group);
    let cleaned = false;

    const effect: ActiveVfxEffect = {
      group,
      age: 0,
      duration: durationSec,
      update: (_dt, p) => {
        const pulse = 1 + Math.sin(p * Math.PI * 12) * 0.07;
        group.scale.setScalar(pulse);
        flames.forEach((f, idx) => {
          const edgeIdx = idx % 3;
          const t = ((idx / 9 + p * 2.2) % 1);
          const a = vertices[edgeIdx];
          const b = vertices[(edgeIdx + 1) % 3];
          f.position.lerpVectors(a, b, t);
          f.position.y += 0.06 + Math.sin(p * 18 + idx) * 0.04;
        });
        if (p > 0.82) {
          const fade = 1 - (p - 0.82) / 0.18;
          outerMat.opacity = Math.max(0, 0.92 * fade);
          innerMat.opacity = Math.max(0, 0.95 * fade);
          flameMat.opacity = Math.max(0, 0.88 * fade);
        }
      }
    };
    this.active.push(effect);

    return () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      effect.age = effect.duration + 1;
    };
  }

  /** Eagle Slam / World Ultimate / Tornado ground shockwave rings. */
  spawnShockwave(x: number, y: number, primaryHex: number, secondaryHex: number, maxScale = 3.2): void {
    const group = new THREE.Group();
    group.position.set(x, y, 0);

    const m1 = new THREE.MeshBasicMaterial({ color: primaryHex, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
    const m2 = new THREE.MeshBasicMaterial({ color: secondaryHex, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.56, 28), m1);
    r1.rotation.x = -Math.PI / 2;
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.055, 8, 28), m2);
    r2.rotation.x = Math.PI / 2;
    group.add(r1, r2);
    this.scene.add(group);

    this.active.push({
      group,
      age: 0,
      duration: 0.45,
      update: (_dt, p) => {
        r1.scale.setScalar(1 + p * maxScale);
        r2.scale.setScalar(1 + p * (maxScale * 0.78));
        r2.position.y = p * 0.65;
        m1.opacity = Math.max(0, 0.95 * (1 - p));
        m2.opacity = Math.max(0, 0.9 * (1 - p));
      }
    });
  }

  /** Glowing crescent slash arc for weapon/spinning ultimates. */
  spawnSlashArc(x: number, y: number, facing: 1 | -1, colorHex: number): void {
    const group = new THREE.Group();
    group.position.set(x + facing * 0.45, y, 0.2);

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.075, 6, 20, Math.PI * 0.95), mat);
    arc.rotation.z = facing > 0 ? -Math.PI * 0.4 : Math.PI * 0.6;
    group.add(arc);
    this.scene.add(group);

    this.active.push({
      group,
      age: 0,
      duration: 0.34,
      update: (dt, p) => {
        group.position.x += facing * dt * 1.8;
        arc.scale.setScalar(1 + p * 0.45);
        mat.opacity = Math.max(0, 0.92 * (1 - p));
      }
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const fx = this.active[i];
      fx.age += dt;
      const p = Math.min(1, fx.age / fx.duration);
      fx.update(dt, p);
      if (fx.age >= fx.duration) {
        this.scene.remove(fx.group);
        disposeObject3D(fx.group);
        this.active.splice(i, 1);
      }
    }

    for (let i = this.callouts.length - 1; i >= 0; i -= 1) {
      this.callouts[i].age += dt;
      this.callouts[i].worldY += dt * 0.65;
      if (this.callouts[i].age >= this.callouts[i].duration) {
        this.callouts.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const fx of this.active) {
      this.scene.remove(fx.group);
      disposeObject3D(fx.group);
    }
    this.active.length = 0;
    this.callouts.length = 0;
  }
}
