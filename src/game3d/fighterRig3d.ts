import * as THREE from 'three';

import { getMartialArtMeta } from '../game/worldMartialArts';
import {
  loadFighterSpritePack25D,
  type FighterSpritePack25D,
  type SpriteActionKey
} from './spriteSheet3d';

export type FighterPoseState =
  | 'idle'
  | 'walkForward'
  | 'walkBackward'
  | 'dash'
  | 'sidestep'
  | 'crouch'
  | 'jump'
  | 'blockHigh'
  | 'blockLow'
  | 'hit'
  | 'ko'
  | 'liverDowned'
  | 'lightPunch'
  | 'crouchLight'
  | 'heavyKick'
  | 'sweep'
  | 'throw'
  | 'frontKick'
  | 'spinHookKick'
  | 'spin360Kick'
  | 'roundhouse540'
  | 'icyCharge'
  | 'icyBodyShot'
  | 'duckUnder'
  | 'choker'
  | 'trapped'
  | 'slammer'
  | 'slammed'
  | 'tigerKnee'
  | 'tornadoKick'
  | 'weaponSlash'
  | 'cycloneStrike'
  | 'spiritStrike'
  | 'specialCharge'
  | 'special'
  | 'rageArt'
  | 'victory';

export interface FighterRig3D {
  characterId: string;
  root: THREE.Group;
  model: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  auraRing: THREE.Mesh;
  shadow: THREE.Mesh;
  tintOverlayMatList: THREE.MeshStandardMaterial[];
  setFacing: (facing: 1 | -1) => void;
  setTurntableYaw: (yaw: number) => void;
  setAuraActive: (active: boolean, colorHex?: number, intensity?: number) => void;
  setRageActive: (rage: boolean, elapsedSec?: number) => void;
  setTintFlash: (colorHex: number | null, strength?: number) => void;
  updatePose: (
    dt: number,
    pose: FighterPoseState,
    poseProgress: number,
    elapsedSec: number,
    heightAboveGround: number,
    scale?: number
  ) => void;
  getHeadWorldPosition: (target: THREE.Vector3) => THREE.Vector3;
  getRightHandWorldPosition: (target: THREE.Vector3) => THREE.Vector3;
}

export const SPRITE_PLANE_SIZE = 2.38;

/**
 * Computes the sprite plane center Y (in meters) that keeps the frame's lowest
 * opaque pixel (`bottomY` in 0..255) flush on or above the arena floor (`y >= 0`).
 */
export function computeGroundedPlaneY(bottomY: number, pose: FighterPoseState): number {
  const clamped = Math.max(227, Math.min(255, bottomY));
  // Airborne kick/special tuck frames still lift cleanly while grounded feet never dip < 0
  if (pose === 'ko' || pose === 'liverDowned') {
    return SPRITE_PLANE_SIZE * (0.5 - (255 - Math.max(229, clamped)) / 256);
  }
  return SPRITE_PLANE_SIZE * (0.5 - (255 - clamped) / 256);
}

/**
 * Resolves the active frame index for both looping moves and held one-shot
 * poses (crouch, low block, jump, hit, knockdown) so crouch holds smoothly
 * on its final low squat frame instead of freezing on frame 0 upright.
 */
export function resolvePoseFrameIndex(
  pose: FighterPoseState,
  entryFrames: number,
  frameRate: number,
  poseProgress: number,
  poseElapsedSec: number,
  globalElapsedSec: number
): number {
  const safeFrames = Math.max(1, entryFrames);
  if (safeFrames === 1) {
    return 0;
  }
  if (isOneShotPose(pose)) {
    if (poseProgress > 0) {
      const p = THREE.MathUtils.clamp(poseProgress, 0, 0.999);
      return Math.min(safeFrames - 1, Math.floor(p * safeFrames));
    }
    const naturalProgress = THREE.MathUtils.clamp((poseElapsedSec * frameRate) / safeFrames, 0, 0.999);
    return Math.min(safeFrames - 1, Math.floor(naturalProgress * safeFrames));
  }
  const rate = pose === 'dash' || pose === 'sidestep' ? frameRate * 1.45 : frameRate;
  return Math.floor(globalElapsedSec * rate) % safeFrames;
}

function mapPoseToAction(pose: FighterPoseState): SpriteActionKey {
  switch (pose) {
    case 'idle':
    case 'victory':
      return 'idle';
    case 'walkForward':
    case 'dash':
    case 'sidestep':
    case 'slammer':
      return 'walk-forward';
    case 'walkBackward':
      return 'walk-backward';
    case 'crouch':
    case 'duckUnder':
    case 'choker':
      return 'crouch';
    case 'crouchLight':
      return 'crouch-punch';
    case 'jump':
      return 'jump';
    case 'blockHigh':
      return 'block-high';
    case 'blockLow':
      return 'block-low';
    case 'hit':
    case 'trapped':
    case 'slammed':
      return 'hit-high';
    case 'ko':
    case 'liverDowned':
      return 'knockdown';
    case 'lightPunch':
    case 'throw':
    case 'icyBodyShot':
      return 'light-punch';
    case 'sweep':
      return 'sweep';
    case 'heavyKick':
    case 'frontKick':
    case 'spinHookKick':
    case 'spin360Kick':
    case 'roundhouse540':
    case 'tigerKnee':
    case 'tornadoKick':
      return 'heavy-kick';
    case 'icyCharge':
    case 'specialCharge':
      return 'special-charge';
    case 'weaponSlash':
    case 'cycloneStrike':
    case 'spiritStrike':
    case 'special':
    case 'rageArt':
      return 'special';
  }
}

function isOneShotPose(pose: FighterPoseState): boolean {
  return (
    pose !== 'idle' &&
    pose !== 'walkForward' &&
    pose !== 'walkBackward' &&
    pose !== 'dash' &&
    pose !== 'sidestep' &&
    pose !== 'victory' &&
    pose !== 'icyCharge' &&
    pose !== 'specialCharge' &&
    pose !== 'choker' &&
    pose !== 'trapped'
  );
}

/**
 * Builds a True 2.5D Fighter Rig inside the Three.js 3D Arena:
 * renders the character's real high-detail pose spritesheets (or HSL-recolored
 * cultural sheets for the 60 World Martial Arts) on a double-sided lit 3D plane
 * with dynamic 3D spin/lean/slam motion, 3D ground contact shadow, Spirit Aura,
 * and Tekken 7 Crimson Rage Ring.
 */
export function createFighterRig3D(characterId: string, contactShadowTex: THREE.Texture): FighterRig3D {
  const meta = getMartialArtMeta(characterId);
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  // Structural anchor groups preserved for world-space VFX tracking (e.g. Triangle Choke)
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  const spine = new THREE.Group();
  spine.position.y = 0.14;
  const chest = new THREE.Group();
  chest.position.y = 0.28;
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.28, 0);
  chest.add(headGroup);
  spine.add(chest);
  hips.add(spine);

  const leftShoulder = new THREE.Group();
  const leftElbow = new THREE.Group();
  const rightShoulder = new THREE.Group();
  const rightElbow = new THREE.Group();
  const rightHand = new THREE.Group();
  rightHand.position.set(0.35, -0.1, 0);
  rightElbow.add(rightHand);
  rightShoulder.add(rightElbow);
  chest.add(leftShoulder, rightShoulder);

  const leftHip = new THREE.Group();
  const leftKnee = new THREE.Group();
  const rightHip = new THREE.Group();
  const rightKnee = new THREE.Group();
  hips.add(leftHip, rightHip);
  model.add(hips);

  // 3D Ground Contact Shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, 0.92),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.016;
  root.add(shadow);

  // Spirit Aura Ring
  const auraColor = meta?.primaryColor ?? 0x38bdf8;
  const auraRing = new THREE.Mesh(
    new THREE.RingGeometry(0.56, 0.88, 28),
    new THREE.MeshBasicMaterial({
      color: auraColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    })
  );
  auraRing.rotation.x = -Math.PI / 2;
  auraRing.position.y = 0.025;
  root.add(auraRing);

  // Tekken 7 Crimson Rage Ring (< 30% HP)
  const rageRing = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.98, 32),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    })
  );
  rageRing.rotation.x = -Math.PI / 2;
  rageRing.position.y = 0.028;
  root.add(rageRing);

  // 2.5D Sprite Cutout Plane (2.38m square; pixel y=229 feet line sits flush at y=0)
  const spriteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.42,
    transparent: true,
    alphaTest: 0.14,
    roughness: 0.85,
    metalness: 0.04,
    side: THREE.DoubleSide
  });

  const spritePlane = new THREE.Mesh(new THREE.PlaneGeometry(SPRITE_PLANE_SIZE, SPRITE_PLANE_SIZE), spriteMat);
  spritePlane.position.y = computeGroundedPlaneY(229, 'idle');
  spritePlane.visible = false; // Revealed immediately once sprite sheet resolves
  model.add(spritePlane);

  const tintOverlayMatList: THREE.MeshStandardMaterial[] = [spriteMat];

  // Isolated per-frame Texture Cache so zero UV bleed or double-sprite slivers occur
  const frameTextureMap = new Map<string, THREE.CanvasTexture>();
  let spritePack: FighterSpritePack25D | null = null;
  let activeFrameKey: string | null = null;

  const getRigFrameTexture = (action: SpriteActionKey, frameIdx: number, frameCanvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const key = `${action}:${frameIdx}`;
    let tex = frameTextureMap.get(key);
    if (!tex) {
      tex = new THREE.CanvasTexture(frameCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      frameTextureMap.set(key, tex);
    }
    return tex;
  };

  let isDisposed = false;
  void loadFighterSpritePack25D(characterId).then((pack) => {
    if (pack && !isDisposed) {
      spritePack = pack;
      const idleEntry = pack.getAction('idle');
      const f0 = idleEntry.frameList[0];
      const tex = getRigFrameTexture('idle', 0, f0 ? f0.canvas : idleEntry.canvas);
      activeFrameKey = 'idle:0';
      spriteMat.map = tex;
      spriteMat.emissiveMap = tex;
      spriteMat.needsUpdate = true;
      spritePlane.position.y = computeGroundedPlaneY(f0 ? f0.bottomY : 229, 'idle');
      spritePlane.visible = true;
    }
  });

  let currentFacing: 1 | -1 = 1;
  let turntableMode = false;
  let turntableYaw = 0;
  let isRageOn = false;
  let wasIcyCharge = false;
  let wasVictory = false;
  let victoryElapsed = 0;
  let flashOverrideColor: number | null = null;
  let lastPose: FighterPoseState = 'idle';
  let poseElapsedSec = 0;
  let smoothedExtraLiftY = 0;

  const setFacing = (facing: 1 | -1): void => {
    currentFacing = facing;
    turntableMode = false;
    // Bundled sprites face LEFT (-X); scale.x = -1 mirrors cleanly to face RIGHT (+X)
    spritePlane.scale.x = facing > 0 ? -1 : 1;
    rightHand.position.x = facing * 0.35;
  };

  const setTurntableYaw = (yaw: number): void => {
    turntableMode = true;
    // Gentle 2.5D showcase tilt so the sprite portrait stays expressive without turning edge-on
    turntableYaw = Math.sin(yaw) * 0.32;
    model.rotation.y = turntableYaw;
  };

  const setAuraActive = (active: boolean, colorHex?: number, intensity = 0.72): void => {
    const mat = auraRing.material as THREE.MeshBasicMaterial;
    if (colorHex !== undefined) {
      mat.color.setHex(colorHex);
    }
    mat.opacity = active ? intensity : 0;
  };

  const applyBaseEmissive = (): void => {
    if (flashOverrideColor !== null) {
      return;
    }
    if (isRageOn) {
      spriteMat.color.setHex(0xffd2d2);
      spriteMat.emissive.setHex(0xff3b3b);
      spriteMat.emissiveIntensity = 0.56;
    } else if (wasVictory) {
      spriteMat.color.setHex(0xfffbeb);
      spriteMat.emissive.setHex(0xfde047);
      spriteMat.emissiveIntensity = 0.5;
    } else {
      spriteMat.color.setHex(0xffffff);
      spriteMat.emissive.setHex(0xffffff);
      spriteMat.emissiveIntensity = 0.42;
    }
  };

  const setRageActive = (rage: boolean, elapsedSec = 0): void => {
    isRageOn = rage;
    const mat = rageRing.material as THREE.MeshBasicMaterial;
    if (rage) {
      mat.opacity = 0.48 + 0.35 * Math.sin(elapsedSec * 9.5);
      rageRing.scale.setScalar(1 + 0.08 * Math.sin(elapsedSec * 12));
    } else {
      mat.opacity = 0;
    }
    applyBaseEmissive();
  };

  const setTintFlash = (colorHex: number | null, strength = 0.65): void => {
    flashOverrideColor = colorHex;
    if (colorHex === null) {
      applyBaseEmissive();
    } else {
      spriteMat.color.setHex(colorHex);
      spriteMat.emissive.setHex(colorHex);
      spriteMat.emissiveIntensity = Math.max(0.55, strength);
    }
  };

  const updatePose = (
    dt: number,
    pose: FighterPoseState,
    poseProgress: number,
    elapsedSec: number,
    heightAboveGround: number,
    scale = 1
  ): void => {
    if (pose !== lastPose) {
      lastPose = pose;
      poseElapsedSec = 0;
    } else {
      poseElapsedSec += dt;
    }

    const lift = THREE.MathUtils.clamp(heightAboveGround / 2.2, 0, 1);
    shadow.scale.setScalar((1 - lift * 0.45) * scale);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.6 - lift * 0.36;

    const action = mapPoseToAction(pose);
    let isFallbackPose = false;
    let frameBottomY = 229;

    if (spritePack) {
      const entry = spritePack.getAction(action);
      isFallbackPose = entry.isFallbackPose;
      const frameIdx = resolvePoseFrameIndex(pose, entry.frames, entry.frameRate, poseProgress, poseElapsedSec, elapsedSec);
      const frameObj = entry.frameList[frameIdx] ?? entry.frameList[0];
      if (frameObj) {
        frameBottomY = frameObj.bottomY;
      }

      const key = `${action}:${frameIdx}`;
      const tex = getRigFrameTexture(action, frameIdx, frameObj ? frameObj.canvas : entry.canvas);
      if (activeFrameKey !== key || spriteMat.map !== tex) {
        activeFrameKey = key;
        spriteMat.map = tex;
        spriteMat.emissiveMap = tex;
        spriteMat.needsUpdate = true;
      }
      spritePlane.visible = true;
    }

    // Never vertically squash or sink spritePlane below y=0
    spritePlane.scale.y = 1;
    let basePlaneY = computeGroundedPlaneY(frameBottomY, pose);
    let extraLiftY = 0;
    let planeShiftX = 0;
    let rotY = turntableMode ? turntableYaw : 0;
    let rotZ = 0;
    const rotX = 0;
    let headY = 0.28;

    if (
      pose === 'crouch' ||
      pose === 'crouchLight' ||
      pose === 'blockLow' ||
      pose === 'sweep' ||
      pose === 'duckUnder' ||
      pose === 'choker' ||
      pose === 'trapped'
    ) {
      headY = -0.15;
    }

    let effectiveScale = scale;

    if (pose === 'victory') {
      if (!wasVictory) {
        wasVictory = true;
        victoryElapsed = 0;
        applyBaseEmissive();
      }
      victoryElapsed += dt;
    } else if (wasVictory) {
      wasVictory = false;
      victoryElapsed = 0;
      applyBaseEmissive();
    }

    if (pose === 'icyCharge') {
      rotZ = currentFacing * 0.1;
      wasIcyCharge = true;
      spriteMat.color.setHex(0xbae6fd);
      spriteMat.emissive.setHex(0x38bdf8);
      spriteMat.emissiveIntensity = 0.65;
    } else {
      if (wasIcyCharge) {
        wasIcyCharge = false;
        applyBaseEmissive();
      }
      if (pose === 'lightPunch' || pose === 'crouchLight') {
        const snap = Math.sin(THREE.MathUtils.clamp(poseProgress, 0, 1) * Math.PI);
        planeShiftX = currentFacing * 0.09 * snap;
        rotZ = -currentFacing * 0.055 * snap;
      } else if (pose === 'icyBodyShot' || pose === 'spiritStrike' || pose === 'weaponSlash' || pose === 'throw') {
        const snap = Math.sin(THREE.MathUtils.clamp(poseProgress, 0, 1) * Math.PI);
        planeShiftX = currentFacing * 0.14 * snap;
        rotZ = -currentFacing * 0.085 * snap;
      } else if (pose === 'heavyKick' || pose === 'frontKick' || pose === 'sweep') {
        const snap = Math.sin(THREE.MathUtils.clamp(poseProgress, 0, 1) * Math.PI);
        planeShiftX = currentFacing * 0.11 * snap;
      } else if (pose === 'sidestep') {
        rotZ = Math.sin(elapsedSec * 16) * 0.09 * currentFacing;
      } else if (pose === 'hit') {
        rotZ = currentFacing * 0.13;
      } else if (pose === 'ko' || pose === 'liverDowned') {
        headY = -0.75;
        if (isFallbackPose || pose === 'liverDowned') {
          rotZ = currentFacing * Math.PI * 0.44;
          basePlaneY = 0.44;
        }
      } else if (pose === 'slammed') {
        if (poseProgress < 0.72) {
          extraLiftY = Math.sin((poseProgress / 0.72) * (Math.PI / 2)) * 1.3;
          rotZ = currentFacing * (poseProgress / 0.72) * Math.PI * 0.88;
        } else {
          basePlaneY = 0.44;
          rotZ = currentFacing * Math.PI * 0.46;
        }
      } else if (
        pose === 'spinHookKick' ||
        pose === 'spin360Kick' ||
        pose === 'roundhouse540' ||
        pose === 'tornadoKick' ||
        pose === 'cycloneStrike'
      ) {
        const turns =
          pose === 'tornadoKick'
            ? 4
            : pose === 'roundhouse540'
              ? 3
              : pose === 'spin360Kick' || pose === 'cycloneStrike'
                ? 2
                : 1.2;
        rotY = currentFacing * poseProgress * Math.PI * turns;
      } else if (pose === 'rageArt') {
        rotZ = -currentFacing * 0.1 * Math.sin(poseProgress * Math.PI);
      } else if (pose === 'victory') {
        const leapDur = 0.48;
        if (victoryElapsed < leapDur) {
          const t = victoryElapsed / leapDur;
          extraLiftY = Math.sin(t * Math.PI) * 0.28;
          rotZ = -currentFacing * 0.07 * Math.sin(t * Math.PI);
          effectiveScale = scale * (1 + 0.08 * Math.sin(t * Math.PI));
        } else {
          const swayT = victoryElapsed - leapDur;
          extraLiftY = Math.abs(Math.sin(swayT * 4.2)) * 0.05;
          rotZ = -currentFacing * 0.03;
          effectiveScale = scale * 1.05;
        }
      }
    }

    // Compensate any body tilt around feet pivot so boots/ankles never dip below y=0
    if (pose !== 'ko' && pose !== 'liverDowned' && pose !== 'slammed' && rotZ !== 0) {
      extraLiftY += Math.abs(Math.sin(rotZ)) * 0.18;
    }

    smoothedExtraLiftY = THREE.MathUtils.damp(smoothedExtraLiftY, extraLiftY, 18, dt);
    model.scale.setScalar(effectiveScale);
    spritePlane.position.y = basePlaneY + Math.max(0, smoothedExtraLiftY);
    spritePlane.position.x = THREE.MathUtils.damp(spritePlane.position.x, planeShiftX, 20, dt);
    model.rotation.x = THREE.MathUtils.damp(model.rotation.x, rotX, 18, dt);
    model.rotation.y =
      pose === 'spinHookKick' ||
      pose === 'spin360Kick' ||
      pose === 'roundhouse540' ||
      pose === 'tornadoKick' ||
      pose === 'cycloneStrike'
        ? rotY
        : THREE.MathUtils.damp(model.rotation.y, rotY, 16, dt);
    model.rotation.z = THREE.MathUtils.damp(model.rotation.z, rotZ, 18, dt);
    headGroup.position.y = headY;
  };

  const getHeadWorldPosition = (target: THREE.Vector3): THREE.Vector3 => {
    headGroup.getWorldPosition(target);
    return target;
  };

  const getRightHandWorldPosition = (target: THREE.Vector3): THREE.Vector3 => {
    rightHand.getWorldPosition(target);
    return target;
  };

  // Guard against stray late texture hydration and dispose all cached action textures cleanly
  root.userData.onDispose = () => {
    isDisposed = true;
    for (const tex of frameTextureMap.values()) {
      tex.dispose();
    }
    frameTextureMap.clear();
  };

  setFacing(1);

  return {
    characterId,
    root,
    model,
    hips,
    spine,
    chest,
    headGroup,
    leftShoulder,
    leftElbow,
    rightShoulder,
    rightElbow,
    leftHip,
    leftKnee,
    rightHip,
    rightKnee,
    auraRing,
    shadow,
    tintOverlayMatList,
    setFacing,
    setTurntableYaw,
    setAuraActive,
    setRageActive,
    setTintFlash,
    updatePose,
    getHeadWorldPosition,
    getRightHandWorldPosition
  };
}
