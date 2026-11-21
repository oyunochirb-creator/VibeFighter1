import * as THREE from 'three';

import {
  createCyberGridTexture,
  createDojoWoodTexture,
  createHelipadTexture,
  createOctagonMatTexture,
  createSteppeGroundTexture
} from './textures3d';

export interface Arena3DInstance {
  stageId: string;
  group: THREE.Group;
  backgroundColor: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  update: (dt: number, elapsedSec: number) => void;
}

function addStandardArenaLighting(
  group: THREE.Group,
  hemiSky: number,
  hemiGround: number,
  hemiIntensity: number,
  keyColor: number,
  keyIntensity: number,
  keyPos: [number, number, number],
  rimColor: number,
  rimIntensity: number,
  allowShadow: boolean
): void {
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, hemiIntensity);
  group.add(hemi);

  const key = new THREE.DirectionalLight(keyColor, keyIntensity);
  key.position.set(...keyPos);
  if (allowShadow) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 36;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0005;
  }
  group.add(key);

  const rim = new THREE.DirectionalLight(rimColor, rimIntensity);
  rim.position.set(-keyPos[0] * 0.85, keyPos[1] * 0.7, -Math.abs(keyPos[2]) - 4);
  group.add(rim);
}

/** Builds any of the 6 selectable 3D championship arenas grounded at y = 0. */
export function buildArena3D(
  stageId: string,
  anisotropy: number,
  allowShadow: boolean
): Arena3DInstance {
  const group = new THREE.Group();

  switch (stageId) {
    case 'mongol-steppe':
      return buildMongolSteppe(group, anisotropy, allowShadow);
    case 'tokyo-dojo':
      return buildTokyoDojo(group, anisotropy, allowShadow);
    case 'cyber-colosseum':
      return buildCyberColosseum(group, anisotropy, allowShadow);
    case 'rooftop-twilight':
      return buildRooftop(group, 'rooftop-twilight', anisotropy, allowShadow, false);
    case 'rooftop-sunset':
      return buildRooftop(group, 'rooftop-sunset', anisotropy, allowShadow, true);
    case 'mma-octagon':
    default:
      return buildMmaOctagon(group, anisotropy, allowShadow);
  }
}

function buildMmaOctagon(
  group: THREE.Group,
  anisotropy: number,
  allowShadow: boolean
): Arena3DInstance {
  const bg = 0x070b14;
  addStandardArenaLighting(group, 0x93c5fd, 0x1e293b, 0.75, 0xfff7ed, 2.2, [4, 12, 7], 0x38bdf8, 1.1, allowShadow);

  // Arena Stadium Dark Floor extending to fog
  const stadiumFloor = new THREE.Mesh(
    new THREE.CircleGeometry(48, 32),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.9, metalness: 0.1 })
  );
  stadiumFloor.rotation.x = -Math.PI / 2;
  stadiumFloor.position.y = -0.45;
  group.add(stadiumFloor);

  // Raised Octagon Platform
  const matTex = createOctagonMatTexture(anisotropy);
  const deckGeo = new THREE.CylinderGeometry(8.8, 9.2, 0.45, 8);
  const deck = new THREE.Mesh(deckGeo, [
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.65, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 })
  ]);
  deck.rotation.y = Math.PI / 8;
  deck.position.y = -0.225;
  deck.receiveShadow = true;
  group.add(deck);

  // 8 Corner Posts + Ropes/Cage Rails (only back + sides prominent, front lower rail so camera stays clear)
  const postMatSteel = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.75 });
  const padRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
  const padBlue = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.45 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45, metalness: 0.25 });

  const radius = 8.45;
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    corners.push(new THREE.Vector3(x, 0, z));

    // Skip front-facing posts that would block the fighting camera view
    if (z > 4.5) {
      continue;
    }

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.85, 10), postMatSteel);
    post.position.set(x, 0.925, z);
    post.castShadow = true;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 1.45, 10),
      i % 2 === 0 ? padRed : padBlue
    );
    pad.position.set(x, 0.9, z);
    group.add(post, pad);
  }

  for (let i = 0; i < 8; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 8];
    if (a.z > 4.5 && b.z > 4.5) {
      continue;
    }
    const len = a.distanceTo(b);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);

    [0.52, 1.04, 1.56].forEach((h, tier) => {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, len, 6),
        tier === 2 ? padRed : ropeMat
      );
      rail.position.set(mid.x, h, mid.z);
      rail.rotation.y = yaw;
      rail.rotation.x = Math.PI / 2;
      group.add(rail);
    });
  }

  // Overhead Lighting Rig & Glowing Crown
  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(6.8, 0.18, 8, 24),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.9,
      metalness: 0.7,
      roughness: 0.3
    })
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 7.4;
  group.add(crown);

  const spotBeams: THREE.Mesh[] = [];
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  [-4.2, 4.2].forEach((bx) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 7.6, 16, 1, true), beamMat);
    cone.position.set(bx, 3.6, -1.2);
    spotBeams.push(cone);
    group.add(cone);
  });

  // Instanced Crowd Silhouettes around back ring
  const crowdCount = 72;
  const crowdGeo = new THREE.CapsuleGeometry(0.28, 0.55, 4, 6);
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < crowdCount; i += 1) {
    const angle = Math.PI + ((i / (crowdCount - 1)) - 0.5) * Math.PI * 1.15;
    const tier = i % 3;
    const dist = 12.2 + tier * 2.1;
    dummy.position.set(Math.cos(angle) * dist, 0.3 + tier * 0.75, Math.sin(angle) * dist);
    dummy.rotation.y = -angle;
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
  }
  group.add(crowd);

  return {
    stageId: 'mma-octagon',
    group,
    backgroundColor: bg,
    fogColor: bg,
    fogNear: 14,
    fogFar: 42,
    update: (_dt, elapsedSec) => {
      spotBeams.forEach((b, idx) => {
        b.rotation.z = Math.sin(elapsedSec * 0.9 + idx * 1.5) * 0.14;
      });
    }
  };
}

function buildMongolSteppe(
  group: THREE.Group,
  anisotropy: number,
  allowShadow: boolean
): Arena3DInstance {
  const sky = 0xd9a76a;
  addStandardArenaLighting(group, 0xfef3c7, 0x4c7c38, 0.95, 0xffe4b5, 2.35, [8, 12, 6], 0x93c5fd, 0.65, allowShadow);

  const groundTex = createSteppeGroundTexture(anisotropy);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(64, 48),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.94, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Two Traditional White Mongolian Gers in the background
  const buildGer = (x: number, z: number, scale: number): void => {
    const ger = new THREE.Group();
    ger.position.set(x, 0, z);
    ger.scale.setScalar(scale);

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 1.35, 18),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85 })
    );
    wall.position.y = 0.675;
    wall.castShadow = true;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.25, 1.05, 18),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.82 })
    );
    roof.position.y = 1.88;
    roof.castShadow = true;

    const sash = new THREE.Mesh(
      new THREE.TorusGeometry(2.12, 0.055, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.6 })
    );
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.95;

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 1.05, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65 })
    );
    door.position.set(0, 0.52, 2.08);

    ger.add(wall, roof, sash, door);
    group.add(ger);
  };
  buildGer(-7.2, -9.5, 1.05);
  buildGer(7.6, -10.2, 0.95);

  // Nine White Banners (Есөн хөлт цагаан туг) behind the wrestling circle
  const banners: THREE.Mesh[] = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.65 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85 });
  const spearMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.85 });

  for (let i = -2; i <= 2; i += 1) {
    const x = i * 1.45;
    const z = -6.8 - Math.abs(i) * 0.35;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.6, 8), poleMat);
    pole.position.set(x, 1.8, z);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), spearMat);
    tip.position.set(x, 3.7, z);
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.08, 1.05, 8), clothMat);
    cloth.position.set(x, 2.85, z);
    banners.push(cloth);
    group.add(pole, tip, cloth);
  }

  // Instanced Distant Altai Mountain Ring along horizon
  const mtnCount = 24;
  const mtnGeo = new THREE.ConeGeometry(5.5, 9.5, 6);
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x576b7c, roughness: 0.95 });
  const mtns = new THREE.InstancedMesh(mtnGeo, mtnMat, mtnCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < mtnCount; i += 1) {
    const angle = (i / mtnCount) * Math.PI * 2;
    const dist = 36 + (i % 3) * 4;
    dummy.position.set(Math.cos(angle) * dist, 3.2, Math.sin(angle) * dist);
    dummy.scale.set(1.2 + (i % 3) * 0.35, 0.8 + (i % 4) * 0.25, 1.2);
    dummy.rotation.y = angle;
    dummy.updateMatrix();
    mtns.setMatrixAt(i, dummy.matrix);
  }
  group.add(mtns);

  return {
    stageId: 'mongol-steppe',
    group,
    backgroundColor: sky,
    fogColor: 0xe3b882,
    fogNear: 18,
    fogFar: 56,
    update: (_dt, elapsedSec) => {
      banners.forEach((b, idx) => {
        b.rotation.z = Math.sin(elapsedSec * 2.1 + idx * 0.6) * 0.1;
      });
    }
  };
}

function buildTokyoDojo(
  group: THREE.Group,
  anisotropy: number,
  allowShadow: boolean
): Arena3DInstance {
  const bg = 0x101324;
  addStandardArenaLighting(group, 0xfde68a, 0x3b2314, 0.85, 0xfdba74, 2.0, [5, 10, 6], 0x60a5fa, 0.85, allowShadow);

  const woodTex = createDojoWoodTexture(anisotropy);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.4, 14),
    new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.52, metalness: 0.08 })
  );
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);

  // Backlit Shoji Cedar Screen Wall
  const shojiMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
    roughness: 0.85
  });
  const cedarMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.75 });

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, 6.2, 0.18), shojiMat);
  backWall.position.set(0, 3.1, -6.2);
  group.add(backWall);

  // Timber pillars & horizontal lattice beams
  for (let x = -9; x <= 9; x += 3) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 6.4, 0.34), cedarMat);
    pillar.position.set(x, 3.2, -6.05);
    group.add(pillar);
  }
  [1.4, 3.0, 4.6, 6.0].forEach((y) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(20, 0.16, 0.26), cedarMat);
    beam.position.set(0, y, -6.05);
    group.add(beam);
  });

  // Glowing Cho-chin Paper Lanterns
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf97316,
    emissiveIntensity: 1.4,
    roughness: 0.6
  });
  const lanterns: THREE.Group[] = [];
  [-5.2, 5.2].forEach((lx) => {
    const g = new THREE.Group();
    g.position.set(lx, 4.4, -4.8);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.72, 12), lanternMat);
    const light = new THREE.PointLight(0xfb923c, 5.5, 11);
    light.position.y = -0.2;
    g.add(body, light);
    lanterns.push(g);
    group.add(g);
  });

  // Drifting Sakura Petals (Instanced)
  const petalCount = 48;
  const petalGeo = new THREE.PlaneGeometry(0.11, 0.08);
  const petalMat = new THREE.MeshBasicMaterial({ color: 0xf9a8d4, side: THREE.DoubleSide });
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, petalCount);
  const dummy = new THREE.Object3D();
  group.add(petals);

  return {
    stageId: 'tokyo-dojo',
    group,
    backgroundColor: bg,
    fogColor: bg,
    fogNear: 14,
    fogFar: 34,
    update: (_dt, elapsedSec) => {
      lanterns.forEach((l, idx) => {
        l.rotation.z = Math.sin(elapsedSec * 1.4 + idx) * 0.06;
      });
      for (let i = 0; i < petalCount; i += 1) {
        const px = ((i * 1.7 + elapsedSec * 0.55) % 16) - 8;
        const py = 5.4 - ((elapsedSec * (0.65 + (i % 4) * 0.12) + i * 0.4) % 5.2);
        const pz = -4.5 + (i % 7) * 0.85;
        dummy.position.set(px, py, pz);
        dummy.rotation.set(elapsedSec + i, elapsedSec * 0.7, i);
        dummy.updateMatrix();
        petals.setMatrixAt(i, dummy.matrix);
      }
      petals.instanceMatrix.needsUpdate = true;
    }
  };
}

function buildCyberColosseum(
  group: THREE.Group,
  anisotropy: number,
  allowShadow: boolean
): Arena3DInstance {
  const bg = 0x050816;
  addStandardArenaLighting(group, 0x38bdf8, 0x1e1b4b, 0.85, 0xe0f2fe, 2.0, [3, 12, 7], 0xf43f5e, 1.35, allowShadow);

  const cyberTex = createCyberGridTexture(anisotropy);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(42, 32),
    new THREE.MeshStandardMaterial({ map: cyberTex, roughness: 0.25, metalness: 0.75 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const neonCyanRing = new THREE.Mesh(
    new THREE.TorusGeometry(8.2, 0.09, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 1.8 })
  );
  neonCyanRing.rotation.x = Math.PI / 2;
  neonCyanRing.position.y = 0.04;
  group.add(neonCyanRing);

  // Towering Cyber Monolith Pillars (Instanced)
  const pillarCount = 12;
  const pillarGeo = new THREE.BoxGeometry(1.1, 11, 1.1);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0x1e1b4b,
    emissiveIntensity: 0.45,
    metalness: 0.8,
    roughness: 0.25
  });
  const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < pillarCount; i += 1) {
    const angle = Math.PI + ((i / (pillarCount - 1)) - 0.5) * Math.PI * 1.1;
    const dist = 13.5;
    dummy.position.set(Math.cos(angle) * dist, 5.5, Math.sin(angle) * dist);
    dummy.rotation.y = -angle;
    dummy.updateMatrix();
    pillars.setMatrixAt(i, dummy.matrix);
  }
  group.add(pillars);

  const holoArch = new THREE.Mesh(
    new THREE.TorusGeometry(6.8, 0.14, 8, 32, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 1.5 })
  );
  holoArch.position.set(0, 0.2, -7.2);
  group.add(holoArch);

  return {
    stageId: 'cyber-colosseum',
    group,
    backgroundColor: bg,
    fogColor: bg,
    fogNear: 14,
    fogFar: 38,
    update: (_dt, elapsedSec) => {
      neonCyanRing.rotation.z = elapsedSec * 0.25;
      (holoArch.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.2 + Math.sin(elapsedSec * 3) * 0.35;
    }
  };
}

function buildRooftop(
  group: THREE.Group,
  stageId: string,
  anisotropy: number,
  allowShadow: boolean,
  isSunset: boolean
): Arena3DInstance {
  const bg = isSunset ? 0x3b1725 : 0x0b1024;
  const fogColor = isSunset ? 0x9a3412 : 0x172042;
  addStandardArenaLighting(
    group,
    isSunset ? 0xfdba74 : 0x818cf8,
    0x1e293b,
    0.85,
    isSunset ? 0xfb923c : 0xc7d2fe,
    isSunset ? 2.4 : 1.9,
    [7, 10, -4],
    isSunset ? 0xfef08a : 0x38bdf8,
    1.1,
    allowShadow
  );

  const padTex = createHelipadTexture(anisotropy, isSunset);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(19, 0.8, 12.5),
    new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.78, metalness: 0.15 })
  );
  deck.position.y = -0.4;
  deck.receiveShadow = true;
  group.add(deck);

  // Perimeter Metal Safety Railing along the back edge
  const railMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.8 });
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.08, 0.08), railMat);
  topRail.position.set(0, 1.05, -5.95);
  group.add(topRail);
  for (let x = -8.5; x <= 8.5; x += 2.125) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.08, 8), railMat);
    post.position.set(x, 0.54, -5.95);
    group.add(post);
  }

  // Glowing Moon / Setting Sun orb on horizon
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 20, 16),
    new THREE.MeshBasicMaterial({ color: isSunset ? 0xfb923c : 0xe0e7ff })
  );
  orb.position.set(0, 6.2, -28);
  group.add(orb);

  // Instanced City Skyline Towers surrounding rooftop
  const towerCount = 26;
  const towerGeo = new THREE.BoxGeometry(2.6, 18, 2.6);
  const towerMat = new THREE.MeshStandardMaterial({
    color: isSunset ? 0x1c1421 : 0x0f172a,
    emissive: isSunset ? 0x451a03 : 0x1e293b,
    emissiveIntensity: 0.35,
    roughness: 0.6
  });
  const skyline = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < towerCount; i += 1) {
    const angle = Math.PI + ((i / (towerCount - 1)) - 0.5) * Math.PI * 1.25;
    const dist = 16 + (i % 4) * 4.5;
    const hScale = 0.5 + ((i * 7) % 5) * 0.25;
    dummy.position.set(Math.cos(angle) * dist, -4 + hScale * 6, Math.sin(angle) * dist);
    dummy.scale.set(1, hScale, 1);
    dummy.updateMatrix();
    skyline.setMatrixAt(i, dummy.matrix);
  }
  group.add(skyline);

  return {
    stageId,
    group,
    backgroundColor: bg,
    fogColor,
    fogNear: 15,
    fogFar: 44,
    update: () => {}
  };
}
