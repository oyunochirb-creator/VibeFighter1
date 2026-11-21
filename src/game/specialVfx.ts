import * as Phaser from 'phaser';

import { spawnCombatCallout } from './vfx';

const SPECIAL_VFX_DEPTH = 95;
const BANNER_VFX_DEPTH = 240;

/**
 * Displays the dramatic pale-blue "ULTIMATE PUNCH" callout banner for `durationMs` (0.8s)
 * with frosty speed streaks before Blue Striker's icy body shot launches.
 */
export function spawnUltimatePunchBanner(scene: Phaser.Scene, durationMs = 800): void {
  const cam = scene.cameras.main;
  const cx = cam.width / 2;
  const cy = cam.height * 0.34;

  const wash = scene.add
    .rectangle(cx, cy, cam.width, 108, 0x0c4a6e, 0.42)
    .setScrollFactor(0)
    .setDepth(BANNER_VFX_DEPTH)
    .setAlpha(0);

  const borderTop = scene.add
    .rectangle(cx, cy - 54, cam.width, 3, 0xbae6fd, 0.9)
    .setScrollFactor(0)
    .setDepth(BANNER_VFX_DEPTH + 1);

  const borderBottom = scene.add
    .rectangle(cx, cy + 54, cam.width, 3, 0xbae6fd, 0.9)
    .setScrollFactor(0)
    .setDepth(BANNER_VFX_DEPTH + 1);

  const title = scene.add
    .text(cx, cy, 'ULTIMATE PUNCH', {
      color: '#e0f2fe',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      fontSize: '46px',
      stroke: '#082f49',
      strokeThickness: 8
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(BANNER_VFX_DEPTH + 2)
    .setScale(0.65);

  // Pale frost streaks across the banner
  const streaks: Phaser.GameObjects.Rectangle[] = [];
  for (let i = 0; i < 8; i += 1) {
    const sy = cy + Phaser.Math.Between(-42, 42);
    const streak = scene.add
      .rectangle(cx - cam.width * 0.6, sy, Phaser.Math.Between(120, 280), Phaser.Math.Between(2, 5), 0xbae6fd, 0.55)
      .setScrollFactor(0)
      .setDepth(BANNER_VFX_DEPTH + 1);
    streaks.push(streak);

    scene.tweens.add({
      targets: streak,
      x: cx + cam.width * 0.65,
      alpha: 0,
      delay: i * 65,
      duration: Math.max(260, durationMs - i * 40),
      ease: 'Cubic.Out'
    });
  }

  scene.tweens.add({
    targets: wash,
    alpha: 0.72,
    duration: 130,
    ease: 'Quad.Out'
  });

  scene.tweens.add({
    targets: title,
    scale: 1.06,
    duration: 180,
    ease: 'Back.Out'
  });

  const fadeStart = Math.max(120, durationMs - 140);
  scene.tweens.add({
    targets: [wash, borderTop, borderBottom, title],
    alpha: 0,
    delay: fadeStart,
    duration: 140,
    ease: 'Quad.In'
  });

  scene.time.delayedCall(durationMs + 40, () => {
    wash.destroy();
    borderTop.destroy();
    borderBottom.destroy();
    title.destroy();
    streaks.forEach((s) => s.destroy());
  });
}

/**
 * Swirling pale-blue cold aura & rising frost crystals around Blue Striker
 * during the 0.8s ULTIMATE PUNCH wind-up.
 */
export function spawnFrostChargeAura(
  scene: Phaser.Scene,
  x: number,
  y: number,
  durationMs = 800
): void {
  const pulse = scene.add
    .circle(x, y, 44, 0xbae6fd, 0.18)
    .setStrokeStyle(3, 0xe0f2fe, 0.85)
    .setDepth(SPECIAL_VFX_DEPTH - 1);

  scene.tweens.add({
    targets: pulse,
    scale: 1.45,
    alpha: 0.04,
    duration: 240,
    yoyo: true,
    repeat: Math.max(0, Math.floor(durationMs / 480) - 1)
  });

  const shardCount = 10;
  for (let i = 0; i < shardCount; i += 1) {
    const angle = (Math.PI * 2 * i) / shardCount;
    const dist = Phaser.Math.Between(56, 94);
    const sx = x + Math.cos(angle) * dist;
    const sy = y + Math.sin(angle) * dist;

    const shard = scene.add
      .rectangle(sx, sy, 8, 8, i % 2 === 0 ? 0xe0f2fe : 0x7dd3fc, 0.85)
      .setAngle(45)
      .setDepth(SPECIAL_VFX_DEPTH);

    scene.tweens.add({
      targets: shard,
      x: x + Phaser.Math.Between(-12, 12),
      y: y + Phaser.Math.Between(-14, 14),
      scale: 0.25,
      alpha: 0,
      delay: Math.min(durationMs - 160, i * 65),
      duration: 260,
      ease: 'Cubic.In',
      onComplete: () => shard.destroy()
    });
  }

  scene.time.delayedCall(durationMs + 40, () => pulse.destroy());
}

/**
 * Pale-blue cold frost explosion at the opponent's liver/midsection when
 * Blue Striker's ULTIMATE PUNCH body shot lands.
 */
export function spawnIcyBodyShotImpact(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facing: 1 | -1
): void {
  const coreFlash = scene.add
    .circle(x, y, 30, 0xe0f2fe, 0.72)
    .setStrokeStyle(5, 0x7dd3fc, 0.95)
    .setDepth(SPECIAL_VFX_DEPTH + 1);

  scene.tweens.add({
    targets: coreFlash,
    scale: 2.8,
    alpha: 0,
    duration: 340,
    ease: 'Cubic.Out',
    onComplete: () => coreFlash.destroy()
  });

  // Cold mist cloud + jagged pale-blue shards bursting outward
  for (let i = 0; i < 14; i += 1) {
    const spreadAngle = Phaser.Math.FloatBetween(-0.85, 0.85) + (facing < 0 ? Math.PI : 0);
    const distance = Phaser.Math.Between(65, 165);
    const isMist = i % 3 === 0;
    const shard = isMist
      ? scene.add.circle(x, y, Phaser.Math.Between(14, 24), 0xbae6fd, 0.42)
      : scene.add
          .rectangle(x, y, Phaser.Math.Between(10, 18), Phaser.Math.Between(4, 8), 0xe0f2fe, 0.92)
          .setAngle(Phaser.Math.RadToDeg(spreadAngle));

    shard.setDepth(SPECIAL_VFX_DEPTH + 2);
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(spreadAngle) * distance,
      y: y + Math.sin(spreadAngle) * distance + Phaser.Math.Between(-16, 16),
      scale: isMist ? 1.8 : 0.2,
      alpha: 0,
      duration: isMist ? 480 : 320,
      ease: 'Cubic.Out',
      onComplete: () => shard.destroy()
    });
  }

  scene.cameras.main.shake(260, 0.014);
  spawnCombatCallout(scene, x, y - 48, 'BODY SHOT!', '#bae6fd');
}

/**
 * Shows a 2-second pale-blue liver-pain indicator above the downed opponent
 * while they clutch their stomach on the mat and remain invulnerable.
 */
export function spawnLiverClutchIndicator(
  scene: Phaser.Scene,
  x: number,
  y: number,
  durationMs = 2000
): void {
  const ring = scene.add
    .circle(x, y, 22, 0x7dd3fc, 0.16)
    .setStrokeStyle(3, 0xbae6fd, 0.75)
    .setDepth(SPECIAL_VFX_DEPTH);

  const label = scene.add
    .text(x, y - 44, 'LIVER CRUSH! 2.0s', {
      color: '#bae6fd',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      fontSize: '14px',
      stroke: '#082f49',
      strokeThickness: 4
    })
    .setOrigin(0.5)
    .setDepth(SPECIAL_VFX_DEPTH + 2);

  scene.tweens.add({
    targets: ring,
    scale: 1.45,
    alpha: 0.28,
    duration: 320,
    yoyo: true,
    repeat: Math.max(1, Math.floor(durationMs / 640))
  });

  scene.tweens.add({
    targets: label,
    alpha: 0,
    delay: Math.max(0, durationMs - 300),
    duration: 280
  });

  scene.time.delayedCall(durationMs, () => {
    ring.destroy();
    label.destroy();
  });
}

/**
 * Spawns dynamic kick slash arcs for Bayasaa's 3-hit G combo and 540° KO finisher.
 */
export function spawnKickComboTrail(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facing: 1 | -1,
  variant: 'front' | 'spinHook' | 'spin360' | 'roundhouse540'
): void {
  const color =
    variant === 'roundhouse540'
      ? 0xfacc15
      : variant === 'spin360'
        ? 0xfb923c
        : variant === 'spinHook'
          ? 0x38bdf8
          : 0xf8fafc;

  const arc = scene.add.graphics().setDepth(SPECIAL_VFX_DEPTH + 1);
  const radius = variant === 'roundhouse540' ? 96 : variant === 'spin360' ? 84 : 68;
  const startDeg = facing > 0 ? -75 : 105;
  const endDeg = facing > 0 ? 55 : 235;

  arc.lineStyle(variant === 'roundhouse540' ? 8 : 6, color, 0.92);
  arc.beginPath();
  arc.arc(x, y, radius, Phaser.Math.DegToRad(startDeg), Phaser.Math.DegToRad(endDeg), false);
  arc.strokePath();

  if (variant === 'spin360' || variant === 'roundhouse540') {
    arc.lineStyle(4, 0xffffff, 0.75);
    arc.strokeCircle(x, y + 8, radius * 0.72);
  }

  scene.tweens.add({
    targets: arc,
    scale: 1.28,
    alpha: 0,
    duration: variant === 'roundhouse540' ? 380 : 240,
    ease: 'Cubic.Out',
    onComplete: () => arc.destroy()
  });
}

export interface TriangleArmGeometry {
  pTopArm: { x: number; y: number };
  pElbowTip: { x: number; y: number };
  pUnderArm: { x: number; y: number };
  headCenter: { x: number; y: number };
}

/**
 * Spawns a glowing flaming triangle ("галтай гурвалжин") wrapping directly
 * around the trapped opponent's head and tracing Bayasaa's locked arm shape.
 * Returns a cleanup callback.
 */
export function spawnFlamingTriangleRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  durationMs = 1420,
  armGeometry?: TriangleArmGeometry
): () => void {
  const headCenter = armGeometry?.headCenter ?? { x, y };
  const p1 = armGeometry
    ? { x: armGeometry.pTopArm.x - headCenter.x, y: armGeometry.pTopArm.y - headCenter.y }
    : { x: 0, y: -46 };
  const p2 = armGeometry
    ? { x: armGeometry.pElbowTip.x - headCenter.x, y: armGeometry.pElbowTip.y - headCenter.y }
    : { x: 40, y: 23 };
  const p3 = armGeometry
    ? { x: armGeometry.pUnderArm.x - headCenter.x, y: armGeometry.pUnderArm.y - headCenter.y }
    : { x: -40, y: 23 };

  const container = scene.add.container(headCenter.x, headCenter.y).setDepth(SPECIAL_VFX_DEPTH + 4);

  // Subtle blazing aura ring framing the trapped head inside Bayasaa's arms
  const headHalo = scene.add.circle(0, 0, 34, 0xf97316, 0.14).setStrokeStyle(3, 0xfb923c, 0.72);
  const outerFireRing = scene.add.circle(0, 0, 52, 0xef4444, 0.08).setStrokeStyle(2.5, 0xfacc15, 0.65);

  // Outer red-orange flame stroke + inner golden core stroke following Bayasaa's arm triangle
  const triangle = scene.add.graphics();
  triangle.lineStyle(11, 0xdc2626, 0.42);
  triangle.beginPath();
  triangle.moveTo(p1.x, p1.y);
  triangle.lineTo(p2.x, p2.y);
  triangle.lineTo(p3.x, p3.y);
  triangle.closePath();
  triangle.strokePath();

  triangle.lineStyle(6, 0xf97316, 0.96);
  triangle.beginPath();
  triangle.moveTo(p1.x, p1.y);
  triangle.lineTo(p2.x, p2.y);
  triangle.lineTo(p3.x, p3.y);
  triangle.closePath();
  triangle.strokePath();

  triangle.lineStyle(2.5, 0xfef08a, 0.98);
  triangle.beginPath();
  triangle.moveTo(p1.x, p1.y);
  triangle.lineTo(p2.x, p2.y);
  triangle.lineTo(p3.x, p3.y);
  triangle.closePath();
  triangle.strokePath();

  container.add([outerFireRing, headHalo, triangle]);

  const edges: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [p1, p2],
    [p2, p3],
    [p3, p1]
  ];

  // Continuous flame tongues & embers igniting along the 3 edges of Bayasaa's arm triangle around the head
  const flameTimer = scene.time.addEvent({
    delay: 60,
    repeat: Math.ceil(durationMs / 60),
    callback: () => {
      if (!container.scene) {
        return;
      }

      for (let k = 0; k < 2; k += 1) {
        const [a, b] = edges[Phaser.Math.Between(0, 2)];
        const t = Math.random();
        const wx = headCenter.x + Phaser.Math.Linear(a.x, b.x, t) + Phaser.Math.Between(-5, 5);
        const wy = headCenter.y + Phaser.Math.Linear(a.y, b.y, t) + Phaser.Math.Between(-5, 5);
        const ember = scene.add
          .circle(
            wx,
            wy,
            Phaser.Math.Between(5, 10),
            k === 0 ? (Math.random() < 0.5 ? 0xf97316 : 0xef4444) : 0xfef08a,
            0.92
          )
          .setDepth(SPECIAL_VFX_DEPTH + 5);

        scene.tweens.add({
          targets: ember,
          y: ember.y - Phaser.Math.Between(18, 42),
          x: ember.x + Phaser.Math.Between(-10, 10),
          scale: 0.18,
          alpha: 0,
          duration: Phaser.Math.Between(220, 340),
          ease: 'Quad.Out',
          onComplete: () => ember.destroy()
        });
      }
    }
  });

  scene.tweens.add({
    targets: [triangle, headHalo],
    scale: 1.07,
    duration: 150,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut'
  });

  scene.tweens.add({
    targets: outerFireRing,
    scale: 1.14,
    alpha: 0.35,
    duration: 210,
    yoyo: true,
    repeat: -1
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    flameTimer.remove(false);
    scene.tweens.killTweensOf(triangle);
    scene.tweens.killTweensOf(headHalo);
    scene.tweens.killTweensOf(outerFireRing);
    container.destroy(true);
  };

  scene.time.delayedCall(durationMs, cleanup);
  return cleanup;
}

/**
 * Visual tap burst + "TAP! (1/2)" / "TAP! (2/2)" when the trapped opponent
 * taps Bayasaa's arm twice during the Triangle Choke.
 */
export function spawnTapOutImpact(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tapNumber: 1 | 2
): void {
  const ring = scene.add
    .circle(x, y, 18, 0xfef08a, 0.35)
    .setStrokeStyle(4, 0xf97316, 0.95)
    .setDepth(SPECIAL_VFX_DEPTH + 5);

  scene.tweens.add({
    targets: ring,
    scale: 2.4,
    alpha: 0,
    duration: 240,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });

  scene.cameras.main.shake(120, 0.008);
  spawnCombatCallout(scene, x, y - 34 - tapNumber * 12, `TAP! (${tapNumber}/2)`, '#fef08a');
}

/**
 * Blazing crimson-gold Muay Thai trail when launching Flying Tiger Knee (L).
 */
export function spawnTigerKneeTrail(scene: Phaser.Scene, x: number, y: number, facing: 1 | -1): void {
  spawnCombatCallout(scene, x, y - 92, 'TIGER KNEE!', '#fb7185');
  for (let i = 0; i < 6; i += 1) {
    const flame = scene.add
      .circle(
        x - facing * (12 + i * 16),
        y + Phaser.Math.Between(-24, 18),
        Phaser.Math.Between(12, 20),
        i % 2 === 0 ? 0xf97316 : 0xf43f5e,
        0.72
      )
      .setDepth(SPECIAL_VFX_DEPTH + 1);

    scene.tweens.add({
      targets: flame,
      x: flame.x - facing * 42,
      y: flame.y - 18,
      scale: 0.2,
      alpha: 0,
      delay: i * 35,
      duration: 280,
      ease: 'Cubic.Out',
      onComplete: () => flame.destroy()
    });
  }
}

/**
 * Explosive golden-crimson shockwave when Muay Thai's Tiger Knee connects.
 */
export function spawnTigerKneeImpact(scene: Phaser.Scene, x: number, y: number, facing: 1 | -1): void {
  const ring = scene.add
    .circle(x, y, 28, 0xf43f5e, 0.42)
    .setStrokeStyle(6, 0xfacc15, 0.95)
    .setDepth(SPECIAL_VFX_DEPTH + 2);

  scene.tweens.add({
    targets: ring,
    scale: 2.9,
    alpha: 0,
    duration: 320,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });

  for (let i = 0; i < 10; i += 1) {
    const angle = Phaser.Math.FloatBetween(-0.9, 0.9) + (facing < 0 ? Math.PI : 0);
    const spark = scene.add
      .rectangle(x, y, 18, 5, i % 2 === 0 ? 0xfacc15 : 0xf43f5e, 0.95)
      .setAngle(Phaser.Math.RadToDeg(angle))
      .setDepth(SPECIAL_VFX_DEPTH + 3);
    const dist = Phaser.Math.Between(65, 160);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scaleX: 0.3,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy()
    });
  }

  scene.cameras.main.shake(240, 0.013);
}

/**
 * Swirling cyan-emerald 720° cyclone vortex for Taekwondo's Tornado Kick (L).
 */
export function spawnTornadoKickVortex(scene: Phaser.Scene, x: number, y: number, durationMs = 520): void {
  spawnCombatCallout(scene, x, y - 96, '720° TORNADO!', '#2dd4bf');

  for (let ringIdx = 0; ringIdx < 3; ringIdx += 1) {
    const ring = scene.add
      .ellipse(x, y - ringIdx * 24, 92 - ringIdx * 14, 28, 0x2dd4bf, 0.16)
      .setStrokeStyle(4, ringIdx % 2 === 0 ? 0x5eead4 : 0x38bdf8, 0.9)
      .setDepth(SPECIAL_VFX_DEPTH + 2);

    scene.tweens.add({
      targets: ring,
      scaleX: 1.55,
      scaleY: 1.25,
      y: ring.y - 38,
      alpha: 0,
      delay: ringIdx * 80,
      duration: Math.max(240, durationMs - 80),
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy()
    });
  }
}

/**
 * Crisp wind-cyclone burst when Taekwondo's Tornado Kick connects.
 */
export function spawnTornadoImpact(scene: Phaser.Scene, x: number, y: number): void {
  const burst = scene.add
    .circle(x, y, 26, 0x2dd4bf, 0.45)
    .setStrokeStyle(5, 0xecfeff, 0.95)
    .setDepth(SPECIAL_VFX_DEPTH + 3);

  scene.tweens.add({
    targets: burst,
    scale: 2.8,
    alpha: 0,
    duration: 280,
    ease: 'Cubic.Out',
    onComplete: () => burst.destroy()
  });

  scene.cameras.main.shake(220, 0.012);
}

/**
 * Golden Mongolian Eagle or national grappler aura when charging in for Slam Ultimate (L).
 */
export function spawnEagleSlamAura(
  scene: Phaser.Scene,
  x: number,
  y: number,
  callout = 'EAGLE SLAM!',
  primaryColor = 0xfacc15,
  secondaryColor = 0xfef08a
): void {
  const hex = `#${primaryColor.toString(16).padStart(6, '0')}`;
  spawnCombatCallout(scene, x, y - 96, callout, hex);
  [-1, 1].forEach((side) => {
    const wing = scene.add
      .ellipse(x + side * 44, y - 24, 62, 22, primaryColor, 0.25)
      .setStrokeStyle(3, secondaryColor, 0.9)
      .setAngle(side * -24)
      .setDepth(SPECIAL_VFX_DEPTH + 1);

    scene.tweens.add({
      targets: wing,
      x: wing.x + side * 36,
      y: wing.y - 26,
      scale: 1.35,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.Out',
      onComplete: () => wing.destroy()
    });
  });
}

/**
 * Massive earth-shattering shockwave when a grappler Ultimate slams the opponent.
 */
export function spawnEagleSlamImpact(
  scene: Phaser.Scene,
  x: number,
  groundY: number,
  callout = 'EAGLE SLAM!',
  primaryColor = 0xfacc15,
  secondaryColor = 0xfef08a
): void {
  const hex = `#${primaryColor.toString(16).padStart(6, '0')}`;
  const groundWave = scene.add
    .ellipse(x, groundY - 6, 70, 22, primaryColor, 0.42)
    .setStrokeStyle(5, secondaryColor, 0.95)
    .setDepth(SPECIAL_VFX_DEPTH + 3);

  scene.tweens.add({
    targets: groundWave,
    scaleX: 3.4,
    scaleY: 2.2,
    alpha: 0,
    duration: 380,
    ease: 'Cubic.Out',
    onComplete: () => groundWave.destroy()
  });

  for (let i = 0; i < 10; i += 1) {
    const dir = i % 2 === 0 ? -1 : 1;
    const dust = scene.add
      .circle(x + dir * Phaser.Math.Between(12, 36), groundY - 12, Phaser.Math.Between(10, 18), secondaryColor, 0.65)
      .setDepth(SPECIAL_VFX_DEPTH + 2);
    scene.tweens.add({
      targets: dust,
      x: dust.x + dir * Phaser.Math.Between(55, 130),
      y: dust.y - Phaser.Math.Between(18, 52),
      scale: 0.3,
      alpha: 0,
      duration: 360,
      ease: 'Quad.Out',
      onComplete: () => dust.destroy()
    });
  }

  scene.cameras.main.shake(300, 0.018);
  spawnCombatCallout(scene, x, groundY - 140, callout, hex);
}

/**
 * Country-colored elemental spirit or weapon slash trail when launching an L Ultimate.
 */
export function spawnSpiritUltimateTrail(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facing: 1 | -1,
  primaryColor: number,
  secondaryColor: number,
  callout: string,
  isWeapon = false
): void {
  const hex = `#${primaryColor.toString(16).padStart(6, '0')}`;
  spawnCombatCallout(scene, x, y - 96, callout, hex);

  if (isWeapon) {
    const arc = scene.add.graphics().setDepth(SPECIAL_VFX_DEPTH + 2);
    const startDeg = facing > 0 ? -85 : 95;
    const endDeg = facing > 0 ? 60 : 240;
    arc.lineStyle(10, primaryColor, 0.92);
    arc.beginPath();
    arc.arc(x + facing * 26, y - 8, 92, Phaser.Math.DegToRad(startDeg), Phaser.Math.DegToRad(endDeg), false);
    arc.strokePath();
    arc.lineStyle(4, secondaryColor, 0.95);
    arc.beginPath();
    arc.arc(x + facing * 26, y - 8, 78, Phaser.Math.DegToRad(startDeg), Phaser.Math.DegToRad(endDeg), false);
    arc.strokePath();

    scene.tweens.add({
      targets: arc,
      scale: 1.25,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.Out',
      onComplete: () => arc.destroy()
    });
    return;
  }

  for (let i = 0; i < 6; i += 1) {
    const orb = scene.add
      .circle(
        x - facing * (10 + i * 16),
        y + Phaser.Math.Between(-24, 18),
        Phaser.Math.Between(10, 18),
        i % 2 === 0 ? primaryColor : secondaryColor,
        0.74
      )
      .setDepth(SPECIAL_VFX_DEPTH + 1);

    scene.tweens.add({
      targets: orb,
      x: orb.x - facing * 40,
      y: orb.y - 16,
      scale: 0.2,
      alpha: 0,
      delay: i * 32,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => orb.destroy()
    });
  }
}

/**
 * Explosive country-aura burst when a world martial art Ultimate connects.
 */
export function spawnSpiritUltimateImpact(
  scene: Phaser.Scene,
  x: number,
  y: number,
  primaryColor: number,
  secondaryColor: number,
  callout?: string
): void {
  const ring = scene.add
    .circle(x, y, 28, primaryColor, 0.45)
    .setStrokeStyle(5, secondaryColor, 0.95)
    .setDepth(SPECIAL_VFX_DEPTH + 2);

  scene.tweens.add({
    targets: ring,
    scale: 2.9,
    alpha: 0,
    duration: 310,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });

  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI * 2 * i) / 10;
    const spark = scene.add
      .rectangle(x, y, 16, 5, i % 2 === 0 ? primaryColor : secondaryColor, 0.95)
      .setAngle(Phaser.Math.RadToDeg(angle))
      .setDepth(SPECIAL_VFX_DEPTH + 3);
    const dist = Phaser.Math.Between(55, 145);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scaleX: 0.3,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy()
    });
  }

  scene.cameras.main.shake(220, 0.013);
  if (callout) {
    const hex = `#${primaryColor.toString(16).padStart(6, '0')}`;
    spawnCombatCallout(scene, x, y - 48, callout, hex);
  }
}
