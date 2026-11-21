import type * as Phaser from 'phaser';

export const MMA_OCTAGON_STAGE_KEY = 'mma-octagon-stage';
export const MMA_OCTAGON_STAGE_WIDTH = 1920;
export const MMA_OCTAGON_STAGE_HEIGHT = 768;

/**
 * Generates the indoor Mixed Martial Arts Octagon Ring stage texture:
 * stadium crowd & rigging, overhead arena spotlights, chain-link octagon cage,
 * red/blue corner pads, and padded canvas mat aligned to the match ground axis.
 */
export function generateMmaOctagonStage(scene: Phaser.Scene): void {
  if (scene.textures.exists(MMA_OCTAGON_STAGE_KEY)) {
    return;
  }

  const width = MMA_OCTAGON_STAGE_WIDTH;
  const height = MMA_OCTAGON_STAGE_HEIGHT;
  const matTopY = 532;
  const groundY = 608;
  const graphics = scene.add.graphics();

  drawArenaBackdrop(graphics, width, height, matTopY);
  drawStadiumCrowd(graphics, width, matTopY);
  drawOverheadRiggingAndLights(graphics, width, height, groundY);
  drawOctagonCage(graphics, width, matTopY, groundY);
  drawOctagonMat(graphics, width, height, matTopY, groundY);

  graphics.generateTexture(MMA_OCTAGON_STAGE_KEY, width, height);
  graphics.destroy();
}

function drawArenaBackdrop(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  matTopY: number
): void {
  const steps = 32;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const y = Math.floor(t * matTopY);
    const h = Math.ceil(matTopY / steps) + 2;
    const color =
      t < 0.25
        ? 0x040710
        : t < 0.5
          ? 0x091021
          : t < 0.75
            ? 0x101c38
            : 0x182647;
    graphics.fillStyle(color, 1);
    graphics.fillRect(0, y, width, h);
  }

  // Deep atmospheric horizon haze behind the stadium upper bowl
  graphics.fillStyle(0x38bdf8, 0.05);
  graphics.fillEllipse(width / 2, 230, 1450, 260);
  graphics.fillStyle(0xf43f5e, 0.04);
  graphics.fillEllipse(width * 0.2, 260, 700, 220);
  graphics.fillStyle(0x3b82f6, 0.04);
  graphics.fillEllipse(width * 0.8, 260, 700, 220);

  graphics.fillStyle(0x070a13, 1);
  graphics.fillRect(0, matTopY, width, height - matTopY);

  // Illuminated arena LED ribbon & sponsor banners in the background
  const bannerColors = [0x1e293b, 0x991b1b, 0x1d4ed8, 0x0f172a];
  for (let i = 0; i < 6; i += 1) {
    const bx = 55 + i * 310;
    graphics.fillStyle(bannerColors[i % bannerColors.length], 0.65);
    graphics.fillRoundedRect(bx, 182, 260, 56, 6);
    graphics.lineStyle(2, i % 2 === 0 ? 0xfacc15 : 0x38bdf8, 0.45);
    graphics.strokeRoundedRect(bx, 182, 260, 56, 6);
    graphics.fillStyle(0xf8fafc, 0.09);
    graphics.fillRect(bx + 12, 194, 236, 8);
  }
}

function drawStadiumCrowd(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  matTopY: number
): void {
  const rows = [
    { y: 266, step: 32, radius: 13, color: 0x0f172a, alpha: 0.92 },
    { y: 312, step: 29, radius: 14, color: 0x17233b, alpha: 0.96 },
    { y: 362, step: 27, radius: 15, color: 0x1e293b, alpha: 0.98 },
    { y: 416, step: 25, radius: 16, color: 0x0c1322, alpha: 1 }
  ];

  rows.forEach((row, rowIndex) => {
    for (let x = (rowIndex % 2) * 14; x < width + 30; x += row.step) {
      const bob = ((x * 13 + rowIndex * 7) % 9) - 4;
      graphics.fillStyle(row.color, row.alpha);
      graphics.fillCircle(x, row.y + bob, row.radius * 0.66);
      graphics.fillRoundedRect(x - row.radius, row.y + bob + 6, row.radius * 2, 48, 8);

      // Subtle rim light from arena spotlights on shoulders
      if ((x + rowIndex) % 3 === 0) {
        graphics.fillStyle(x < width / 2 ? 0xf43f5e : 0x38bdf8, 0.14);
        graphics.fillCircle(x, row.y + bob - 4, row.radius * 0.48);
      }
    }
  });

  // Glowing phone screens & camera flashes in the crowd
  const flashSpots = [
    [160, 290],
    [320, 380],
    [430, 340],
    [710, 280],
    [1190, 310],
    [1490, 350],
    [1640, 395],
    [1760, 295]
  ];
  flashSpots.forEach(([fx, fy]) => {
    graphics.fillStyle(0xf8fafc, 0.24);
    graphics.fillCircle(fx, fy, 18);
    graphics.fillStyle(0xffffff, 0.85);
    graphics.fillCircle(fx, fy, 4.5);
  });

  // Illuminated LED ringside barrier behind the cage
  graphics.fillStyle(0x060a13, 0.95);
  graphics.fillRect(0, matTopY - 82, width, 86);
  graphics.fillStyle(0x38bdf8, 0.25);
  graphics.fillRect(0, matTopY - 82, width / 2, 3);
  graphics.fillStyle(0xf43f5e, 0.25);
  graphics.fillRect(width / 2, matTopY - 82, width / 2, 3);
}

function drawOverheadRiggingAndLights(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  groundY: number
): void {
  // Overhead steel lighting truss.
  graphics.fillStyle(0x090f1d, 0.98);
  graphics.fillRect(0, 0, width, 46);
  graphics.lineStyle(3, 0x334155, 0.9);
  graphics.lineBetween(0, 46, width, 46);
  for (let x = 0; x < width; x += 64) {
    graphics.lineBetween(x, 0, x + 32, 46);
    graphics.lineBetween(x + 32, 46, x + 64, 0);
  }

  // Center arena Jumbotron / World Championship scoreboard frame.
  const cx = width / 2;
  graphics.fillStyle(0x0b1222, 0.97);
  graphics.fillRoundedRect(cx - 240, 48, 480, 82, 10);
  graphics.lineStyle(3, 0xfacc15, 0.85);
  graphics.strokeRoundedRect(cx - 240, 48, 480, 82, 10);
  graphics.lineStyle(1.5, 0x38bdf8, 0.4);
  graphics.strokeRoundedRect(cx - 232, 54, 464, 70, 7);

  graphics.fillStyle(0xef4444, 0.9);
  graphics.fillRoundedRect(cx - 210, 64, 155, 12, 4);
  graphics.fillStyle(0x3b82f6, 0.9);
  graphics.fillRoundedRect(cx + 55, 64, 155, 12, 4);
  graphics.fillStyle(0xfacc15, 0.95);
  graphics.fillRoundedRect(cx - 105, 92, 210, 14, 5);
  graphics.fillStyle(0xf8fafc, 0.22);
  graphics.fillRect(cx - 42, 62, 84, 16);

  // Spotlights and multi-layered volumetric light cones onto the octagon.
  const lights = [
    { x: cx - 480, targetX: cx - 230, color: 0xf43f5e, alpha: 0.065 },
    { x: cx - 200, targetX: cx - 45, color: 0xf8fafc, alpha: 0.085 },
    { x: cx + 200, targetX: cx + 45, color: 0xf8fafc, alpha: 0.085 },
    { x: cx + 480, targetX: cx + 230, color: 0x38bdf8, alpha: 0.065 }
  ];

  lights.forEach((light) => {
    graphics.fillStyle(0xfef9c3, 0.35);
    graphics.fillCircle(light.x, 48, 22);
    graphics.fillStyle(0xffffff, 0.98);
    graphics.fillCircle(light.x, 48, 9);
    graphics.fillStyle(light.color, light.alpha);
    graphics.fillTriangle(light.x, 52, light.targetX - 270, groundY + 48, light.targetX + 270, height);
    graphics.fillStyle(light.color, light.alpha * 0.55);
    graphics.fillTriangle(light.x, 52, light.targetX - 135, groundY + 36, light.targetX + 135, height);
  });
}

function drawOctagonCage(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  matTopY: number,
  groundY: number
): void {
  const cageLeft = 170;
  const cageRight = width - 170;
  const innerLeft = 450;
  const innerRight = width - 450;
  const backFenceTopY = 278;
  const sideFenceTopY = 236;
  const backWallY = matTopY;
  const frontPostBottomY = groundY - 22;

  // Back wall and angled side panels of the octagon chain-link fence.
  drawFencePanel(graphics, cageLeft, sideFenceTopY, innerLeft, backFenceTopY, frontPostBottomY, backWallY);
  drawFencePanel(graphics, innerLeft, backFenceTopY, innerRight, backFenceTopY, backWallY, backWallY);
  drawFencePanel(graphics, innerRight, backFenceTopY, cageRight, sideFenceTopY, backWallY, frontPostBottomY);

  // Padded corner posts (Red corner left, Blue corner right).
  drawCornerPost(graphics, cageLeft, sideFenceTopY - 8, frontPostBottomY, 0xef4444, 32);
  drawCornerPost(graphics, innerLeft, backFenceTopY - 8, backWallY + 4, 0xdc2626, 28);
  drawCornerPost(graphics, innerRight, backFenceTopY - 8, backWallY + 4, 0x2563eb, 28);
  drawCornerPost(graphics, cageRight, sideFenceTopY - 8, frontPostBottomY, 0x3b82f6, 32);

  // Heavy black padded top rail and metallic rim highlight around the cage.
  graphics.lineStyle(18, 0x070b14, 1);
  graphics.lineBetween(cageLeft, sideFenceTopY, innerLeft, backFenceTopY);
  graphics.lineBetween(innerLeft, backFenceTopY, innerRight, backFenceTopY);
  graphics.lineBetween(innerRight, backFenceTopY, cageRight, sideFenceTopY);

  graphics.lineStyle(3, 0x64748b, 0.9);
  graphics.lineBetween(cageLeft, sideFenceTopY - 5, innerLeft, backFenceTopY - 5);
  graphics.lineBetween(innerLeft, backFenceTopY - 5, innerRight, backFenceTopY - 5);
  graphics.lineBetween(innerRight, backFenceTopY - 5, cageRight, sideFenceTopY - 5);

  // Illuminated gold championship pad along the center top rail.
  graphics.fillStyle(0xfacc15, 0.92);
  graphics.fillRoundedRect(width / 2 - 150, backFenceTopY - 8, 300, 14, 4);
  graphics.fillStyle(0xffffff, 0.35);
  graphics.fillRect(width / 2 - 130, backFenceTopY - 6, 260, 3);
}

function drawFencePanel(
  graphics: Phaser.GameObjects.Graphics,
  x1: number,
  topY1: number,
  x2: number,
  topY2: number,
  botY1: number,
  botY2: number
): void {
  graphics.fillStyle(0x020617, 0.3);
  graphics.beginPath();
  graphics.moveTo(x1, topY1);
  graphics.lineTo(x2, topY2);
  graphics.lineTo(x2, botY2);
  graphics.lineTo(x1, botY1);
  graphics.closePath();
  graphics.fillPath();

  const step = 20;
  const span = x2 - x1;
  graphics.lineStyle(1.5, 0x94a3b8, 0.36);

  const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  for (let offset = -span; offset <= span * 2; offset += step) {
    const startX = clamp(x1 + offset, x1, x2);
    const endX = clamp(x1 + offset + 150, x1, x2);
    if (endX <= startX) {
      continue;
    }

    const tStart = (startX - x1) / span;
    const tEnd = (endX - x1) / span;
    const yTopStart = lerp(topY1, topY2, tStart);
    const yBotEnd = lerp(botY1, botY2, tEnd);
    graphics.lineBetween(startX, yTopStart, endX, yBotEnd);

    const yBotStart = lerp(botY1, botY2, tStart);
    const yTopEnd = lerp(topY1, topY2, tEnd);
    graphics.lineBetween(startX, yBotStart, endX, yTopEnd);
  }
}

function drawCornerPost(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  topY: number,
  bottomY: number,
  padColor: number,
  width: number
): void {
  const height = bottomY - topY;
  graphics.fillStyle(0x090d16, 1);
  graphics.fillRoundedRect(x - width / 2, topY, width, height, 6);
  graphics.fillStyle(padColor, 0.95);
  graphics.fillRoundedRect(x - width / 2 + 3, topY + 12, width - 6, height - 24, 4);
  graphics.fillStyle(0xffffff, 0.25);
  graphics.fillRect(x - width / 2 + 5, topY + 16, 5, height - 32);
  graphics.lineStyle(2, 0xf8fafc, 0.28);
  graphics.strokeRoundedRect(x - width / 2 + 3, topY + 12, width - 6, height - 24, 4);
}

function drawOctagonMat(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  matTopY: number,
  groundY: number
): void {
  const cx = width / 2;
  const apronTopY = groundY + 78;

  // Main padded canvas mat trapezoid.
  graphics.fillStyle(0x232c3d, 1);
  graphics.beginPath();
  graphics.moveTo(150, matTopY);
  graphics.lineTo(width - 150, matTopY);
  graphics.lineTo(width, apronTopY);
  graphics.lineTo(0, apronTopY);
  graphics.closePath();
  graphics.fillPath();

  // Inner combat mat area + specular overhead spotlight reflection pool.
  graphics.fillStyle(0x334155, 0.5);
  graphics.beginPath();
  graphics.moveTo(260, matTopY + 14);
  graphics.lineTo(width - 260, matTopY + 14);
  graphics.lineTo(width - 90, apronTopY - 14);
  graphics.lineTo(90, apronTopY - 14);
  graphics.closePath();
  graphics.fillPath();

  graphics.fillStyle(0xf8fafc, 0.055);
  graphics.fillEllipse(cx, groundY + 4, 720, 128);

  // Mat canvas seam lines.
  graphics.lineStyle(2, 0x1e293b, 0.78);
  for (let gx = 200; gx < width; gx += 180) {
    graphics.lineBetween(gx, matTopY, gx + (gx - cx) * 0.18, apronTopY);
  }
  graphics.lineBetween(110, groundY, width - 110, groundY);

  // Center octagon championship emblem & ringside boundary rings.
  graphics.lineStyle(5, 0xfacc15, 0.65);
  graphics.strokeEllipse(cx, groundY + 8, 440, 86);
  graphics.lineStyle(3, 0xef4444, 0.65);
  graphics.strokeEllipse(cx, groundY + 8, 316, 62);
  graphics.lineStyle(3, 0x3b82f6, 0.65);
  graphics.strokeEllipse(cx, groundY + 8, 176, 36);

  // Red & Blue corner starting lines on the mat.
  graphics.lineStyle(6, 0xef4444, 0.85);
  graphics.lineBetween(cx - 430, groundY - 18, cx - 390, groundY + 28);
  graphics.lineStyle(6, 0x3b82f6, 0.85);
  graphics.lineBetween(cx + 430, groundY - 18, cx + 390, groundY + 28);

  // Ringside padded apron skirt below the mat edge.
  graphics.fillStyle(0x0b101d, 1);
  graphics.fillRect(0, apronTopY, width, height - apronTopY);
  graphics.fillStyle(0xfacc15, 0.9);
  graphics.fillRect(0, apronTopY, width, 6);
  graphics.fillStyle(0x1e293b, 0.95);
  graphics.fillRoundedRect(cx - 270, apronTopY + 18, 540, 44, 6);
  graphics.lineStyle(2, 0x64748b, 0.85);
  graphics.strokeRoundedRect(cx - 270, apronTopY + 18, 540, 44, 6);
}
