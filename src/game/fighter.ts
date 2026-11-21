import * as Phaser from 'phaser';

import type { AppContext } from './context';
import {
  BAYASAA_KICK_COMBO_WINDOW_MS,
  buildCombatAttackProfile,
  canCancelMove,
  EX_METER_COST,
  hasSuperArmor,
  nextBayasaaKickStep,
  type CombatMoveKind,
  type ExtendedAttackProfile
} from './combatActions';
import { playSpiritUltimateSfx, playTornadoKickSfx, playUltimateChargeSfx } from './core/combatAudio';
import { FighterSpiritVisuals } from './fighterAura';
import { FIGHTER_BOUNDS_FIELDS, getFighterCombat, getFighterStats } from './fighterConfig';
import {
  findCharacterAnimationKeyByAction,
  getCharacterAnimationDefinition,
  getCharacterDefinition,
  resolveHeroBoundsFrame,
  type CharacterDefinition,
  type HeroAnimationDefinition,
  type HeroBoundsFrame
} from './hero';
import { hasDedicatedHitSheet, hasDedicatedKoSheet } from './myFighterLoader';
import {
  spawnEagleSlamAura,
  spawnFrostChargeAura,
  spawnKickComboTrail,
  spawnLiverClutchIndicator,
  spawnSpiritUltimateTrail,
  spawnTigerKneeTrail,
  spawnTornadoKickVortex,
  spawnUltimatePunchBanner
} from './specialVfx';
import { spawnChargeAura, spawnCombatCallout, spawnDashDust, spawnExAura } from './vfx';
import { getMartialArtMeta, type MartialArtDefinition } from './worldMartialArts';
import type {
  AttackKind,
  AttackProfile,
  FighterBoundsVisibility,
  FighterCombat,
  FighterStats,
  Rect
} from './types';

/** Deceleration applied to knockback velocity, in px/s^2. */
const KNOCKBACK_FRICTION = 720;
/** Blockstun duration when an attack is guarded, in seconds. */
const BLOCKSTUN_SECONDS = 0.14;

/** Full meter value; a special requires (and consumes) a full bar. */
const METER_MAX = 100;
/** Meter gained by the attacker when a normal attack lands. */
const METER_GAIN_ON_HIT = 12;
/** Meter gained by the defender when taking a hit. */
const METER_GAIN_ON_TAKE = 7;
/** Meter gained by both sides on a blocked hit. */
const METER_GAIN_ON_BLOCK = 4;
/**
 * After the charge wind-up completes, the fighter holds the charged pose for this
 * long before the special executes — the "super freeze" that lets the cut-in
 * cinematic land before the move launches.
 */
const SUPER_FREEZE_MS = 360;

/**
 * A live attack from a fighter on its current animation frame: the world-space
 * attack rectangle, the resolved damage/knockback/hitstun profile, and a
 * per-swing signature so a single swing only connects once.
 */
export interface ActiveAttack {
  rect: Phaser.Geom.Rectangle;
  profile: ExtendedAttackProfile;
  signature: number;
  /** True when this is the final hit window of a special (the combo finisher). */
  finisher: boolean;
}

const BOUNDS_ALPHA_ACTIVE = 0.95;
const BOUNDS_ALPHA_INACTIVE = 0.28;

// Frame pixels between the anchor baseline (frame bottom, ~255) and the visible
// feet. Used to seat the ground shadow under the feet rather than the padded
// frame bottom, so fighters don't appear to float above their shadow.
const SHADOW_FOOT_OFFSET = 24;

const BOUNDS_COLORS: Record<keyof FighterBoundsVisibility, number> = Object.fromEntries(
  FIGHTER_BOUNDS_FIELDS.map((field) => [field.id, Number.parseInt(field.color.slice(1), 16)])
) as Record<keyof FighterBoundsVisibility, number>;

/**
 * A per-frame snapshot of a fighter's intent. Held inputs (`left`, `right`,
 * `crouch`, `block`) describe the current key state; edge inputs (`jump`,
 * `light`, `heavy`, `special`, `throw`, `dash`) are active only on the frame triggered.
 */
export interface FighterInput {
  left: boolean;
  right: boolean;
  crouch: boolean;
  block: boolean;
  jump: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  dash: -1 | 0 | 1;
  throw: boolean;
  ultimate: boolean;
}

/** A neutral (no-op) input snapshot. */
export const NEUTRAL_FIGHTER_INPUT: FighterInput = {
  left: false,
  right: false,
  crouch: false,
  block: false,
  jump: false,
  light: false,
  heavy: false,
  special: false,
  dash: 0,
  throw: false,
  ultimate: false
};

interface FighterActionKeys {
  idle: string;
  walkForward: string;
  walkBackward: string;
  crouch: string;
  jump: string;
  blockHigh: string;
  blockLow: string;
  hitHigh: string;
  lightPunch: string;
  heavy: string;
  specialCharge: string;
  special: string;
  knockdown: string;
}

/**
 * Construction options for a {@link Fighter}: which scene/character to build,
 * where it stands, which way it faces, and its horizontal movement bounds.
 */
export interface FighterOptions {
  scene: Phaser.Scene;
  app: AppContext;
  characterId: string;
  x: number;
  groundY: number;
  facing: 1 | -1;
  minX: number;
  maxX: number;
  depth?: number;
  /**
   * Invoked the moment a meter special begins (the charge wind-up). Hosts use it
   * to trigger the super cut-in cinematic.
   */
  onSpecialStart?: (fighter: Fighter) => void;
  /**
   * Queried by Bayasaa on heavy kick to check if the opponent can be KO'd in one
   * 540° Roundhouse Kick hit.
   */
  isOpponentOneHitKo?: (finisherDamage: number) => boolean;
}

/**
 * A self-contained, input-driven fighter actor: sprite + ground shadow + a
 * grounded/airborne state machine. The host scene feeds it a {@link FighterInput}
 * each frame, so the same entity backs both human and CPU opponents. Movement
 * and physics stats are read from the persisted fighter balance.
 */
export class Fighter {
  private readonly scene: Phaser.Scene;
  private readonly app: AppContext;
  private readonly character: CharacterDefinition;
  private readonly martialMeta?: MartialArtDefinition;
  private readonly spriteArchetypeId: string;
  private readonly actionKeys: FighterActionKeys;
  private facing: 1 | -1;
  private minX: number;
  private maxX: number;
  private readonly groundY: number;

  private sprite!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private boundsGraphics!: Phaser.GameObjects.Graphics;
  private spiritVisuals?: FighterSpiritVisuals;
  private depthBase = 5;
  private posX: number;
  private velocityY = 0;
  private grounded = true;
  private locked = false;
  private frozen = true;
  private currentAnimKey = '';
  private currentReverse = false;

  private maxHealth: number;
  private health: number;
  private hitstunTimer = 0;
  private stunIsBlock = false;
  private stunBlockLow = false;
  private knockbackVel = 0;
  private defeated = false;
  private attackId = 0;
  private attackConnected = true;
  private currentHitConnected = false;
  private currentMoveKind: CombatMoveKind | null = null;
  private oneShotToken = 0;
  private dashTimer = 0;
  private dashVel = 0;
  private invulnTimer = 0;
  private lungeVel = 0;
  // Multi-hit: each contiguous run of attack-active frames is one hit window.
  // When the attack box turns on after being off, a new window opens so the
  // swing can connect again — this is how a special lands several hits.
  private attackActiveLast = false;
  private meter = 0;
  private appliedScale = 0;
  private ultimateCooldown = 0;
  private downedTimer = 0;
  private downedLyingApplied = false;
  private grappleMode: 'none' | 'choker' | 'trapped' | 'slammer' | 'slammed' = 'none';
  private duckChokeTimer = 0;
  private eagleSlamTimer = 0;
  private bayasaaKickStep: 0 | 1 | 2 | 3 = 0;
  private bayasaaKickStartedAt = -Infinity;
  private bayasaaLastKickEndedAt = -Infinity;
  private readonly hasSpecial: boolean;
  private readonly onSpecialStart?: (fighter: Fighter) => void;
  private readonly isOpponentOneHitKo?: (finisherDamage: number) => boolean;

  constructor(options: FighterOptions) {
    this.scene = options.scene;
    this.app = options.app;
    this.onSpecialStart = options.onSpecialStart;
    this.isOpponentOneHitKo = options.isOpponentOneHitKo;
    this.character = getCharacterDefinition(options.characterId);
    this.martialMeta = getMartialArtMeta(this.character.id);
    this.spriteArchetypeId = this.martialMeta?.baseArchetypeId ?? this.character.id;
    this.facing = options.facing;
    this.minX = options.minX;
    this.maxX = options.maxX;
    this.groundY = options.groundY;
    this.posX = Phaser.Math.Clamp(options.x, options.minX, options.maxX);
    this.actionKeys = this.resolveActionKeys();
    this.hasSpecial = findCharacterAnimationKeyByAction(this.character.id, 'special') !== null;
    this.maxHealth = this.combat().maxHealth;
    this.health = this.maxHealth;
    this.build(options.depth ?? 5);
  }

  /** The fighter's id. */
  get characterId(): string {
    return this.character.id;
  }

  /** The fighter's display label. */
  get label(): string {
    return this.character.label;
  }

  /** The fighter's current horizontal centre in world pixels. */
  get x(): number {
    return this.posX;
  }

  /** The direction the fighter is facing (+1 right, -1 left). */
  get facingDirection(): 1 | -1 {
    return this.facing;
  }

  /** The fighter's current health. */
  get health01(): number {
    return this.maxHealth > 0 ? Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) : 0;
  }

  /** The fighter's remaining raw HP. */
  get healthPoints(): number {
    return this.health;
  }

  /** The fighter's ground baseline y coordinate. */
  get groundBaselineY(): number {
    return this.groundY;
  }

  /** The fighter's applied sprite display scale. */
  get visualScale(): number {
    return this.appliedScale;
  }

  /** Whether the fighter has been knocked out this round. */
  get isDefeated(): boolean {
    return this.defeated;
  }

  /** Whether the fighter is currently in hitstun/blockstun. */
  get isInHitstun(): boolean {
    return this.hitstunTimer > 0;
  }

  /** Whether the fighter currently has dodge invulnerability frames (backdash or duck-under). */
  get isInvulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  /** Whether the fighter is downed clutching their liver for 2s (unhittable). */
  get isBodyDowned(): boolean {
    return this.downedTimer > 0;
  }

  /** Whether Bayasaa is actively lunging forward to catch a Triangle Choke. */
  get isDuckChoking(): boolean {
    return this.duckChokeTimer > 0;
  }

  /** Whether Mongol Bokh is actively lunging forward to catch an Eagle Slam. */
  get isEagleCharging(): boolean {
    return this.eagleSlamTimer > 0;
  }

  /** Whether the fighter is currently locked inside a submission grapple or slam. */
  get isInGrapple(): boolean {
    return this.grappleMode !== 'none';
  }

  /** Whether the fighter is currently holding a low (crouch) block. */
  get isCrouchBlocking(): boolean {
    return this.currentAnimKey === this.actionKeys.blockLow;
  }

  /** Whether the fighter is currently airborne. */
  get isAirborne(): boolean {
    return !this.grounded;
  }

  /** The fighter's special meter charge (0..1). */
  get meter01(): number {
    return METER_MAX > 0 ? Phaser.Math.Clamp(this.meter / METER_MAX, 0, 1) : 0;
  }

  /** Whether the fighter has enough meter for a 50% EX Burst move. */
  get isExReady(): boolean {
    return this.meter >= EX_METER_COST;
  }

  /** Whether the special meter is full and a super special can be performed. */
  get isMeterReady(): boolean {
    return this.hasSpecial && this.meter >= METER_MAX;
  }

  /**
   * Adds charge to the special meter (clamped to full). Called by the match when
   * this fighter deals, blocks, or takes a hit.
   * @param amount - Meter points to add.
   */
  gainMeter(amount: number): void {
    if (this.defeated) {
      return;
    }

    this.meter = Phaser.Math.Clamp(this.meter + amount, 0, METER_MAX);
  }

  /**
   * Awards meter for landing an attack. Special moves grant no meter (so they
   * can't refill themselves); normal hits grant more than guarded ones.
   * @param blocked - Whether the attack was guarded by the defender.
   * @param isSpecial - Whether the attack was a special move.
   */
  registerOffense(blocked: boolean, isSpecial: boolean): void {
    if (isSpecial) {
      return;
    }

    this.gainMeter(blocked ? METER_GAIN_ON_BLOCK : METER_GAIN_ON_HIT);
  }

  /**
   * Awards meter for being struck. Taking a clean hit builds more than blocking.
   * @param blocked - Whether the incoming attack was guarded.
   */
  registerDefense(blocked: boolean): void {
    this.gainMeter(blocked ? METER_GAIN_ON_BLOCK : METER_GAIN_ON_TAKE);
  }

  /** Tops the special meter to full (used by the playground's debug fill toggle). */
  fillMeter(): void {
    this.meter = METER_MAX;
  }

  /**
   * Gradually restores health toward full without clearing hitstun/knockback,
   * so a training dummy visibly takes damage and then recovers between hits.
   * @param amount - Health points to restore this tick.
   */
  regenHealth(amount: number): void {
    if (!this.defeated) {
      this.health = Math.min(this.maxHealth, this.health + amount);
    }
  }

  /**
   * Live-updates the display scale (sprite + ground shadow) so playground scale
   * tuning is reflected without rebuilding the fighter.
   * @param scale - The desired display scale.
   */
  setVisualScale(scale: number): void {
    if (this.appliedScale === scale) {
      return;
    }

    this.appliedScale = scale;
    this.sprite.setScale(scale);
    this.shadow.setSize(Math.round(107 * scale), Math.round(24 * scale));
    this.shadow.y = this.groundY - SHADOW_FOOT_OFFSET * scale;
    this.updateShadow();
  }

  /**
   * Sets the base render depth, restacking the sprite, shadow, and bounds
   * overlay together. Used to bring the most recently active fighter in front.
   * @param base - The base depth for the sprite.
   */
  setDepthBase(base: number): void {
    if (this.depthBase === base) {
      return;
    }

    this.depthBase = base;
    this.applyDepths();
  }

  /**
   * Turns the fighter to face a target x (e.g. the opponent), flipping the
   * sprite and — via the shared transform — its bounds. Skipped while mid
   * one-shot action and within a small deadzone to avoid jitter on overlap.
   * @param targetX - The world x the fighter should face toward.
   */
  faceToward(targetX: number): void {
    if (this.locked) {
      return;
    }

    const delta = targetX - this.posX;
    if (Math.abs(delta) < 12) {
      return;
    }

    const desired: 1 | -1 = delta >= 0 ? 1 : -1;
    if (desired !== this.facing) {
      this.facing = desired;
      this.sprite.setFlipX(this.facing === 1);
    }
  }

  /**
   * Freezes or unfreezes the fighter. While frozen it holds the idle pose and
   * ignores all input (used during the round intro).
   * @param frozen - Whether the fighter should be frozen.
   */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /**
   * Updates the fighter's horizontal movement limits and immediately re-clamps
   * the current position into the new range. Used by the match camera to turn
   * the visible screen edges into walls (and the stage ends into corners).
   * @param minX - The leftmost centre the fighter may occupy, in world pixels.
   * @param maxX - The rightmost centre the fighter may occupy, in world pixels.
   */
  setHorizontalBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = Math.max(minX, maxX);
    this.posX = Phaser.Math.Clamp(this.posX, this.minX, this.maxX);
    this.sprite.x = this.posX;
    this.shadow.x = this.posX;
  }

  /**
   * The fighter's currently active attack (if any): present only while a strike
   * animation is on an attack-active frame and the swing hasn't connected yet.
   */
  getActiveAttack(): ActiveAttack | null {
    if (this.attackConnected || this.defeated) {
      return null;
    }

    const kind = this.currentAttackKind();
    if (kind === null) {
      return null;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);
    if (!frame?.attack) {
      return null;
    }

    const frameIndex = this.currentFrameIndex(animation);
    const moveKind = this.currentMoveKind ?? (kind === 'high' ? 'light' : kind === 'low' ? 'heavy' : 'special');
    const finisher = kind === 'special' && !this.hasAttackFrameAfter(animation, frameIndex);
    const rect = this.frameRectToWorld(animation, frame.attack);

    if (
      moveKind === 'throw' ||
      moveKind === 'icyBodyShot' ||
      moveKind === 'roundhouse540' ||
      moveKind === 'tigerKnee' ||
      moveKind === 'tornadoKick' ||
      moveKind === 'spiritStrike' ||
      moveKind === 'weaponSlash' ||
      moveKind === 'cycloneStrike'
    ) {
      const bonusReach = (moveKind === 'weaponSlash' ? 38 : moveKind === 'throw' ? 20 : 28) * this.appliedScale;
      rect.width += bonusReach;
      if (this.facing < 0) {
        rect.x -= bonusReach;
      }
    }

    return {
      rect,
      profile: buildCombatAttackProfile(this.combat(), moveKind),
      signature: this.attackId,
      finisher
    };
  }

  /** Marks the current swing as having connected so it can't hit again (and enables combo cancels). */
  markAttackConnected(): void {
    this.attackConnected = true;
    this.currentHitConnected = true;
  }

  /**
   * Briefly tints the sprite to telegraph an impact (red for a clean hit, blue
   * for a guarded one).
   * @param blocked - Whether the hit was blocked.
   */
  flashHit(blocked: boolean): void {
    this.sprite.setTint(blocked ? 0x93c5fd : 0xff7a7a);
    this.scene.time.delayedCall(100, () => {
      if (this.downedTimer <= 0 && this.currentMoveKind !== 'icyBodyShot') {
        this.restoreBaseTint();
      }
    });
  }

  /**
   * The fighter's current hurtbox in world space (the active frame's hit box,
   * falling back to its visual box), or null when unavailable.
   */
  getHurtRect(): Phaser.Geom.Rectangle | null {
    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);
    const rect = frame?.hit ?? frame?.visual;

    return rect ? this.frameRectToWorld(animation, rect) : null;
  }

  /**
   * The fighter's active guard box in world space — the current frame's `guard`
   * rect, present only while a block pose is held (and the fighter isn't
   * defeated). An attack is blocked when its hitbox overlaps this rect; null
   * means the fighter isn't guarding and any connecting attack will hit.
   */
  getGuardRect(): Phaser.Geom.Rectangle | null {
    if (this.defeated) {
      return null;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);

    return frame?.guard ? this.frameRectToWorld(animation, frame.guard) : null;
  }

  /**
   * Applies a connected hit: blocked hits deal no damage and apply short
   * blockstun + light pushback; unblocked hits deal damage, hitstun, and
   * knockback, triggering a knockdown when health reaches zero. Blue Striker
   * ignores hitstun/knockback/interruption while still taking damage unless KO'd.
   * @param profile - The attack profile that landed.
   * @param attackerFacing - The attacker's facing (push direction).
   * @param blocked - Whether the defender guarded the attack.
   */
  applyHit(profile: AttackProfile, attackerFacing: 1 | -1, blocked: boolean): void {
    if (this.defeated) {
      return;
    }

    if (blocked) {
      this.knockbackVel = attackerFacing * profile.knockback * 0.35;
      this.hitstunTimer = Math.max(this.hitstunTimer, BLOCKSTUN_SECONDS);
      this.stunIsBlock = true;
      this.stunBlockLow = this.currentAnimKey === this.actionKeys.blockLow;
      this.locked = false;
      return;
    }

    const nextHealth = Math.max(0, this.health - profile.damage);

    // Blue Striker has unstoppable super armor: taking hits does not stop movement or attacks.
    if (hasSuperArmor(this.character.id) && nextHealth > 0) {
      this.health = nextHealth;
      return;
    }

    this.health = nextHealth;
    this.knockbackVel = attackerFacing * profile.knockback;
    this.dashTimer = 0;
    this.dashVel = 0;
    this.invulnTimer = 0;
    this.lungeVel = 0;
    this.duckChokeTimer = 0;
    this.eagleSlamTimer = 0;
    this.oneShotToken += 1;
    this.currentMoveKind = null;
    this.currentHitConnected = false;
    this.resetVisualTransform();

    if (this.health <= 0) {
      this.defeated = true;
      this.locked = true;
      this.grounded = true;
      this.stunIsBlock = false;
      this.hitstunTimer = 0;
      this.downedTimer = 0;
      this.grappleMode = 'none';
      this.playKnockdownPose();
      return;
    }

    this.stunIsBlock = false;
    this.locked = false;
    this.hitstunTimer = profile.hitstun / 1000;
    this.currentAnimKey = '';
    this.playState(this.actionKeys.hitHigh, false);
    if (!hasDedicatedHitSheet(this.spriteArchetypeId)) {
      this.sprite.setAngle(-this.facing * 14);
    }
  }

  /**
   * Puts the opponent into a 2-second liver-clutching downed state (invulnerable
   * to follow-up hits while on the mat) after Blue Striker's ULTIMATE PUNCH body shot.
   */
  triggerLiverDowned(durationSeconds = 2.0): void {
    if (this.defeated) {
      return;
    }

    this.oneShotToken += 1;
    this.locked = true;
    this.grounded = true;
    this.hitstunTimer = 0;
    this.dashTimer = 0;
    this.dashVel = 0;
    this.invulnTimer = 0;
    this.lungeVel = 0;
    this.duckChokeTimer = 0;
    this.eagleSlamTimer = 0;
    this.grappleMode = 'none';
    this.currentMoveKind = null;
    this.currentHitConnected = false;
    this.attackConnected = true;
    this.downedTimer = durationSeconds;
    this.downedLyingApplied = false;
    this.resetVisualTransform();
    this.sprite.setTint(0xbae6fd);
    this.currentAnimKey = '';
    this.playState(this.actionKeys.crouch, false);

    spawnLiverClutchIndicator(this.scene, this.posX, this.groundY - 76, durationSeconds * 1000);
  }

  /** Places and orients the fighter directly (used to lock Triangle Choke or Slam spacing). */
  setPositionAndFacing(x: number, facing: 1 | -1): void {
    this.posX = Phaser.Math.Clamp(x, this.minX, this.maxX);
    this.facing = facing;
    this.sprite.x = this.posX;
    this.sprite.setFlipX(this.facing === 1);
    this.updateShadow();
  }

  /** Stops the Duck Under / Eagle Slam lunge once the grab connects. */
  completeDuckGrab(): void {
    this.duckChokeTimer = 0;
    this.eagleSlamTimer = 0;
    this.lungeVel = 0;
    this.invulnTimer = 0;
  }

  /** Locks the fighter into a ground Triangle Choke or Eagle Slam pose. */
  setGrapplePose(mode: 'choker' | 'trapped' | 'slammer' | 'slammed'): void {
    this.oneShotToken += 1;
    this.grappleMode = mode;
    this.locked = true;
    this.grounded = true;
    this.hitstunTimer = 0;
    this.dashTimer = 0;
    this.dashVel = 0;
    this.invulnTimer = 0;
    this.lungeVel = 0;
    this.knockbackVel = 0;
    this.duckChokeTimer = 0;
    this.eagleSlamTimer = 0;
    this.currentMoveKind = null;
    this.currentHitConnected = false;
    this.attackConnected = true;
    this.resetVisualTransform();

    if (mode === 'slammer') {
      const punchAnim = getCharacterAnimationDefinition(this.character.id, this.actionKeys.lightPunch);
      const liftFrame = Math.min(2, Math.max(0, punchAnim.sheet.frames - 1));
      this.currentAnimKey = this.actionKeys.lightPunch;
      this.sprite.anims.stop();
      this.sprite.setTexture(this.actionKeys.lightPunch, liftFrame);
      this.sprite.setAngle(-this.facing * 8);
      this.updateShadow();
      return;
    }

    if (mode === 'slammed') {
      this.currentAnimKey = this.actionKeys.hitHigh;
      this.sprite.anims.stop();
      this.sprite.setTexture(this.actionKeys.hitHigh, 0);
      this.updateShadow();
      return;
    }

    const crouchAnim = getCharacterAnimationDefinition(this.character.id, this.actionKeys.crouch);
    const crouchFrame = Math.max(0, crouchAnim.sheet.frames - 1);
    this.currentAnimKey = this.actionKeys.crouch;
    this.sprite.anims.stop();
    this.sprite.setTexture(this.actionKeys.crouch, crouchFrame);

    if (mode === 'trapped') {
      this.sprite.setAngle(-this.facing * 18);
    } else {
      this.sprite.setAngle(this.facing * 10);
    }
    this.updateShadow();
  }

  /** Tweens a grabbed fighter high overhead and slams them into the canvas for Mongol Bokh's Eagle Slam. */
  animateEagleSlamVictim(targetX: number, liftMs = 340, slamMs = 130): void {
    if (!this.sprite) {
      return;
    }
    this.posX = Phaser.Math.Clamp(targetX, this.minX, this.maxX);
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.posX,
      y: this.groundY - 135,
      angle: -this.facing * 145,
      duration: liftMs,
      ease: 'Cubic.Out',
      onUpdate: () => this.updateShadow(),
      onComplete: () => {
        if (!this.sprite || this.defeated) {
          return;
        }
        this.scene.tweens.add({
          targets: this.sprite,
          y: this.groundY - 12,
          angle: -this.facing * 92,
          duration: slamMs,
          ease: 'Quad.In',
          onUpdate: () => this.updateShadow()
        });
      }
    });
  }

  /** Visual tap-out bounce when the trapped opponent taps Bayasaa's arm. */
  pulseTapMotion(): void {
    if (!this.sprite) {
      return;
    }

    this.scene.tweens.add({
      targets: this.sprite,
      y: this.groundY - 12,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out'
    });
  }

  /**
   * Applies direct damage without breaking grapple state (used by Triangle Choke taps
   * and guaranteed KOs). Returns true if the fighter was KO'd.
   */
  applyDirectDamage(amount: number): boolean {
    if (this.defeated) {
      return true;
    }

    this.health = Math.max(0, this.health - amount);
    this.flashHit(false);

    if (this.health <= 0) {
      this.defeated = true;
      this.grappleMode = 'none';
      this.locked = true;
      this.grounded = true;
      this.hitstunTimer = 0;
      this.downedTimer = 0;
      this.resetVisualTransform();
      this.playKnockdownPose();
      return true;
    }

    return false;
  }

  /** Releases the fighter from a Triangle Choke grapple back into normal combat. */
  releaseGrapple(pushVel = 0): void {
    this.grappleMode = 'none';
    this.locked = false;
    this.currentMoveKind = null;
    this.currentHitConnected = false;
    this.currentAnimKey = '';
    this.knockbackVel = pushVel;
    this.resetVisualTransform();

    if (!this.defeated) {
      this.playState(this.actionKeys.idle, true);
    }
  }

  /**
   * Resets the fighter for a new round: restores health, repositions and faces,
   * clears combat state, and re-freezes until the round intro releases it.
   * @param x - The spawn x position.
   * @param facing - The spawn facing direction.
   */
  resetForRound(x: number, facing: 1 | -1): void {
    this.posX = Phaser.Math.Clamp(x, this.minX, this.maxX);
    this.facing = facing;
    this.maxHealth = this.combat().maxHealth;
    this.health = this.maxHealth;
    this.velocityY = 0;
    this.grounded = true;
    this.locked = false;
    this.defeated = false;
    this.frozen = true;
    this.hitstunTimer = 0;
    this.stunIsBlock = false;
    this.stunBlockLow = false;
    this.knockbackVel = 0;
    this.attackConnected = true;
    this.currentHitConnected = false;
    this.currentMoveKind = null;
    this.oneShotToken += 1;
    this.dashTimer = 0;
    this.dashVel = 0;
    this.invulnTimer = 0;
    this.lungeVel = 0;
    this.attackActiveLast = false;
    this.meter = 0;
    this.ultimateCooldown = 0;
    this.downedTimer = 0;
    this.downedLyingApplied = false;
    this.grappleMode = 'none';
    this.duckChokeTimer = 0;
    this.eagleSlamTimer = 0;
    this.bayasaaKickStep = 0;
    this.bayasaaKickStartedAt = -Infinity;
    this.bayasaaLastKickEndedAt = -Infinity;
    this.currentAnimKey = '';
    this.currentReverse = false;
    this.resetVisualTransform();

    this.sprite.setPosition(this.posX, this.groundY).setFlipX(this.facing === 1).setAlpha(1);
    this.playState(this.actionKeys.idle, true);
    this.updateShadow();
  }

  /**
   * Advances the fighter one frame.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  update(seconds: number, input: FighterInput): void {
    try {
      this.ultimateCooldown = Math.max(0, this.ultimateCooldown - seconds);

      if (this.defeated) {
        this.applyKnockback(seconds);
        this.updateShadow();
        this.drawBoundsOverlay();
        return;
      }

      if (this.frozen) {
        this.playState(this.actionKeys.idle, true);
        this.drawBoundsOverlay();
        return;
      }

      if (this.grappleMode !== 'none') {
        this.updateShadow();
        this.drawBoundsOverlay();
        return;
      }

      if (this.downedTimer > 0) {
        this.downedTimer = Math.max(0, this.downedTimer - seconds);
        this.applyKnockback(seconds);

        if (this.downedTimer <= 1.65 && !this.downedLyingApplied) {
          this.downedLyingApplied = true;
          this.setLyingDownPose();
        }

        this.updateShadow();

        if (this.downedTimer === 0) {
          this.locked = false;
          this.currentAnimKey = '';
          this.resetVisualTransform();
          this.playState(this.actionKeys.idle, true);
        }

        this.drawBoundsOverlay();
        return;
      }

      if (this.invulnTimer > 0) {
        this.invulnTimer = Math.max(0, this.invulnTimer - seconds);
        this.sprite.setAlpha(this.invulnTimer > 0 ? 0.62 : 1);
      }

      if (this.hitstunTimer > 0) {
        this.hitstunTimer = Math.max(0, this.hitstunTimer - seconds);
        this.applyKnockback(seconds);
        this.playState(
          this.stunIsBlock
            ? this.stunBlockLow
              ? this.actionKeys.blockLow
              : this.actionKeys.blockHigh
            : this.actionKeys.hitHigh,
          false
        );
        this.updateShadow();

        if (this.hitstunTimer === 0) {
          this.currentAnimKey = '';
          this.sprite.setAngle(0);
        }

        this.drawBoundsOverlay();
        return;
      }

      if (this.lungeVel !== 0) {
        this.applyLunge(seconds);
      }

      if (this.duckChokeTimer > 0) {
        this.duckChokeTimer = Math.max(0, this.duckChokeTimer - seconds);
        if (this.duckChokeTimer === 0) {
          this.locked = false;
          this.currentMoveKind = null;
          this.currentAnimKey = '';
          this.resetVisualTransform();
          this.playState(this.actionKeys.idle, true);
        }
        this.drawBoundsOverlay();
        return;
      }

      if (this.eagleSlamTimer > 0) {
        this.eagleSlamTimer = Math.max(0, this.eagleSlamTimer - seconds);
        if (this.eagleSlamTimer === 0) {
          this.locked = false;
          this.currentMoveKind = null;
          this.currentAnimKey = '';
          this.resetVisualTransform();
          this.playState(this.actionKeys.idle, true);
        }
        this.drawBoundsOverlay();
        return;
      }

      if (!this.grounded) {
        this.updateAirborne(seconds, input);
      } else if (this.locked) {
        this.tryGroundedComboCancel(input);
      } else {
        this.updateGrounded(seconds, input);
      }

      this.updateAttackWindow();
      this.drawBoundsOverlay();
    } finally {
      const isAttacking = this.locked && this.currentAttackKind() !== null;
      this.spiritVisuals?.update(
        seconds,
        this.posX,
        this.groundY,
        this.sprite?.y ?? this.groundY,
        this.appliedScale || 1,
        this.facing,
        isAttacking,
        this.defeated
      );
    }
  }

  /** Destroys the fighter's display objects. */
  destroy(): void {
    this.sprite?.removeAllListeners();
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.boundsGraphics?.destroy();
    this.spiritVisuals?.destroy();
  }

  /**
   * Resolves the per-action animation keys for this character, falling back to
   * the first available animation for any missing action.
   */
  private resolveActionKeys(): FighterActionKeys {
    const key = (action: string): string =>
      findCharacterAnimationKeyByAction(this.character.id, action) ?? this.character.animations[0].key;

    return {
      idle: key('idle'),
      walkForward: key('walk-forward'),
      walkBackward: key('walk-backward'),
      crouch: key('crouch'),
      jump: key('jump'),
      blockHigh: key('block-high'),
      blockLow: findCharacterAnimationKeyByAction(this.character.id, 'block-low') ?? key('block-high'),
      hitHigh: key('hit-high'),
      lightPunch: key('light-punch'),
      heavy:
        findCharacterAnimationKeyByAction(this.character.id, 'heavy-kick') ??
        findCharacterAnimationKeyByAction(this.character.id, 'heavy-punch') ??
        key('light-punch'),
      specialCharge: findCharacterAnimationKeyByAction(this.character.id, 'special-charge') ?? key('crouch'),
      special: findCharacterAnimationKeyByAction(this.character.id, 'special') ?? key('heavy-kick'),
      knockdown: key('knockdown')
    };
  }

  /** Current persisted stats for this fighter. */
  private stats(): FighterStats {
    return getFighterStats(this.app.debugStore.getState().fighterPlayground, this.character.id);
  }

  /** Current persisted combat tuning for this fighter. */
  private combat(): FighterCombat {
    return getFighterCombat(this.app.debugStore.getState().fighterPlayground, this.character.id);
  }

  /**
   * The attack kind currently being thrown (`high` = light, `low` = heavy), or
   * null when the fighter isn't mid-strike.
   */
  private currentAttackKind(): AttackKind | null {
    if (!this.locked) {
      return null;
    }
    if (this.currentAnimKey === this.actionKeys.lightPunch) {
      return 'high';
    }
    if (this.currentAnimKey === this.actionKeys.heavy) {
      return 'low';
    }
    if (this.currentAnimKey === this.actionKeys.special) {
      return 'special';
    }

    return null;
  }

  /** The fighter's active animation definition, or null when none is playing. */
  private currentAnimation(): HeroAnimationDefinition | null {
    const animKey = this.sprite.anims.currentAnim?.key ?? this.currentAnimKey;
    if (!animKey) {
      return null;
    }

    return getCharacterAnimationDefinition(this.character.id, animKey);
  }

  /**
   * Advances knockback: slides the fighter by the current knockback velocity and
   * decays it toward zero by friction.
   * @param seconds - Delta time in seconds.
   */
  private applyKnockback(seconds: number): void {
    if (this.knockbackVel === 0) {
      return;
    }

    this.posX = Phaser.Math.Clamp(this.posX + this.knockbackVel * seconds, this.minX, this.maxX);
    this.sprite.x = this.posX;

    const decay = KNOCKBACK_FRICTION * seconds;
    this.knockbackVel =
      this.knockbackVel > 0
        ? Math.max(0, this.knockbackVel - decay)
        : Math.min(0, this.knockbackVel + decay);
  }

  /**
   * Builds the sprite (feet-anchored, facing the opponent) and ground shadow.
   * @param depth - The display depth for the sprite (shadow renders just under).
   */
  private build(depth: number): void {
    const scale = this.stats().scale;
    this.appliedScale = scale;
    this.depthBase = depth;

    this.shadow = this.scene.add
      .ellipse(
        this.posX,
        this.groundY - SHADOW_FOOT_OFFSET * scale,
        Math.round(107 * scale),
        Math.round(24 * scale),
        0x000000,
        1
      )
      .setAlpha(0.32)
      .setDepth(depth - 1);

    this.sprite = this.scene.add
      .sprite(this.posX, this.groundY, this.actionKeys.idle, 0)
      .setOrigin(0.5, this.character.anchor.y)
      .setScale(scale)
      .setFlipX(this.facing === 1)
      .setDepth(depth);

    this.restoreBaseTint();

    if (this.martialMeta) {
      this.spiritVisuals = new FighterSpiritVisuals(this.scene, this.martialMeta, depth);
    }

    this.boundsGraphics = this.scene.add.graphics().setDepth(depth + 45);

    this.playState(this.actionKeys.idle, true);
  }

  /** Restacks the sprite, shadow, and bounds overlay around the base depth. */
  private applyDepths(): void {
    this.shadow.setDepth(this.depthBase - 1);
    this.sprite.setDepth(this.depthBase);
    this.spiritVisuals?.setDepthBase(this.depthBase);
    this.boundsGraphics.setDepth(this.depthBase + 45);
  }

  private applyLunge(seconds: number): void {
    this.posX = Phaser.Math.Clamp(this.posX + this.lungeVel * seconds, this.minX, this.maxX);
    this.sprite.x = this.posX;
    this.updateShadow();

    const decay = KNOCKBACK_FRICTION * 1.4 * seconds;
    this.lungeVel =
      this.lungeVel > 0 ? Math.max(0, this.lungeVel - decay) : Math.min(0, this.lungeVel + decay);
  }

  /**
   * Advances the jump arc, allows light air drift and air attacks, and lands on
   * the ground axis.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  private updateAirborne(seconds: number, input: FighterInput): void {
    const stats = this.stats();
    this.velocityY += stats.gravity * seconds;
    let nextY = this.sprite.y + this.velocityY * seconds;

    const drift = this.horizontalDirection(input);
    if (drift !== 0) {
      this.posX = Phaser.Math.Clamp(this.posX + drift * stats.airDrift * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
    }

    if (!this.locked) {
      if (input.light) {
        this.startAirAttack(this.actionKeys.lightPunch, 'airLight');
      } else if (input.heavy) {
        this.startAirAttack(this.actionKeys.heavy, 'airHeavy');
      }
    } else if (canCancelMove(this.currentMoveKind, 'airHeavy', this.currentHitConnected) && input.heavy) {
      this.startAirAttack(this.actionKeys.heavy, 'airHeavy');
    }

    if (nextY >= this.groundY) {
      nextY = this.groundY;
      this.velocityY = 0;
      this.grounded = true;
      this.locked = false;
      this.oneShotToken += 1;
      this.currentMoveKind = null;
      this.currentHitConnected = false;
      this.currentAnimKey = '';
      this.currentReverse = false;
      this.sprite.anims.timeScale = 1;
    }

    this.sprite.y = nextY;
    this.updateShadow();
  }

  /**
   * Resolves grounded behaviour: specials/EX, throws, jumps, strikes (standing &
   * crouching), dashes, held block/crouch, walking, then idle.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  private updateGrounded(seconds: number, input: FighterInput): void {
    const requestedMove = this.resolveGroundedAttackInput(input);
    if (requestedMove) {
      this.dashTimer = 0;
      this.dashVel = 0;
      this.launchGroundedMove(requestedMove);
      return;
    }

    if (input.jump) {
      this.dashTimer = 0;
      this.dashVel = 0;
      this.startJump();
      return;
    }

    if (input.dash !== 0) {
      this.startDash(input.dash);
    }

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - seconds);
      this.posX = Phaser.Math.Clamp(this.posX + this.dashVel * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
      this.updateShadow();
      this.sprite.anims.timeScale = 1.6;
      this.playWalk(this.dashVel * this.facing > 0);
      if (this.dashTimer === 0) {
        this.sprite.anims.timeScale = 1;
      }
      return;
    }

    this.sprite.anims.timeScale = 1;

    if (input.block) {
      this.playState(input.crouch ? this.actionKeys.blockLow : this.actionKeys.blockHigh, false);
      return;
    }
    if (input.crouch) {
      this.playState(this.actionKeys.crouch, false);
      return;
    }

    const direction = this.horizontalDirection(input);
    if (direction !== 0) {
      const stats = this.stats();
      this.posX = Phaser.Math.Clamp(this.posX + direction * stats.walkSpeed * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
      this.updateShadow();
      this.playWalk(direction === this.facing);
      return;
    }

    this.playState(this.actionKeys.idle, true);
  }

  private resolveGroundedAttackInput(input: FighterInput): CombatMoveKind | null {
    if (input.ultimate && this.ultimateCooldown <= 0) {
      if (this.character.id === 'blue-striker') {
        return 'icyBodyShot';
      }
      if (this.character.id === 'bayasaa') {
        // Handled as Duck Under -> Triangle Choke
        this.startBayasaaDuckChoke();
        return null;
      }
      if (this.martialMeta) {
        switch (this.martialMeta.ultimateStyle) {
          case 'tigerKnee':
            return 'tigerKnee';
          case 'tornadoKick':
            return 'tornadoKick';
          case 'eagleSlam':
          case 'bearSlam':
            this.startMongolBokhEagleSlamCharge();
            return null;
          case 'weaponSlash':
            return 'weaponSlash';
          case 'cycloneStrike':
            return 'cycloneStrike';
          case 'spiritRush':
          default:
            return 'spiritStrike';
        }
      }
    }
    if (input.special) {
      if (this.isMeterReady) {
        return 'special';
      }
      if (this.isExReady) {
        return 'exBurst';
      }
    }
    if (input.throw || (input.light && input.heavy)) {
      return 'throw';
    }
    if (input.crouch && input.heavy) {
      return 'sweep';
    }
    if (input.crouch && input.light) {
      return 'crouchLight';
    }
    if (input.heavy) {
      if (this.character.id === 'bayasaa') {
        return this.resolveBayasaaHeavyMove();
      }
      return 'heavy';
    }
    if (input.light) {
      return 'light';
    }
    return null;
  }

  private resolveBayasaaHeavyMove(): CombatMoveKind {
    const finisherDamage = buildCombatAttackProfile(this.combat(), 'roundhouse540').damage;
    if (this.isOpponentOneHitKo?.(finisherDamage)) {
      this.bayasaaKickStep = 0;
      return 'roundhouse540';
    }

    const now = this.scene.time.now;
    const step = nextBayasaaKickStep(
      this.bayasaaKickStep,
      now - this.bayasaaLastKickEndedAt,
      BAYASAA_KICK_COMBO_WINDOW_MS
    );
    this.bayasaaKickStep = step;

    return step === 1 ? 'frontKick' : step === 2 ? 'spinHookKick' : 'spin360Kick';
  }

  private tryGroundedComboCancel(input: FighterInput): void {
    // Allow Bayasaa to chain Front Kick -> Spin Hook Kick -> 360° Spin Kick cleanly on G presses.
    if (
      this.character.id === 'bayasaa' &&
      input.heavy &&
      !input.crouch &&
      (this.currentMoveKind === 'frontKick' || this.currentMoveKind === 'spinHookKick')
    ) {
      const elapsedMs = this.scene.time.now - this.bayasaaKickStartedAt;
      if (this.currentHitConnected || elapsedMs >= 150) {
        const finisherDamage = buildCombatAttackProfile(this.combat(), 'roundhouse540').damage;
        if (this.isOpponentOneHitKo?.(finisherDamage)) {
          this.bayasaaKickStep = 0;
          this.launchGroundedMove('roundhouse540');
          return;
        }

        const nextStep: 2 | 3 = this.currentMoveKind === 'frontKick' ? 2 : 3;
        this.bayasaaKickStep = nextStep;
        this.launchGroundedMove(nextStep === 2 ? 'spinHookKick' : 'spin360Kick');
        return;
      }
    }

    const nextMove = this.resolveGroundedAttackInput(input);
    if (!nextMove || !canCancelMove(this.currentMoveKind, nextMove, this.currentHitConnected)) {
      return;
    }

    this.launchGroundedMove(nextMove);
  }

  private launchGroundedMove(moveKind: CombatMoveKind): void {
    switch (moveKind) {
      case 'icyBodyShot':
        this.startBlueStrikerUltimate();
        return;
      case 'tigerKnee':
        this.startMuayThaiUltimate();
        return;
      case 'tornadoKick':
        this.startTaekwondoUltimate();
        return;
      case 'spiritStrike':
      case 'weaponSlash':
      case 'cycloneStrike':
        this.startWorldUltimate(moveKind);
        return;
      case 'frontKick':
        this.startBayasaaKick('frontKick');
        return;
      case 'spinHookKick':
        this.startBayasaaKick('spinHookKick');
        return;
      case 'spin360Kick':
        this.startBayasaaKick('spin360Kick');
        return;
      case 'roundhouse540':
        this.startBayasaaKick('roundhouse540');
        return;
      case 'special':
        this.startSpecial();
        return;
      case 'exBurst':
        this.startExBurst();
        return;
      case 'throw':
        this.lungeVel = this.facing * 220;
        this.startOneShot(this.actionKeys.lightPunch, 'throw', 1.15);
        return;
      case 'sweep':
        this.lungeVel = this.facing * 120;
        this.startOneShot(this.actionKeys.heavy, 'sweep', 1.05);
        return;
      case 'crouchLight':
        this.startOneShot(this.actionKeys.lightPunch, 'crouchLight', 1.15);
        return;
      case 'heavy':
        this.startOneShot(this.actionKeys.heavy, 'heavy', 1);
        return;
      case 'light':
      default:
        this.startOneShot(this.actionKeys.lightPunch, 'light', 1);
        return;
    }
  }

  /**
   * Blue Striker L Ultimate: displays "ULTIMATE PUNCH" with pale icy frost aura
   * for 0.8s, then lunges forward with a freezing liver body shot.
   */
  private startBlueStrikerUltimate(): void {
    const token = ++this.oneShotToken;
    this.ultimateCooldown = 3.5;
    this.locked = true;
    this.dashTimer = 0;
    this.dashVel = 0;
    this.lungeVel = 0;
    this.currentMoveKind = 'icyBodyShot';
    this.currentHitConnected = false;
    this.attackConnected = true;
    this.resetVisualTransform();

    this.currentAnimKey = this.actionKeys.lightPunch;
    this.sprite.anims.stop();
    this.sprite.setTexture(this.actionKeys.lightPunch, 1);
    this.sprite.setTint(0xbae6fd);

    spawnUltimatePunchBanner(this.scene, 800);
    spawnFrostChargeAura(this.scene, this.posX, this.groundY - 104 * this.appliedScale, 800);
    playUltimateChargeSfx(this.app.settingsStore.getState());

    this.scene.time.delayedCall(800, () => {
      if (this.defeated || token !== this.oneShotToken || this.grappleMode !== 'none') {
        return;
      }

      this.lungeVel = this.facing * 540;
      this.startOneShot(this.actionKeys.lightPunch, 'icyBodyShot', 0.9);
      this.sprite.setTint(0xe0f2fe);
    });
  }

  /**
   * Bayasaa L Move: swift invulnerable Duck Under lunge that transitions into a
   * Triangle Choke if it reaches the opponent.
   */
  private startBayasaaDuckChoke(): void {
    this.ultimateCooldown = 3.5;
    this.locked = true;
    this.dashTimer = 0;
    this.dashVel = 0;
    this.invulnTimer = 0.34;
    this.duckChokeTimer = 0.32;
    this.lungeVel = this.facing * 540;
    this.currentMoveKind = null;
    this.attackConnected = true;
    this.resetVisualTransform();

    this.playState(this.actionKeys.crouch, false);
    spawnCombatCallout(this.scene, this.posX, this.groundY - 140, 'DUCK UNDER!', '#fb923c');
    spawnDashDust(this.scene, this.posX, this.groundY, this.facing);
  }

  /**
   * Muay Thai L Ultimate: rushes forward and launches a leaping fiery Flying Tiger Knee.
   */
  private startMuayThaiUltimate(): void {
    this.ultimateCooldown = 3.5;
    this.spiritVisuals?.flare(0.7);
    this.lungeVel = this.facing * 580;
    this.startOneShot(this.actionKeys.heavy, 'tigerKnee', 0.85);
    this.sprite.setTint(0xfda4af);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.groundY - 48,
      duration: 180,
      yoyo: true,
      ease: 'Quad.Out'
    });
    spawnTigerKneeTrail(this.scene, this.posX, this.groundY - 104, this.facing);
  }

  /**
   * Taekwondo L Ultimate: launches upward in a 720° spinning hurricane vortex kick.
   */
  private startTaekwondoUltimate(): void {
    this.ultimateCooldown = 3.5;
    this.spiritVisuals?.flare(0.7);
    this.lungeVel = this.facing * 460;
    this.startOneShot(this.actionKeys.heavy, 'tornadoKick', 0.78);
    this.sprite.setTint(0x99f6e4);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: this.facing * 720,
      duration: 460,
      ease: 'Cubic.Out',
      onComplete: () => this.sprite?.setAngle(0)
    });
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.groundY - 68,
      duration: 230,
      yoyo: true,
      ease: 'Quad.Out'
    });
    spawnTornadoKickVortex(this.scene, this.posX, this.groundY - 96, 520);
    playTornadoKickSfx(this.app.settingsStore.getState());
  }

  /**
   * Grappler L Ultimate: charges forward with country animal aura to grab and slam the opponent.
   */
  private startMongolBokhEagleSlamCharge(): void {
    this.ultimateCooldown = 3.5;
    this.spiritVisuals?.flare(0.75);
    this.locked = true;
    this.dashTimer = 0;
    this.dashVel = 0;
    this.invulnTimer = 0.34;
    this.eagleSlamTimer = 0.34;
    this.lungeVel = this.facing * 520;
    this.currentMoveKind = null;
    this.attackConnected = true;
    this.resetVisualTransform();

    this.playState(this.actionKeys.lightPunch, false);
    spawnEagleSlamAura(
      this.scene,
      this.posX,
      this.groundY - 96,
      this.martialMeta?.ultimateCallout ?? 'EAGLE SLAM!',
      this.martialMeta?.primaryColor ?? 0xfacc15,
      this.martialMeta?.secondaryColor ?? 0xfef08a
    );
    spawnDashDust(this.scene, this.posX, this.groundY, this.facing);
  }

  /**
   * World Martial Art L Ultimate: unleashes the nation's elemental spirit strike,
   * weapon slash, or cyclone spin kick.
   */
  private startWorldUltimate(moveKind: 'spiritStrike' | 'weaponSlash' | 'cycloneStrike'): void {
    this.ultimateCooldown = 3.5;
    this.spiritVisuals?.flare(0.75);

    const primary = this.martialMeta?.primaryColor ?? 0x38bdf8;
    const secondary = this.martialMeta?.secondaryColor ?? 0xfacc15;
    const callout = this.martialMeta?.ultimateCallout ?? 'SPIRIT ULTIMATE!';
    const isWeapon = moveKind === 'weaponSlash';

    this.lungeVel = this.facing * (moveKind === 'cycloneStrike' ? 480 : 550);
    this.startOneShot(
      moveKind === 'cycloneStrike' ? this.actionKeys.heavy : this.actionKeys.lightPunch,
      moveKind,
      0.84
    );
    this.sprite.setTint(primary);

    if (moveKind === 'cycloneStrike') {
      this.scene.tweens.add({
        targets: this.sprite,
        angle: this.facing * 360,
        duration: 360,
        ease: 'Cubic.Out',
        onComplete: () => this.sprite?.setAngle(0)
      });
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.groundY - 46,
        duration: 180,
        yoyo: true,
        ease: 'Quad.Out'
      });
    }

    spawnSpiritUltimateTrail(
      this.scene,
      this.posX,
      this.groundY - 98,
      this.facing,
      primary,
      secondary,
      callout,
      isWeapon
    );
    playSpiritUltimateSfx(this.app.settingsStore.getState(), isWeapon);
  }

  /**
   * Executes Bayasaa's 3-step kick chain (Front Kick -> Spin Hook Kick -> 360° Spin)
   * or the leaping 540° Roundhouse Kick KO finisher.
   */
  private startBayasaaKick(
    moveKind: 'frontKick' | 'spinHookKick' | 'spin360Kick' | 'roundhouse540'
  ): void {
    this.bayasaaKickStartedAt = this.scene.time.now;
    this.bayasaaLastKickEndedAt = this.scene.time.now + 460;

    if (moveKind === 'frontKick') {
      this.lungeVel = this.facing * 150;
      this.startOneShot(this.actionKeys.heavy, 'frontKick', 1.25);
      spawnKickComboTrail(this.scene, this.posX + this.facing * 42, this.groundY - 110, this.facing, 'front');
      return;
    }

    if (moveKind === 'spinHookKick') {
      this.lungeVel = this.facing * 220;
      this.startOneShot(this.actionKeys.heavy, 'spinHookKick', 1.15);
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: -this.appliedScale,
        duration: 110,
        yoyo: true,
        ease: 'Sine.InOut'
      });
      spawnKickComboTrail(this.scene, this.posX + this.facing * 36, this.groundY - 120, this.facing, 'spinHook');
      return;
    }

    if (moveKind === 'spin360Kick') {
      this.lungeVel = this.facing * 270;
      this.startOneShot(this.actionKeys.heavy, 'spin360Kick', 1.0);
      this.scene.tweens.add({
        targets: this.sprite,
        angle: this.facing * 360,
        duration: 320,
        ease: 'Cubic.Out',
        onComplete: () => this.sprite?.setAngle(0)
      });
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.groundY - 34,
        duration: 160,
        yoyo: true,
        ease: 'Quad.Out'
      });
      spawnKickComboTrail(this.scene, this.posX + this.facing * 30, this.groundY - 125, this.facing, 'spin360');
      return;
    }

    // 540° Roundhouse Kick KO Finisher
    this.lungeVel = this.facing * 360;
    this.startOneShot(this.actionKeys.heavy, 'roundhouse540', 0.92);
    this.sprite.setTint(0xfef08a);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: this.facing * 540,
      duration: 420,
      ease: 'Cubic.Out',
      onComplete: () => this.sprite?.setAngle(0)
    });
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.groundY - 52,
      duration: 210,
      yoyo: true,
      ease: 'Quad.Out'
    });
    spawnKickComboTrail(this.scene, this.posX + this.facing * 34, this.groundY - 135, this.facing, 'roundhouse540');
    spawnCombatCallout(this.scene, this.posX, this.groundY - 190, '540° ROUNDHOUSE!', '#facc15');
  }

  private restoreBaseTint(): void {
    if (!this.sprite) {
      return;
    }

    if (this.martialMeta && this.martialMeta.tintColor !== 0xffffff) {
      this.sprite.setTint(this.martialMeta.tintColor);
    } else {
      this.sprite.clearTint();
    }
  }

  private resetVisualTransform(): void {
    if (!this.sprite) {
      return;
    }
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.anims.timeScale = 1;
    this.sprite.setAngle(0);
    this.sprite.setScale(this.appliedScale);
    this.sprite.y = this.groundY;
    this.sprite.setAlpha(1);
    this.restoreBaseTint();
  }

  private playKnockdownPose(): void {
    if (!hasDedicatedKoSheet(this.spriteArchetypeId)) {
      this.currentAnimKey = this.actionKeys.idle;
      this.sprite.anims.stop();
      this.sprite.setTexture(this.actionKeys.idle, 0);
      this.scene.tweens.add({
        targets: this.sprite,
        angle: -this.facing * 88,
        y: this.groundY - 18,
        duration: 220,
        ease: 'Cubic.Out'
      });
      return;
    }

    const anim = getCharacterAnimationDefinition(this.character.id, this.actionKeys.knockdown);
    this.currentAnimKey = this.actionKeys.knockdown;
    this.sprite.play({ key: this.actionKeys.knockdown, repeat: 0 }, true);

    // Bayasaa's knockdown spritesheet ends with get-up frames (7-9); stop on the lying frame (5) on KO.
    if (this.spriteArchetypeId === 'bayasaa' && anim.sheet.frames >= 6) {
      this.scene.time.delayedCall(340, () => {
        if (this.defeated) {
          this.sprite?.anims.stop();
          this.sprite?.setTexture(this.actionKeys.knockdown, 5);
        }
      });
    }
  }

  private setLyingDownPose(): void {
    if (!hasDedicatedKoSheet(this.spriteArchetypeId)) {
      this.currentAnimKey = this.actionKeys.idle;
      this.sprite.anims.stop();
      this.sprite.setTexture(this.actionKeys.idle, 0);
      this.sprite.setAngle(-this.facing * 88);
      this.sprite.y = this.groundY - 18;
      return;
    }

    const anim = getCharacterAnimationDefinition(this.character.id, this.actionKeys.knockdown);
    const totalFrames = anim.sheet.frames;
    let lyingFrame = Math.max(0, totalFrames - 1);

    if (this.spriteArchetypeId === 'bayasaa' && totalFrames >= 6) {
      lyingFrame = 5;
    } else if (totalFrames >= 8) {
      lyingFrame = 6;
    }

    this.currentAnimKey = this.actionKeys.knockdown;
    this.sprite.anims.stop();
    this.sprite.setTexture(this.actionKeys.knockdown, lyingFrame);
  }

  /**
   * Returns -1 for left, +1 for right, or 0 when neutral/opposed.
   * @param input - The intent snapshot for this frame.
   */
  private horizontalDirection(input: FighterInput): number {
    return (input.right ? 1 : 0) - (input.left ? 1 : 0);
  }

  /**
   * Plays a looping or hold animation, switching only when the state (key or
   * playback direction) changes.
   * @param animKey - The animation key to play.
   * @param loop - Whether the animation should loop.
   * @param reverse - Whether to play the animation in reverse.
   */
  private playState(animKey: string, loop: boolean, reverse = false): void {
    if (this.currentAnimKey === animKey && this.currentReverse === reverse) {
      return;
    }

    this.currentAnimKey = animKey;
    this.currentReverse = reverse;

    // ignoreIfPlaying must be false so a forward->reverse switch on the same
    // key (reverse walk) is applied; the guard above prevents per-frame restarts.
    const config: Phaser.Types.Animations.PlayAnimationConfig = { key: animKey, repeat: loop ? -1 : 0 };
    if (reverse) {
      this.sprite.playReverse(config, false);
    } else {
      this.sprite.play(config, false);
    }
  }

  /**
   * Plays the appropriate walk animation. Backward walking uses the dedicated
   * backward animation, or the forward animation played in reverse when the
   * persisted "use reverse walk anims" setting is enabled.
   * @param movingForward - Whether the fighter is walking in its facing direction.
   */
  private playWalk(movingForward: boolean): void {
    if (movingForward) {
      this.playState(this.actionKeys.walkForward, true);
      return;
    }

    const reverseWalk = this.app.debugStore.getState().fighterPlayground.reverseWalk;
    if (reverseWalk) {
      this.playState(this.actionKeys.walkForward, true, true);
      return;
    }

    this.playState(this.actionKeys.walkBackward, true);
  }

  private startDash(direction: -1 | 1): void {
    const isForward = direction === this.facing;
    const stats = this.stats();
    this.dashTimer = isForward ? 0.18 : 0.2;
    this.dashVel = direction * stats.walkSpeed * (isForward ? 2.6 : 2.2);
    if (!isForward) {
      this.invulnTimer = 0.16;
    }
    spawnDashDust(this.scene, this.posX, this.groundY, direction);
  }

  /**
   * Plays a one-shot action that locks input until it completes, then returns
   * to idle.
   * @param animKey - The action animation key to play.
   * @param moveKind - The semantic move kind for profile & combo cancels.
   * @param timeScale - Playback speed multiplier.
   */
  private startOneShot(animKey: string, moveKind: CombatMoveKind, timeScale = 1): void {
    const token = ++this.oneShotToken;
    this.resetVisualTransform();
    this.spiritVisuals?.flare(0.28);
    this.locked = true;
    this.currentMoveKind = moveKind;
    this.currentHitConnected = false;
    this.currentAnimKey = animKey;
    this.currentReverse = false;
    this.attackId += 1;
    this.attackConnected = false;
    this.sprite.anims.timeScale = timeScale;
    this.sprite.play({ key: animKey, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${animKey}`, () => {
      if (token !== this.oneShotToken) {
        return;
      }

      if (
        moveKind === 'frontKick' ||
        moveKind === 'spinHookKick' ||
        moveKind === 'spin360Kick' ||
        moveKind === 'roundhouse540'
      ) {
        this.bayasaaLastKickEndedAt = this.scene.time.now;
      }

      this.locked = false;
      this.currentMoveKind = null;
      this.currentHitConnected = false;
      this.currentAnimKey = '';
      this.resetVisualTransform();

      if (this.grounded) {
        this.playState(this.actionKeys.idle, true);
      }
    });
  }

  private startAirAttack(animKey: string, moveKind: 'airLight' | 'airHeavy'): void {
    const token = ++this.oneShotToken;
    this.locked = true;
    this.currentMoveKind = moveKind;
    this.currentHitConnected = false;
    this.currentAnimKey = animKey;
    this.currentReverse = false;
    this.attackId += 1;
    this.attackConnected = false;
    this.sprite.anims.timeScale = 1.1;
    this.sprite.play({ key: animKey, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${animKey}`, () => {
      if (token !== this.oneShotToken) {
        return;
      }

      this.locked = false;
      this.currentMoveKind = null;
      this.currentHitConnected = false;
      this.sprite.anims.timeScale = 1;

      if (!this.grounded) {
        this.playState(this.actionKeys.jump, false);
      } else {
        this.currentAnimKey = '';
        this.playState(this.actionKeys.idle, true);
      }
    });
  }

  /**
   * Executes a fast 50%-meter EX Burst strike with forward lunge and burst aura.
   */
  private startExBurst(): void {
    this.meter = Math.max(0, this.meter - EX_METER_COST);
    this.lungeVel = this.facing * 260;
    spawnExAura(this.scene, this.sprite.x, this.sprite.y - this.sprite.displayHeight * 0.48);
    this.startOneShot(this.actionKeys.heavy, 'exBurst', 1.25);
  }

  /**
   * Performs the meter special: consumes the full meter, plays the charge
   * (wind-up) animation, then chains into the multi-hit execution animation, and
   * finally returns to idle. The execution's attack-active spans each open a new
   * hit window so the move lands a combo.
   */
  private startSpecial(): void {
    const token = ++this.oneShotToken;
    this.locked = true;
    this.meter = 0;
    this.currentMoveKind = 'special';
    this.currentHitConnected = false;
    this.currentReverse = false;
    this.attackConnected = true;
    this.attackActiveLast = false;
    this.sprite.anims.timeScale = 1;

    this.onSpecialStart?.(this);
    spawnChargeAura(this.scene, this.sprite.x, this.sprite.y - this.sprite.displayHeight * 0.45);

    this.currentAnimKey = this.actionKeys.specialCharge;
    this.sprite.play({ key: this.actionKeys.specialCharge, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${this.actionKeys.specialCharge}`, () => {
      if (this.defeated || token !== this.oneShotToken) {
        return;
      }

      // Super freeze: hold the charged pose so the cut-in cinematic peaks before
      // the move launches.
      this.scene.time.delayedCall(SUPER_FREEZE_MS, () => {
        if (!this.defeated && token === this.oneShotToken) {
          this.executeSpecial(token);
        }
      });
    });
  }

  /**
   * Launches the multi-hit special execution animation after the charge/super
   * freeze, then returns to idle. Each attack-active span opens a fresh hit
   * window so the move lands a combo.
   */
  private executeSpecial(token: number): void {
    this.currentAnimKey = this.actionKeys.special;
    this.currentMoveKind = 'special';
    this.attackId += 1;
    this.attackConnected = false;
    this.attackActiveLast = false;
    this.sprite.play({ key: this.actionKeys.special, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${this.actionKeys.special}`, () => {
      if (token !== this.oneShotToken) {
        return;
      }

      this.locked = false;
      this.currentMoveKind = null;
      this.currentHitConnected = false;
      this.currentAnimKey = '';

      if (this.grounded) {
        this.playState(this.actionKeys.idle, true);
      }
    });
  }

  /**
   * Opens a fresh hit window each time the attack box turns on after being off,
   * so a single animation with several attack-active spans connects once per
   * span (multi-hit specials). Single-span normal attacks are unaffected.
   */
  private updateAttackWindow(): void {
    const active = this.isAttackActiveFrame();

    if (active && !this.attackActiveLast) {
      this.attackConnected = false;
    }

    this.attackActiveLast = active;
  }

  /**
   * Whether the current animation frame has an attack box (independent of
   * whether the current swing has already connected).
   */
  private isAttackActiveFrame(): boolean {
    if (this.currentAttackKind() === null) {
      return false;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return false;
    }

    return Boolean(this.resolvedFrame(animation).attack);
  }

  /**
   * Whether any frame after the given index in the animation still has an attack
   * box — used to detect the final hit window of a special (the finisher).
   * @param animation - The active animation.
   * @param frameIndex - The current frame index.
   */
  private hasAttackFrameAfter(animation: HeroAnimationDefinition, frameIndex: number): boolean {
    return animation.bounds.some((frame) => frame.frame > frameIndex && frame.attack !== null);
  }

  /** Launches a jump, playing the jump animation while physics drives the arc. */
  private startJump(): void {
    this.grounded = false;
    this.velocityY = -Math.abs(this.stats().jump);
    this.currentAnimKey = this.actionKeys.jump;
    this.currentReverse = false;
    this.sprite.play({ key: this.actionKeys.jump, repeat: 0 }, true);
  }

  /**
   * Redraws the enabled debug bounds (visual/collision/hit/attack) for the
   * fighter's current animation frame, driven by `debugStore.fighterPlayground.
   * bounds`. Boxes active on the current frame draw solid; boxes only active on
   * other frames draw faint using a representative rect.
   */
  private drawBoundsOverlay(): void {
    this.boundsGraphics.clear();

    const bounds = this.app.debugStore.getState().fighterPlayground.bounds;
    if (FIGHTER_BOUNDS_FIELDS.every((field) => !bounds[field.id])) {
      return;
    }

    const animKey = this.sprite.anims.currentAnim?.key ?? this.currentAnimKey;
    if (!animKey) {
      return;
    }

    const animation = getCharacterAnimationDefinition(this.character.id, animKey);
    if (animation.bounds.length === 0) {
      return;
    }

    const boundsFrame = this.resolvedFrame(animation);

    FIGHTER_BOUNDS_FIELDS.forEach((field) => {
      if (!bounds[field.id]) {
        return;
      }

      const active = boundsFrame[field.id];
      const rect = active ?? this.representativeBoundsRect(animation, field.id);
      if (!rect) {
        return;
      }

      this.strokeBoundsRect(animation, rect, BOUNDS_COLORS[field.id], active ? BOUNDS_ALPHA_ACTIVE : BOUNDS_ALPHA_INACTIVE);
    });
  }

  /**
   * Finds the first frame that defines the given bounds kind, used as a faint
   * placeholder on frames where that kind is inactive.
   * @param animation - The animation whose frames are scanned.
   * @param kind - The bounds kind to look up.
   */
  private representativeBoundsRect(
    animation: HeroAnimationDefinition,
    kind: keyof FighterBoundsVisibility
  ): Rect | null {
    for (const frame of animation.bounds) {
      const rect = frame[kind];
      if (rect) {
        return rect;
      }
    }

    return null;
  }

  /**
   * Strokes (and faintly fills) a frame-local rect in world space, accounting
   * for the fighter's origin, scale, and horizontal flip.
   * @param animation - The active animation (for frame dimensions).
   * @param rect - The frame-local rect to draw.
   * @param color - Stroke/fill colour.
   * @param alpha - Stroke alpha (fill uses a fraction of it).
   */
  private strokeBoundsRect(animation: HeroAnimationDefinition, rect: Rect, color: number, alpha: number): void {
    const world = this.frameRectToWorld(animation, rect);

    this.boundsGraphics.fillStyle(color, alpha * 0.18);
    this.boundsGraphics.fillRect(world.x, world.y, world.width, world.height);
    this.boundsGraphics.lineStyle(2, color, alpha);
    this.boundsGraphics.strokeRect(world.x, world.y, world.width, world.height);
  }

  /**
   * Converts a frame-local rect to a world-space rectangle, accounting for the
   * sprite's origin, scale, and horizontal flip.
   * @param animation - The active animation (for frame dimensions).
   * @param rect - The frame-local rect to convert.
   */
  private frameRectToWorld(animation: HeroAnimationDefinition, rect: Rect): Phaser.Geom.Rectangle {
    const frameWidth = animation.sheet.frameWidth;
    const left = this.sprite.x - this.sprite.displayWidth * this.sprite.originX;
    const top = this.sprite.y - this.sprite.displayHeight * this.sprite.originY;
    const scaleX = this.sprite.displayWidth / frameWidth;
    const scaleY = this.sprite.displayHeight / animation.sheet.frameHeight;
    const localX = this.sprite.flipX ? frameWidth - (rect.x + rect.width) : rect.x;

    return new Phaser.Geom.Rectangle(left + localX * scaleX, top + rect.y * scaleY, rect.width * scaleX, rect.height * scaleY);
  }

  /**
   * Resolves the current frame's bounds with the persisted Character Gym
   * overrides applied, so authored hit/attack/guard boxes drive live combat
   * (not just the gym preview).
   * @param animation - The active animation.
   */
  private resolvedFrame(animation: HeroAnimationDefinition): HeroBoundsFrame {
    const overrides = this.app.debugStore.getState().characterGym.boundsOverrides;

    return resolveHeroBoundsFrame(animation, this.currentFrameIndex(animation), overrides);
  }

  /**
   * Resolves the sprite's current animation frame index, clamped to range.
   * @param animation - The active animation.
   */
  private currentFrameIndex(animation: HeroAnimationDefinition): number {
    const frameName = Number(this.sprite.frame.name);
    const lastFrame = animation.sheet.frames - 1;

    if (Number.isFinite(frameName)) {
      return Phaser.Math.Clamp(frameName, 0, lastFrame);
    }

    return 0;
  }

  /** Keeps the ground shadow under the fighter and shrinks it as they rise. */
  private updateShadow(): void {
    const airborneLift = Phaser.Math.Clamp((this.groundY - this.sprite.y) / 220, 0, 1);

    this.shadow.x = this.posX;
    this.shadow.setScale(1 - airborneLift * 0.45);
    this.shadow.setAlpha(0.32 - airborneLift * 0.18);
  }
}
