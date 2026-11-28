import * as THREE from 'three';

import { resolveFighterAppearance, type FighterAppearanceProfile } from '../game/fighterAppearance';
import { RAW_CELL, RAW_COLS, loadFirstImage, reverseRawSheet, sliceRawSheet, type RawSheet } from '../game/rawSheet';
import { getMartialArtMeta, type BaseArchetypeId } from '../game/worldMartialArts';

export type SpriteActionKey =
  | 'idle'
  | 'walk-forward'
  | 'walk-backward'
  | 'crouch'
  | 'crouch-punch'
  | 'jump'
  | 'block-high'
  | 'block-low'
  | 'hit-high'
  | 'light-punch'
  | 'heavy-kick'
  | 'sweep'
  | 'special-charge'
  | 'special'
  | 'knockdown';

export interface SpriteFrame25D {
  canvas: HTMLCanvasElement;
  /** Lowest opaque pixel row inside this 256x256 cell (0..255). */
  bottomY: number;
}

export interface SpriteSheetEntry25D {
  canvas: HTMLCanvasElement;
  frames: number;
  cols: number;
  rows: number;
  frameRate: number;
  isFallbackPose: boolean;
  frameList: SpriteFrame25D[];
}

export interface FighterSpritePack25D {
  characterId: string;
  baseArchetype: BaseArchetypeId;
  getAction: (action: SpriteActionKey) => SpriteSheetEntry25D;
}

interface GridActionSpec {
  action: SpriteActionKey;
  file: string;
  frames: number;
  frameRate: number;
}

const STANDARD_13_ACTIONS = (heavyFile: string, heavyFrames: number, hasDedicatedSpecial: boolean): GridActionSpec[] => [
  { action: 'idle', file: 'idle.png', frames: 12, frameRate: 10 },
  { action: 'walk-forward', file: 'walk-forward.png', frames: 8, frameRate: 10 },
  { action: 'walk-backward', file: 'walk-backward.png', frames: 8, frameRate: 10 },
  { action: 'crouch', file: 'crouch.png', frames: 5, frameRate: 14 },
  { action: 'jump', file: 'jump.png', frames: 8, frameRate: 12 },
  { action: 'block-high', file: 'block-high.png', frames: 4, frameRate: 12 },
  { action: 'block-low', file: 'block-low.png', frames: 4, frameRate: 14 },
  { action: 'hit-high', file: 'hit-high.png', frames: 6, frameRate: 14 },
  { action: 'light-punch', file: 'light-punch.png', frames: 6, frameRate: 16 },
  { action: 'heavy-kick', file: heavyFile, frames: heavyFrames, frameRate: 14 },
  { action: 'special-charge', file: hasDedicatedSpecial ? 'special-charge.png' : 'crouch.png', frames: 5, frameRate: 14 },
  { action: 'special', file: hasDedicatedSpecial ? 'special.png' : heavyFile, frames: hasDedicatedSpecial ? 12 : heavyFrames, frameRate: 16 },
  { action: 'knockdown', file: 'knockdown.png', frames: 10, frameRate: 14 }
];

const ARCHETYPE_GRID_SPECS: Partial<Record<BaseArchetypeId, GridActionSpec[]>> = {
  bayasaa: STANDARD_13_ACTIONS('heavy-kick.png', 8, true),
  'red-brawler': STANDARD_13_ACTIONS('heavy-kick.png', 10, true),
  'jiujitsu-fighter': STANDARD_13_ACTIONS('heavy-kick.png', 10, true),
  'green-boxer': STANDARD_13_ACTIONS('heavy-punch.png', 8, false)
};

const RAW_ARCHETYPE_CONFIG: Partial<Record<BaseArchetypeId, { flip: boolean }>> = {
  'blue-striker': { flip: false },
  'mongol-bokh': { flip: true },
  'muay-thai': { flip: true },
  taekwondo: { flip: true }
};

interface LoadedRawSheetData {
  canvas: HTMLCanvasElement;
  frames: number;
  cols: number;
  rows: number;
  frameRate: number;
  isFallbackPose: boolean;
}

const baseSheetCache = new Map<BaseArchetypeId, Promise<Map<SpriteActionKey, LoadedRawSheetData>>>();
const characterPackCache = new Map<string, Promise<FighterSpritePack25D>>();
const canvasSheetCache = new Map<string, SpriteSheetEntry25D>();

const GROUNDED_FEET_Y = 229;

function sliceIsolatedFrames(canvas: HTMLCanvasElement, frames: number, cols: number): SpriteFrame25D[] {
  const safeFrames = Math.max(1, frames);
  const safeCols = Math.max(1, cols);
  const list: SpriteFrame25D[] = [];

  for (let i = 0; i < safeFrames; i += 1) {
    const col = i % safeCols;
    const row = Math.floor(i / safeCols);
    const cell = document.createElement('canvas');
    cell.width = RAW_CELL;
    cell.height = RAW_CELL;
    const ctx = cell.getContext('2d');
    let bottomY = GROUNDED_FEET_Y;

    if (ctx) {
      ctx.drawImage(
        canvas,
        col * RAW_CELL,
        row * RAW_CELL,
        RAW_CELL,
        RAW_CELL,
        0,
        0,
        RAW_CELL,
        RAW_CELL
      );
      const data = ctx.getImageData(0, 0, RAW_CELL, RAW_CELL).data;
      let maxY = -1;
      for (let y = RAW_CELL - 1; y >= 0; y -= 1) {
        const rowBase = y * RAW_CELL * 4;
        for (let x = 0; x < RAW_CELL; x += 1) {
          if (data[rowBase + x * 4 + 3] >= 24) {
            maxY = y;
            break;
          }
        }
        if (maxY >= 0) break;
      }
      if (maxY >= 0) {
        bottomY = maxY;
      }
    }

    list.push({ canvas: cell, bottomY });
  }

  return list;
}

function makeEntryFromCanvas(
  canvas: HTMLCanvasElement,
  frames: number,
  cols: number,
  frameRate: number,
  isFallbackPose: boolean
): SpriteSheetEntry25D {
  const rows = Math.max(1, Math.ceil(Math.max(1, canvas.height) / RAW_CELL));
  const safeFrames = Math.max(1, frames);
  const safeCols = Math.max(1, cols);
  return {
    canvas,
    frames: safeFrames,
    cols: safeCols,
    rows,
    frameRate,
    isFallbackPose,
    frameList: sliceIsolatedFrames(canvas, safeFrames, safeCols)
  };
}

function loadRawImage(url: string): Promise<HTMLImageElement | null> {
  return loadFirstImage([url]);
}

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')?.drawImage(img, 0, 0);
  return c;
}

function measureCellBounds(
  canvas: HTMLCanvasElement,
  frameIdx: number,
  cols: number
): { minY: number; maxY: number; minX: number; maxX: number } {
  const cx = (frameIdx % cols) * RAW_CELL;
  const cy = Math.floor(frameIdx / cols) * RAW_CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { minY: 30, maxY: GROUNDED_FEET_Y, minX: 64, maxX: 192 };
  }
  const data = ctx.getImageData(cx, cy, RAW_CELL, RAW_CELL).data;
  let minY = RAW_CELL;
  let maxY = -1;
  let minX = RAW_CELL;
  let maxX = -1;
  for (let ly = 0; ly < RAW_CELL; ly += 1) {
    const rowOff = ly * RAW_CELL * 4;
    for (let lx = 0; lx < RAW_CELL; lx += 1) {
      if (data[rowOff + lx * 4 + 3] >= 28) {
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
      }
    }
  }
  if (maxY < 0) {
    return { minY: 30, maxY: GROUNDED_FEET_Y, minX: 64, maxX: 192 };
  }
  return { minY, maxY, minX, maxX };
}

/**
 * Synthesizes an authentic 2-foot-grounded athletic crouch/low-guard spritesheet
 * from frame 0 of `sourceCanvas` (always a solid grounded stance).
 * Keeps boots/ankles 1:1 pinned to GROUNDED_FEET_Y, bends knees/thighs smoothly,
 * and drops the crisp un-squashed torso & guard down over the bent knees.
 */
function synthesizeTwoFootCrouchData(
  sourceCanvas: HTMLCanvasElement,
  sourceCols: number,
  mode: 'crouch' | 'blockLow' | 'charge'
): LoadedRawSheetData {
  const frames = 3;
  const cols = RAW_COLS;
  const out = document.createElement('canvas');
  out.width = cols * RAW_CELL;
  out.height = RAW_CELL;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return { canvas: sourceCanvas, frames: 1, cols: sourceCols, rows: 1, frameRate: 12, isFallbackPose: false };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const b = measureCellBounds(sourceCanvas, 0, sourceCols);
  const feetY = b.maxY;
  const bodyH = Math.max(80, feetY - b.minY);
  const ankleH = Math.max(18, Math.round(bodyH * 0.17));
  const ankleSrcY = feetY - ankleH;
  const hipSrcY = b.minY + Math.round(bodyH * 0.56);
  const legBandH = Math.max(16, ankleSrcY - hipSrcY);
  const torsoH = Math.max(24, hipSrcY - b.minY);
  const maxDrop = Math.round(bodyH * (mode === 'crouch' ? 0.165 : 0.155));

  const depthFracs = mode === 'crouch' ? [0.42, 0.78, 1.0] : [0.68, 0.92, 1.0];
  const ankleDstY = GROUNDED_FEET_Y - ankleH;

  for (let f = 0; f < frames; f += 1) {
    const cellX = f * RAW_CELL;
    const frac = depthFracs[f];
    const drop = Math.round(maxDrop * frac);
    const hipDstY = hipSrcY + drop + (GROUNDED_FEET_Y - feetY);
    const bentLegH = Math.max(10, ankleDstY - hipDstY);
    const leanX = mode === 'blockLow' ? -Math.round(3 * frac) : -Math.round(2 * frac);

    // 1. Boots / ankles pinned 1:1 on the floor at GROUNDED_FEET_Y
    ctx.drawImage(sourceCanvas, 0, ankleSrcY, RAW_CELL, ankleH, cellX, ankleDstY, RAW_CELL, ankleH);

    // 2. Bent knees / thighs compressed cleanly into bent squat space
    ctx.drawImage(sourceCanvas, 0, hipSrcY, RAW_CELL, legBandH + 2, cellX + 1, hipDstY, RAW_CELL, bentLegH + 2);

    // 3. Sharp upper torso, arms & head lowered cleanly without distortion
    ctx.drawImage(
      sourceCanvas,
      0,
      b.minY,
      RAW_CELL,
      torsoH + 3,
      cellX + leanX,
      hipDstY - torsoH,
      RAW_CELL,
      torsoH + 3
    );
  }

  return {
    canvas: out,
    frames,
    cols,
    rows: 1,
    frameRate: 16,
    isFallbackPose: false
  };
}

/**
 * Synthesizes a 2-foot-grounded crouch-punch (`crouchLight`) spritesheet by
 * anchoring crouched bent lower legs at the floor and snapping the upper-body
 * punch motion from `punchData` down at crouched shoulder height.
 */
function synthesizeCrouchPunchData(
  crouchData: LoadedRawSheetData,
  punchData: LoadedRawSheetData
): LoadedRawSheetData {
  const frames = Math.min(5, Math.max(1, punchData.frames));
  const cols = RAW_COLS;
  const out = document.createElement('canvas');
  out.width = cols * RAW_CELL;
  out.height = RAW_CELL;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return punchData;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const crouchFrameIdx = Math.max(0, crouchData.frames - 1);
  const crouchCol = crouchFrameIdx % crouchData.cols;
  const crouchRow = Math.floor(crouchFrameIdx / crouchData.cols);
  const cb = measureCellBounds(crouchData.canvas, crouchFrameIdx, crouchData.cols);
  const crouchHipY = cb.minY + Math.round((cb.maxY - cb.minY) * 0.48);
  const lowerH = Math.max(18, cb.maxY - crouchHipY + 2);
  const lowerDstY = GROUNDED_FEET_Y - lowerH + 2;

  for (let f = 0; f < frames; f += 1) {
    const pCol = f % punchData.cols;
    const pRow = Math.floor(f / punchData.cols);
    const pb = measureCellBounds(punchData.canvas, f, punchData.cols);
    const punchHipY = pb.minY + Math.round((pb.maxY - pb.minY) * 0.56);
    const upperH = Math.max(24, punchHipY - pb.minY + 3);
    const upperDstY = lowerDstY - upperH + 4;
    const cellX = f * RAW_CELL;

    // 1. Both crouched legs firmly planted on GROUNDED_FEET_Y
    ctx.drawImage(
      crouchData.canvas,
      crouchCol * RAW_CELL,
      crouchRow * RAW_CELL + crouchHipY,
      RAW_CELL,
      lowerH,
      cellX,
      lowerDstY,
      RAW_CELL,
      lowerH
    );

    // 2. Upper torso + extended punch snap lowered to crouched waist
    ctx.drawImage(
      punchData.canvas,
      pCol * RAW_CELL,
      pRow * RAW_CELL + pb.minY,
      RAW_CELL,
      upperH,
      cellX - 2,
      upperDstY,
      RAW_CELL,
      upperH
    );
  }

  return {
    canvas: out,
    frames,
    cols,
    rows: 1,
    frameRate: 16,
    isFallbackPose: false
  };
}

/**
 * Synthesizes a grounded low leg-sweep sheet anchored firmly on the floor
 * so sweep strikes crouch low without clipping underground.
 */
function synthesizeSweepData(kickData: LoadedRawSheetData, crouchData: LoadedRawSheetData): LoadedRawSheetData {
  const frames = Math.min(5, Math.max(1, kickData.frames));
  const cols = RAW_COLS;
  const out = document.createElement('canvas');
  out.width = cols * RAW_CELL;
  out.height = RAW_CELL;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return kickData;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const crouchFrameIdx = Math.max(0, crouchData.frames - 1);
  const cCol = crouchFrameIdx % crouchData.cols;
  const cRow = Math.floor(crouchFrameIdx / crouchData.cols);

  for (let f = 0; f < frames; f += 1) {
    const cellX = f * RAW_CELL;
    if (f === 0) {
      ctx.drawImage(
        crouchData.canvas,
        cCol * RAW_CELL,
        cRow * RAW_CELL,
        RAW_CELL,
        RAW_CELL,
        cellX,
        0,
        RAW_CELL,
        RAW_CELL
      );
      continue;
    }

    const kCol = f % kickData.cols;
    const kRow = Math.floor(f / kickData.cols);
    const kb = measureCellBounds(kickData.canvas, f, kickData.cols);
    const srcH = Math.max(24, kb.maxY - kb.minY + 1);
    const squattedH = Math.round(srcH * 0.86);
    const dstY = GROUNDED_FEET_Y - squattedH;
    ctx.drawImage(
      kickData.canvas,
      kCol * RAW_CELL,
      kRow * RAW_CELL + kb.minY,
      RAW_CELL,
      srcH,
      cellX,
      dstY,
      RAW_CELL,
      squattedH
    );
  }

  return {
    canvas: out,
    frames,
    cols,
    rows: 1,
    frameRate: 14,
    isFallbackPose: false
  };
}

async function loadArchetypeRawData(archetype: BaseArchetypeId): Promise<Map<SpriteActionKey, LoadedRawSheetData>> {
  const cached = baseSheetCache.get(archetype);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const map = new Map<SpriteActionKey, LoadedRawSheetData>();
    const root = `/assets/${archetype}`;

    const gridSpecs = ARCHETYPE_GRID_SPECS[archetype];
    if (gridSpecs) {
      await Promise.all(
        gridSpecs.map(async (spec) => {
          const img = await loadRawImage(`${root}/${spec.file}`);
          if (!img) {
            return;
          }
          const canvas = imageToCanvas(img);
          const cols = Math.max(1, Math.round(canvas.width / RAW_CELL));
          const rows = Math.max(1, Math.round(canvas.height / RAW_CELL));
          map.set(spec.action, {
            canvas,
            frames: spec.frames,
            cols,
            rows,
            frameRate: spec.frameRate,
            isFallbackPose: false
          });
        })
      );
      const crouchEntry = map.get('crouch');
      const punchEntry = map.get('light-punch');
      const kickEntry = map.get('heavy-kick');
      if (crouchEntry && punchEntry) {
        map.set('crouch-punch', synthesizeCrouchPunchData(crouchEntry, punchEntry));
      }
      if (crouchEntry && kickEntry) {
        map.set('sweep', synthesizeSweepData(kickEntry, crouchEntry));
      }
      return map;
    }

    const rawCfg = RAW_ARCHETYPE_CONFIG[archetype] ?? { flip: false };
    const exts = ['png', 'jpg', 'jpeg', 'webp'];
    const loadNamed = async (name: string): Promise<RawSheet | null> => {
      const img = await loadFirstImage(exts.map((ext) => `${root}/${name}.${ext}`));
      return img ? sliceRawSheet(img, { flip: rawCfg.flip }) : null;
    };

    const [idle, walk, punch, kick, hit, ko, crouch, jump, block, special] = await Promise.all([
      loadNamed('idle'),
      loadNamed('walk'),
      loadNamed('punch'),
      loadNamed('kick'),
      loadNamed('hit'),
      loadNamed('ko'),
      loadNamed('crouch'),
      loadNamed('jump'),
      loadNamed('block'),
      loadNamed('special')
    ]);

    const register = (action: SpriteActionKey, sheet: RawSheet | null, frameRate: number, fallback: boolean): void => {
      if (!sheet) {
        return;
      }
      map.set(action, {
        canvas: sheet.canvas,
        frames: sheet.frames,
        cols: RAW_COLS,
        rows: Math.max(1, Math.ceil(sheet.frames / RAW_COLS)),
        frameRate,
        isFallbackPose: fallback
      });
    };

    const idleSheet = idle ?? punch ?? kick;
    if (!idleSheet) {
      return map;
    }

    const walkSheet = walk ?? idleSheet;
    register('idle', idleSheet, 9, false);
    register('walk-forward', walkSheet, 11, !walk);
    register('walk-backward', reverseRawSheet(walkSheet), 11, !walk);

    const idleData = map.get('idle')!;
    if (crouch) {
      register('crouch', crouch, 14, false);
    } else {
      map.set('crouch', synthesizeTwoFootCrouchData(idleSheet.canvas, RAW_COLS, 'crouch'));
    }
    const crouchData = map.get('crouch')!;

    register('jump', jump ?? idleSheet, 10, !jump);
    register('block-high', block ?? idleSheet, 12, !block);
    if (block) {
      register('block-low', block, 12, false);
    } else if (crouch) {
      register('block-low', crouch, 12, false);
    } else {
      map.set('block-low', synthesizeTwoFootCrouchData(idleSheet.canvas, RAW_COLS, 'blockLow'));
    }

    register('hit-high', hit ?? idleSheet, 12, !hit);
    register('light-punch', punch ?? idleSheet, 15, !punch);
    register('heavy-kick', kick ?? punch ?? idleSheet, 13, !kick);

    const punchData = map.get('light-punch') ?? idleData;
    const kickData = map.get('heavy-kick') ?? punchData;
    map.set('crouch-punch', synthesizeCrouchPunchData(crouchData, punchData));
    map.set('sweep', synthesizeSweepData(kickData, crouchData));

    if (crouch) {
      register('special-charge', crouch, 12, false);
    } else {
      map.set('special-charge', synthesizeTwoFootCrouchData(idleSheet.canvas, RAW_COLS, 'charge'));
    }

    register('special', special ?? kick ?? punch ?? idleSheet, 14, !special);
    register('knockdown', ko ?? hit ?? idleSheet, 10, !ko);

    return map;
  })();

  baseSheetCache.set(archetype, promise);
  return promise;
}

// ─── Color Space Helpers ───

interface HslColor {
  h: number;
  s: number;
  l: number;
}

type OutfitSlot = 'primary' | 'secondary' | 'belt' | null;

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
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0.001) {
    const v = Math.round(THREE.MathUtils.clamp(l, 0, 1) * 255);
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
  const hk = (((h % 360) + 360) % 360) / 360;
  return [
    Math.round(hue2rgb(p, q, hk + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hk) * 255),
    Math.round(hue2rgb(p, q, hk - 1 / 3) * 255)
  ];
}

function hexToRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function hexToHsl(color: number): HslColor {
  const [r, g, b] = hexToRgb(color);
  return rgbToHsl(r, g, b);
}

function blendPixelRgb(
  data: Uint8ClampedArray,
  idx: number,
  tr: number,
  tg: number,
  tb: number,
  weight: number
): void {
  const inv = 1 - weight;
  data[idx] = Math.round(data[idx] * inv + tr * weight);
  data[idx + 1] = Math.round(data[idx + 1] * inv + tg * weight);
  data[idx + 2] = Math.round(data[idx + 2] * inv + tb * weight);
}

function isLikelySkinTone(hsl: HslColor): boolean {
  return hsl.h >= 12 && hsl.h <= 46 && hsl.s >= 0.18 && hsl.s <= 0.78 && hsl.l >= 0.23 && hsl.l <= 0.88;
}

/**
 * Classifies an outfit pixel accurately using both HSL color and cell-local Y
 * (`ly`, where standing bodies span roughly `ly = 30..230`, head `30..75`).
 */
function shouldRecolorSlot(
  archetype: BaseArchetypeId,
  hsl: HslColor,
  ly: number,
  torsoMinY: number
): OutfitSlot {
  if (hsl.l < 0.11 || hsl.l > 0.97) {
    return null;
  }

  switch (archetype) {
    case 'red-brawler':
      if ((hsl.h <= 16 || hsl.h >= 325) && hsl.s >= 0.34) return 'primary';
      if (ly >= torsoMinY && ly <= 152 && hsl.s <= 0.18 && hsl.l >= 0.62) return 'secondary';
      if (ly >= 122 && hsl.s <= 0.24 && hsl.l >= 0.15 && hsl.l <= 0.42) return 'belt';
      return null;

    case 'blue-striker':
      if (hsl.h >= 186 && hsl.h <= 255 && hsl.s >= 0.26) return 'primary';
      if (ly >= torsoMinY && ly <= 152 && hsl.s <= 0.18 && hsl.l >= 0.62) return 'secondary';
      if (ly >= 122 && hsl.s <= 0.24 && hsl.l >= 0.15 && hsl.l <= 0.42) return 'belt';
      return null;

    case 'green-boxer':
      if (hsl.h >= 78 && hsl.h <= 168 && hsl.s >= 0.22) return 'primary';
      if (ly >= 112 && ly <= 178 && hsl.s <= 0.25 && hsl.l >= 0.13 && hsl.l <= 0.38) return 'secondary';
      if ((hsl.h <= 18 || hsl.h >= 265) && hsl.s >= 0.26 && ly >= torsoMinY) return 'belt';
      return null;

    case 'jiujitsu-fighter':
      if (hsl.h >= 168 && hsl.h <= 245 && hsl.s >= 0.22) return 'primary';
      if (ly >= 92 && hsl.h >= 22 && hsl.h <= 64 && hsl.s >= 0.34) return 'secondary';
      if (ly >= 125 && hsl.s <= 0.18 && hsl.l >= 0.58) return 'belt';
      return null;

    case 'taekwondo':
      if (ly >= torsoMinY && hsl.s <= 0.2 && hsl.l >= 0.52) return 'primary';
      if (hsl.h >= 185 && hsl.h <= 255 && hsl.s >= 0.22) return 'secondary';
      if (ly >= torsoMinY + 4 && hsl.s <= 0.28 && hsl.l >= 0.11 && hsl.l <= 0.32) return 'belt';
      return null;

    case 'muay-thai':
      if (isLikelySkinTone(hsl)) return null;
      if (ly >= torsoMinY && (hsl.h <= 16 || hsl.h >= 320) && hsl.s >= 0.32) return 'primary';
      if (hsl.h >= 34 && hsl.h <= 66 && hsl.s >= 0.34) return 'secondary';
      if (ly >= torsoMinY && hsl.s <= 0.18 && hsl.l >= 0.64) return 'belt';
      return null;

    case 'mongol-bokh':
      if (hsl.h >= 188 && hsl.h <= 252 && hsl.s >= 0.24) return 'primary';
      if (ly >= torsoMinY && hsl.h >= 32 && hsl.h <= 64 && hsl.s >= 0.34) return 'secondary';
      if (ly >= 162 && hsl.h >= 14 && hsl.h <= 38 && hsl.s >= 0.22 && hsl.l <= 0.56) return 'belt';
      return null;

    case 'bayasaa':
      if (ly >= torsoMinY && ly <= 152 && hsl.s <= 0.22 && hsl.l >= 0.13 && hsl.l <= 0.44) return 'primary';
      if (ly >= torsoMinY && ly <= 148 && hsl.s <= 0.18 && hsl.l >= 0.44 && hsl.l <= 0.85) return 'secondary';
      if (ly >= 134 && hsl.h >= 188 && hsl.h <= 248 && hsl.s >= 0.16) return 'belt';
      return null;
  }
}

interface CellHeadFaceBounds {
  bodyTopY: number;
  faceMinX: number;
  faceMaxX: number;
  faceMinY: number;
  faceMaxY: number;
  hasFace: boolean;
}

/** Locates the exact head & skin face box inside one 256x256 spritesheet frame. */
function detectCellFaceBounds(
  data: Uint8ClampedArray,
  sheetWidth: number,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number
): CellHeadFaceBounds {
  let bodyTopY = cellH;
  for (let ly = 0; ly < cellH; ly += 1) {
    for (let lx = 0; lx < cellW; lx += 1) {
      const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
      if (data[idx + 3] >= 40) {
        bodyTopY = ly;
        break;
      }
    }
    if (bodyTopY < cellH) break;
  }

  let faceMinX = cellW;
  let faceMaxX = -1;
  let faceMinY = cellH;
  let faceMaxY = -1;
  let skinCount = 0;

  const scanBottom = Math.min(cellH, bodyTopY + 42);
  for (let ly = bodyTopY; ly < scanBottom; ly += 1) {
    for (let lx = 0; lx < cellW; lx += 1) {
      const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
      if (data[idx + 3] < 40) continue;
      const hsl = rgbToHsl(data[idx], data[idx + 1], data[idx + 2]);
      if (isLikelySkinTone(hsl)) {
        skinCount += 1;
        if (lx < faceMinX) faceMinX = lx;
        if (lx > faceMaxX) faceMaxX = lx;
        if (ly < faceMinY) faceMinY = ly;
        if (ly > faceMaxY) faceMaxY = ly;
      }
    }
  }

  const hasFace = skinCount >= 8 && faceMaxX > faceMinX && faceMaxY - faceMinY >= 5;
  return { bodyTopY, faceMinX, faceMaxX, faceMinY, faceMaxY, hasFace };
}

function applyCellFaceAccents(
  data: Uint8ClampedArray,
  sheetWidth: number,
  cellX: number,
  cellY: number,
  bounds: CellHeadFaceBounds,
  appearance: FighterAppearanceProfile
): void {
  if (!bounds.hasFace) {
    return;
  }

  const { bodyTopY, faceMinX, faceMaxX, faceMinY, faceMaxY } = bounds;
  const faceW = faceMaxX - faceMinX + 1;
  const faceH = faceMaxY - faceMinY + 1;
  const [hr, hg, hb] = hexToRgb(appearance.hairColor);
  const [gr, gg, gb] = hexToRgb(appearance.headgearColor);

  // 1. Subtle Headband / Mongkhon / Crown strip across existing opaque head pixels
  if (
    appearance.headgear === 'headband' ||
    appearance.headgear === 'mongkhon' ||
    appearance.headgear === 'laurel' ||
    appearance.headgear === 'gaungBaung' ||
    appearance.headgear === 'tanjak'
  ) {
    const bandY0 = Math.max(bodyTopY + 2, faceMinY - 1);
    const bandY1 = bandY0 + 1;
    const minBandX = Math.max(0, faceMinX - 4);
    const maxBandX = Math.min(RAW_CELL - 1, faceMaxX + 8);
    for (let ly = bandY0; ly <= bandY1; ly += 1) {
      for (let lx = minBandX; lx <= maxBandX; lx += 1) {
        const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
        if (data[idx + 3] < 80) continue;
        // Skip crisp black outline edge pixels
        if (data[idx] + data[idx + 1] + data[idx + 2] < 65) continue;
        blendPixelRgb(data, idx, gr, gg, gb, 0.72);
      }
    }
  }

  // 2. Ninja Mask or Helmet/Visor tint over face
  if (appearance.headgear === 'ninjaMask') {
    const maskStartY = faceMinY + Math.floor(faceH * 0.46);
    for (let ly = maskStartY; ly <= faceMaxY + 1; ly += 1) {
      for (let lx = faceMinX; lx <= faceMaxX; lx += 1) {
        const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
        if (data[idx + 3] < 80) continue;
        const hsl = rgbToHsl(data[idx], data[idx + 1], data[idx + 2]);
        if (isLikelySkinTone(hsl)) {
          blendPixelRgb(data, idx, gr, gg, gb, 0.78);
        }
      }
    }
  } else if (
    appearance.headgear === 'kudoVisor' ||
    appearance.headgear === 'fencingMask' ||
    appearance.headgear === 'helmetCage' ||
    appearance.headgear === 'kendoMen' ||
    appearance.headgear === 'hemaHelm'
  ) {
    const visorEndY = faceMinY + Math.floor(faceH * 0.72);
    for (let ly = faceMinY + 1; ly <= visorEndY; ly += 1) {
      for (let lx = faceMinX; lx <= faceMaxX; lx += 1) {
        const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
        if (data[idx + 3] < 80) continue;
        if (data[idx] + data[idx + 1] + data[idx + 2] < 65) continue;
        blendPixelRgb(data, idx, gr, gg, gb, 0.42);
      }
    }
  }

  // 3. Subtle Facial Hair / Brow / Scar / War Paint accents (sprite always faces LEFT -> front is faceMinX)
  const frontMaxX = faceMinX + Math.max(4, Math.floor(faceW * 0.55));
  if (appearance.facialFeature === 'beard') {
    const chinTop = faceMaxY - Math.max(3, Math.floor(faceH * 0.34));
    for (let ly = chinTop; ly <= faceMaxY; ly += 1) {
      for (let lx = faceMinX; lx <= faceMaxX; lx += 1) {
        const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
        if (data[idx + 3] < 80) continue;
        const hsl = rgbToHsl(data[idx], data[idx + 1], data[idx + 2]);
        if (isLikelySkinTone(hsl)) {
          blendPixelRgb(data, idx, hr, hg, hb, 0.56);
        }
      }
    }
  } else if (appearance.facialFeature === 'goatee') {
    const chinTop = faceMaxY - Math.max(3, Math.floor(faceH * 0.28));
    for (let ly = chinTop; ly <= faceMaxY; ly += 1) {
      for (let lx = faceMinX; lx <= frontMaxX; lx += 1) {
        const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
        if (data[idx + 3] < 80) continue;
        const hsl = rgbToHsl(data[idx], data[idx + 1], data[idx + 2]);
        if (isLikelySkinTone(hsl)) {
          blendPixelRgb(data, idx, hr, hg, hb, 0.58);
        }
      }
    }
  } else if (appearance.facialFeature === 'mustache') {
    const lipY = faceMinY + Math.round(faceH * 0.62);
    for (let lx = faceMinX; lx <= Math.min(faceMaxX, faceMinX + 4); lx += 1) {
      const idx = ((cellY + lipY) * sheetWidth + (cellX + lx)) * 4;
      if (data[idx + 3] >= 80 && data[idx] + data[idx + 1] + data[idx + 2] >= 70) {
        blendPixelRgb(data, idx, hr, hg, hb, 0.62);
      }
    }
  } else if (appearance.facialFeature === 'scar') {
    const sx = faceMinX + Math.max(2, Math.floor(faceW * 0.25));
    const sy = faceMinY + Math.max(3, Math.floor(faceH * 0.34));
    for (let d = 0; d < 3; d += 1) {
      const lx = sx + d;
      const ly = sy + d;
      if (lx <= faceMaxX && ly <= faceMaxY) {
        const idx = ((cellY + ly) * sheetWidth + (cellX + lx)) * 4;
        if (data[idx + 3] >= 80) {
          blendPixelRgb(data, idx, 185, 48, 48, 0.48);
        }
      }
    }
  } else if (appearance.facialFeature === 'warPaint') {
    const wy = faceMinY + Math.max(3, Math.floor(faceH * 0.45));
    for (let d = 0; d < 3; d += 1) {
      const lx = faceMinX + 2 + d;
      if (lx <= faceMaxX) {
        const idx = ((cellY + wy) * sheetWidth + (cellX + lx)) * 4;
        if (data[idx + 3] >= 80) {
          blendPixelRgb(data, idx, gr, gg, gb, 0.65);
        }
      }
    }
  } else if (appearance.facialFeature === 'fierceBrows') {
    const by = faceMinY + Math.max(2, Math.floor(faceH * 0.24));
    for (let lx = faceMinX; lx <= frontMaxX; lx += 1) {
      const idx = ((cellY + by) * sheetWidth + (cellX + lx)) * 4;
      if (data[idx + 3] >= 80 && data[idx] + data[idx + 1] + data[idx + 2] >= 70) {
        blendPixelRgb(data, idx, hr, hg, hb, 0.28);
      }
    }
  }
}

export interface RecolorSheetOptions {
  /** Only tweak face, hair, and shirt accents without recoloring the main jacket/gi. */
  faceAndShirtOnly?: boolean;
}

/**
 * Pure RGBA pixel transform that slightly alters face skin tone, hair shade,
 * subtle facial/headgear details, and uniform colors across every 256x256 cell.
 */
export function transformSpriteSheetPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  archetype: BaseArchetypeId,
  appearance: FighterAppearanceProfile,
  options: RecolorSheetOptions = {}
): void {
  const primary = hexToHsl(appearance.outfitPrimary);
  const secondary = hexToHsl(appearance.outfitSecondary);
  const belt = hexToHsl(appearance.beltColor);
  const skin = hexToHsl(appearance.skinColor);
  const hair = hexToHsl(appearance.hairColor);
  const [skinR, skinG, skinB] = hexToRgb(appearance.skinColor);

  const cols = Math.max(1, Math.floor(width / RAW_CELL));
  const rows = Math.max(1, Math.floor(height / RAW_CELL));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cellX = col * RAW_CELL;
      const cellY = row * RAW_CELL;
      const cellW = Math.min(RAW_CELL, width - cellX);
      const cellH = Math.min(RAW_CELL, height - cellY);
      const bounds = detectCellFaceBounds(data, width, cellX, cellY, cellW, cellH);
      const torsoMinY = bounds.hasFace ? Math.max(62, bounds.faceMaxY + 4) : 68;

      for (let ly = 0; ly < cellH; ly += 1) {
        for (let lx = 0; lx < cellW; lx += 1) {
          const idx = ((cellY + ly) * width + (cellX + lx)) * 4;
          if (data[idx + 3] < 16) continue;

          const hsl = rgbToHsl(data[idx], data[idx + 1], data[idx + 2]);

          // Subtle skin complexion shift (keeps highlights & muscle shading crisp)
          if (isLikelySkinTone(hsl)) {
            const blend = 0.34;
            const lightAdjust = THREE.MathUtils.clamp(hsl.l * (0.86 + skin.l * 0.22), 0.18, 0.9);
            const [sr, sg, sb] = hslToRgb(skin.h, THREE.MathUtils.clamp(skin.s * 0.85, 0.18, 0.72), lightAdjust);
            blendPixelRgb(
              data,
              idx,
              Math.round(sr * 0.7 + skinR * 0.3),
              Math.round(sg * 0.7 + skinG * 0.3),
              Math.round(sb * 0.7 + skinB * 0.3),
              blend
            );
            continue;
          }

          // Subtle hair shade shift inside head upper silhouette (never touching black outlines)
          if (
            bounds.hasFace &&
            ly >= bounds.bodyTopY &&
            ly <= bounds.faceMaxY + 2 &&
            lx >= bounds.faceMinX - 10 &&
            lx <= bounds.faceMaxX + 10 &&
            hsl.l >= 0.08 &&
            hsl.l <= 0.56 &&
            hsl.s <= 0.68
          ) {
            const nextHairL = THREE.MathUtils.clamp(hsl.l * 0.55 + hair.l * 0.55, 0.09, 0.88);
            const [nhr, nhg, nhb] = hslToRgb(hair.h, hair.s, nextHairL);
            blendPixelRgb(data, idx, nhr, nhg, nhb, 0.56);
            continue;
          }

          const slot = shouldRecolorSlot(archetype, hsl, ly, torsoMinY);
          if (!slot) continue;
          if (options.faceAndShirtOnly && slot === 'primary') {
            continue;
          }

          const target = slot === 'primary' ? primary : slot === 'secondary' ? secondary : belt;
          const isNeutralSrc = hsl.s <= 0.2;
          const nextS =
            target.s < 0.08
              ? hsl.s * 0.24
              : THREE.MathUtils.clamp(target.s * (isNeutralSrc ? 0.65 : 0.78) + hsl.s * 0.22, 0.14, 0.96);
          const lScale = slot === 'primary' ? 0.55 + target.l * 0.72 : 0.62 + target.l * 0.66;
          const nextL = THREE.MathUtils.clamp(hsl.l * lScale, 0.12, 0.93);
          const [nr, ng, nb] = hslToRgb(target.h, nextS, nextL);
          const strength = slot === 'primary' ? 0.9 : slot === 'secondary' ? (isNeutralSrc ? 0.58 : 0.88) : 0.62;
          blendPixelRgb(data, idx, nr, ng, nb, strength);
        }
      }

      applyCellFaceAccents(data, width, cellX, cellY, bounds, appearance);
    }
  }
}

/**
 * Slightly alters face skin tone, hair shade, subtle facial/headgear details,
 * and uniform palette across every 256x256 spritesheet frame so overlapping
 * fighters remain visibly distinct in 2.5D combat and character select.
 */
export function recolorSheetCanvas(
  source: HTMLCanvasElement,
  archetype: BaseArchetypeId,
  appearance: FighterAppearanceProfile,
  options: RecolorSheetOptions = {}
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return source;
  }

  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  transformSpriteSheetPixels(img.data, out.width, out.height, archetype, appearance, options);
  ctx.putImageData(img, 0, 0);
  return out;
}

const PROTECTED_BASE_IDS = new Set<string>([
  'muay-thai',
  'taekwondo',
  'mongol-bokh',
  'red-brawler',
  'jiujitsu-fighter',
  'green-boxer',
  'bayasaa'
]);

/**
 * Loads & caches a true 2.5D animated spritesheet pack for any of the 68 fighters.
 * Base 7 distinct archetypes keep their pure authored artwork; `blue-striker`
 * gets a subtle face/hair/undershirt variation from `red-brawler`, and all 60
 * world martial arts get distinct face, hair, headgear, and uniform updates.
 */
export async function loadFighterSpritePack25D(characterId: string): Promise<FighterSpritePack25D | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  const existing = characterPackCache.get(characterId);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<FighterSpritePack25D> => {
    const meta = getMartialArtMeta(characterId);
    const isBlueStriker = characterId === 'blue-striker';
    const baseArchetype: BaseArchetypeId =
      PROTECTED_BASE_IDS.has(characterId) || isBlueStriker
        ? (characterId as BaseArchetypeId)
        : meta?.baseArchetypeId ?? 'red-brawler';

    const rawMap = await loadArchetypeRawData(baseArchetype);
    const isRecolored = !PROTECTED_BASE_IDS.has(characterId);
    const appearance = isRecolored ? resolveFighterAppearance(characterId) : null;

    const getAction = (action: SpriteActionKey): SpriteSheetEntry25D => {
      const cacheKey = `${characterId}:${action}`;
      const cachedEntry = canvasSheetCache.get(cacheKey);
      if (cachedEntry) {
        return cachedEntry;
      }

      const raw =
        rawMap.get(action) ??
        rawMap.get('idle') ??
        Array.from(rawMap.values())[0];

      if (!raw) {
        const empty = document.createElement('canvas');
        empty.width = RAW_CELL;
        empty.height = RAW_CELL;
        const entry = makeEntryFromCanvas(empty, 1, 1, 8, true);
        canvasSheetCache.set(cacheKey, entry);
        return entry;
      }

      const finalCanvas =
        isRecolored && appearance
          ? recolorSheetCanvas(raw.canvas, baseArchetype, appearance, {
              faceAndShirtOnly: isBlueStriker
            })
          : raw.canvas;

      const entry = makeEntryFromCanvas(finalCanvas, raw.frames, raw.cols, raw.frameRate, raw.isFallbackPose);
      canvasSheetCache.set(cacheKey, entry);
      return entry;
    };

    // Pre-warm idle immediately so showcase/match starts sharp on frame 1
    getAction('idle');

    return {
      characterId,
      baseArchetype,
      getAction
    };
  })();

  characterPackCache.set(characterId, promise);
  return promise;
}
