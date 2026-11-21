import * as Phaser from 'phaser';

import { AUDIO_KEYS } from '../game/core/audio';
import {
  playEagleSlamSfx,
  playFlameRingSfx,
  playIcyBodyShotSfx,
  playKnockOutVoice,
  playSpiritUltimateSfx,
  playTigerKneeSfx,
  playTriangleTapSfx
} from '../game/core/combatAudio';
import type { SceneMusicController } from '../game/core/music';
import {
  DoubleTapDashTracker,
  EAGLE_SLAM_DAMAGE,
  isAttackGuarded,
  isOneHitKoRange,
  TRIANGLE_CHOKE_TAP1_DAMAGE,
  TRIANGLE_CHOKE_TAP2_DAMAGE
} from '../game/combatActions';
import { CpuController } from '../game/cpuController';
import { Fighter, NEUTRAL_FIGHTER_INPUT, type FighterInput } from '../game/fighter';
import { getCharacterDefinition } from '../game/hero';
import { MatchHud } from '../game/matchHud';
import {
  spawnEagleSlamImpact,
  spawnFlamingTriangleRing,
  spawnIcyBodyShotImpact,
  spawnSpiritUltimateImpact,
  spawnTapOutImpact,
  spawnTigerKneeImpact,
  spawnTornadoImpact,
  type TriangleArmGeometry
} from '../game/specialVfx';
import { getStageDefinition } from '../game/stageConfig';
import { playSuperCutIn } from '../game/superCutIn';
import { SCENE_KEYS, type MatchConfig } from '../game/types';
import { spawnCombatCallout, spawnHitSpark, spawnThrowSpark, type VfxColor } from '../game/vfx';
import { getMartialArtMeta } from '../game/worldMartialArts';
import { BaseScene } from './BaseScene';

const GROUND_FRACTION = 0.82;
const EDGE_MARGIN = 170;
const DEPTH_FRONT = 8;
const DEPTH_BACK = 5;

// Fraction of the gap from the screen centre each fighter occupies at spawn.
const SPAWN_OFFSET_FRACTION = 0.18;
// How quickly the camera eases toward the fighters' midpoint (0..1 per frame).
const CAMERA_LERP = 0.14;

const ROUNDS_TO_WIN = 2;
// Seconds on the round clock. When it expires the fighter with more health wins
// (a tie is a draw and replays the round).
const ROUND_SECONDS = 60;
const HUD_DEPTH = 100;
const BANNER_DEPTH = 200;
const OVERLAY_DEPTH = 300;

/** The match's high-level state, driving input gating and the HUD. */
type MatchPhase = 'intro' | 'fighting' | 'roundEnd' | 'matchOver';

interface PlayerKeys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  crouch: Phaser.Input.Keyboard.Key;
  block: Phaser.Input.Keyboard.Key;
  jump: Phaser.Input.Keyboard.Key;
  light: Phaser.Input.Keyboard.Key;
  heavy: Phaser.Input.Keyboard.Key;
  special: Phaser.Input.Keyboard.Key;
  throw: Phaser.Input.Keyboard.Key;
  ultimate: Phaser.Input.Keyboard.Key;
  altUltimate?: Phaser.Input.Keyboard.Key;
}

interface ActiveTriangleChoke {
  attacker: Fighter;
  defender: Fighter;
  cleanupRing: () => void;
  timers: Phaser.Time.TimerEvent[];
}

interface ActiveEagleSlam {
  attacker: Fighter;
  defender: Fighter;
  timers: Phaser.Time.TimerEvent[];
}

/**
 * The versus match: two fighters spawn facing each other and fight a best-of-3
 * (first to {@link ROUNDS_TO_WIN} rounds). Each round runs a "ROUND n / FIGHT!"
 * intro, then live combat — attack boxes vs hurtboxes drive damage, hitstun,
 * knockback, and a knockdown on KO. When the match is decided a game-over
 * overlay offers a rematch or a return to the main menu. P1 is always human;
 * P2 is human in 1v1 or a simple CPU in 1vCPU.
 */
export class MatchScene extends BaseScene {
  private config: MatchConfig = {
    mode: '1v1',
    stageId: 'mma-octagon',
    p1CharacterId: '',
    p2CharacterId: ''
  };

  private p1!: Fighter;
  private p2!: Fighter;
  private p1Keys!: PlayerKeys;
  private p2Keys!: PlayerKeys;
  private p1DashTracker = new DoubleTapDashTracker();
  private p2DashTracker = new DoubleTapDashTracker();
  private cpu?: CpuController;

  private p1ComboCount = 0;
  private p2ComboCount = 0;
  private lastDodgedSigP1 = -1;
  private lastDodgedSigP2 = -1;

  private phase: MatchPhase = 'intro';
  private roundNumber = 1;
  private p1Wins = 0;
  private p2Wins = 0;

  private spawnX1 = 0;
  private spawnX2 = 0;

  private stageWorldWidth = 0;
  private maxScroll = 0;

  private hud!: MatchHud;
  private banner!: Phaser.GameObjects.Text;
  private roundTimeMs = ROUND_SECONDS * 1000;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private music!: SceneMusicController;
  private activeChoke: ActiveTriangleChoke | null = null;
  private activeSlam: ActiveEagleSlam | null = null;

  constructor() {
    super(SCENE_KEYS.Match);
  }

  init(data: MatchConfig): void {
    if (data) {
      this.config = data;
    }
  }

  create(): void {
    this.cpu = undefined;
    this.phase = 'intro';
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.overlay = [];

    this.markActiveScene(SCENE_KEYS.Match);
    this.music = this.bindMusic(AUDIO_KEYS.preFightMusic);
    this.cameras.main.setBackgroundColor(0x05070d);

    this.buildStage();
    this.spawnFighters();
    this.registerKeys();
    this.createControlsLegend();

    this.hud = new MatchHud(this, {
      mode: this.config.mode,
      p1CharacterId: this.config.p1CharacterId,
      p2CharacterId: this.config.p2CharacterId,
      roundsToWin: ROUNDS_TO_WIN,
      depth: HUD_DEPTH
    });
    this.hud.slideIn();

    this.banner = this.add
      .text(this.cameras.main.centerX, this.cameras.main.centerY - 40, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '64px',
        stroke: '#020617',
        strokeThickness: 8
      })
      .setOrigin(0.5)
      .setDepth(BANNER_DEPTH)
      .setScrollFactor(0)
      .setAlpha(0);

    if (this.config.mode === '1vcpu') {
      this.cpu = new CpuController();
    }

    this.startRound();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearActiveChoke(false);
      this.clearActiveSlam(false);
      this.p1?.destroy();
      this.p2?.destroy();
      this.hud?.destroy();
    });
  }

  /**
   * Per-frame loop: feeds both fighters their input (only while fighting),
   * keeps them facing each other, resolves hits, checks for a KO, and redraws
   * the HUD.
   * @param time - Phaser clock time in ms.
   * @param delta - Milliseconds since the previous frame.
   */
  update(time: number, delta: number): void {
    const seconds = delta / 1000;
    const fighting = this.phase === 'fighting';

    const p1Input = fighting ? this.readKeys(this.p1Keys, this.p1DashTracker, time) : { ...NEUTRAL_FIGHTER_INPUT };
    const p2Input = fighting
      ? this.cpu
        ? this.cpu.update(time, this.p2, this.p1)
        : this.readKeys(this.p2Keys, this.p2DashTracker, time)
      : { ...NEUTRAL_FIGHTER_INPUT };

    this.p1.faceToward(this.p2.x);
    this.p2.faceToward(this.p1.x);

    if (fighting) {
      if (isActing(p1Input)) {
        this.p1.setDepthBase(DEPTH_FRONT);
        this.p2.setDepthBase(DEPTH_BACK);
      } else if (isActing(p2Input)) {
        this.p2.setDepthBase(DEPTH_FRONT);
        this.p1.setDepthBase(DEPTH_BACK);
      }
    }

    this.p1.update(seconds, p1Input);
    this.p2.update(seconds, p2Input);

    if (!this.p2.isInHitstun) {
      this.p1ComboCount = 0;
    }
    if (!this.p1.isInHitstun) {
      this.p2ComboCount = 0;
    }

    this.updateCamera(false);

    if (fighting) {
      this.resolveTriangleChokeGrab();
      this.resolveEagleSlamGrab();
      this.resolveCombat();
      this.checkForKnockout();

      if (this.phase === 'fighting') {
        this.tickRoundTimer(delta);
        this.hud.applyHealth(this.p1.health01, this.p2.health01);
      }
    }

    this.hud.setMeter(this.p1.meter01, this.p2.meter01);
    this.hud.setTime(Math.ceil(this.roundTimeMs / 1000));
    this.hud.updateWins(this.p1Wins, this.p2Wins);
  }

  /**
   * Checks both directions for a connecting hit and applies damage/block this
   * frame. A swing only lands once thanks to the attacker's connect flag.
   */
  private resolveCombat(): void {
    this.tryHit(this.p1, this.p2, 1);
    this.tryHit(this.p2, this.p1, 2);
  }

  private resolveTriangleChokeGrab(): void {
    if (this.activeChoke) {
      return;
    }

    if (this.tryCatchChoke(this.p1, this.p2)) {
      return;
    }

    this.tryCatchChoke(this.p2, this.p1);
  }

  private tryCatchChoke(attacker: Fighter, defender: Fighter): boolean {
    if (
      !attacker.isDuckChoking ||
      defender.isDefeated ||
      defender.isBodyDowned ||
      defender.isInvulnerable ||
      defender.isAirborne ||
      defender.isInGrapple
    ) {
      return false;
    }

    const reach = 148 * attacker.visualScale;
    if (Math.abs(defender.x - attacker.x) > reach) {
      return false;
    }

    this.startTriangleChoke(attacker, defender);
    return true;
  }

  private startTriangleChoke(attacker: Fighter, defender: Fighter): void {
    attacker.completeDuckGrab();
    const lockSpacing = 44 * attacker.visualScale;
    const defenderX = attacker.x + attacker.facingDirection * lockSpacing;
    defender.setPositionAndFacing(defenderX, attacker.facingDirection === 1 ? -1 : 1);
    attacker.setGrapplePose('choker');
    defender.setGrapplePose('trapped');

    const f = attacker.facingDirection;
    const scale = attacker.visualScale;
    const defHurt = defender.getHurtRect();
    const headX = defHurt
      ? defender.x - f * Math.min(18, defHurt.width * 0.14)
      : defender.x - f * 10 * scale;
    const headY = defHurt
      ? defHurt.y + defHurt.height * 0.24
      : attacker.groundBaselineY - 122 * scale;
    const armGeometry: TriangleArmGeometry = {
      headCenter: { x: headX, y: headY },
      pTopArm: { x: headX - f * 36 * scale, y: headY - 34 * scale },
      pElbowTip: { x: headX + f * 40 * scale, y: headY + 4 * scale },
      pUnderArm: { x: headX - f * 26 * scale, y: headY + 34 * scale }
    };
    const tapX = (armGeometry.pElbowTip.x + armGeometry.pUnderArm.x) / 2;
    const tapY = (armGeometry.pElbowTip.y + armGeometry.pUnderArm.y) / 2;
    const cleanupRing = spawnFlamingTriangleRing(this, headX, headY, 1450, armGeometry);

    spawnCombatCallout(this, headX, headY - 62, 'TRIANGLE CHOKE!', '#fb923c');
    playFlameRingSfx(this.app.settingsStore.getState());

    const runTap = (tapNumber: 1 | 2, damage: number): void => {
      if (this.phase !== 'fighting' || !this.activeChoke) {
        return;
      }

      defender.pulseTapMotion();
      spawnTapOutImpact(this, tapX, tapY, tapNumber);
      playTriangleTapSfx(this.app.settingsStore.getState());

      const ko = defender.applyDirectDamage(damage);
      this.hud.applyHealth(this.p1.health01, this.p2.health01);

      if (ko) {
        this.clearActiveChoke(false);
        attacker.releaseGrapple(0);
        spawnCombatCallout(this, defender.x, headY - 78, 'SUBMISSION K.O.!', '#facc15');
        playKnockOutVoice(this.app.settingsStore.getState());
        this.checkForKnockout();
      }
    };

    const timer1 = this.time.delayedCall(580, () => runTap(1, TRIANGLE_CHOKE_TAP1_DAMAGE));
    const timer2 = this.time.delayedCall(980, () => runTap(2, TRIANGLE_CHOKE_TAP2_DAMAGE));
    const releaseTimer = this.time.delayedCall(1440, () => {
      if (!this.activeChoke) {
        return;
      }

      this.clearActiveChoke(false);
      attacker.releaseGrapple(0);
      defender.releaseGrapple(attacker.facingDirection * 240);
    });

    this.activeChoke = {
      attacker,
      defender,
      cleanupRing,
      timers: [timer1, timer2, releaseTimer]
    };
  }

  private clearActiveChoke(releaseFighters: boolean): void {
    if (!this.activeChoke) {
      return;
    }

    const { attacker, defender, cleanupRing, timers } = this.activeChoke;
    this.activeChoke = null;
    timers.forEach((timer) => timer.remove(false));
    cleanupRing();

    if (releaseFighters) {
      attacker.releaseGrapple(0);
      defender.releaseGrapple(0);
    }
  }

  private resolveEagleSlamGrab(): void {
    if (this.activeSlam || this.activeChoke) {
      return;
    }

    if (this.tryCatchEagleSlam(this.p1, this.p2)) {
      return;
    }

    this.tryCatchEagleSlam(this.p2, this.p1);
  }

  private tryCatchEagleSlam(attacker: Fighter, defender: Fighter): boolean {
    if (
      !attacker.isEagleCharging ||
      defender.isDefeated ||
      defender.isBodyDowned ||
      defender.isInvulnerable ||
      defender.isAirborne ||
      defender.isInGrapple
    ) {
      return false;
    }

    const reach = 152 * attacker.visualScale;
    if (Math.abs(defender.x - attacker.x) > reach) {
      return false;
    }

    this.startEagleSlam(attacker, defender);
    return true;
  }

  private startEagleSlam(attacker: Fighter, defender: Fighter): void {
    attacker.completeDuckGrab();
    const slamTargetX = attacker.x + attacker.facingDirection * 68 * attacker.visualScale;
    defender.setPositionAndFacing(
      attacker.x + attacker.facingDirection * 40 * attacker.visualScale,
      attacker.facingDirection === 1 ? -1 : 1
    );
    attacker.setGrapplePose('slammer');
    defender.setGrapplePose('slammed');
    defender.animateEagleSlamVictim(slamTargetX, 340, 130);

    const slamTimer = this.time.delayedCall(470, () => {
      if (this.phase !== 'fighting' || !this.activeSlam) {
        return;
      }

      const attackerMeta = getMartialArtMeta(attacker.characterId);
      const slamCallout = attackerMeta?.ultimateCallout ?? 'EAGLE SLAM!';
      const primary = attackerMeta?.primaryColor ?? 0xfacc15;
      const secondary = attackerMeta?.secondaryColor ?? 0xfef08a;

      spawnEagleSlamImpact(this, slamTargetX, defender.groundBaselineY, slamCallout, primary, secondary);
      playEagleSlamSfx(this.app.settingsStore.getState());

      const ko = defender.applyDirectDamage(EAGLE_SLAM_DAMAGE);
      this.hud.applyHealth(this.p1.health01, this.p2.health01);

      if (ko) {
        this.clearActiveSlam(false);
        attacker.releaseGrapple(0);
        spawnCombatCallout(this, defender.x, defender.groundBaselineY - 170, `${slamCallout} K.O.!`, '#facc15');
        playKnockOutVoice(this.app.settingsStore.getState());
        this.checkForKnockout();
      }
    });

    const releaseTimer = this.time.delayedCall(780, () => {
      if (!this.activeSlam) {
        return;
      }

      this.clearActiveSlam(false);
      attacker.releaseGrapple(0);
      defender.releaseGrapple(attacker.facingDirection * 280);
    });

    this.activeSlam = {
      attacker,
      defender,
      timers: [slamTimer, releaseTimer]
    };
  }

  private clearActiveSlam(releaseFighters: boolean): void {
    if (!this.activeSlam) {
      return;
    }

    const { attacker, defender, timers } = this.activeSlam;
    this.activeSlam = null;
    timers.forEach((timer) => timer.remove(false));

    if (releaseFighters) {
      attacker.releaseGrapple(0);
      defender.releaseGrapple(0);
    }
  }

  /**
   * Resolves a single attacker -> defender interaction for the current frame,
   * accounting for backdash invulnerability, high/low/overhead/unblockable
   * guard rules, and combo callouts.
   */
  private tryHit(attacker: Fighter, defender: Fighter, attackerSide: 1 | 2): void {
    if (defender.isDefeated || defender.isBodyDowned || defender.isInGrapple) {
      return;
    }

    const attack = attacker.getActiveAttack();
    if (!attack) {
      return;
    }

    const hurt = defender.getHurtRect();
    if (!hurt || !Phaser.Geom.Intersects.RectangleToRectangle(attack.rect, hurt)) {
      return;
    }

    if (defender.isInvulnerable) {
      const lastSig = attackerSide === 1 ? this.lastDodgedSigP2 : this.lastDodgedSigP1;
      if (lastSig !== attack.signature) {
        if (attackerSide === 1) {
          this.lastDodgedSigP2 = attack.signature;
        } else {
          this.lastDodgedSigP1 = attack.signature;
        }
        spawnCombatCallout(this, defender.x, hurt.y - 12, 'DODGE!', '#38bdf8');
      }
      return;
    }

    const guard = defender.getGuardRect();
    const guardOverlap = guard !== null && Phaser.Geom.Intersects.RectangleToRectangle(attack.rect, guard);
    const blocked = isAttackGuarded(guardOverlap, defender.isCrouchBlocking, attack.profile.defenseHeight);
    const isSpecial = attack.profile.kind === 'special';
    const isMeterMove = isSpecial || attack.profile.moveKind === 'exBurst';
    const isRoundhouse540Ko =
      attack.profile.moveKind === 'roundhouse540' &&
      !blocked &&
      isOneHitKoRange(defender.healthPoints, attack.profile.damage);
    const finisher = (attack.finisher && !blocked) || isRoundhouse540Ko;

    // The combo finisher launches harder and stuns longer than a regular hit.
    const baseProfile = isRoundhouse540Ko
      ? {
          ...attack.profile,
          damage: Math.max(attack.profile.damage, defender.healthPoints),
          knockback: attack.profile.knockback * 1.6,
          hitstun: attack.profile.hitstun * 1.4
        }
      : attack.profile;

    const profile =
      finisher && !isRoundhouse540Ko
        ? { ...baseProfile, knockback: baseProfile.knockback * 1.9, hitstun: baseProfile.hitstun * 1.4 }
        : baseProfile;

    const wasInHitstun = defender.isInHitstun;
    defender.applyHit(profile, attacker.facingDirection, blocked);
    defender.flashHit(blocked);
    attacker.markAttackConnected();
    attacker.registerOffense(blocked, isMeterMove);
    defender.registerDefense(blocked);

    if (attack.profile.moveKind === 'throw') {
      spawnThrowSpark(this, (attack.rect.centerX + hurt.centerX) / 2, hurt.centerY);
    }

    if (attack.profile.moveKind === 'icyBodyShot' && !blocked) {
      spawnIcyBodyShotImpact(
        this,
        (attack.rect.centerX + hurt.centerX) / 2,
        hurt.centerY + 12,
        attacker.facingDirection
      );
      playIcyBodyShotSfx(this.app.settingsStore.getState());
      if (!defender.isDefeated) {
        defender.triggerLiverDowned(2.0);
      }
    }

    if (attack.profile.moveKind === 'tigerKnee' && !blocked) {
      spawnTigerKneeImpact(
        this,
        (attack.rect.centerX + hurt.centerX) / 2,
        hurt.centerY,
        attacker.facingDirection
      );
      playTigerKneeSfx(this.app.settingsStore.getState());
    }

    if (attack.profile.moveKind === 'tornadoKick' && !blocked) {
      spawnTornadoImpact(this, (attack.rect.centerX + hurt.centerX) / 2, hurt.centerY);
    }

    if (
      (attack.profile.moveKind === 'spiritStrike' ||
        attack.profile.moveKind === 'weaponSlash' ||
        attack.profile.moveKind === 'cycloneStrike') &&
      !blocked
    ) {
      const attackerMeta = getMartialArtMeta(attacker.characterId);
      spawnSpiritUltimateImpact(
        this,
        (attack.rect.centerX + hurt.centerX) / 2,
        hurt.centerY,
        attackerMeta?.primaryColor ?? 0x38bdf8,
        attackerMeta?.secondaryColor ?? 0xfacc15
      );
      playSpiritUltimateSfx(
        this.app.settingsStore.getState(),
        attack.profile.moveKind === 'weaponSlash'
      );
    }

    if (isRoundhouse540Ko && defender.isDefeated) {
      playKnockOutVoice(this.app.settingsStore.getState());
      spawnCombatCallout(this, defender.x, hurt.y - 36, 'KNOCK OUT!', '#facc15');
    }

    if (!blocked) {
      const nextCombo = wasInHitstun
        ? (attackerSide === 1 ? this.p1ComboCount : this.p2ComboCount) + 1
        : 1;
      if (attackerSide === 1) {
        this.p1ComboCount = nextCombo;
      } else {
        this.p2ComboCount = nextCombo;
      }

      if (nextCombo >= 2) {
        spawnCombatCallout(this, defender.x, hurt.y - 26, `${nextCombo} HIT!`, '#facc15');
      } else if (attack.profile.callout && attack.profile.moveKind !== 'icyBodyShot' && !isRoundhouse540Ko) {
        const calloutColor =
          attack.profile.moveKind === 'throw'
            ? '#c084fc'
            : attack.profile.moveKind === 'exBurst'
              ? '#38bdf8'
              : '#fb923c';
        spawnCombatCallout(this, defender.x, hurt.y - 18, attack.profile.callout, calloutColor);
      }
    }

    this.spawnHitFx(attack.rect, hurt, blocked, isSpecial, finisher);
  }

  /**
   * Spawns the impact spark and camera shake for a connecting hit, scaled up for
   * special hits and the combo finisher.
   * @param attackRect - The attacker's attack box (world space).
   * @param hurtRect - The defender's hurtbox (world space).
   * @param blocked - Whether the hit was guarded.
   * @param isSpecial - Whether the attack was a special move.
   * @param finisher - Whether this is the special's finishing hit.
   */
  private spawnHitFx(
    attackRect: Phaser.Geom.Rectangle,
    hurtRect: Phaser.Geom.Rectangle,
    blocked: boolean,
    isSpecial: boolean,
    finisher: boolean
  ): void {
    const sparkX = (Phaser.Geom.Rectangle.GetCenter(attackRect).x + Phaser.Geom.Rectangle.GetCenter(hurtRect).x) / 2;
    const sparkY = (Phaser.Geom.Rectangle.GetCenter(attackRect).y + Phaser.Geom.Rectangle.GetCenter(hurtRect).y) / 2;

    const color: VfxColor = blocked ? 'blue' : finisher ? 'gold' : 'red';
    const sparkScale = finisher ? 1.7 : isSpecial ? 1.1 : 0.9;
    spawnHitSpark(this, sparkX, sparkY, color, sparkScale);

    if (finisher) {
      this.cameras.main.shake(220, 0.012);
    } else if (isSpecial) {
      this.cameras.main.shake(blocked ? 60 : 90, blocked ? 0.003 : 0.005);
    } else {
      this.cameras.main.shake(blocked ? 60 : 120, blocked ? 0.003 : 0.006);
    }
  }

  /** Ends the round when either fighter is knocked out. */
  private checkForKnockout(): void {
    if (this.p1.isDefeated) {
      this.endRound(2);
    } else if (this.p2.isDefeated) {
      this.endRound(1);
    }
  }

  /**
   * Counts the round clock down while fighting. When it reaches zero the round
   * is decided on remaining health (a tie replays the round as a draw).
   * @param delta - Milliseconds since the previous frame.
   */
  private tickRoundTimer(delta: number): void {
    this.roundTimeMs = Math.max(0, this.roundTimeMs - delta);

    if (this.roundTimeMs <= 0) {
      this.resolveTimeOut();
    }
  }

  /** Decides a timed-out round by comparing remaining health. */
  private resolveTimeOut(): void {
    const p1 = this.p1.health01;
    const p2 = this.p2.health01;

    if (p1 > p2) {
      this.endRound(1, 'TIME UP', '#facc15');
    } else if (p2 > p1) {
      this.endRound(2, 'TIME UP', '#facc15');
    } else {
      this.drawRound();
    }
  }

  /** Handles a drawn round (timeout with equal health): replays the round. */
  private drawRound(): void {
    if (this.phase !== 'fighting') {
      return;
    }

    this.phase = 'roundEnd';
    this.showBanner('DRAW', '#e2e8f0', 1.1);
    this.time.delayedCall(1100, () => this.startRound());
  }

  /**
   * Places the chosen stage fit to the viewport height, anchored at world x=0,
   * and sets up the scrollable world. The stage's on-screen width becomes the
   * world width; the camera is bounded to it so it can scroll horizontally and
   * stop at the stage ends (producing corners).
   */
  private buildStage(): void {
    const cam = this.cameras.main;
    const stage = getStageDefinition(this.config.stageId);
    const source = this.textures.get(stage.key).getSourceImage();
    const scale = cam.height / (source.height || stage.height);
    this.stageWorldWidth = (source.width || stage.width) * scale;
    this.maxScroll = Math.max(0, this.stageWorldWidth - cam.width);

    this.add.image(0, 0, stage.key).setOrigin(0, 0).setScale(scale).setDepth(0);
    cam.setBounds(0, 0, this.stageWorldWidth, cam.height);

    const center = this.stageWorldWidth / 2;

    if (stage.id === 'tokyo-dojo') {
      // Gently drifting pink Sakura petals behind fighters
      for (let i = 0; i < 16; i += 1) {
        const px = 140 + ((i * 117) % Math.max(400, this.stageWorldWidth - 280));
        const py = 70 + ((i * 53) % 240);
        const petal = this.add.ellipse(px, py, 9, 5, i % 2 === 0 ? 0xf472b6 : 0xfbcfe8, 0.72).setDepth(1);
        this.tweens.add({
          targets: petal,
          x: px + (i % 2 === 0 ? 90 : -70),
          y: cam.height * GROUND_FRACTION - 16,
          angle: 260,
          alpha: 0.15,
          duration: 3800 + (i % 5) * 700,
          delay: i * 180,
          repeat: -1,
          ease: 'Sine.InOut'
        });
      }
      return;
    }

    if (stage.id === 'mongol-steppe') {
      // Soft golden steppe sun shafts & drifting sunlit motes behind fighters
      const sunBeam = this.add
        .triangle(this.stageWorldWidth * 0.72, 0, 0, 0, -280, cam.height, 260, cam.height, 0xfef08a, 0.045)
        .setOrigin(0.5, 0)
        .setDepth(1);
      this.tweens.add({
        targets: sunBeam,
        alpha: 0.08,
        duration: 3400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut'
      });
      for (let i = 0; i < 10; i += 1) {
        const mx = 180 + ((i * 163) % Math.max(400, this.stageWorldWidth - 360));
        const my = 200 + ((i * 79) % 280);
        const mote = this.add.circle(mx, my, 2.5, 0xfef9c3, 0.42).setDepth(1);
        this.tweens.add({
          targets: mote,
          y: my - 46,
          alpha: 0.1,
          duration: 2800 + (i % 4) * 550,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut'
        });
      }
      return;
    }

    // Dual ambient arena spotlight beams behind fighters for stadium / rooftop stages
    const leftBeamColor = stage.id === 'rooftop-sunset' ? 0xf59e0b : stage.id === 'cyber-colosseum' ? 0x22d3ee : 0x38bdf8;
    const rightBeamColor = stage.id === 'rooftop-sunset' ? 0xf97316 : stage.id === 'cyber-colosseum' ? 0xec4899 : 0xf43f5e;
    const beamLeft = this.add
      .triangle(center - 240, 0, 0, 0, -180, cam.height, 180, cam.height, leftBeamColor, 0.04)
      .setOrigin(0.5, 0)
      .setDepth(1);
    const beamRight = this.add
      .triangle(center + 240, 0, 0, 0, -180, cam.height, 180, cam.height, rightBeamColor, 0.04)
      .setOrigin(0.5, 0)
      .setDepth(1);

    this.tweens.add({
      targets: beamLeft,
      angle: 10,
      alpha: 0.07,
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
    this.tweens.add({
      targets: beamRight,
      angle: -10,
      alpha: 0.07,
      duration: 3600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  /** Spawns P1 (left, facing right) and P2 (right, facing left). */
  private spawnFighters(): void {
    const cam = this.cameras.main;
    const groundY = Math.round(cam.height * GROUND_FRACTION);
    const minX = EDGE_MARGIN;
    const maxX = this.stageWorldWidth - EDGE_MARGIN;
    const center = this.stageWorldWidth / 2;
    this.spawnX1 = Math.round(center - cam.width * SPAWN_OFFSET_FRACTION);
    this.spawnX2 = Math.round(center + cam.width * SPAWN_OFFSET_FRACTION);

    this.p1 = new Fighter({
      scene: this,
      app: this.app,
      characterId: this.config.p1CharacterId,
      x: this.spawnX1,
      groundY,
      facing: 1,
      minX,
      maxX,
      depth: DEPTH_FRONT,
      onSpecialStart: (fighter) => playSuperCutIn(this, { characterId: fighter.characterId, side: 'left' }),
      isOpponentOneHitKo: (finisherDamage) =>
        Boolean(this.p2) && !this.p2.isBodyDowned && isOneHitKoRange(this.p2.healthPoints, finisherDamage)
    });

    this.p2 = new Fighter({
      scene: this,
      app: this.app,
      characterId: this.config.p2CharacterId,
      x: this.spawnX2,
      groundY,
      facing: -1,
      minX,
      maxX,
      depth: DEPTH_BACK,
      onSpecialStart: (fighter) => playSuperCutIn(this, { characterId: fighter.characterId, side: 'right' }),
      isOpponentOneHitKo: (finisherDamage) =>
        Boolean(this.p1) && !this.p1.isBodyDowned && isOneHitKoRange(this.p1.healthPoints, finisherDamage)
    });
  }

  /**
   * Group-camera tracking: scrolls horizontally to keep both fighters framed
   * around their midpoint, clamped to the stage ends (so it stops at corners),
   * then turns the visible screen edges into movement walls for both fighters.
   * This is what produces the "camera locks until one fighter relents" feel —
   * neither fighter can walk off-screen, so they can only separate as far as the
   * screen is wide.
   * @param snap - When true, jumps to the target scroll instantly (round start)
   *   instead of easing toward it.
   */
  private updateCamera(snap: boolean): void {
    const cam = this.cameras.main;
    const viewWidth = cam.width;
    const midpoint = (this.p1.x + this.p2.x) / 2;
    const targetScroll = Phaser.Math.Clamp(midpoint - viewWidth / 2, 0, this.maxScroll);
    const scrollX = snap ? targetScroll : Phaser.Math.Linear(cam.scrollX, targetScroll, CAMERA_LERP);

    cam.setScroll(scrollX, 0);

    const leftWall = scrollX + EDGE_MARGIN;
    const rightWall = scrollX + viewWidth - EDGE_MARGIN;
    this.p1.setHorizontalBounds(leftWall, rightWall);
    this.p2.setHorizontalBounds(leftWall, rightWall);
  }

  /** Registers the two keyboard control schemes plus the menu shortcut. */
  private registerKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('MatchScene requires keyboard input');
    }

    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.p1Keys = {
      left: keyboard.addKey(codes.A),
      right: keyboard.addKey(codes.D),
      crouch: keyboard.addKey(codes.S),
      block: keyboard.addKey(codes.C),
      jump: keyboard.addKey(codes.W),
      light: keyboard.addKey(codes.F),
      heavy: keyboard.addKey(codes.G),
      special: keyboard.addKey(codes.V),
      throw: keyboard.addKey(codes.E),
      ultimate: keyboard.addKey(this.config.mode === '1vcpu' ? codes.L : codes.H),
      altUltimate: this.config.mode === '1vcpu' ? keyboard.addKey(codes.H) : undefined
    };

    this.p2Keys = {
      left: keyboard.addKey(codes.LEFT),
      right: keyboard.addKey(codes.RIGHT),
      crouch: keyboard.addKey(codes.DOWN),
      block: keyboard.addKey(codes.FORWARD_SLASH),
      jump: keyboard.addKey(codes.UP),
      light: keyboard.addKey(codes.COMMA),
      heavy: keyboard.addKey(codes.PERIOD),
      special: keyboard.addKey(codes.L),
      throw: keyboard.addKey(codes.M),
      ultimate: keyboard.addKey(codes.K)
    };

    keyboard.on('keydown-ESC', () => this.goToMenu());
    keyboard.on('keydown-BACKSPACE', () => this.goToMenu());
    keyboard.on('keydown-R', () => {
      if (this.phase === 'matchOver') {
        this.rematch();
      }
    });
  }

  /**
   * Reads a control scheme into a fighter input snapshot. Held keys map to held
   * inputs; jump/light/heavy/throw/special/dash/ultimate use edge detection.
   */
  private readKeys(
    keys: PlayerKeys,
    dashTracker: DoubleTapDashTracker,
    timeMs: number
  ): FighterInput {
    const leftJustDown = Phaser.Input.Keyboard.JustDown(keys.left);
    const rightJustDown = Phaser.Input.Keyboard.JustDown(keys.right);

    return {
      left: keys.left.isDown,
      right: keys.right.isDown,
      crouch: keys.crouch.isDown,
      block: keys.block.isDown,
      jump: Phaser.Input.Keyboard.JustDown(keys.jump),
      light: Phaser.Input.Keyboard.JustDown(keys.light),
      heavy: Phaser.Input.Keyboard.JustDown(keys.heavy),
      special: Phaser.Input.Keyboard.JustDown(keys.special),
      dash: dashTracker.update(leftJustDown, rightJustDown, timeMs),
      throw: Phaser.Input.Keyboard.JustDown(keys.throw),
      ultimate:
        Phaser.Input.Keyboard.JustDown(keys.ultimate) ||
        (keys.altUltimate ? Phaser.Input.Keyboard.JustDown(keys.altUltimate) : false)
    };
  }

  /** Draws the control legend at the bottom of the screen. */
  private createControlsLegend(): void {
    const { centerX, height } = this.cameras.main;
    const p1 =
      this.config.mode === '1vcpu'
        ? 'P1: WASD • F Light • G Heavy • C Block • E Throw • V EX/Super • L / H Ultimate'
        : 'P1: WASD • F Light • G Heavy • C Block • E Throw • V EX/Super • H Ult';
    const p2 =
      this.config.mode === '1vcpu'
        ? 'P2: CPU'
        : 'P2: Arrows • , Light • . Heavy • / Block • M Throw • L EX/Super • K Ult';

    this.add
      .text(centerX, height - 20, `${p1}   |   ${p2}   |   Esc Menu`, {
        color: '#cbd5f5',
        fontFamily: 'monospace',
        fontSize: '11px',
        backgroundColor: 'rgba(2, 6, 23, 0.68)',
        padding: { x: 10, y: 5 }
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0);
  }

  /** Resets both fighters to their corners and runs the round intro. */
  private startRound(): void {
    this.clearActiveChoke(true);
    this.clearActiveSlam(true);
    this.phase = 'intro';
    this.roundTimeMs = ROUND_SECONDS * 1000;
    this.p1ComboCount = 0;
    this.p2ComboCount = 0;
    this.lastDodgedSigP1 = -1;
    this.lastDodgedSigP2 = -1;
    this.p1DashTracker.reset();
    this.p2DashTracker.reset();

    const fullMin = EDGE_MARGIN;
    const fullMax = this.stageWorldWidth - EDGE_MARGIN;
    this.p1.setHorizontalBounds(fullMin, fullMax);
    this.p2.setHorizontalBounds(fullMin, fullMax);

    this.p1.resetForRound(this.spawnX1, 1);
    this.p2.resetForRound(this.spawnX2, -1);
    this.p1.setDepthBase(DEPTH_FRONT);
    this.p2.setDepthBase(DEPTH_BACK);
    this.updateCamera(true);
    this.hud.animateFill();
    this.hud.updateWins(this.p1Wins, this.p2Wins);

    this.showBanner(`ROUND ${this.roundNumber}`, '#f8fafc');

    this.time.delayedCall(900, () => {
      if (this.phase !== 'intro') {
        return;
      }

      this.showBanner('FIGHT!', '#facc15', 1.15);
      this.phase = 'fighting';
      this.music.setTrack(AUDIO_KEYS.fightMusic);
      this.p1.setFrozen(false);
      this.p2.setFrozen(false);

      this.time.delayedCall(650, () => this.hideBanner());
    });
  }

  /**
   * Concludes the current round, tallies the win, and either advances to the
   * next round or ends the match.
   * @param winner - Which player won (1 or 2).
   * @param bannerText - The banner to show (defaults to a knockout).
   * @param bannerColor - The banner colour.
   */
  private endRound(winner: 1 | 2, bannerText = 'K.O.', bannerColor = '#f43f5e'): void {
    if (this.phase !== 'fighting') {
      return;
    }

    this.clearActiveChoke(true);
    this.clearActiveSlam(true);
    this.phase = 'roundEnd';

    if (winner === 1) {
      this.p1Wins += 1;
    } else {
      this.p2Wins += 1;
    }

    const winnerName =
      winner === 1
        ? `P1 ${getCharacterDefinition(this.config.p1CharacterId).label}`
        : `${this.config.mode === '1vcpu' ? 'CPU' : 'P2'} ${getCharacterDefinition(this.config.p2CharacterId).label}`;
    this.showBanner(bannerText, bannerColor, 1.2);

    this.time.delayedCall(1100, () => {
      const matchOver = this.p1Wins >= ROUNDS_TO_WIN || this.p2Wins >= ROUNDS_TO_WIN;

      if (matchOver) {
        this.endMatch(winnerName);
      } else {
        this.roundNumber += 1;
        this.startRound();
      }
    });
  }

  /**
   * Shows the game-over overlay with the match winner and rematch / menu options.
   * @param winnerName - The display name of the match winner.
   */
  private endMatch(winnerName: string): void {
    this.phase = 'matchOver';
    this.hideBanner();

    const { centerX, centerY, width, height } = this.cameras.main;

    const dim = this.add
      .rectangle(centerX, centerY, width, height, 0x020617, 0.62)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const title = this.add
      .text(centerX, centerY - 90, `${winnerName}  WINS!`, {
        color: '#facc15',
        fontFamily: 'monospace',
        fontSize: '46px',
        stroke: '#020617',
        strokeThickness: 6,
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const score = this.add
      .text(centerX, centerY - 30, `${this.p1Wins} - ${this.p2Wins}`, {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '28px'
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const rematch = this.makeOverlayButton(centerX, centerY + 40, 'Rematch  (R)', () => this.rematch());
    const menu = this.makeOverlayButton(centerX, centerY + 96, 'Main Menu  (Esc)', () => this.goToMenu());

    this.overlay = [dim, title, score, rematch, menu];
  }

  /**
   * Builds a clickable overlay button with hover feedback.
   * @param x - Centre x.
   * @param y - Centre y.
   * @param label - Button text.
   * @param onClick - Click handler.
   */
  private makeOverlayButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '22px',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: { x: 18, y: 10 }
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setColor('#facc15'));
    button.on('pointerout', () => button.setColor('#e2e8f0'));
    button.on('pointerdown', onClick);

    return button;
  }

  /** Restarts the match from round 1 with the same configuration. */
  private rematch(): void {
    this.overlay.forEach((object) => object.destroy());
    this.overlay = [];
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.cpu = this.config.mode === '1vcpu' ? new CpuController() : undefined;
    this.startRound();
  }

  /**
   * Shows the centre banner with a short pop-in tween.
   * @param text - The banner text.
   * @param color - The text colour.
   * @param peakScale - The scale to settle at (default 1).
   */
  private showBanner(text: string, color: string, peakScale = 1): void {
    this.banner.setText(text).setColor(color).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.banner, alpha: 1, scale: peakScale, duration: 260, ease: 'Back.Out' });
  }

  /** Fades the centre banner out. */
  private hideBanner(): void {
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 300 });
  }
}

/**
 * Whether an input represents the fighter actively doing something (moving,
 * jumping, dashing, throwing, or attacking) this frame — used to decide who draws in front.
 * @param input - The fighter input snapshot to test.
 */
function isActing(input: FighterInput): boolean {
  return (
    input.left ||
    input.right ||
    input.jump ||
    input.light ||
    input.heavy ||
    input.throw ||
    input.special ||
    input.ultimate ||
    input.dash !== 0
  );
}
