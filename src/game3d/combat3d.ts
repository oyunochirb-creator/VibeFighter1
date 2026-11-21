import * as THREE from 'three';

import {
  BAYASAA_KICK_COMBO_WINDOW_MS,
  buildCombatAttackProfile,
  canCancelMove,
  DoubleTapDashTracker,
  EAGLE_SLAM_DAMAGE,
  EX_METER_COST,
  hasSuperArmor,
  isAttackGuarded,
  isOneHitKoRange,
  nextBayasaaKickStep,
  SUPER_METER_COST,
  TRIANGLE_CHOKE_TAP1_DAMAGE,
  TRIANGLE_CHOKE_TAP2_DAMAGE,
  type CombatMoveKind,
  type ExtendedAttackProfile
} from '../game/combatActions';
import { getFighterCombat, getFighterStats } from '../game/fighterConfig';
import type { FighterPlaygroundDebugState, MatchConfig, MatchMode } from '../game/types';
import { getMartialArtMeta, type MartialArtDefinition } from '../game/worldMartialArts';
import type { Game3DAudio } from './audio3d';
import type { FighterPoseState, FighterRig3D } from './fighterRig3d';
import type { Vfx3DManager } from './vfx3d';

export const ARENA_HALF_WIDTH_M = 6.1;
export const ARENA_HALF_DEPTH_M = 1.35;
export const ROUNDS_TO_WIN = 2;
export const ROUND_SECONDS = 60;
export const RAGE_HEALTH_THRESHOLD = 0.3;

export interface MatchHudSnapshot {
  phase: 'intro' | 'fighting' | 'roundEnd' | 'matchOver';
  roundNumber: number;
  timeSeconds: number;
  p1Wins: number;
  p2Wins: number;
  p1Health01: number;
  p2Health01: number;
  p1Meter01: number;
  p2Meter01: number;
  p1Rage: boolean;
  p2Rage: boolean;
  bannerText: string;
  bannerSubtext: string;
  superCutIn: { title: string; subtitle: string; color: string } | null;
  ultimateBanner: string | null;
  winnerSide: 1 | 2 | null;
}

export interface FighterInputFrame {
  left: boolean;
  right: boolean;
  sidestep: -1 | 0 | 1;
  crouch: boolean;
  block: boolean;
  jump: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  throw: boolean;
  ultimate: boolean;
  dash: -1 | 0 | 1;
}

const NEUTRAL_INPUT: FighterInputFrame = {
  left: false,
  right: false,
  sidestep: 0,
  crouch: false,
  block: false,
  jump: false,
  light: false,
  heavy: false,
  special: false,
  throw: false,
  ultimate: false,
  dash: 0
};

interface ActiveMoveRuntime {
  kind: CombatMoveKind;
  pose: FighterPoseState;
  durationSec: number;
  elapsedSec: number;
  hitStartFrac: number;
  hitEndFrac: number;
  reachM: number;
  multiHitsTotal: number;
  hitsDone: number;
  profile: ExtendedAttackProfile;
  didConnectThisSpan: boolean;
  lungeSpeed: number;
  jumpLift: number;
}

interface FighterSimState {
  side: 1 | 2;
  characterId: string;
  rig: FighterRig3D;
  meta?: MartialArtDefinition;
  x: number;
  y: number;
  z: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  health: number;
  maxHealth: number;
  meter: number;
  walkSpeedM: number;
  airDriftM: number;
  jumpVelM: number;
  gravityM: number;
  scale: number;
  hitstunTimer: number;
  blockstunTimer: number;
  blockLow: boolean;
  knockbackVel: number;
  dashTimer: number;
  dashVel: number;
  invulnTimer: number;
  ultimateCooldown: number;
  downedTimer: number;
  icyChargeTimer: number;
  duckChokeTimer: number;
  eagleSlamTimer: number;
  grappleMode: 'none' | 'choker' | 'trapped' | 'slammer' | 'slammed';
  grappleProgress: number;
  bayasaaKickStep: 0 | 1 | 2 | 3;
  bayasaaLastKickAt: number;
  activeMove: ActiveMoveRuntime | null;
  flashTimer: number;
  flashColor: number;
  defeated: boolean;
  comboReceived: number;
  usedRageArtThisRound: boolean;
}

function isFighterInRage(f: Pick<FighterSimState, 'defeated' | 'health' | 'maxHealth'>): boolean {
  return !f.defeated && f.health > 0 && f.health <= f.maxHealth * RAGE_HEALTH_THRESHOLD;
}

function isHomingMove(kind: CombatMoveKind): boolean {
  return (
    kind === 'sweep' ||
    kind === 'spinHookKick' ||
    kind === 'spin360Kick' ||
    kind === 'roundhouse540' ||
    kind === 'tornadoKick' ||
    kind === 'cycloneStrike'
  );
}

class CpuAi3D {
  private nextDecisionAt = 0;
  private holdUntil = 0;
  private moveDir = 0;
  private holdSidestep: -1 | 0 | 1 = 0;
  private holdCrouch = false;
  private holdBlock = false;
  private pendingAirAt = 0;
  private pendingAirHeavy = false;

  update(timeMs: number, self: FighterSimState, opponent: FighterSimState): FighterInputFrame {
    const inp: FighterInputFrame = { ...NEUTRAL_INPUT };

    if (this.pendingAirAt > 0 && !self.grounded && timeMs >= this.pendingAirAt) {
      if (this.pendingAirHeavy) {
        inp.heavy = true;
      } else {
        inp.light = true;
      }
      this.pendingAirAt = 0;
    }

    if (timeMs >= this.nextDecisionAt) {
      this.decide(timeMs, self, opponent, inp);
      this.nextDecisionAt = timeMs + 340 + Math.random() * 520;
    }

    if (timeMs < this.holdUntil) {
      if (this.moveDir < 0) {
        inp.left = true;
      } else if (this.moveDir > 0) {
        inp.right = true;
      }
      inp.sidestep = this.holdSidestep;
      inp.crouch = inp.crouch || this.holdCrouch;
      inp.block = inp.block || this.holdBlock;
    } else {
      this.moveDir = 0;
      this.holdSidestep = 0;
      this.holdCrouch = false;
      this.holdBlock = false;
    }
    return inp;
  }

  private decide(
    timeMs: number,
    self: FighterSimState,
    opp: FighterSimState,
    inp: FighterInputFrame
  ): void {
    const dist = Math.abs(opp.x - self.x);
    const toward: -1 | 1 = opp.x >= self.x ? 1 : -1;
    const away: -1 | 1 = toward === 1 ? -1 : 1;
    const roll = Math.random();

    if (dist < 2.2 && (self.meter >= SUPER_METER_COST || (isFighterInRage(self) && !self.usedRageArtThisRound)) && roll < 0.4) {
      inp.special = true;
      return;
    }
    if (dist < 2.0 && self.meter >= EX_METER_COST && self.meter < SUPER_METER_COST && roll < 0.25) {
      inp.special = true;
      return;
    }

    if (dist < 1.9) {
      if (roll < 0.2) {
        inp.light = true;
      } else if (roll < 0.36) {
        inp.heavy = true;
      } else if (roll < 0.48) {
        inp.crouch = true;
        inp.heavy = true;
      } else if (roll < 0.58) {
        inp.throw = true;
      } else if (roll < 0.68 && self.ultimateCooldown <= 0 && opp.downedTimer <= 0) {
        inp.ultimate = true;
      } else if (roll < 0.8) {
        this.holdBlock = true;
        this.holdCrouch = Math.random() < 0.45;
        this.holdUntil = timeMs + 280 + Math.random() * 260;
      } else if (roll < 0.92) {
        this.holdSidestep = Math.random() < 0.5 ? -1 : 1;
        this.holdUntil = timeMs + 280 + Math.random() * 180;
      } else {
        inp.dash = away;
      }
      return;
    }

    if (roll < 0.28) {
      inp.dash = toward;
    } else if (roll < 0.46) {
      inp.jump = true;
      this.moveDir = toward;
      this.holdUntil = timeMs + 420;
      this.pendingAirAt = timeMs + 190 + Math.random() * 120;
      this.pendingAirHeavy = Math.random() < 0.55;
    } else if (roll < 0.8) {
      this.moveDir = toward;
      this.holdUntil = timeMs + 300 + Math.random() * 320;
    } else {
      this.moveDir = away;
      this.holdUntil = timeMs + 240 + Math.random() * 220;
    }
  }
}

interface PendingCallback {
  remainingSec: number;
  fn: () => void;
}

/**
 * Full 3D Fighting Match Engine preserving all 68 fighters' stats, moves,
 * L-Ultimates, Bayasaa's 3-kick chain & Flaming Triangle Choke, Blue Striker's
 * Super Armor & 0.8s Icy Body Shot, Mongol Bokh's Eagle Slam, and 3D camera action.
 */
export class Match3DSimulation {
  private readonly mode: MatchMode;
  private readonly vfx: Vfx3DManager;
  private readonly audio: Game3DAudio;
  private readonly playgroundState: FighterPlaygroundDebugState;
  private readonly p1: FighterSimState;
  private readonly p2: FighterSimState;
  private readonly cpu?: CpuAi3D;
  private readonly dashP1 = new DoubleTapDashTracker();
  private readonly dashP2 = new DoubleTapDashTracker();

  private phase: 'intro' | 'fighting' | 'roundEnd' | 'matchOver' = 'intro';
  private roundNumber = 1;
  private p1Wins = 0;
  private p2Wins = 0;
  private winnerSide: 1 | 2 | null = null;
  private roundTimeSec = ROUND_SECONDS;
  private bannerText = '';
  private bannerSubtext = '';
  private superCutIn: MatchHudSnapshot['superCutIn'] = null;
  private ultimateBanner: string | null = null;
  private callbacks: PendingCallback[] = [];
  private cameraShake = 0;
  private koSlowMoTimer = 0;
  private koSlowMoPending = false;
  private rageCamTimer = 0;
  private chokeCleanup: (() => void) | null = null;
  private elapsedMs = 0;

  private readonly keysDown = new Set<string>();
  private readonly keysJustPressed = new Set<string>();
  private readonly _tmpHead = new THREE.Vector3();

  constructor(
    config: MatchConfig,
    p1Rig: FighterRig3D,
    p2Rig: FighterRig3D,
    playgroundState: FighterPlaygroundDebugState,
    vfx: Vfx3DManager,
    audio: Game3DAudio
  ) {
    this.mode = config.mode;
    this.playgroundState = playgroundState;
    this.vfx = vfx;
    this.audio = audio;

    this.p1 = this.createFighterState(1, config.p1CharacterId, p1Rig, -2.2, 1);
    this.p2 = this.createFighterState(2, config.p2CharacterId, p2Rig, 2.2, -1);

    if (this.mode === '1vcpu') {
      this.cpu = new CpuAi3D();
    }

    this.startRound();
  }

  private createFighterState(
    side: 1 | 2,
    characterId: string,
    rig: FighterRig3D,
    x: number,
    facing: 1 | -1
  ): FighterSimState {
    const stats = getFighterStats(this.playgroundState, characterId);
    const combat = getFighterCombat(this.playgroundState, characterId);
    const pxToM = 0.011;
    const fScale = THREE.MathUtils.clamp(stats.scale / 1.4, 0.72, 1.35);

    return {
      side,
      characterId,
      rig,
      meta: getMartialArtMeta(characterId),
      x,
      y: 0,
      z: 0,
      vy: 0,
      facing,
      grounded: true,
      health: combat.maxHealth,
      maxHealth: combat.maxHealth,
      meter: 0,
      walkSpeedM: stats.walkSpeed * pxToM,
      airDriftM: stats.airDrift * pxToM,
      jumpVelM: stats.jump * 0.0086,
      gravityM: stats.gravity * 0.0094,
      scale: fScale,
      hitstunTimer: 0,
      blockstunTimer: 0,
      blockLow: false,
      knockbackVel: 0,
      dashTimer: 0,
      dashVel: 0,
      invulnTimer: 0,
      ultimateCooldown: 0,
      downedTimer: 0,
      icyChargeTimer: 0,
      duckChokeTimer: 0,
      eagleSlamTimer: 0,
      grappleMode: 'none',
      grappleProgress: 0,
      bayasaaKickStep: 0,
      bayasaaLastKickAt: -Infinity,
      activeMove: null,
      flashTimer: 0,
      flashColor: 0xffffff,
      defeated: false,
      comboReceived: 0,
      usedRageArtThisRound: false
    };
  }

  onKeyDown(code: string): void {
    if (!this.keysDown.has(code)) {
      this.keysJustPressed.add(code);
    }
    this.keysDown.add(code);
  }

  onKeyUp(code: string): void {
    this.keysDown.delete(code);
  }

  clearKeys(): void {
    this.keysDown.clear();
    this.keysJustPressed.clear();
  }

  private schedule(delaySec: number, fn: () => void): void {
    this.callbacks.push({ remainingSec: delaySec, fn });
  }

  private startRound(): void {
    this.callbacks.length = 0;
    this.chokeCleanup?.();
    this.chokeCleanup = null;
    this.vfx.clear();
    this.resetFighter(this.p1, -2.2, 1);
    this.resetFighter(this.p2, 2.2, -1);
    this.roundTimeSec = ROUND_SECONDS;
    this.koSlowMoTimer = 0;
    this.koSlowMoPending = false;
    this.rageCamTimer = 0;
    this.phase = 'intro';
    this.superCutIn = null;
    this.ultimateBanner = null;
    this.bannerText = `ROUND ${this.roundNumber}`;
    this.bannerSubtext = this.roundNumber === 1 ? 'GET READY FOR THE NEXT BATTLE' : 'IRON FIST SHOWDOWN';
    this.audio.setMusicMood('preFight');
    this.audio.playAnnouncerPhrase(
      this.roundNumber === 1 ? 'Get Ready for the Next Battle!' : `Round ${this.roundNumber}!`
    );

    this.schedule(1.25, () => {
      this.bannerText = 'FIGHT!';
      this.bannerSubtext = '';
      this.phase = 'fighting';
      this.audio.setMusicMood('fight');
      this.audio.playAnnouncerPhrase('Fight!');
      this.schedule(0.65, () => {
        if (this.phase === 'fighting') {
          this.bannerText = '';
        }
      });
    });
  }

  private resetFighter(f: FighterSimState, x: number, facing: 1 | -1): void {
    f.x = x;
    f.y = 0;
    f.z = 0;
    f.vy = 0;
    f.facing = facing;
    f.grounded = true;
    f.health = f.maxHealth;
    f.meter = 0;
    f.hitstunTimer = 0;
    f.blockstunTimer = 0;
    f.knockbackVel = 0;
    f.dashTimer = 0;
    f.dashVel = 0;
    f.invulnTimer = 0;
    f.ultimateCooldown = 0;
    f.downedTimer = 0;
    f.icyChargeTimer = 0;
    f.duckChokeTimer = 0;
    f.eagleSlamTimer = 0;
    f.grappleMode = 'none';
    f.grappleProgress = 0;
    f.bayasaaKickStep = 0;
    f.bayasaaLastKickAt = -Infinity;
    f.activeMove = null;
    f.flashTimer = 0;
    f.defeated = false;
    f.comboReceived = 0;
    f.usedRageArtThisRound = false;
    f.rig.setFacing(facing);
    f.rig.setTintFlash(null);
    f.rig.setAuraActive(false);
    f.rig.setRageActive(false);
    f.rig.root.position.set(x, 0, 0);
  }

  private readP1Input(): FighterInputFrame {
    const leftJust = this.keysJustPressed.has('KeyA');
    const rightJust = this.keysJustPressed.has('KeyD');
    const sidestep: -1 | 0 | 1 =
      this.keysDown.has('KeyQ') && !this.keysDown.has('KeyZ')
        ? -1
        : this.keysDown.has('KeyZ') && !this.keysDown.has('KeyQ')
          ? 1
          : 0;
    return {
      left: this.keysDown.has('KeyA'),
      right: this.keysDown.has('KeyD'),
      sidestep,
      crouch: this.keysDown.has('KeyS'),
      block: this.keysDown.has('KeyC'),
      jump: this.keysJustPressed.has('KeyW'),
      light: this.keysJustPressed.has('KeyF'),
      heavy: this.keysJustPressed.has('KeyG'),
      special: this.keysJustPressed.has('KeyV'),
      throw: this.keysJustPressed.has('KeyE'),
      ultimate: this.keysJustPressed.has('KeyL') || this.keysJustPressed.has('KeyH'),
      dash: this.dashP1.update(leftJust, rightJust, this.elapsedMs)
    };
  }

  private readP2Input(): FighterInputFrame {
    const leftJust = this.keysJustPressed.has('ArrowLeft');
    const rightJust = this.keysJustPressed.has('ArrowRight');
    const sidestep: -1 | 0 | 1 =
      this.keysDown.has('BracketLeft') && !this.keysDown.has('KeyN')
        ? -1
        : this.keysDown.has('KeyN') && !this.keysDown.has('BracketLeft')
          ? 1
          : 0;
    return {
      left: this.keysDown.has('ArrowLeft'),
      right: this.keysDown.has('ArrowRight'),
      sidestep,
      crouch: this.keysDown.has('ArrowDown'),
      block: this.keysDown.has('KeyM'),
      jump: this.keysJustPressed.has('ArrowUp'),
      light: this.keysJustPressed.has('Comma'),
      heavy: this.keysJustPressed.has('Period'),
      special: this.keysJustPressed.has('Slash'),
      throw: this.keysJustPressed.has('KeyK'),
      ultimate: this.keysJustPressed.has('Semicolon') || this.keysJustPressed.has('ShiftRight'),
      dash: this.dashP2.update(leftJust, rightJust, this.elapsedMs)
    };
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    // Tekken 7 KO Slow-Motion Final Hit: scale simulation time to 0.25x for 0.85s
    let simDt = dt;
    if (this.koSlowMoTimer > 0) {
      this.koSlowMoTimer = Math.max(0, this.koSlowMoTimer - dt);
      simDt = dt * 0.25;
      if (this.koSlowMoTimer === 0 && this.koSlowMoPending) {
        this.koSlowMoPending = false;
        this.finalizeKnockout();
      }
    }

    this.elapsedMs += simDt * 1000;
    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.5);
    this.rageCamTimer = Math.max(0, this.rageCamTimer - dt);

    // Advance scheduled round/grapple callbacks
    for (let i = this.callbacks.length - 1; i >= 0; i -= 1) {
      const cb = this.callbacks[i];
      cb.remainingSec -= simDt;
      if (cb.remainingSec <= 0) {
        this.callbacks.splice(i, 1);
        cb.fn();
      }
    }

    const fighting = this.phase === 'fighting' && !this.koSlowMoPending;
    const p1In = fighting ? this.readP1Input() : NEUTRAL_INPUT;
    const p2In = fighting
      ? this.cpu
        ? this.cpu.update(this.elapsedMs, this.p2, this.p1)
        : this.readP2Input()
      : NEUTRAL_INPUT;

    this.keysJustPressed.clear();

    if (fighting) {
      this.roundTimeSec = Math.max(0, this.roundTimeSec - simDt);
      if (this.roundTimeSec <= 0) {
        this.handleTimeOver();
      }
    }

    this.updateFacing(this.p1, this.p2);
    this.updateFacing(this.p2, this.p1);

    this.stepFighter(this.p1, this.p2, p1In, simDt, fighting || this.koSlowMoPending);
    this.stepFighter(this.p2, this.p1, p2In, simDt, fighting || this.koSlowMoPending);

    if (fighting) {
      this.preventBodyOverlap();
      this.resolveSpecialGrabs(this.p1, this.p2);
      this.resolveSpecialGrabs(this.p2, this.p1);
      this.resolveStrike(this.p1, this.p2);
      this.resolveStrike(this.p2, this.p1);
      this.checkKnockout();
    }

    this.syncFighterRig(this.p1, p1In, simDt);
    this.syncFighterRig(this.p2, p2In, simDt);

    // Dynamic Tekken 7 3D Fighting Camera
    this.updateCamera(dt, camera);
  }

  private updateFacing(self: FighterSimState, opp: FighterSimState): void {
    if (
      self.defeated ||
      self.activeMove ||
      self.grappleMode !== 'none' ||
      self.downedTimer > 0 ||
      self.icyChargeTimer > 0
    ) {
      return;
    }
    const desired: 1 | -1 = opp.x >= self.x ? 1 : -1;
    if (desired !== self.facing) {
      self.facing = desired;
      self.rig.setFacing(desired);
    }
  }

  private stepFighter(
    f: FighterSimState,
    opp: FighterSimState,
    inp: FighterInputFrame,
    dt: number,
    fighting: boolean
  ): void {
    f.ultimateCooldown = Math.max(0, f.ultimateCooldown - dt);
    f.invulnTimer = Math.max(0, f.invulnTimer - dt);
    if (f.flashTimer > 0) {
      f.flashTimer = Math.max(0, f.flashTimer - dt);
      if (f.flashTimer === 0) {
        f.rig.setTintFlash(null);
      }
    }

    // Knockback slide
    if (f.knockbackVel !== 0) {
      f.x = THREE.MathUtils.clamp(f.x + f.knockbackVel * dt, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
      const decay = 7.8 * dt;
      f.knockbackVel =
        f.knockbackVel > 0 ? Math.max(0, f.knockbackVel - decay) : Math.min(0, f.knockbackVel + decay);
    }

    if (f.defeated || !fighting) {
      return;
    }

    if (f.grappleMode !== 'none') {
      f.grappleProgress = Math.min(1, f.grappleProgress + dt * 1.45);
      return;
    }

    if (f.downedTimer > 0) {
      f.downedTimer = Math.max(0, f.downedTimer - dt);
      return;
    }

    if (f.hitstunTimer > 0) {
      f.hitstunTimer = Math.max(0, f.hitstunTimer - dt);
      if (f.hitstunTimer === 0) {
        f.comboReceived = 0;
      }
      return;
    }

    if (f.blockstunTimer > 0) {
      f.blockstunTimer = Math.max(0, f.blockstunTimer - dt);
      return;
    }

    // Blue Striker 0.8s frost charge wind-up
    if (f.icyChargeTimer > 0) {
      f.icyChargeTimer = Math.max(0, f.icyChargeTimer - dt);
      if (f.icyChargeTimer === 0) {
        this.launchAttack(f, opp, 'icyBodyShot');
      }
      return;
    }

    // Bayasaa Duck Under rush
    if (f.duckChokeTimer > 0) {
      f.x = THREE.MathUtils.clamp(f.x + f.facing * 5.6 * dt, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
      f.duckChokeTimer = Math.max(0, f.duckChokeTimer - dt);
      return;
    }

    // Mongol Bokh Eagle Slam rush
    if (f.eagleSlamTimer > 0) {
      f.x = THREE.MathUtils.clamp(f.x + f.facing * 5.4 * dt, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
      f.eagleSlamTimer = Math.max(0, f.eagleSlamTimer - dt);
      return;
    }

    // Airborne physics
    if (!f.grounded) {
      f.vy -= f.gravityM * dt;
      f.y += f.vy * dt;
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir !== 0) {
        f.x = THREE.MathUtils.clamp(f.x + dir * f.airDriftM * dt, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
      }

      if (!f.activeMove) {
        if (inp.light) {
          this.launchAttack(f, opp, 'airLight');
        } else if (inp.heavy) {
          this.launchAttack(f, opp, 'airHeavy');
        }
      } else if (canCancelMove(f.activeMove.kind, 'airHeavy', f.activeMove.didConnectThisSpan) && inp.heavy) {
        this.launchAttack(f, opp, 'airHeavy');
      }

      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        f.grounded = true;
        f.activeMove = null;
      }
    }

    // Active strike progression & chain cancels
    if (f.activeMove) {
      const m = f.activeMove;
      m.elapsedSec += dt;
      if (m.lungeSpeed !== 0) {
        f.x = THREE.MathUtils.clamp(f.x + f.facing * m.lungeSpeed * dt, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
        m.lungeSpeed = THREE.MathUtils.damp(m.lungeSpeed, 0, 7, dt);
      }
      if (m.jumpLift > 0) {
        const arcFrac = m.elapsedSec / m.durationSec;
        f.y = Math.max(0, Math.sin(Math.min(1, arcFrac) * Math.PI) * m.jumpLift);
      }

      // Bayasaa 3-kick combo chaining
      if (
        f.characterId === 'bayasaa' &&
        inp.heavy &&
        !inp.crouch &&
        (m.kind === 'frontKick' || m.kind === 'spinHookKick') &&
        (m.didConnectThisSpan || m.elapsedSec >= 0.14)
      ) {
        const nextKind: CombatMoveKind = isOneHitKoRange(
          opp.health,
          buildCombatAttackProfile(getFighterCombat(this.playgroundState, f.characterId), 'roundhouse540').damage
        )
          ? 'roundhouse540'
          : m.kind === 'frontKick'
            ? 'spinHookKick'
            : 'spin360Kick';
        f.bayasaaKickStep = nextKind === 'spinHookKick' ? 2 : nextKind === 'spin360Kick' ? 3 : 0;
        this.launchAttack(f, opp, nextKind);
        return;
      }

      const canceledMove = this.pickRequestedMove(f, opp, inp);
      if (canceledMove && canCancelMove(m.kind, canceledMove, m.didConnectThisSpan)) {
        this.launchAttack(f, opp, canceledMove);
        return;
      }

      if (m.elapsedSec >= m.durationSec) {
        if (m.kind === 'frontKick' || m.kind === 'spinHookKick' || m.kind === 'spin360Kick') {
          f.bayasaaLastKickAt = this.elapsedMs;
        }
        f.activeMove = null;
        f.y = f.grounded ? 0 : f.y;
      }
      return;
    }

    if (!f.grounded) {
      return;
    }

    // Trigger new grounded move
    const move = this.pickRequestedMove(f, opp, inp);
    if (move) {
      f.dashTimer = 0;
      this.handleMoveStart(f, opp, move);
      return;
    }

    if (inp.jump) {
      f.grounded = false;
      f.vy = f.jumpVelM;
      return;
    }

    if (inp.dash !== 0) {
      const fwd = inp.dash === f.facing;
      f.dashTimer = fwd ? 0.18 : 0.2;
      f.dashVel = inp.dash * f.walkSpeedM * (fwd ? 2.5 : 2.1);
      if (!fwd) {
        f.invulnTimer = 0.16;
      }
      this.vfx.spawnDashDust(f.x, inp.dash);
    }

    if (f.dashTimer > 0) {
      f.dashTimer = Math.max(0, f.dashTimer - dt);
      f.x = THREE.MathUtils.clamp(f.x + f.dashVel * dt, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
      return;
    }

    if (inp.block || inp.crouch) {
      return;
    }

    // Tekken 7 3D Sidestep along Z-axis
    if (inp.sidestep !== 0) {
      f.z = THREE.MathUtils.clamp(
        f.z + inp.sidestep * f.walkSpeedM * 0.94 * dt,
        -ARENA_HALF_DEPTH_M,
        ARENA_HALF_DEPTH_M
      );
    }

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) {
      f.x = THREE.MathUtils.clamp(f.x + dir * f.walkSpeedM * dt, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
      // Subtle Z tracking toward opponent when advancing without holding sidestep
      if (inp.sidestep === 0 && dir === f.facing && Math.abs(opp.z - f.z) > 0.14) {
        f.z += Math.sign(opp.z - f.z) * f.walkSpeedM * 0.34 * dt;
      }
    }
  }

  private pickRequestedMove(
    f: FighterSimState,
    opp: FighterSimState,
    inp: FighterInputFrame
  ): CombatMoveKind | null {
    if (inp.ultimate && f.ultimateCooldown <= 0) {
      if (f.characterId === 'blue-striker') {
        return 'icyBodyShot';
      }
      if (f.characterId === 'bayasaa') {
        this.startBayasaaDuck(f);
        return null;
      }
      const style = f.meta?.ultimateStyle;
      if (style === 'tigerKnee') return 'tigerKnee';
      if (style === 'tornadoKick') return 'tornadoKick';
      if (style === 'eagleSlam' || style === 'bearSlam') {
        this.startEagleSlamCharge(f);
        return null;
      }
      if (style === 'weaponSlash') return 'weaponSlash';
      if (style === 'cycloneStrike') return 'cycloneStrike';
      return 'spiritStrike';
    }
    if (inp.special) {
      if (isFighterInRage(f) && !f.usedRageArtThisRound) return 'special';
      if (f.meter >= SUPER_METER_COST) return 'special';
      if (f.meter >= EX_METER_COST) return 'exBurst';
    }
    if (inp.throw || (inp.light && inp.heavy)) return 'throw';
    if (inp.crouch && inp.heavy) return 'sweep';
    if (inp.crouch && inp.light) return 'crouchLight';
    if (inp.heavy) {
      if (f.characterId === 'bayasaa') {
        const dmg = buildCombatAttackProfile(
          getFighterCombat(this.playgroundState, f.characterId),
          'roundhouse540'
        ).damage;
        if (isOneHitKoRange(opp.health, dmg)) {
          f.bayasaaKickStep = 0;
          return 'roundhouse540';
        }
        const step = nextBayasaaKickStep(
          f.bayasaaKickStep,
          this.elapsedMs - f.bayasaaLastKickAt,
          BAYASAA_KICK_COMBO_WINDOW_MS
        );
        f.bayasaaKickStep = step;
        return step === 1 ? 'frontKick' : step === 2 ? 'spinHookKick' : 'spin360Kick';
      }
      return 'heavy';
    }
    if (inp.light) return 'light';
    return null;
  }

  private handleMoveStart(f: FighterSimState, opp: FighterSimState, kind: CombatMoveKind): void {
    if (kind === 'icyBodyShot') {
      f.ultimateCooldown = 3.5;
      f.icyChargeTimer = 0.8;
      this.ultimateBanner = 'ULTIMATE PUNCH';
      this.vfx.spawnFrostCharge(f.x, 0.8);
      this.audio.playUltimateCharge();
      this.schedule(0.8, () => {
        if (this.ultimateBanner === 'ULTIMATE PUNCH') {
          this.ultimateBanner = null;
        }
      });
      return;
    }

    if (kind === 'special') {
      const triggeredViaRage = isFighterInRage(f) && !f.usedRageArtThisRound;
      if (triggeredViaRage) {
        f.usedRageArtThisRound = true;
      } else {
        f.meter = 0;
      }
      const meta = f.meta;
      this.rageCamTimer = 0.85;
      this.superCutIn = {
        title: triggeredViaRage ? `RAGE ART · ${meta?.ultimateCallout ?? 'FINAL FURY!'}` : meta?.ultimateCallout ?? 'SUPER ART!',
        subtitle: meta ? `${meta.label} (${meta.countryMn})` : f.characterId.toUpperCase(),
        color: triggeredViaRage ? '#ef4444' : meta ? `#${meta.primaryColor.toString(16).padStart(6, '0')}` : '#38bdf8'
      };
      this.vfx.spawnShockwave(f.x, 0.05, triggeredViaRage ? 0xef4444 : meta?.primaryColor ?? 0x38bdf8, 0xfacc15, 3.0);
      this.audio.playSpiritUltimate(meta?.weapon !== 'none');
      this.schedule(0.75, () => {
        this.superCutIn = null;
      });
    } else if (kind === 'exBurst') {
      f.meter = Math.max(0, f.meter - EX_METER_COST);
      this.vfx.spawnShockwave(f.x, 0.05, 0xfacc15, 0xffffff, 2.1);
    }

    this.launchAttack(f, opp, kind);
  }

  private launchAttack(f: FighterSimState, _opp: FighterSimState, kind: CombatMoveKind): void {
    const combat = getFighterCombat(this.playgroundState, f.characterId);
    const profile = buildCombatAttackProfile(combat, kind);

    let pose: FighterPoseState = 'lightPunch';
    let durationSec = 0.3;
    let hitStartFrac = 0.28;
    let hitEndFrac = 0.65;
    let reachM = 1.65 * f.scale;
    let multiHitsTotal = 1;
    let lungeSpeed = 0;
    let jumpLift = 0;

    switch (kind) {
      case 'light':
      case 'airLight':
        pose = 'lightPunch';
        durationSec = 0.28;
        reachM = 1.55 * f.scale;
        break;
      case 'crouchLight':
        pose = 'crouchLight';
        durationSec = 0.26;
        reachM = 1.55 * f.scale;
        break;
      case 'heavy':
      case 'airHeavy':
        pose = 'heavyKick';
        durationSec = 0.42;
        reachM = 1.82 * f.scale;
        break;
      case 'sweep':
        pose = 'sweep';
        durationSec = 0.44;
        reachM = 1.92 * f.scale;
        lungeSpeed = 1.4;
        break;
      case 'throw':
        pose = 'throw';
        durationSec = 0.34;
        reachM = 1.45 * f.scale;
        lungeSpeed = 2.4;
        break;
      case 'frontKick':
        pose = 'frontKick';
        durationSec = 0.34;
        reachM = 1.85 * f.scale;
        lungeSpeed = 1.6;
        break;
      case 'spinHookKick':
        pose = 'spinHookKick';
        durationSec = 0.4;
        reachM = 1.95 * f.scale;
        lungeSpeed = 2.2;
        break;
      case 'spin360Kick':
        pose = 'spin360Kick';
        durationSec = 0.46;
        reachM = 2.0 * f.scale;
        lungeSpeed = 2.8;
        jumpLift = 0.45;
        break;
      case 'roundhouse540':
        pose = 'roundhouse540';
        durationSec = 0.52;
        reachM = 2.15 * f.scale;
        lungeSpeed = 3.6;
        jumpLift = 0.68;
        this.vfx.addCallout(f.x, 2.2, '540° ROUNDHOUSE!', '#facc15', 0.85);
        break;
      case 'icyBodyShot':
        pose = 'icyBodyShot';
        durationSec = 0.46;
        reachM = 2.1 * f.scale;
        lungeSpeed = 5.4;
        break;
      case 'tigerKnee':
        f.ultimateCooldown = 3.5;
        pose = 'tigerKnee';
        durationSec = 0.46;
        reachM = 2.15 * f.scale;
        lungeSpeed = 5.6;
        jumpLift = 0.65;
        this.vfx.spawnShockwave(f.x, 0.06, 0xf43f5e, 0xfacc15, 2.5);
        this.audio.playTigerKnee();
        break;
      case 'tornadoKick':
        f.ultimateCooldown = 3.5;
        pose = 'tornadoKick';
        durationSec = 0.56;
        reachM = 2.15 * f.scale;
        lungeSpeed = 4.6;
        jumpLift = 0.85;
        this.vfx.spawnShockwave(f.x, 0.06, 0x38bdf8, 0x2dd4bf, 2.8);
        this.audio.playTornadoKick();
        break;
      case 'weaponSlash':
        f.ultimateCooldown = 3.5;
        pose = 'weaponSlash';
        durationSec = 0.48;
        reachM = 2.35 * f.scale;
        lungeSpeed = 5.0;
        this.vfx.spawnSlashArc(f.x, 1.15, f.facing, f.meta?.primaryColor ?? 0xfacc15);
        this.audio.playSpiritUltimate(true);
        break;
      case 'cycloneStrike':
        f.ultimateCooldown = 3.5;
        pose = 'cycloneStrike';
        durationSec = 0.48;
        reachM = 2.1 * f.scale;
        lungeSpeed = 4.6;
        jumpLift = 0.55;
        this.vfx.spawnSlashArc(f.x, 1.05, f.facing, f.meta?.primaryColor ?? 0x38bdf8);
        this.audio.playSpiritUltimate(false);
        break;
      case 'spiritStrike':
        f.ultimateCooldown = 3.5;
        pose = 'spiritStrike';
        durationSec = 0.48;
        reachM = 2.15 * f.scale;
        lungeSpeed = 5.2;
        this.vfx.spawnShockwave(f.x, 0.06, f.meta?.primaryColor ?? 0x38bdf8, f.meta?.secondaryColor ?? 0xfacc15, 2.5);
        this.audio.playSpiritUltimate(false);
        break;
      case 'exBurst':
        pose = 'heavyKick';
        durationSec = 0.42;
        reachM = 2.05 * f.scale;
        lungeSpeed = 3.4;
        break;
      case 'special':
        pose = isFighterInRage(f) ? 'rageArt' : 'special';
        durationSec = 0.72;
        hitStartFrac = 0.16;
        hitEndFrac = 0.88;
        reachM = 2.3 * f.scale;
        multiHitsTotal = 3;
        lungeSpeed = 3.4;
        break;
    }

    f.rig.setAuraActive(true, f.meta?.primaryColor ?? 0x38bdf8, 0.78);
    this.audio.playSwing(kind !== 'light' && kind !== 'crouchLight');

    f.activeMove = {
      kind,
      pose,
      durationSec,
      elapsedSec: 0,
      hitStartFrac,
      hitEndFrac,
      reachM,
      multiHitsTotal,
      hitsDone: 0,
      profile,
      didConnectThisSpan: false,
      lungeSpeed,
      jumpLift
    };
  }

  private startBayasaaDuck(f: FighterSimState): void {
    f.ultimateCooldown = 3.5;
    f.invulnTimer = 0.35;
    f.duckChokeTimer = 0.32;
    this.vfx.addCallout(f.x, 1.9, 'DUCK UNDER!', '#fb923c', 0.65);
    this.vfx.spawnDashDust(f.x, f.facing);
  }

  private startEagleSlamCharge(f: FighterSimState): void {
    f.ultimateCooldown = 3.5;
    f.invulnTimer = 0.34;
    f.eagleSlamTimer = 0.34;
    this.vfx.addCallout(
      f.x,
      1.95,
      f.meta?.ultimateCallout ?? 'EAGLE SLAM!',
      `#${(f.meta?.primaryColor ?? 0xfacc15).toString(16).padStart(6, '0')}`,
      0.7
    );
    this.vfx.spawnDashDust(f.x, f.facing);
  }

  private resolveSpecialGrabs(attacker: FighterSimState, defender: FighterSimState): void {
    if (
      defender.defeated ||
      defender.downedTimer > 0 ||
      defender.invulnTimer > 0 ||
      !defender.grounded ||
      defender.grappleMode !== 'none'
    ) {
      return;
    }

    const dist = Math.abs(defender.x - attacker.x);

    // Bayasaa Triangle Choke Grab
    if (attacker.duckChokeTimer > 0 && dist <= 1.65 * attacker.scale) {
      attacker.duckChokeTimer = 0;
      attacker.grappleMode = 'choker';
      attacker.grappleProgress = 0;
      defender.grappleMode = 'trapped';
      defender.grappleProgress = 0;
      defender.activeMove = null;
      defender.x = THREE.MathUtils.clamp(
        attacker.x + attacker.facing * 0.56,
        -ARENA_HALF_WIDTH_M,
        ARENA_HALF_WIDTH_M
      );
      defender.facing = attacker.facing === 1 ? -1 : 1;
      defender.rig.setFacing(defender.facing);

      defender.rig.getHeadWorldPosition(this._tmpHead);
      this.chokeCleanup = this.vfx.spawnFlamingTriangleRing(
        this._tmpHead.x,
        Math.max(0.85, this._tmpHead.y),
        attacker.facing,
        1.45
      );
      this.vfx.addCallout(defender.x, 1.8, 'TRIANGLE CHOKE!', '#fb923c', 0.9);
      this.audio.playFlameRing();

      const applyTap = (dmg: number): void => {
        if (this.phase !== 'fighting' || defender.grappleMode !== 'trapped') {
          return;
        }
        defender.health = Math.max(0, defender.health - dmg);
        defender.flashTimer = 0.14;
        defender.flashColor = 0xfb923c;
        defender.rig.setTintFlash(0xfb923c, 0.7);
        this.cameraShake = 0.22;
        this.vfx.spawnHitSpark(defender.x, 1.0, 0xfb923c, true);
        this.audio.playTriangleTap();
        if (defender.health <= 0) {
          this.releaseAllGrapples();
          defender.defeated = true;
          this.vfx.addCallout(defender.x, 2.0, 'SUBMISSION K.O.!', '#facc15', 1.1);
          this.audio.playKnockOut();
        }
      };

      this.schedule(0.58, () => applyTap(TRIANGLE_CHOKE_TAP1_DAMAGE));
      this.schedule(0.98, () => applyTap(TRIANGLE_CHOKE_TAP2_DAMAGE));
      this.schedule(1.44, () => {
        if (attacker.grappleMode === 'choker') {
          attacker.grappleMode = 'none';
          defender.grappleMode = 'none';
          defender.knockbackVel = attacker.facing * 3.4;
        }
      });
      return;
    }

    // Mongol Bokh / Bear Slam Grab
    if (attacker.eagleSlamTimer > 0 && dist <= 1.7 * attacker.scale) {
      attacker.eagleSlamTimer = 0;
      attacker.grappleMode = 'slammer';
      attacker.grappleProgress = 0;
      defender.grappleMode = 'slammed';
      defender.grappleProgress = 0;
      defender.activeMove = null;
      defender.x = THREE.MathUtils.clamp(
        attacker.x + attacker.facing * 0.45,
        -ARENA_HALF_WIDTH_M,
        ARENA_HALF_WIDTH_M
      );

      this.schedule(0.47, () => {
        if (this.phase !== 'fighting' || defender.grappleMode !== 'slammed') {
          return;
        }
        const slamX = THREE.MathUtils.clamp(
          attacker.x + attacker.facing * 0.85,
          -ARENA_HALF_WIDTH_M,
          ARENA_HALF_WIDTH_M
        );
        defender.x = slamX;
        defender.health = Math.max(0, defender.health - EAGLE_SLAM_DAMAGE);
        this.cameraShake = 0.55;
        this.vfx.spawnShockwave(
          slamX,
          0.05,
          attacker.meta?.primaryColor ?? 0xfacc15,
          attacker.meta?.secondaryColor ?? 0xfef08a,
          3.8
        );
        this.vfx.addCallout(slamX, 2.0, attacker.meta?.ultimateCallout ?? 'EAGLE SLAM!', '#facc15', 0.95);
        this.audio.playEagleSlam();

        if (defender.health <= 0) {
          this.releaseAllGrapples();
          defender.defeated = true;
          this.audio.playKnockOut();
        }
      });

      this.schedule(0.78, () => {
        if (attacker.grappleMode === 'slammer') {
          attacker.grappleMode = 'none';
          defender.grappleMode = 'none';
          defender.knockbackVel = attacker.facing * 3.6;
        }
      });
    }
  }

  private releaseAllGrapples(): void {
    this.chokeCleanup?.();
    this.chokeCleanup = null;
    this.p1.grappleMode = 'none';
    this.p2.grappleMode = 'none';
  }

  private resolveStrike(attacker: FighterSimState, defender: FighterSimState): void {
    const move = attacker.activeMove;
    if (!move || defender.defeated || defender.downedTimer > 0 || defender.grappleMode !== 'none') {
      return;
    }

    const frac = move.elapsedSec / move.durationSec;
    if (frac < move.hitStartFrac || frac > move.hitEndFrac) {
      return;
    }

    const spanSize = (move.hitEndFrac - move.hitStartFrac) / move.multiHitsTotal;
    const currentSpan = Math.min(
      move.multiHitsTotal - 1,
      Math.floor((frac - move.hitStartFrac) / spanSize)
    );
    if (move.hitsDone > currentSpan) {
      return;
    }

    const dx = (defender.x - attacker.x) * attacker.facing;
    const dy = Math.abs(defender.y - attacker.y);
    const dz = Math.abs(defender.z - attacker.z);
    if (dx < -0.35 || dx > move.reachM || dy > 1.55) {
      return;
    }

    // Tekken 7 3D Sidestep evasion: linear moves miss if defender sidestepped in Z; homing moves track!
    const maxDepthTol = isHomingMove(move.kind) ? 1.48 : 0.72;
    if (dz > maxDepthTol) {
      move.hitsDone = currentSpan + 1;
      this.vfx.addCallout(defender.x, 1.95, 'SIDESTEP!', '#38bdf8', 0.65);
      return;
    }

    if (defender.invulnTimer > 0) {
      move.hitsDone = currentSpan + 1;
      this.vfx.addCallout(defender.x, 1.85, 'DODGE!', '#38bdf8', 0.55);
      return;
    }

    move.hitsDone = currentSpan + 1;
    move.didConnectThisSpan = true;

    const p2Blocking = this.mode === '1vcpu' ? defender.blockstunTimer > 0 || Math.random() < 0.14 : false;
    const keyBlock =
      defender.side === 1 ? this.keysDown.has('KeyC') : this.keysDown.has('KeyM') || p2Blocking;
    const keyCrouch =
      defender.side === 1 ? this.keysDown.has('KeyS') : this.keysDown.has('ArrowDown');
    const defenderGuarding =
      defender.grounded && !defender.activeMove && defender.hitstunTimer <= 0 && keyBlock;

    const blocked = isAttackGuarded(defenderGuarding, keyCrouch, move.profile.defenseHeight);
    const isRoundhouse540Ko =
      move.kind === 'roundhouse540' && !blocked && isOneHitKoRange(defender.health, move.profile.damage);

    const rageMult = isFighterInRage(attacker) ? 1.15 : 1.0;
    const rawDamage = Math.round(move.profile.damage * rageMult);
    const dmg = blocked
      ? Math.max(1, Math.round(rawDamage * 0.22))
      : isRoundhouse540Ko
        ? Math.max(rawDamage, defender.health)
        : rawDamage;

    defender.health = Math.max(0, defender.health - dmg);
    attacker.meter = Math.min(SUPER_METER_COST, attacker.meter + (blocked ? 4 : 12));
    defender.meter = Math.min(SUPER_METER_COST, defender.meter + (blocked ? 4 : 7));

    const hitX = (attacker.x + defender.x) * 0.5;
    const hitY = 1.05 + defender.y;

    if (blocked) {
      defender.blockstunTimer = 0.14;
      defender.blockLow = keyCrouch;
      defender.knockbackVel = attacker.facing * (move.profile.knockback * 0.005);
      this.vfx.spawnBlockRipple(hitX, hitY);
      this.vfx.addCallout(defender.x, 1.8, 'BLOCK!', '#38bdf8', 0.5);
      this.audio.playHit(false, true);
      return;
    }

    const heavyHit =
      move.kind === 'icyBodyShot' ||
      move.kind === 'roundhouse540' ||
      move.kind === 'tigerKnee' ||
      move.kind === 'tornadoKick' ||
      move.kind === 'weaponSlash' ||
      move.kind === 'spiritStrike' ||
      move.kind === 'cycloneStrike' ||
      move.kind === 'heavy' ||
      move.kind === 'special';

    // Blue Striker Super Armor shrugs off normal hitstun unless icy body shot / KO
    if (move.kind === 'icyBodyShot') {
      defender.downedTimer = 2.0;
      defender.hitstunTimer = 0;
      defender.activeMove = null;
      defender.knockbackVel = attacker.facing * 2.2;
      this.vfx.spawnShockwave(hitX, 0.1, 0xbae6fd, 0xe0f2fe, 3.0);
      this.vfx.addCallout(defender.x, 1.9, 'BODY SHOT!', '#7dd3fc', 0.9);
      this.audio.playIcyBodyShot();
      this.cameraShake = 0.45;
    } else if (!hasSuperArmor(defender.characterId) || defender.health <= 0) {
      defender.hitstunTimer = Math.max(0.18, move.profile.hitstun / 1000);
      defender.activeMove = null;
      defender.knockbackVel = attacker.facing * (move.profile.knockback * 0.009);
      defender.comboReceived += 1;
      if (defender.comboReceived >= 2) {
        this.vfx.addCallout(defender.x, 2.05, `${defender.comboReceived} HITS!`, '#facc15', 0.65);
      }
    } else {
      // Blue Striker Super Armor flash
      this.vfx.addCallout(defender.x, 1.95, 'ARMOR!', '#38bdf8', 0.45);
    }

    if (isRoundhouse540Ko) {
      this.audio.playKnockOut();
    } else {
      this.audio.playHit(heavyHit, false);
    }

    defender.flashTimer = 0.14;
    defender.flashColor = move.kind === 'icyBodyShot' ? 0xbae6fd : 0xf43f5e;
    defender.rig.setTintFlash(defender.flashColor, 0.72);
    this.vfx.spawnHitSpark(
      hitX,
      hitY,
      move.kind === 'icyBodyShot' ? 0xbae6fd : attacker.meta?.primaryColor ?? 0xfacc15,
      heavyHit
    );
    if (heavyHit) {
      this.cameraShake = Math.max(this.cameraShake, 0.26);
    }
  }

  private preventBodyOverlap(): void {
    if (this.p1.grappleMode !== 'none' || this.p2.grappleMode !== 'none') {
      return;
    }
    if (Math.abs(this.p1.z - this.p2.z) >= 0.72) {
      return;
    }
    const minSep = 0.78;
    const dx = this.p2.x - this.p1.x;
    if (Math.abs(dx) < minSep && Math.abs(this.p1.y - this.p2.y) < 1.1) {
      const push = (minSep - Math.abs(dx)) * 0.5;
      const sign = dx >= 0 ? 1 : -1;
      this.p1.x = THREE.MathUtils.clamp(this.p1.x - sign * push, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
      this.p2.x = THREE.MathUtils.clamp(this.p2.x + sign * push, -ARENA_HALF_WIDTH_M, ARENA_HALF_WIDTH_M);
    }
  }

  private checkKnockout(): void {
    if (this.phase !== 'fighting' || this.koSlowMoPending) {
      return;
    }
    if (this.p1.health <= 0 || this.p2.health <= 0) {
      this.p1.defeated = this.p1.health <= 0;
      this.p2.defeated = this.p2.health <= 0;
      this.releaseAllGrapples();
      // Tekken 7 dramatic 0.25x KO slow-motion final blow!
      this.koSlowMoTimer = 0.85;
      this.koSlowMoPending = true;
      this.cameraShake = 0.35;
    }
  }

  private finalizeKnockout(): void {
    if (this.phase !== 'fighting') {
      return;
    }
    if (this.p1.defeated && this.p2.defeated) {
      this.audio.playAnnouncerPhrase('Double Knock Out!');
      this.endRound(null, 'DOUBLE K.O.!');
    } else if (this.p2.defeated) {
      this.p1Wins += 1;
      this.audio.playAnnouncerPhrase('Knock Out!');
      this.endRound(1, 'K.O.!');
    } else {
      this.p2Wins += 1;
      this.audio.playAnnouncerPhrase('Knock Out!');
      this.endRound(2, 'K.O.!');
    }
  }

  private handleTimeOver(): void {
    if (this.phase !== 'fighting') {
      return;
    }
    this.releaseAllGrapples();
    this.audio.playAnnouncerPhrase('Time Over!');
    if (this.p1.health === this.p2.health) {
      this.endRound(null, 'DRAW!');
    } else if (this.p1.health > this.p2.health) {
      this.p1Wins += 1;
      this.endRound(1, 'TIME OVER!');
    } else {
      this.p2Wins += 1;
      this.endRound(2, 'TIME OVER!');
    }
  }

  private endRound(roundWinner: 1 | 2 | null, label: string): void {
    this.phase = 'roundEnd';
    this.bannerText = label;
    this.cameraShake = 0.45;
    this.audio.setMusicMood('preFight');

    this.schedule(1.9, () => {
      if (this.p1Wins >= ROUNDS_TO_WIN || this.p2Wins >= ROUNDS_TO_WIN) {
        this.phase = 'matchOver';
        this.winnerSide = this.p1Wins >= ROUNDS_TO_WIN ? 1 : 2;
        this.bannerText = '';
        return;
      }
      if (roundWinner !== null) {
        this.roundNumber += 1;
      }
      this.startRound();
    });
  }

  private syncFighterRig(f: FighterSimState, inp: FighterInputFrame, dt: number): void {
    f.rig.root.position.set(f.x, f.y, f.z);

    let pose: FighterPoseState = 'idle';
    let progress = 0;

    if (f.defeated) {
      pose = 'ko';
    } else if (this.phase === 'matchOver' && this.winnerSide === f.side) {
      pose = 'victory';
    } else if (f.grappleMode !== 'none') {
      pose = f.grappleMode;
      progress = f.grappleProgress;
    } else if (f.downedTimer > 0) {
      pose = 'liverDowned';
    } else if (f.hitstunTimer > 0) {
      pose = 'hit';
    } else if (f.blockstunTimer > 0) {
      pose = f.blockLow ? 'blockLow' : 'blockHigh';
    } else if (f.icyChargeTimer > 0) {
      pose = 'icyCharge';
    } else if (f.duckChokeTimer > 0) {
      pose = 'duckUnder';
    } else if (f.eagleSlamTimer > 0) {
      pose = 'dash';
    } else if (f.activeMove) {
      pose = f.activeMove.pose;
      progress = f.activeMove.elapsedSec / f.activeMove.durationSec;
    } else if (!f.grounded) {
      pose = 'jump';
    } else if (f.dashTimer > 0) {
      pose = 'dash';
    } else if (inp.block) {
      pose = inp.crouch ? 'blockLow' : 'blockHigh';
    } else if (inp.crouch) {
      pose = 'crouch';
    } else if (inp.sidestep !== 0) {
      pose = 'sidestep';
    } else if (inp.left || inp.right) {
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      pose = dir === f.facing ? 'walkForward' : 'walkBackward';
    }

    const showAura = Boolean(f.activeMove || f.icyChargeTimer > 0 || f.duckChokeTimer > 0 || f.eagleSlamTimer > 0);
    f.rig.setAuraActive(
      showAura,
      f.icyChargeTimer > 0 ? 0xbae6fd : f.meta?.primaryColor ?? 0x38bdf8,
      0.75
    );
    f.rig.setRageActive(isFighterInRage(f), this.elapsedMs / 1000);
    f.rig.updatePose(dt, pose, progress, this.elapsedMs / 1000, f.y, f.scale);
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera): void {
    const midX = (this.p1.x + this.p2.x) * 0.5;
    const midZ = (this.p1.z + this.p2.z) * 0.5;
    const span = Math.abs(this.p1.x - this.p2.x);
    const grappleZoom = this.p1.grappleMode !== 'none' || this.superCutIn ? -1.45 : 0;
    const slowMoZoom = this.koSlowMoTimer > 0 ? -1.65 : 0;
    const targetZ = THREE.MathUtils.clamp(5.6 + span * 0.42 + grappleZoom + slowMoZoom + midZ * 0.5, 4.1, 9.4);
    const targetY = this.phase === 'matchOver' ? 2.1 : this.koSlowMoTimer > 0 ? 1.45 : 1.75 + span * 0.06;

    // Dramatic Tekken 7 camera sweep during KO Slow-Mo or Rage Art
    let orbitOffsetX = 0;
    if (this.koSlowMoTimer > 0) {
      orbitOffsetX = Math.sin((0.85 - this.koSlowMoTimer) * 4.5) * 1.4;
    } else if (this.rageCamTimer > 0) {
      orbitOffsetX = Math.sin(this.rageCamTimer * 6.0) * 1.25;
    }

    camera.position.x = THREE.MathUtils.damp(camera.position.x, midX * 0.65 + orbitOffsetX, 7, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 6, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, 6, dt);

    if (this.cameraShake > 0) {
      camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.45;
      camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.35;
    }

    camera.lookAt(midX * 0.8, 1.05, midZ * 0.6);
  }

  getSnapshot(): MatchHudSnapshot {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      timeSeconds: Math.ceil(this.roundTimeSec),
      p1Wins: this.p1Wins,
      p2Wins: this.p2Wins,
      p1Health01: this.p1.health / Math.max(1, this.p1.maxHealth),
      p2Health01: this.p2.health / Math.max(1, this.p2.maxHealth),
      p1Meter01: this.p1.meter / SUPER_METER_COST,
      p2Meter01: this.p2.meter / SUPER_METER_COST,
      p1Rage: isFighterInRage(this.p1),
      p2Rage: isFighterInRage(this.p2),
      bannerText: this.bannerText,
      bannerSubtext: this.bannerSubtext,
      superCutIn: this.superCutIn,
      ultimateBanner: this.ultimateBanner,
      winnerSide: this.winnerSide
    };
  }
}
