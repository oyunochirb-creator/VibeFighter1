import { describe, expect, it } from 'vitest';

import {
  buildCombatAttackProfile,
  canCancelMove,
  DoubleTapDashTracker,
  hasSuperArmor,
  isAttackGuarded,
  isOneHitKoRange,
  nextBayasaaKickStep
} from './combatActions';
import { DEFAULT_FIGHTER_COMBAT } from './fighterConfig';

describe('DoubleTapDashTracker', () => {
  it('detects a double-tap in the same direction within the time window', () => {
    const tracker = new DoubleTapDashTracker();

    expect(tracker.update(false, true, 100)).toBe(0);
    expect(tracker.update(false, true, 250)).toBe(1);
    expect(tracker.update(false, true, 320)).toBe(0);
  });

  it('does not trigger a dash if the second tap is too slow or reversed', () => {
    const tracker = new DoubleTapDashTracker();

    expect(tracker.update(true, false, 100)).toBe(0);
    expect(tracker.update(false, true, 180)).toBe(0);
    expect(tracker.update(false, true, 500)).toBe(0);
  });
});

describe('isAttackGuarded', () => {
  it('enforces high, low, overhead, and unblockable guard rules', () => {
    expect(isAttackGuarded(false, false, 'high')).toBe(false);
    expect(isAttackGuarded(true, false, 'high')).toBe(true);
    expect(isAttackGuarded(true, true, 'high')).toBe(true);

    expect(isAttackGuarded(true, false, 'low')).toBe(false);
    expect(isAttackGuarded(true, true, 'low')).toBe(true);

    expect(isAttackGuarded(true, false, 'overhead')).toBe(true);
    expect(isAttackGuarded(true, true, 'overhead')).toBe(false);

    expect(isAttackGuarded(true, false, 'unblockable')).toBe(false);
    expect(isAttackGuarded(true, true, 'unblockable')).toBe(false);
  });
});

describe('canCancelMove and buildCombatAttackProfile', () => {
  it('allows chaining connected lights into heavies or meter moves', () => {
    expect(canCancelMove('light', 'heavy', false)).toBe(false);
    expect(canCancelMove('light', 'heavy', true)).toBe(true);
    expect(canCancelMove('crouchLight', 'sweep', true)).toBe(true);
    expect(canCancelMove('heavy', 'exBurst', true)).toBe(true);
    expect(canCancelMove('heavy', 'light', true)).toBe(false);
  });

  it('builds distinct profiles for sweep, overhead, throw, exBurst, and signature moves', () => {
    const sweep = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'sweep');
    const airHeavy = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'airHeavy');
    const grab = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'throw');
    const ex = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'exBurst');
    const bodyShot = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'icyBodyShot');
    const kick540 = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'roundhouse540');
    const tigerKnee = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'tigerKnee');
    const tornadoKick = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'tornadoKick');

    expect(sweep.defenseHeight).toBe('low');
    expect(airHeavy.defenseHeight).toBe('overhead');
    expect(grab.defenseHeight).toBe('unblockable');
    expect(ex.damage).toBeGreaterThan(DEFAULT_FIGHTER_COMBAT.lowDamage);
    expect(bodyShot.defenseHeight).toBe('unblockable');
    expect(bodyShot.damage).toBeGreaterThan(DEFAULT_FIGHTER_COMBAT.lowDamage);
    expect(kick540.callout).toBe('540° ROUNDHOUSE!');
    expect(tigerKnee.defenseHeight).toBe('unblockable');
    expect(tigerKnee.callout).toBe('TIGER KNEE!');
    expect(tornadoKick.defenseHeight).toBe('unblockable');
    expect(tornadoKick.callout).toBe('TORNADO KICK!');
  });
});

import { getFighterAppearance } from './fighterAppearance';
import {
  getWorldMartialArtsByCategory,
  MARTIAL_ART_CATEGORIES,
  WORLD_MARTIAL_ARTS
} from './worldMartialArts';

describe('character signature helpers', () => {
  it('grants super armor only to blue-striker', () => {
    expect(hasSuperArmor('blue-striker')).toBe(true);
    expect(hasSuperArmor('bayasaa')).toBe(false);
    expect(hasSuperArmor('red-brawler')).toBe(false);
  });

  it('detects 1-hit KO range accurately', () => {
    expect(isOneHitKoRange(20, 22)).toBe(true);
    expect(isOneHitKoRange(22, 22)).toBe(true);
    expect(isOneHitKoRange(23, 22)).toBe(false);
    expect(isOneHitKoRange(0, 22)).toBe(false);
  });

  it('cycles Bayasaa 3-step heavy kick combo within window and resets after 3 or expiry', () => {
    expect(nextBayasaaKickStep(0, 100)).toBe(1);
    expect(nextBayasaaKickStep(1, 300)).toBe(2);
    expect(nextBayasaaKickStep(2, 300)).toBe(3);
    expect(nextBayasaaKickStep(3, 300)).toBe(1);
    expect(nextBayasaaKickStep(1, 1200)).toBe(1);
  });
});

describe('world martial arts roster', () => {
  it('covers all 6 categories and 64 unique playable disciplines with country animals', () => {
    expect(WORLD_MARTIAL_ARTS).toHaveLength(64);
    for (const cat of MARTIAL_ART_CATEGORIES) {
      expect(getWorldMartialArtsByCategory(cat.id).length).toBeGreaterThan(0);
    }
    for (const art of WORLD_MARTIAL_ARTS) {
      expect(art.countryMn.length).toBeGreaterThan(0);
      expect(art.animalMn.length).toBeGreaterThan(0);
      expect(art.baseArchetypeId.length).toBeGreaterThan(0);
    }
  });

  it('assigns distinct face, hair, headgear, and uniform profiles to all 64 martial arts', () => {
    const signatures = new Set<string>();
    for (const art of WORLD_MARTIAL_ARTS) {
      const appearance = getFighterAppearance(art.id);
      expect(appearance).toBeDefined();
      if (appearance) {
        const sig = `${appearance.skinColor}-${appearance.hairStyle}-${appearance.facialFeature}-${appearance.headgear}-${appearance.outfit}-${appearance.outfitPrimary}`;
        signatures.add(sig);
      }
    }
    expect(signatures.size).toBe(WORLD_MARTIAL_ARTS.length);
  });

  it('builds unblockable profiles for spiritStrike, weaponSlash, and cycloneStrike', () => {
    const spirit = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'spiritStrike');
    const weapon = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'weaponSlash');
    const cyclone = buildCombatAttackProfile(DEFAULT_FIGHTER_COMBAT, 'cycloneStrike');
    expect(spirit.defenseHeight).toBe('unblockable');
    expect(weapon.defenseHeight).toBe('unblockable');
    expect(cyclone.defenseHeight).toBe('unblockable');
  });
});

import { STAGE_DEFINITIONS } from './stageConfig';

describe('battle stages', () => {
  it('includes 6 distinct arena stages including Mongol Naadam, Tokyo Dojo, and Cyber Colosseum', () => {
    expect(STAGE_DEFINITIONS).toHaveLength(6);
    const ids = new Set(STAGE_DEFINITIONS.map((s) => s.id));
    expect(ids.size).toBe(6);
    expect(ids.has('mma-octagon')).toBe(true);
    expect(ids.has('mongol-steppe')).toBe(true);
    expect(ids.has('tokyo-dojo')).toBe(true);
    expect(ids.has('cyber-colosseum')).toBe(true);
  });
});

