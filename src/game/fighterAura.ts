import * as Phaser from 'phaser';

import type { MartialArtDefinition } from './worldMartialArts';

/**
 * Renders a clean ground aura pulse strictly under the fighter's feet during
 * active attacks or L-Ultimates so sprites remain crisp and uncluttered.
 */
export class FighterSpiritVisuals {
  private readonly scene: Phaser.Scene;
  private readonly meta: MartialArtDefinition;
  private readonly backGfx: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private flareTimer = 0;

  constructor(scene: Phaser.Scene, meta: MartialArtDefinition, depthBase: number) {
    this.scene = scene;
    this.meta = meta;
    this.backGfx = scene.add.graphics().setDepth(depthBase - 2);
  }

  /** Updates render depth when the owning fighter swaps front/back priority. */
  setDepthBase(depthBase: number): void {
    this.backGfx.setDepth(depthBase - 2);
  }

  /** Pulses the ground aura ring during attacks or Ultimates. */
  flare(durationSeconds = 0.55): void {
    this.flareTimer = Math.max(this.flareTimer, durationSeconds);
  }

  /** Draws a clean subtle ground ring only when attacking or flaring an Ultimate. */
  update(
    seconds: number,
    x: number,
    groundY: number,
    _spriteY: number,
    scale: number,
    _facing: 1 | -1,
    isAttacking: boolean,
    isDefeated: boolean
  ): void {
    this.elapsed += seconds;
    if (this.flareTimer > 0) {
      this.flareTimer = Math.max(0, this.flareTimer - seconds);
    }

    this.backGfx.clear();

    if (!this.scene || isDefeated || (!isAttacking && this.flareTimer <= 0)) {
      return;
    }

    const flareBoost = this.flareTimer > 0 ? Math.min(1, this.flareTimer * 2.2) : 0.45;
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 6);
    const alpha = 0.22 + flareBoost * 0.34 + pulse * 0.08;
    const { primaryColor, secondaryColor } = this.meta;

    const ringW = (96 + flareBoost * 26) * scale;
    const ringH = (22 + flareBoost * 6) * scale;
    this.backGfx.fillStyle(primaryColor, alpha * 0.32);
    this.backGfx.fillEllipse(x, groundY - 12 * scale, ringW, ringH);
    this.backGfx.lineStyle(2, primaryColor, Math.min(0.85, alpha + 0.25));
    this.backGfx.strokeEllipse(x, groundY - 12 * scale, ringW, ringH);
    this.backGfx.lineStyle(1.4, secondaryColor, Math.min(0.8, alpha + 0.18));
    this.backGfx.strokeEllipse(x, groundY - 12 * scale, ringW * 0.72, ringH * 0.68);
  }

  destroy(): void {
    this.backGfx.destroy();
  }
}
