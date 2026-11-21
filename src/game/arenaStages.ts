import type * as Phaser from 'phaser';

export const MONGOL_STEPPE_STAGE_KEY = 'mongol-steppe-stage';
export const TOKYO_DOJO_STAGE_KEY = 'tokyo-dojo-stage';
export const CYBER_COLOSSEUM_STAGE_KEY = 'cyber-colosseum-stage';

export const ARENA_STAGE_WIDTH = 1920;
export const ARENA_STAGE_HEIGHT = 768;

/**
 * Generates all additional championship fighting stage textures aligned cleanly
 * with the match ground plane (`GROUND_FRACTION = 0.82`).
 */
export function generateAdditionalArenaStages(scene: Phaser.Scene): void {
  generateMongolSteppeStage(scene);
  generateTokyoDojoStage(scene);
  generateCyberColosseumStage(scene);
}

/**
 * 1. Mongolian Naadam Steppe Arena:
 * Clear steppe sky, snow-capped Altai ridges, white Gers, Nine White Banners,
 * sunlit meadow, and a ceremonial Naadam wrestling ring.
 */
function generateMongolSteppeStage(scene: Phaser.Scene): void {
  if (scene.textures.exists(MONGOL_STEPPE_STAGE_KEY)) {
    return;
  }

  const width = ARENA_STAGE_WIDTH;
  const height = ARENA_STAGE_HEIGHT;
  const horizonY = 472;
  const matTopY = 532;
  const groundY = 608;
  const g = scene.add.graphics();

  // Sky gradient
  const skyBands = 28;
  for (let i = 0; i < skyBands; i += 1) {
    const t = i / skyBands;
    const y = Math.floor(t * horizonY);
    const h = Math.ceil(horizonY / skyBands) + 2;
    const color =
      t < 0.25 ? 0x0c4a6e : t < 0.55 ? 0x0284c7 : t < 0.8 ? 0x38bdf8 : 0xbae6fd;
    g.fillStyle(color, 1);
    g.fillRect(0, y, width, h);
  }

  // Radiant steppe sun + warm halo
  g.fillStyle(0xfef08a, 0.2);
  g.fillCircle(width * 0.72, 145, 118);
  g.fillStyle(0xfef9c3, 0.42);
  g.fillCircle(width * 0.72, 145, 74);
  g.fillStyle(0xffffff, 0.96);
  g.fillCircle(width * 0.72, 145, 44);

  // Sculpted steppe clouds
  const clouds = [
    [220, 110, 210, 38],
    [520, 82, 260, 44],
    [980, 125, 290, 42],
    [1520, 95, 230, 36]
  ];
  clouds.forEach(([cx, cy, cw, ch]) => {
    g.fillStyle(0xf8fafc, 0.88);
    g.fillRoundedRect(cx, cy, cw, ch, 18);
    g.fillCircle(cx + cw * 0.3, cy, ch * 0.65);
    g.fillCircle(cx + cw * 0.62, cy - 4, ch * 0.78);
  });

  // Far Altai mountain range with snow peaks
  g.fillStyle(0x334155, 0.88);
  const farPeaks = [0, 180, 360, 560, 760, 960, 1180, 1400, 1620, 1820, 1920];
  g.beginPath();
  g.moveTo(0, horizonY);
  farPeaks.forEach((px, idx) => {
    const py = idx % 2 === 0 ? horizonY - 120 : horizonY - 215 - ((idx * 17) % 45);
    g.lineTo(px, py);
  });
  g.lineTo(width, horizonY);
  g.closePath();
  g.fillPath();

  // Snow caps on tall peaks
  g.fillStyle(0xf1f5f9, 0.92);
  for (let idx = 1; idx < farPeaks.length - 1; idx += 2) {
    const px = farPeaks[idx];
    const py = horizonY - 215 - ((idx * 17) % 45);
    g.fillTriangle(px, py, px - 46, py + 58, px + 46, py + 58);
  }

  // Rolling emerald steppe hills
  g.fillStyle(0x15803d, 1);
  g.fillEllipse(420, horizonY + 18, 980, 120);
  g.fillEllipse(1420, horizonY + 16, 1080, 130);
  g.fillStyle(0x16a34a, 1);
  g.fillRect(0, horizonY, width, matTopY - horizonY);

  // Traditional Mongolian White Gers in background
  const gerPositions = [210, 390, 1520, 1710];
  gerPositions.forEach((gx, idx) => {
    const gy = horizonY + 14 + (idx % 2) * 8;
    // White felt wall
    g.fillStyle(0xf8fafc, 1);
    g.fillRect(gx - 48, gy - 32, 96, 32);
    // Blue/gold decorative Khana band
    g.fillStyle(idx % 2 === 0 ? 0x0284c7 : 0xdc2626, 0.9);
    g.fillRect(gx - 48, gy - 20, 96, 5);
    // Conical roof + Toono
    g.fillStyle(0xe2e8f0, 1);
    g.fillTriangle(gx - 54, gy - 32, gx + 54, gy - 32, gx, gy - 62);
    g.fillStyle(0xd97706, 1);
    g.fillRect(gx - 12, gy - 28, 24, 28);
    g.fillStyle(0xfacc15, 0.95);
    g.fillCircle(gx, gy - 62, 5);
  });

  // Nine White Spirit Banners (Есөн хөлт цагаан туг) behind center arena
  const bannerBaseY = matTopY - 8;
  for (let b = -4; b <= 4; b += 1) {
    const bx = width / 2 + b * 68;
    const poleH = b === 0 ? 132 : 104;
    g.lineStyle(4, 0x78350f, 1);
    g.lineBetween(bx, bannerBaseY, bx, bannerBaseY - poleH);
    // Flowing white horsehair tuft + gold trident top
    g.fillStyle(0xf8fafc, 0.95);
    g.fillTriangle(bx - 12, bannerBaseY - poleH + 14, bx + 12, bannerBaseY - poleH + 14, bx, bannerBaseY - poleH + 46);
    g.fillStyle(0xfacc15, 1);
    g.fillCircle(bx, bannerBaseY - poleH, b === 0 ? 8 : 5);
  }

  // Ceremonial wooden Naadam arena railing
  g.lineStyle(5, 0x78350f, 1);
  g.lineBetween(0, matTopY - 26, width, matTopY - 26);
  for (let px = 60; px < width; px += 120) {
    g.fillStyle(0x92400e, 1);
    g.fillRect(px - 6, matTopY - 38, 12, 42);
    g.fillStyle(0xfacc15, 0.9);
    g.fillCircle(px, matTopY - 40, 6);
  }

  // Sunlit grass border & packed golden Naadam wrestling ring floor
  g.fillStyle(0x166534, 1);
  g.fillRect(0, matTopY, width, height - matTopY);

  g.fillStyle(0xb45309, 0.35);
  g.fillEllipse(width / 2, groundY + 18, 1580, 190);
  g.fillStyle(0xd97706, 0.42);
  g.fillEllipse(width / 2, groundY + 18, 1340, 150);

  // Center golden Soyombo / Naadam championship circle
  g.lineStyle(5, 0xfacc15, 0.72);
  g.strokeEllipse(width / 2, groundY + 14, 460, 90);
  g.lineStyle(3, 0x0284c7, 0.75);
  g.strokeEllipse(width / 2, groundY + 14, 320, 62);
  g.fillStyle(0xfacc15, 0.2);
  g.fillEllipse(width / 2, groundY + 14, 160, 32);

  // Foreground grass edge shadow
  g.fillStyle(0x052e16, 0.92);
  g.fillRect(0, groundY + 96, width, height - (groundY + 96));
  g.fillStyle(0xfacc15, 0.65);
  g.fillRect(0, groundY + 94, width, 4);

  g.generateTexture(MONGOL_STEPPE_STAGE_KEY, width, height);
  g.destroy();
}

/**
 * 2. Midnight Samurai Dojo:
 * Cedar beams, backlit Shoji screens, moonlight Sakura trees, calligraphy scroll,
 * hanging Chochin lanterns, and glossy hardwood sparring floor.
 */
function generateTokyoDojoStage(scene: Phaser.Scene): void {
  if (scene.textures.exists(TOKYO_DOJO_STAGE_KEY)) {
    return;
  }

  const width = ARENA_STAGE_WIDTH;
  const height = ARENA_STAGE_HEIGHT;
  const matTopY = 528;
  const groundY = 608;
  const g = scene.add.graphics();

  // Moonlight exterior sky behind courtyard opening
  const skySteps = 22;
  for (let i = 0; i < skySteps; i += 1) {
    const t = i / skySteps;
    const y = Math.floor(t * matTopY);
    const h = Math.ceil(matTopY / skySteps) + 2;
    const color = t < 0.4 ? 0x050816 : t < 0.75 ? 0x0f172a : 0x1e1b4b;
    g.fillStyle(color, 1);
    g.fillRect(0, y, width, h);
  }

  // Full moon behind left courtyard screen
  g.fillStyle(0xe0f2fe, 0.14);
  g.fillCircle(420, 175, 110);
  g.fillStyle(0xf8fafc, 0.92);
  g.fillCircle(420, 175, 48);

  // Sakura tree silhouettes with glowing pink blossoms outside
  g.lineStyle(8, 0x090d16, 0.95);
  g.lineBetween(240, matTopY, 340, 240);
  g.lineBetween(340, 240, 500, 180);
  g.lineBetween(1620, matTopY, 1520, 230);
  g.lineBetween(1520, 230, 1380, 165);
  const blossomClusters = [
    [290, 220],
    [370, 180],
    [470, 195],
    [1420, 175],
    [1510, 205],
    [1580, 245]
  ];
  blossomClusters.forEach(([bx, by]) => {
    g.fillStyle(0xf472b6, 0.48);
    g.fillCircle(bx, by, 54);
    g.fillStyle(0xfbcfe8, 0.35);
    g.fillCircle(bx - 16, by - 10, 32);
  });

  // Backlit Shoji sliding panels (left & right wings)
  const panelXs = [60, 280, 1440, 1660];
  panelXs.forEach((px) => {
    g.fillStyle(0xfef3c7, 0.2);
    g.fillRect(px, 140, 190, matTopY - 140);
    g.fillStyle(0xf59e0b, 0.12);
    g.fillRect(px + 12, 160, 166, matTopY - 170);
    g.lineStyle(3, 0x291709, 0.95);
    g.strokeRect(px, 140, 190, matTopY - 140);
    for (let gy = 190; gy < matTopY; gy += 56) {
      g.lineBetween(px, gy, px + 190, gy);
    }
    for (let gx = px + 48; gx < px + 190; gx += 48) {
      g.lineBetween(gx, 140, gx, matTopY);
    }
  });

  // Central Dojo Timber Wall & Tokonoma Scroll Alcove
  const cx = width / 2;
  g.fillStyle(0x1f1209, 1);
  g.fillRect(cx - 260, 110, 520, matTopY - 110);
  g.fillStyle(0x2c1a0e, 1);
  g.fillRect(cx - 190, 140, 380, matTopY - 150);
  // Calligraphy scroll
  g.fillStyle(0xfef3c7, 0.92);
  g.fillRect(cx - 56, 165, 112, 210);
  g.lineStyle(4, 0x78350f, 1);
  g.strokeRect(cx - 56, 165, 112, 210);
  // Bold crimson dojo seal & brushstroke emblem on scroll
  g.fillStyle(0x111827, 0.9);
  g.fillRect(cx - 8, 195, 16, 108);
  g.fillRect(cx - 28, 224, 56, 14);
  g.fillRect(cx - 22, 266, 44, 12);
  g.fillStyle(0xdc2626, 0.95);
  g.fillRect(cx + 16, 336, 22, 22);

  // Heavy cedar pillars & roof beam
  g.fillStyle(0x180d06, 1);
  g.fillRect(0, 0, width, 92);
  g.lineStyle(4, 0x78350f, 0.85);
  g.lineBetween(0, 92, width, 92);
  [30, 510, 690, 1230, 1410, 1860].forEach((px) => {
    g.fillStyle(0x27150a, 1);
    g.fillRect(px, 88, 34, matTopY - 88);
  });

  // Hanging glowing Cho-chin paper lanterns
  [580, 1340].forEach((lx) => {
    g.lineStyle(2, 0x78350f, 1);
    g.lineBetween(lx, 92, lx, 142);
    g.fillStyle(0xf59e0b, 0.25);
    g.fillCircle(lx, 182, 68);
    g.fillStyle(0xfef08a, 0.92);
    g.fillEllipse(lx, 182, 42, 62);
    g.fillStyle(0x111827, 1);
    g.fillRect(lx - 14, 146, 28, 7);
    g.fillRect(lx - 14, 211, 28, 7);
  });

  // Glossy Hinoki hardwood dojo floor
  g.fillStyle(0x3a2010, 1);
  g.fillRect(0, matTopY, width, height - matTopY);
  g.fillStyle(0x4b2a15, 0.6);
  g.fillRect(0, matTopY + 8, width, 150);

  // Perspective floorboard seams + lantern specular pool
  g.lineStyle(2, 0x1c0f07, 0.85);
  for (let fx = -200; fx < width + 200; fx += 96) {
    g.lineBetween(fx, matTopY, fx + (fx - cx) * 0.28, height);
  }
  for (let fy = matTopY + 34; fy < height; fy += 38) {
    g.lineBetween(0, fy, width, fy);
  }

  g.fillStyle(0xfef08a, 0.08);
  g.fillEllipse(cx, groundY + 12, 820, 110);

  // Dojo sparring circle
  g.lineStyle(4, 0xf8fafc, 0.55);
  g.strokeEllipse(cx, groundY + 12, 440, 86);
  g.lineStyle(2, 0xdc2626, 0.72);
  g.strokeEllipse(cx, groundY + 12, 260, 52);

  // Foreground dark step edge
  g.fillStyle(0x0f0804, 1);
  g.fillRect(0, groundY + 94, width, height - (groundY + 94));
  g.fillStyle(0xd97706, 0.55);
  g.fillRect(0, groundY + 92, width, 4);

  g.generateTexture(TOKYO_DOJO_STAGE_KEY, width, height);
  g.destroy();
}

/**
 * 3. Neon Cyber Colosseum:
 * Futuristic stadium ribs, holographic champion banners, neon cyan/magenta conduits,
 * and reflective hex-grid energy arena floor.
 */
function generateCyberColosseumStage(scene: Phaser.Scene): void {
  if (scene.textures.exists(CYBER_COLOSSEUM_STAGE_KEY)) {
    return;
  }

  const width = ARENA_STAGE_WIDTH;
  const height = ARENA_STAGE_HEIGHT;
  const matTopY = 530;
  const groundY = 608;
  const cx = width / 2;
  const g = scene.add.graphics();

  // Deep obsidian cyber sky gradient
  const steps = 26;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const y = Math.floor(t * matTopY);
    const h = Math.ceil(matTopY / steps) + 2;
    const color = t < 0.35 ? 0x020617 : t < 0.7 ? 0x0b1120 : 0x161b33;
    g.fillStyle(color, 1);
    g.fillRect(0, y, width, h);
  }

  // Horizon cyber glow
  g.fillStyle(0x06b6d4, 0.14);
  g.fillEllipse(cx - 280, matTopY - 40, 900, 220);
  g.fillStyle(0xec4899, 0.14);
  g.fillEllipse(cx + 280, matTopY - 40, 900, 220);

  // Futuristic stadium skyline pillars & glowing neon stripes
  for (let px = 40; px < width; px += 155) {
    const bh = 210 + ((px * 13) % 160);
    const topY = matTopY - bh;
    const leftSide = px < cx;
    const accent = leftSide ? 0x22d3ee : 0xf43f5e;
    g.fillStyle(0x0f172a, 0.96);
    g.fillRect(px, topY, 92, bh);
    g.fillStyle(accent, 0.85);
    g.fillRect(px + 8, topY + 12, 6, bh - 20);
    g.fillRect(px + 78, topY + 12, 6, bh - 20);
    g.fillStyle(accent, 0.18);
    g.fillRect(px + 22, topY + 28, 48, 22);
  }

  // Center holographic championship monolith
  g.fillStyle(0x090d1a, 0.94);
  g.fillRoundedRect(cx - 260, 74, 520, 150, 14);
  g.lineStyle(3, 0x22d3ee, 0.9);
  g.strokeRoundedRect(cx - 260, 74, 520, 150, 14);
  g.lineStyle(2, 0xec4899, 0.75);
  g.strokeRoundedRect(cx - 246, 86, 492, 126, 10);
  g.fillStyle(0x22d3ee, 0.22);
  g.fillRect(cx - 210, 114, 175, 18);
  g.fillStyle(0xec4899, 0.22);
  g.fillRect(cx + 35, 114, 175, 18);
  g.fillStyle(0xfacc15, 0.85);
  g.fillRoundedRect(cx - 110, 158, 220, 16, 6);

  // Ringside neon safety barriers
  g.fillStyle(0x050814, 0.96);
  g.fillRect(0, matTopY - 48, width, 52);
  g.fillStyle(0x22d3ee, 0.85);
  g.fillRect(0, matTopY - 48, width / 2, 4);
  g.fillStyle(0xec4899, 0.85);
  g.fillRect(width / 2, matTopY - 48, width / 2, 4);

  // Metallic reflective cyber combat deck
  g.fillStyle(0x0b1222, 1);
  g.fillRect(0, matTopY, width, height - matTopY);
  g.fillStyle(0x16223b, 0.72);
  g.fillRect(0, matTopY + 6, width, 160);

  // Perspective cyan/magenta grid lines on floor
  g.lineStyle(2, 0x1e3a5f, 0.85);
  for (let gx = -240; gx <= width + 240; gx += 110) {
    g.lineBetween(gx, matTopY, gx + (gx - cx) * 0.34, height);
  }
  for (let gy = matTopY + 26; gy < height; gy += 32) {
    g.lineBetween(0, gy, width, gy);
  }

  // Dual glowing energy rings in arena center
  g.lineStyle(4, 0x22d3ee, 0.88);
  g.strokeEllipse(cx, groundY + 12, 490, 92);
  g.lineStyle(3, 0xec4899, 0.85);
  g.strokeEllipse(cx, groundY + 12, 340, 64);
  g.lineStyle(2, 0xfacc15, 0.85);
  g.strokeEllipse(cx, groundY + 12, 180, 34);

  // Glowing floor apron strip
  g.fillStyle(0x020617, 1);
  g.fillRect(0, groundY + 92, width, height - (groundY + 92));
  g.fillStyle(0x22d3ee, 0.9);
  g.fillRect(0, groundY + 90, width / 2, 5);
  g.fillStyle(0xec4899, 0.9);
  g.fillRect(width / 2, groundY + 90, width / 2, 5);

  g.generateTexture(CYBER_COLOSSEUM_STAGE_KEY, width, height);
  g.destroy();
}
