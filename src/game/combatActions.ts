import type { AttackKind, AttackProfile, FighterCombat } from './types';

/**
 * Extended combat actions supported by a fighter during a match.
 */
export type CombatMoveKind =
  | 'light'
  | 'heavy'
  | 'frontKick'
  | 'spinHookKick'
  | 'spin360Kick'
  | 'roundhouse540'
  | 'icyBodyShot'
  | 'tigerKnee'
  | 'tornadoKick'
  | 'spiritStrike'
  | 'weaponSlash'
  | 'cycloneStrike'
  | 'crouchLight'
  | 'sweep'
  | 'airLight'
  | 'airHeavy'
  | 'throw'
  | 'exBurst'
  | 'special';

/**
 * Guard interaction rule for an attack:
 * - `high`: blocked by standing or crouching guard
 * - `low`: must be blocked crouching (hits standing guard)
 * - `overhead`: must be blocked standing (hits crouching guard)
 * - `unblockable`: breaks through any guard (throws / ultimates)
 */
export type DefenseHeight = 'high' | 'low' | 'overhead' | 'unblockable';

export interface ExtendedAttackProfile extends AttackProfile {
  moveKind: CombatMoveKind;
  defenseHeight: DefenseHeight;
  callout?: string;
}

export const EX_METER_COST = 50;
export const SUPER_METER_COST = 100;
export const DOUBLE_TAP_WINDOW_MS = 240;
export const BAYASAA_KICK_COMBO_WINDOW_MS = 950;
export const TRIANGLE_CHOKE_TAP1_DAMAGE = 18;
export const TRIANGLE_CHOKE_TAP2_DAMAGE = 22;
export const EAGLE_SLAM_DAMAGE = 28;

/** Blue Striker shrugs off standard hits without hitstun or movement interruption. */
export function hasSuperArmor(characterId: string): boolean {
  return characterId === 'blue-striker';
}

/** Returns true when the defender has low enough HP to be KO'd in one 540° finisher hit. */
export function isOneHitKoRange(defenderHealth: number, finisherDamage: number): boolean {
  return defenderHealth > 0 && defenderHealth <= finisherDamage;
}

/** Advances Bayasaa's 3-hit G kick chain (1: Front -> 2: Spin Hook -> 3: 360° Spin). */
export function nextBayasaaKickStep(
  currentStep: 0 | 1 | 2 | 3,
  timeSinceLastKickMs: number,
  windowMs = BAYASAA_KICK_COMBO_WINDOW_MS
): 1 | 2 | 3 {
  if (timeSinceLastKickMs > windowMs || currentStep === 0 || currentStep === 3) {
    return 1;
  }

  return currentStep === 1 ? 2 : 3;
}

/**
 * Tracks left/right key press timestamps to detect double-tap dashes.
 */
export class DoubleTapDashTracker {
  private lastDir: -1 | 0 | 1 = 0;
  private lastPressAt = -Infinity;

  /**
   * Checks whether a newly pressed horizontal direction completes a double-tap dash.
   * @param leftJustDown - True on the frame the left key was pressed.
   * @param rightJustDown - True on the frame the right key was pressed.
   * @param timeMs - Current game clock time in milliseconds.
   */
  update(leftJustDown: boolean, rightJustDown: boolean, timeMs: number): -1 | 0 | 1 {
    const dir: -1 | 0 | 1 = leftJustDown && !rightJustDown ? -1 : rightJustDown && !leftJustDown ? 1 : 0;

    if (dir === 0) {
      return 0;
    }

    const isDoubleTap = this.lastDir === dir && timeMs - this.lastPressAt <= DOUBLE_TAP_WINDOW_MS;

    if (isDoubleTap) {
      this.lastDir = 0;
      this.lastPressAt = -Infinity;
      return dir;
    }

    this.lastDir = dir;
    this.lastPressAt = timeMs;
    return 0;
  }

  reset(): void {
    this.lastDir = 0;
    this.lastPressAt = -Infinity;
  }
}

/**
 * Resolves whether an attack is successfully blocked given the defender's
 * guard state.
 * @param hasGuardBox - Whether the defender currently has an active guard box overlapping the attack.
 * @param isCrouchBlocking - Whether the defender is holding low block.
 * @param defenseHeight - The incoming attack's guard rule.
 */
export function isAttackGuarded(
  hasGuardBox: boolean,
  isCrouchBlocking: boolean,
  defenseHeight: DefenseHeight
): boolean {
  if (!hasGuardBox || defenseHeight === 'unblockable') {
    return false;
  }

  if (defenseHeight === 'low') {
    return isCrouchBlocking;
  }

  if (defenseHeight === 'overhead') {
    return !isCrouchBlocking;
  }

  return true;
}

/**
 * Returns true if the current connected strike can immediately cancel into the
 * requested follow-up move (classic 2D fighter chain combo system).
 */
export function canCancelMove(
  currentMove: CombatMoveKind | null,
  nextMove: CombatMoveKind,
  hasConnected: boolean
): boolean {
  if (!currentMove || !hasConnected) {
    return false;
  }

  if (currentMove === 'light' || currentMove === 'crouchLight' || currentMove === 'airLight') {
    return (
      nextMove === 'heavy' ||
      nextMove === 'frontKick' ||
      nextMove === 'sweep' ||
      nextMove === 'exBurst' ||
      nextMove === 'special'
    );
  }

  if (
    currentMove === 'heavy' ||
    currentMove === 'frontKick' ||
    currentMove === 'spinHookKick' ||
    currentMove === 'spin360Kick' ||
    currentMove === 'sweep' ||
    currentMove === 'airHeavy'
  ) {
    return nextMove === 'exBurst' || nextMove === 'special';
  }

  return false;
}

/**
 * Builds the combat profile (damage, knockback, hitstun, guard rule) for any
 * extended move from the character's base {@link FighterCombat} tuning.
 */
export function buildCombatAttackProfile(
  combat: FighterCombat,
  moveKind: CombatMoveKind
): ExtendedAttackProfile {
  switch (moveKind) {
    case 'light':
      return {
        kind: 'high',
        height: 'high',
        moveKind,
        defenseHeight: 'high',
        damage: combat.highDamage,
        knockback: combat.highKnockback,
        hitstun: combat.highHitstun
      };

    case 'crouchLight':
      return {
        kind: 'high',
        height: 'low',
        moveKind,
        defenseHeight: 'low',
        damage: Math.max(4, Math.round(combat.highDamage * 0.85)),
        knockback: Math.round(combat.highKnockback * 0.8),
        hitstun: Math.round(combat.highHitstun * 0.9),
        callout: 'LOW!'
      };

    case 'heavy':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'high',
        damage: combat.lowDamage,
        knockback: combat.lowKnockback,
        hitstun: combat.lowHitstun
      };

    case 'frontKick':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'high',
        damage: combat.lowDamage,
        knockback: Math.round(combat.lowKnockback * 0.85),
        hitstun: Math.round(combat.lowHitstun * 0.9),
        callout: 'FRONT KICK!'
      };

    case 'spinHookKick':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'high',
        damage: Math.round(combat.lowDamage * 1.15),
        knockback: Math.round(combat.lowKnockback * 1.1),
        hitstun: Math.round(combat.lowHitstun * 1.05),
        callout: 'SPIN HOOK KICK!'
      };

    case 'spin360Kick':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'overhead',
        damage: Math.round(combat.lowDamage * 1.35),
        knockback: Math.round(combat.lowKnockback * 1.45),
        hitstun: Math.round(combat.lowHitstun * 1.25),
        callout: '360° SPIN KICK!'
      };

    case 'roundhouse540':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'overhead',
        damage: Math.max(22, Math.round(combat.lowDamage * 1.45)),
        knockback: Math.round(combat.lowKnockback * 1.8),
        hitstun: Math.round(combat.lowHitstun * 1.4),
        callout: '540° ROUNDHOUSE!'
      };

    case 'icyBodyShot':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'unblockable',
        damage: Math.max(24, Math.round(combat.lowDamage * 1.85)),
        knockback: Math.round(combat.lowKnockback * 1.15),
        hitstun: 600,
        callout: 'BODY SHOT!'
      };

    case 'tigerKnee':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'unblockable',
        damage: Math.max(26, Math.round(combat.lowDamage * 1.85)),
        knockback: Math.round(combat.lowKnockback * 1.35),
        hitstun: 580,
        callout: 'TIGER KNEE!'
      };

    case 'tornadoKick':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'unblockable',
        damage: Math.max(25, Math.round(combat.lowDamage * 1.9)),
        knockback: Math.round(combat.lowKnockback * 1.45),
        hitstun: 540,
        callout: 'TORNADO KICK!'
      };

    case 'spiritStrike':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'unblockable',
        damage: Math.max(25, Math.round(combat.lowDamage * 1.85)),
        knockback: Math.round(combat.lowKnockback * 1.35),
        hitstun: 560,
        callout: 'SPIRIT STRIKE!'
      };

    case 'weaponSlash':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'unblockable',
        damage: Math.max(26, Math.round(combat.lowDamage * 1.9)),
        knockback: Math.round(combat.lowKnockback * 1.4),
        hitstun: 560,
        callout: 'WEAPON SLASH!'
      };

    case 'cycloneStrike':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'unblockable',
        damage: Math.max(24, Math.round(combat.lowDamage * 1.8)),
        knockback: Math.round(combat.lowKnockback * 1.4),
        hitstun: 540,
        callout: 'CYCLONE STRIKE!'
      };

    case 'sweep':
      return {
        kind: 'low',
        height: 'low',
        moveKind,
        defenseHeight: 'low',
        damage: Math.max(8, Math.round(combat.lowDamage * 1.05)),
        knockback: Math.round(combat.lowKnockback * 1.25),
        hitstun: Math.round(combat.lowHitstun * 1.15),
        callout: 'SWEEP!'
      };

    case 'airLight':
      return {
        kind: 'high',
        height: 'high',
        moveKind,
        defenseHeight: 'overhead',
        damage: combat.highDamage,
        knockback: Math.round(combat.highKnockback * 0.9),
        hitstun: Math.round(combat.highHitstun * 1.05),
        callout: 'OVERHEAD!'
      };

    case 'airHeavy':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'overhead',
        damage: Math.round(combat.lowDamage * 1.1),
        knockback: Math.round(combat.lowKnockback * 1.05),
        hitstun: Math.round(combat.lowHitstun * 1.05),
        callout: 'OVERHEAD!'
      };

    case 'throw':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'unblockable',
        damage: Math.max(9, Math.round((combat.highDamage + combat.lowDamage) * 0.58)),
        knockback: Math.max(360, Math.round(combat.lowKnockback * 1.35)),
        hitstun: Math.max(420, combat.lowHitstun),
        callout: 'THROW!'
      };

    case 'exBurst':
      return {
        kind: 'low',
        height: 'high',
        moveKind,
        defenseHeight: 'high',
        damage: Math.round(combat.lowDamage * 1.45),
        knockback: Math.round(combat.lowKnockback * 1.4),
        hitstun: Math.round(combat.lowHitstun * 1.2),
        callout: 'EX BURST!'
      };

    case 'special':
      return {
        kind: 'special' as AttackKind,
        height: 'high',
        moveKind,
        defenseHeight: 'high',
        damage: combat.specialDamage,
        knockback: combat.specialKnockback,
        hitstun: combat.specialHitstun
      };
  }
}
