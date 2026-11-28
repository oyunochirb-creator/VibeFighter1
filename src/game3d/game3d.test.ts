import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { resolveFighterAppearance } from '../game/fighterAppearance';
import { FIGHTER_CHARACTER_DEFINITIONS } from '../game/hero';
import { STAGE_DEFINITIONS } from '../game/stageConfig';
import { WORLD_MARTIAL_ARTS } from '../game/worldMartialArts';
import type { Game3DAudio } from './audio3d';
import { Match3DSimulation } from './combat3d';
import { createFighterRig3D } from './fighterRig3d';
import { loadFighterSpritePack25D, transformSpriteSheetPixels } from './spriteSheet3d';
import type { Vfx3DManager } from './vfx3d';

describe('2.5D Fighter Rigs, Face/Outfit Variations, Tekken 7 Poses & Stages Coverage', () => {
  it('preserves all 68 fighters and builds 2.5D rigs supporting all custom & Tekken 7 poses', async () => {
    const dummyTex = new THREE.Texture();
    expect(FIGHTER_CHARACTER_DEFINITIONS.length).toBeGreaterThanOrEqual(68);

    // In Node Vitest without DOM canvas, loadFighterSpritePack25D resolves safely to null
    const nodePack = await loadFighterSpritePack25D('bayasaa');
    expect(nodePack).toBeNull();

    for (const def of FIGHTER_CHARACTER_DEFINITIONS) {
      const rig = createFighterRig3D(def.id, dummyTex);
      expect(rig.root.children.length).toBeGreaterThanOrEqual(4);
      expect(rig.hips.position.y).toBeGreaterThan(0.8);

      rig.setFacing(1);
      rig.setRageActive(true, 0.5);
      rig.setAuraActive(true, undefined, 0.75);
      rig.setTintFlash(0xfb923c, 0.7);
      rig.setTintFlash(null);

      rig.updatePose(0.016, 'idle', 0, 1.0, 0, 1);
      rig.updatePose(0.016, 'sidestep', 0.4, 1.0, 0, 1);
      rig.updatePose(0.016, 'icyCharge', 0.5, 1.0, 0, 1);
      rig.updatePose(0.016, 'icyBodyShot', 0.5, 1.0, 0, 1);
      rig.updatePose(0.016, 'roundhouse540', 0.6, 1.0, 0, 1);
      rig.updatePose(0.016, 'duckUnder', 0.4, 1.0, 0, 1);
      rig.updatePose(0.016, 'choker', 0.5, 1.0, 0, 1);
      rig.updatePose(0.016, 'slammed', 0.6, 1.0, 0, 1);
      rig.updatePose(0.016, 'rageArt', 0.5, 1.0, 0, 1);
      rig.updatePose(0.016, 'victory', 0.5, 1.0, 0, 1);
      rig.updatePose(0.016, 'liverDowned', 0.8, 1.0, 0, 1);
      rig.updatePose(0.016, 'ko', 1.0, 1.0, 0, 1);
    }

    dummyTex.dispose();
  });

  it('triggers Winner banner and brief victory pose when a player drops to zero health', () => {
    const dummyTex = new THREE.Texture();
    const p1Rig = createFighterRig3D('mongol-bokh', dummyTex);
    const p2Rig = createFighterRig3D('bayasaa', dummyTex);

    const posesSeenP1: string[] = [];
    const origUpdateP1 = p1Rig.updatePose;
    p1Rig.updatePose = (dt, pose, progress, elapsedSec, h, scale) => {
      posesSeenP1.push(pose);
      origUpdateP1(dt, pose, progress, elapsedSec, h, scale);
    };

    const noop = () => {};
    const musicMoods: string[] = [];
    const koPhrases: string[] = [];
    const vfxStub = {
      clear: noop,
      spawnShockwave: noop,
      spawnHitSpark: noop,
      spawnBlockRipple: noop,
      addCallout: noop,
      attachTriangleRing: () => noop
    } as unknown as Vfx3DManager;
    const audioStub = {
      setMusicMood: (mood: string) => {
        musicMoods.push(mood);
      },
      playAnnouncerPhrase: noop,
      playHit: noop,
      playKnockOut: (phrase = 'Knock Out!') => {
        koPhrases.push(phrase);
      },
      playWhoosh: noop,
      playJump: noop,
      playSuperActivate: noop
    } as unknown as Game3DAudio;

    const sim = new Match3DSimulation(
      { mode: '1v1', stageId: 'mma-octagon', p1CharacterId: 'mongol-bokh', p2CharacterId: 'bayasaa' },
      p1Rig,
      p2Rig,
      {
        characterId: 'mongol-bokh',
        stats: {},
        combat: {},
        bounds: { visual: false, collision: false, hit: false, attack: false, guard: false },
        reverseWalk: false,
        fillSpecial: false,
        saveStatus: ''
      },
      vfxStub,
      audioStub
    );

    const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 140);
    // Advance past intro (1.25s) into fighting
    for (let i = 0; i < 40; i += 1) {
      sim.update(0.05, camera);
    }
    expect(sim.getSnapshot().phase).toBe('fighting');

    // Drop P2's health to 0
    const internal = sim as unknown as { p2: { health: number } };
    internal.p2.health = 0;

    // Step through KO detection + 0.85s slow-mo + 0.42s K.O. reveal -> Winner banner
    let sawWinnerBanner = false;
    posesSeenP1.length = 0;
    for (let i = 0; i < 65; i += 1) {
      sim.update(0.05, camera);
      const snap = sim.getSnapshot();
      if (snap.winnerBanner?.title === 'WINNER' && snap.winnerBanner.side === 1) {
        sawWinnerBanner = true;
        break;
      }
    }

    expect(sawWinnerBanner).toBe(true);
    expect(posesSeenP1).toContain('victory');
    expect(koPhrases).toContain('Knock Out!');
    expect(musicMoods).toContain('victory');
    dummyTex.dispose();
  });

  it('applies subtle face, hair, headband, and outfit modifications for overlapping fighters', () => {
    const W = 256;
    const H = 256;
    const paint = (
      buf: Uint8ClampedArray,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      r: number,
      g: number,
      b: number
    ): void => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const i = (y * W + x) * 4;
          buf[i] = r;
          buf[i + 1] = g;
          buf[i + 2] = b;
          buf[i + 3] = 255;
        }
      }
    };

    // Synthetic Taekwondo-like white dobok + blue guard + brown hair + peach face
    const karateData = new Uint8ClampedArray(W * H * 4);
    paint(karateData, 118, 28, 138, 36, 40, 32, 28); // dark brown hair
    paint(karateData, 118, 37, 136, 56, 232, 180, 140); // face skin
    paint(karateData, 110, 80, 146, 160, 238, 240, 244); // white dobok
    paint(karateData, 108, 115, 116, 135, 36, 98, 214); // blue arm guard

    const karateBefore = karateData.slice();
    transformSpriteSheetPixels(karateData, W, H, 'taekwondo', resolveFighterAppearance('karate'));

    // Hair shifted, face/headband modified, blue guard shifted toward crimson
    const hairIdx = (32 * W + 128) * 4;
    expect(karateData[hairIdx]).not.toBe(karateBefore[hairIdx]);
    const guardIdx = (124 * W + 112) * 4;
    expect(karateData[guardIdx]).toBeGreaterThan(karateData[guardIdx + 2]); // more red than blue now

    // Blue Striker faceAndShirtOnly keeps royal blue jacket while tweaking face/hair
    const blueData = new Uint8ClampedArray(W * H * 4);
    paint(blueData, 118, 28, 138, 36, 92, 54, 30); // spiky brown hair
    paint(blueData, 118, 37, 136, 56, 235, 182, 140); // face
    paint(blueData, 110, 76, 146, 128, 28, 86, 215); // royal blue jacket
    const jacketBeforeIdx = (96 * W + 128) * 4;
    const jacketBeforeR = blueData[jacketBeforeIdx];
    const jacketBeforeB = blueData[jacketBeforeIdx + 2];

    transformSpriteSheetPixels(blueData, W, H, 'blue-striker', resolveFighterAppearance('blue-striker'), {
      faceAndShirtOnly: true
    });
    expect(blueData[jacketBeforeIdx]).toBe(jacketBeforeR);
    expect(blueData[jacketBeforeIdx + 2]).toBe(jacketBeforeB);
    expect(blueData[(32 * W + 128) * 4]).not.toBe(92); // hair changed cleanly
  });

  it('ensures no two fighters sharing an archetype have identical appearance palettes', () => {
    const signatures = new Set<string>();
    for (const art of WORLD_MARTIAL_ARTS) {
      const a = resolveFighterAppearance(art.id);
      const sig = `${art.baseArchetypeId}:${a.outfitPrimary}:${a.outfitSecondary}:${a.facialFeature}:${a.headgear}`;
      expect(signatures.has(sig)).toBe(false);
      signatures.add(sig);
    }
  });

  it('defines all 6 selectable 3D stage IDs', () => {
    const ids = STAGE_DEFINITIONS.map((s) => s.id);
    expect(ids).toEqual([
      'mma-octagon',
      'mongol-steppe',
      'tokyo-dojo',
      'cyber-colosseum',
      'rooftop-twilight',
      'rooftop-sunset'
    ]);
  });
});
