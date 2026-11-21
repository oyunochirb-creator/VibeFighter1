import * as Phaser from 'phaser';

import { resolveFighterAppearance, type FighterAppearanceProfile } from './fighterAppearance';
import type { BaseArchetypeId, MartialArtDefinition } from './worldMartialArts';
import { WORLD_MARTIAL_ARTS } from './worldMartialArts';

const PORTRAIT_SIZE = 256;

const BASE_TEXTURE_PROTECTED_IDS = new Set([
  'muay-thai',
  'taekwondo',
  'mongol-bokh',
  'red-brawler',
  'jiujitsu-fighter',
  'green-boxer',
  'blue-striker',
  'bayasaa'
]);

interface HslColor {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0.001) {
    const v = Math.round(Phaser.Math.Clamp(l, 0, 1) * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, tRaw: number): number => {
    let t = tRaw;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = ((h % 360) + 360) % 360 / 360;

  return [
    Math.round(hue2rgb(p, q, hk + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hk) * 255),
    Math.round(hue2rgb(p, q, hk - 1 / 3) * 255)
  ];
}

function hexToHsl(color: number): HslColor {
  return rgbToHsl((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
}

function isGreenScreenPixel(r: number, g: number, b: number, a: number): boolean {
  return a > 10 && g > 145 && g > r * 1.45 && g > b * 1.45;
}

function isLikelySkinTone(hsl: HslColor): boolean {
  return hsl.h >= 12 && hsl.h <= 48 && hsl.s >= 0.18 && hsl.s <= 0.85 && hsl.l >= 0.22 && hsl.l <= 0.88;
}

function shouldRecolorAsPrimary(
  archetype: BaseArchetypeId,
  hsl: HslColor
): 'primary' | 'secondary' | null {
  if (hsl.l < 0.16 || hsl.l > 0.93) {
    return null;
  }

  switch (archetype) {
    case 'red-brawler':
      if ((hsl.h <= 14 || hsl.h >= 328) && hsl.s >= 0.36) {
        return 'primary';
      }
      return null;

    case 'blue-striker':
      if (hsl.h >= 190 && hsl.h <= 255 && hsl.s >= 0.28) {
        return 'primary';
      }
      return null;

    case 'green-boxer':
      if (hsl.h >= 82 && hsl.h <= 165 && hsl.s >= 0.24) {
        return 'primary';
      }
      if ((hsl.h <= 14 || hsl.h >= 330) && hsl.s >= 0.38) {
        return 'secondary';
      }
      return null;

    case 'jiujitsu-fighter':
      if (hsl.h >= 188 && hsl.h <= 255 && hsl.s >= 0.25) {
        return 'primary';
      }
      if (hsl.s <= 0.16 && hsl.l >= 0.48 && hsl.l <= 0.9) {
        return 'primary';
      }
      return null;

    case 'taekwondo':
      if (hsl.s <= 0.17 && hsl.l >= 0.5 && hsl.l <= 0.92) {
        return 'primary';
      }
      if ((hsl.h >= 190 && hsl.h <= 255 && hsl.s >= 0.24) || (hsl.l < 0.32 && hsl.s < 0.25)) {
        return 'secondary';
      }
      return null;

    case 'muay-thai':
      if (isLikelySkinTone(hsl)) {
        return null;
      }
      if (hsl.s >= 0.34) {
        return hsl.h >= 36 && hsl.h <= 66 ? 'secondary' : 'primary';
      }
      return null;

    case 'mongol-bokh':
      if (hsl.h >= 188 && hsl.h <= 255 && hsl.s >= 0.24) {
        return 'primary';
      }
      if ((hsl.h <= 14 || hsl.h >= 330) && hsl.s >= 0.34) {
        return 'secondary';
      }
      return null;

    case 'bayasaa':
      if (hsl.h >= 190 && hsl.h <= 255 && hsl.s >= 0.24) {
        return 'primary';
      }
      if ((hsl.h <= 14 || hsl.h >= 325) && hsl.s >= 0.32) {
        return 'secondary';
      }
      return null;
  }
}

function shiftUniformColors(
  canvas: HTMLCanvasElement,
  archetype: BaseArchetypeId,
  appearance: FighterAppearanceProfile
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const primary = hexToHsl(appearance.outfitPrimary);
  const secondary = hexToHsl(appearance.outfitSecondary);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 16) {
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hsl = rgbToHsl(r, g, b);
    const slot = shouldRecolorAsPrimary(archetype, hsl);
    if (!slot) {
      continue;
    }

    const target = slot === 'primary' ? primary : secondary;
    const nextH = target.h;
    const nextS = target.s < 0.08 ? hsl.s * 0.22 : Phaser.Math.Clamp(target.s * 0.78 + hsl.s * 0.22, 0.2, 0.96);
    const lScale = 0.58 + target.l * 0.72;
    const nextL = Phaser.Math.Clamp(hsl.l * lScale, 0.16, 0.91);

    const [nr, ng, nb] = hslToRgb(nextH, nextS, nextL);
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }

  ctx.putImageData(img, 0, 0);
}

/**
 * Strips bright green-screen background from a base portrait texture (e.g. red-brawler)
 * and tightly frames it on a 256x256 transparent canvas to match sprite cards.
 */
function cleanGreenScreenPortrait(scene: Phaser.Scene, portraitKey: string): void {
  if (!scene.textures.exists(portraitKey)) {
    return;
  }

  const source = scene.textures.get(portraitKey).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement
    | undefined;
  if (!source || !source.width || !source.height) {
    return;
  }

  const work = document.createElement('canvas');
  work.width = source.width;
  work.height = source.height;
  const wCtx = work.getContext('2d');
  if (!wCtx) {
    return;
  }

  wCtx.drawImage(source, 0, 0);
  const img = wCtx.getImageData(0, 0, work.width, work.height);
  const data = img.data;

  // Quick corner check to avoid processing textures that are already transparent
  if (!isGreenScreenPixel(data[0], data[1], data[2], data[3])) {
    return;
  }

  let minX = work.width;
  let minY = work.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < work.height; y += 1) {
    for (let x = 0; x < work.width; x += 1) {
      const idx = (y * work.width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (isGreenScreenPixel(r, g, b, a)) {
        data[idx + 3] = 0;
      } else if (a >= 16) {
        // Reduce green fringe spill on edges
        if (g > Math.max(r, b) + 18) {
          data[idx + 1] = Math.round((r + b) / 2);
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  wCtx.putImageData(img, 0, 0);
  if (maxX < minX || maxY < minY) {
    return;
  }

  const out = cropCenteredSquare(work, minX, minY, maxX - minX + 1, maxY - minY + 1);
  scene.textures.remove(portraitKey);
  scene.textures.addCanvas(portraitKey, out);
}

function cropCenteredSquare(
  sourceCanvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = PORTRAIT_SIZE;
  out.height = PORTRAIT_SIZE;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return out;
  }

  ctx.imageSmoothingEnabled = false;
  const pad = 18;
  const available = PORTRAIT_SIZE - pad * 2;
  const scale = Math.min(available / Math.max(1, sw), available / Math.max(1, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const dx = Math.round((PORTRAIT_SIZE - dw) / 2);
  const dy = Math.round((PORTRAIT_SIZE - dh) / 2);

  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
  return out;
}

/**
 * Extracts frame 0 from the discipline's base archetype idle spritesheet,
 * tightly crops it to match Mongol Bokh / Bayasaa arcade-sprite cards,
 * and recolors its uniform pixels to the discipline's outfit palette.
 */
export function buildSpriteStylePortraitCanvas(
  scene: Phaser.Scene,
  art: MartialArtDefinition,
  appearance: FighterAppearanceProfile
): HTMLCanvasElement {
  const idleKey = `${art.baseArchetypeId}-idle`;
  if (!scene.textures.exists(idleKey)) {
    const empty = document.createElement('canvas');
    empty.width = PORTRAIT_SIZE;
    empty.height = PORTRAIT_SIZE;
    return empty;
  }

  const texture = scene.textures.get(idleKey);
  const frame = texture.get(0);
  const source = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const fw = frame?.cutWidth || 256;
  const fh = frame?.cutHeight || 256;
  const fx = frame?.cutX || 0;
  const fy = frame?.cutY || 0;

  const raw = document.createElement('canvas');
  raw.width = fw;
  raw.height = fh;
  const rCtx = raw.getContext('2d');
  if (!rCtx) {
    return raw;
  }

  rCtx.drawImage(source, fx, fy, fw, fh, 0, 0, fw, fh);
  shiftUniformColors(raw, art.baseArchetypeId, appearance);

  // Measure tight opaque bounding box
  const img = rCtx.getImageData(0, 0, fw, fh);
  const data = img.data;
  let minX = fw;
  let minY = fh;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < fh; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      const a = data[(y * fw + x) * 4 + 3];
      if (a >= 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return cropCenteredSquare(raw, 0, 0, fw, fh);
  }

  return cropCenteredSquare(raw, minX, minY, maxX - minX + 1, maxY - minY + 1);
}

/**
 * Generates sprite-consistent 256x256 full-body arcade portraits for every
 * world martial art discipline and strips any legacy green-screen portrait edges.
 */
export function prepareWorldMartialArtPortraits(scene: Phaser.Scene): void {
  cleanGreenScreenPortrait(scene, 'red-brawler-portrait');

  for (const art of WORLD_MARTIAL_ARTS) {
    if (BASE_TEXTURE_PROTECTED_IDS.has(art.id)) {
      continue;
    }

    const portraitKey = `${art.id}-portrait`;
    if (scene.textures.exists(portraitKey)) {
      continue;
    }

    const appearance = resolveFighterAppearance(art.id);
    const canvas = buildSpriteStylePortraitCanvas(scene, art, appearance);
    scene.textures.addCanvas(portraitKey, canvas);
  }
}
