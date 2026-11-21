import * as Phaser from 'phaser';

import { FIGHTING_UI_ATLAS_TEXTURE_KEY } from './fightingUiAtlas';

/** Render depth for combat VFX: above fighters, below the HUD. */
const VFX_DEPTH = 90;

/** Tint/spark colour keyed to the kind of impact. */
export type VfxColor = 'red' | 'gold' | 'blue';

const SPARK_FRAME: Record<VfxColor, string> = {
  red: 'icon-hit-red',
  gold: 'icon-hit-gold',
  blue: 'icon-hit-blue'
};

const FLASH_TINT: Record<VfxColor, number> = {
  red: 0xff5a5a,
  gold: 0xffd24a,
  blue: 0x7ec8ff
};

/**
 * Spawns a short-lived hit spark (an atlas impact icon) at a contact point that
 * pops in, scales up, and fades out. Used when an attack connects.
 * @param scene - The owning scene.
 * @param x - World x of the contact point.
 * @param y - World y of the contact point.
 * @param color - Spark colour (red clean hit, blue blocked, gold finisher).
 * @param scale - Peak display scale of the spark (default 1).
 */
export function spawnHitSpark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: VfxColor = 'red',
  scale = 1
): void {
  const frame = SPARK_FRAME[color];
  if (!scene.textures.exists(FIGHTING_UI_ATLAS_TEXTURE_KEY)) {
    spawnImpactFlash(scene, x, y, color, 40 * scale);
    return;
  }

  const spark = scene.add
    .image(x, y, FIGHTING_UI_ATLAS_TEXTURE_KEY, frame)
    .setDepth(VFX_DEPTH)
    .setScrollFactor(1)
    .setScale(0.2 * scale)
    .setAngle(Phaser.Math.Between(-30, 30))
    .setAlpha(1);

  scene.tweens.add({
    targets: spark,
    scale: scale,
    alpha: 0,
    duration: 220,
    ease: 'Cubic.Out',
    onComplete: () => spark.destroy()
  });

  spawnImpactFlash(scene, x, y, color, 34 * scale);
}

/**
 * Spawns an expanding ring flash at a point that fades as it grows.
 * @param scene - The owning scene.
 * @param x - World x of the flash centre.
 * @param y - World y of the flash centre.
 * @param color - Flash tint.
 * @param radius - Peak radius in world pixels.
 */
export function spawnImpactFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: VfxColor,
  radius = 40
): void {
  const ring = scene.add
    .circle(x, y, radius * 0.3, FLASH_TINT[color], 0.55)
    .setDepth(VFX_DEPTH - 1)
    .setScrollFactor(1);

  scene.tweens.add({
    targets: ring,
    scale: 2.4,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });
}

/**
 * Spawns a special-move charge burst around a fighter: concentric rings that
 * expand outward and fade, telegraphing the wind-up before the move executes.
 * @param scene - The owning scene.
 * @param x - World x of the fighter's centre.
 * @param y - World y of the fighter's centre (roughly mid-body).
 * @param color - Aura colour.
 */
export function spawnChargeAura(scene: Phaser.Scene, x: number, y: number, color: VfxColor = 'gold'): void {
  for (let index = 0; index < 3; index += 1) {
    const ring = scene.add
      .circle(x, y, 18, FLASH_TINT[color], 0)
      .setStrokeStyle(4, FLASH_TINT[color], 0.9)
      .setDepth(VFX_DEPTH - 1)
      .setScrollFactor(1)
      .setScale(1.6);

    scene.tweens.add({
      targets: ring,
      scale: 0.2,
      alpha: 0,
      delay: index * 120,
      duration: 420,
      ease: 'Sine.In',
      onComplete: () => ring.destroy()
    });
  }
}

/**
 * Spawns a quick ground dust burst behind a dashing fighter.
 */
export function spawnDashDust(scene: Phaser.Scene, x: number, groundY: number, direction: 1 | -1): void {
  for (let i = 0; i < 3; i += 1) {
    const puff = scene.add
      .circle(x - direction * i * 10, groundY - 12 - i * 4, 8 - i * 1.5, 0xe2e8f0, 0.45)
      .setDepth(VFX_DEPTH - 2)
      .setScrollFactor(1);

    scene.tweens.add({
      targets: puff,
      x: puff.x - direction * (24 + i * 10),
      y: puff.y - 10,
      scale: 1.5,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.Out',
      onComplete: () => puff.destroy()
    });
  }
}

/**
 * Spawns a sharp cyan-gold burst ring when firing a 50% meter EX attack.
 */
export function spawnExAura(scene: Phaser.Scene, x: number, y: number): void {
  const ring = scene.add
    .circle(x, y, 22, 0x38bdf8, 0.28)
    .setStrokeStyle(4, 0xfacc15, 0.95)
    .setDepth(VFX_DEPTH - 1)
    .setScrollFactor(1);

  scene.tweens.add({
    targets: ring,
    scale: 2.3,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });
}

/**
 * Spawns a purple-gold impact ring when a close-range throw connects.
 */
export function spawnThrowSpark(scene: Phaser.Scene, x: number, y: number): void {
  const ring = scene.add
    .circle(x, y, 20, 0xc084fc, 0.35)
    .setStrokeStyle(4, 0xfacc15, 0.95)
    .setDepth(VFX_DEPTH)
    .setScrollFactor(1);

  scene.tweens.add({
    targets: ring,
    scale: 2.1,
    alpha: 0,
    duration: 240,
    ease: 'Back.Out',
    onComplete: () => ring.destroy()
  });
}

/**
 * Displays a crisp floating combat callout (e.g. THROW!, SWEEP!, 3 HIT!).
 */
export function spawnCombatCallout(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  color = '#facc15'
): void {
  const text = scene.add
    .text(x, y, label, {
      color,
      fontFamily: 'monospace',
      fontSize: '18px',
      fontStyle: 'bold',
      stroke: '#020617',
      strokeThickness: 5
    })
    .setOrigin(0.5)
    .setDepth(VFX_DEPTH + 2)
    .setScrollFactor(1)
    .setScale(0.7);

  scene.tweens.add({
    targets: text,
    y: y - 38,
    scale: 1,
    alpha: 0,
    duration: 680,
    ease: 'Cubic.Out',
    onComplete: () => text.destroy()
  });
}

