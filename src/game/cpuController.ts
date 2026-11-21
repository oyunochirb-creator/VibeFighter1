import * as Phaser from 'phaser';

import { NEUTRAL_FIGHTER_INPUT, type Fighter, type FighterInput } from './fighter';

/**
 * Context-aware CPU opponent controller for 1vCPU matches. Uses distance,
 * meter state, and opponent stance to mix dashes, crouch/low-block, sweeps,
 * jump-ins, throws, EX bursts, and specials.
 */
export class CpuController {
  private nextDecisionAt = 0;
  private holdUntil = 0;
  private moveDir = 0;
  private holdCrouch = false;
  private holdBlock = false;
  private pendingAirAttackAt = 0;
  private pendingAirHeavy = false;

  /**
   * Produces the CPU's input snapshot for this frame.
   * @param timeMs - Current Phaser clock time in ms.
   * @param self - The CPU-controlled fighter.
   * @param opponent - The opposing fighter.
   */
  update(timeMs: number, self: Fighter, opponent: Fighter): FighterInput {
    const input: FighterInput = { ...NEUTRAL_FIGHTER_INPUT };

    if (this.pendingAirAttackAt > 0 && self.isAirborne && timeMs >= this.pendingAirAttackAt) {
      if (this.pendingAirHeavy) {
        input.heavy = true;
      } else {
        input.light = true;
      }
      this.pendingAirAttackAt = 0;
    }

    if (timeMs >= this.nextDecisionAt) {
      this.decide(timeMs, self, opponent, input);
      this.nextDecisionAt = timeMs + Phaser.Math.Between(360, 920);
    }

    if (timeMs < this.holdUntil) {
      if (this.moveDir < 0) {
        input.left = true;
      } else if (this.moveDir > 0) {
        input.right = true;
      }
      input.crouch = input.crouch || this.holdCrouch;
      input.block = input.block || this.holdBlock;
    } else {
      this.moveDir = 0;
      this.holdCrouch = false;
      this.holdBlock = false;
    }

    return input;
  }

  private decide(
    timeMs: number,
    self: Fighter,
    opponent: Fighter,
    input: FighterInput
  ): void {
    const distance = Math.abs(opponent.x - self.x);
    const toward = opponent.x >= self.x ? 1 : -1;
    const away: -1 | 1 = toward === 1 ? -1 : 1;
    const roll = Math.random();

    // Unleash full Super Special or 50% EX Burst when in range.
    if (distance < 210 && self.isMeterReady && roll < 0.35) {
      input.special = true;
      return;
    }
    if (distance < 190 && self.isExReady && !self.isMeterReady && roll < 0.25) {
      input.special = true;
      return;
    }

    // Close range: mix fast normals, sweeps, throws, signature ultimate, or defensive guard/backdash.
    if (distance < 155) {
      if (roll < 0.22) {
        input.light = true;
      } else if (roll < 0.39) {
        input.heavy = true;
      } else if (roll < 0.51) {
        input.crouch = true;
        input.heavy = true; // Low sweep
      } else if (roll < 0.62) {
        input.throw = true;
      } else if (roll < 0.7 && !opponent.isBodyDowned) {
        input.ultimate = true;
      } else if (roll < 0.84) {
        this.holdBlock = true;
        this.holdCrouch = Math.random() < 0.45;
        this.holdUntil = timeMs + Phaser.Math.Between(280, 560);
      } else if (roll < 0.93) {
        input.dash = away; // Backdash evade
      } else {
        this.holdCrouch = true;
        this.holdUntil = timeMs + Phaser.Math.Between(260, 480);
      }
      return;
    }

    // Mid/far range: close gap with dash, jump-in air attack, or walk.
    if (roll < 0.28) {
      input.dash = toward;
    } else if (roll < 0.48) {
      input.jump = true;
      this.moveDir = toward;
      this.holdUntil = timeMs + 420;
      this.pendingAirAttackAt = timeMs + Phaser.Math.Between(180, 320);
      this.pendingAirHeavy = Math.random() < 0.55;
    } else if (roll < 0.78) {
      this.moveDir = toward;
      this.holdUntil = timeMs + Phaser.Math.Between(300, 620);
    } else if (roll < 0.9) {
      this.moveDir = away;
      this.holdUntil = timeMs + Phaser.Math.Between(220, 420);
    } else {
      this.holdBlock = true;
      this.holdUntil = timeMs + Phaser.Math.Between(250, 480);
    }
  }
}
