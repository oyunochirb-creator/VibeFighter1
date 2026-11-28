import type { Rect } from './types';

/**
 * Turns a "raw" AI-drawn pose sheet (a row or grid of poses on one flat
 * background colour) into a game-ready spritesheet canvas: background removed,
 * every pose scaled to the same body height, feet on the same line, one pose
 * per 256x256 cell, 5 cells per row.
 */

export const RAW_CELL = 256;
export const RAW_COLS = 5;
/** Feet line and standing body height shared with the bundled fighters. */
const FEET_Y = 229;
const BODY_HEIGHT = 200;
const MAX_POSE_WIDTH = 244;
const MAX_FRAMES = 10;
const MAX_SOURCE_SIDE = 2048;

export interface RawSheet {
  canvas: HTMLCanvasElement;
  frames: number;
  /** Tight box around each pose inside its 256x256 cell. */
  boxes: Rect[];
}

export interface RawSheetOptions {
  /** Mirror every pose. Use when the art faces right instead of left. */
  flip?: boolean;
  /** Force this many equal-width poses instead of auto-detecting them. */
  frames?: number;
}

interface Pose {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  feetX: number;
  label?: number;
}

/**
 * Load the first URL that decodes as an image.
 * @param urls - Candidate URLs, tried in order.
 */
export async function loadFirstImage(urls: string[]): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    const image = await loadImage(url);

    if (image) {
      return image;
    }
  }

  return null;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Slice a raw pose sheet into a normalized spritesheet.
 * @param image - The decoded source image.
 * @param options - Flip and frame-count overrides.
 * @returns The spritesheet, or null when no pose was found.
 */
export function sliceRawSheet(image: HTMLImageElement, options: RawSheetOptions = {}): RawSheet | null {
  const shrink = Math.min(1, MAX_SOURCE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * shrink));
  const height = Math.max(1, Math.round(image.naturalHeight * shrink));
  const source = makeCanvas(width, height);
  const sourceContext = source.getContext('2d', { willReadFrequently: true });

  if (!sourceContext) {
    return null;
  }

  sourceContext.drawImage(image, 0, 0, width, height);

  const pixels = sourceContext.getImageData(0, 0, width, height);

  removeBackground(pixels.data, width, height);
  sourceContext.putImageData(pixels, 0, 0);

  const mask = new Uint8Array(width * height);

  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = pixels.data[index * 4 + 3] > 40 ? 1 : 0;
  }

  const segmented = extractConnectedPoses(mask, width, height);
  const poses = (
    options.frames && options.frames !== segmented.poses.length
      ? splitEvenly(mask, width, height, options.frames)
      : segmented.poses
  ).slice(0, MAX_FRAMES);

  if (poses.length === 0) {
    return null;
  }

  const tallest = Math.max(...poses.map((pose) => pose.height));
  const widest = Math.max(...poses.map((pose) => pose.width));
  const scale = Math.min(BODY_HEIGHT / tallest, MAX_POSE_WIDTH / widest);
  const rows = Math.ceil(poses.length / RAW_COLS);
  const canvas = makeCanvas(RAW_COLS * RAW_CELL, rows * RAW_CELL);
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const boxes = poses.map((pose, frame) => {
    const drawWidth = Math.max(1, Math.round(pose.width * scale));
    const drawHeight = Math.max(1, Math.round(pose.height * scale));
    const centered = Math.round(RAW_CELL / 2 - (pose.feetX - pose.x) * scale);
    const left = Math.max(2, Math.min(RAW_CELL - 2 - drawWidth, centered));
    const top = FEET_Y - drawHeight;
    const cellX = (frame % RAW_COLS) * RAW_CELL;
    const cellY = Math.floor(frame / RAW_COLS) * RAW_CELL;

    // Stamp ONLY pixels belonging to this connected pose so neighboring limbs
    // inside overlapping bounding boxes never appear as ghost second sprites.
    const isolated = makeCanvas(pose.width, pose.height);
    const isoCtx = isolated.getContext('2d');
    if (isoCtx) {
      if (pose.label !== undefined) {
        const isoImg = isoCtx.createImageData(pose.width, pose.height);
        const dst = isoImg.data;
        const src = pixels.data;
        const lbls = segmented.labels;
        const targetLbl = pose.label;
        for (let py = 0; py < pose.height; py += 1) {
          const sy = pose.y + py;
          for (let px = 0; px < pose.width; px += 1) {
            const sx = pose.x + px;
            const sIdx = sy * width + sx;
            if (lbls[sIdx] === targetLbl) {
              const sOff = sIdx * 4;
              const dOff = (py * pose.width + px) * 4;
              dst[dOff] = src[sOff];
              dst[dOff + 1] = src[sOff + 1];
              dst[dOff + 2] = src[sOff + 2];
              dst[dOff + 3] = src[sOff + 3];
            }
          }
        }
        isoCtx.putImageData(isoImg, 0, 0);
      } else {
        isoCtx.drawImage(source, pose.x, pose.y, pose.width, pose.height, 0, 0, pose.width, pose.height);
      }
    }

    context.save();

    if (options.flip) {
      context.translate(cellX + RAW_CELL, cellY);
      context.scale(-1, 1);
    } else {
      context.translate(cellX, cellY);
    }

    context.drawImage(isolated, 0, 0, pose.width, pose.height, left, top, drawWidth, drawHeight);
    context.restore();

    return {
      x: options.flip ? RAW_CELL - left - drawWidth : left,
      y: top,
      width: drawWidth,
      height: drawHeight
    };
  });

  return { canvas, frames: poses.length, boxes };
}

/**
 * Copy a spritesheet with its frames in reverse order (walk -> walk backward).
 * @param sheet - The sheet to reverse.
 */
export function reverseRawSheet(sheet: RawSheet): RawSheet {
  const canvas = makeCanvas(sheet.canvas.width, sheet.canvas.height);
  const context = canvas.getContext('2d');

  for (let frame = 0; frame < sheet.frames; frame += 1) {
    const from = sheet.frames - 1 - frame;

    context?.drawImage(
      sheet.canvas,
      (from % RAW_COLS) * RAW_CELL,
      Math.floor(from / RAW_COLS) * RAW_CELL,
      RAW_CELL,
      RAW_CELL,
      (frame % RAW_COLS) * RAW_CELL,
      Math.floor(frame / RAW_COLS) * RAW_CELL,
      RAW_CELL,
      RAW_CELL
    );
  }

  return { canvas, frames: sheet.frames, boxes: [...sheet.boxes].reverse() };
}

/**
 * Cut one frame out of a spritesheet as a square image (used for portraits).
 * @param sheet - The source sheet.
 * @param frame - Frame index to copy.
 */
export function frameToCanvas(sheet: RawSheet, frame = 0): HTMLCanvasElement {
  const canvas = makeCanvas(RAW_CELL, RAW_CELL);

  canvas
    .getContext('2d')
    ?.drawImage(
      sheet.canvas,
      (frame % RAW_COLS) * RAW_CELL,
      Math.floor(frame / RAW_COLS) * RAW_CELL,
      RAW_CELL,
      RAW_CELL,
      0,
      0,
      RAW_CELL,
      RAW_CELL
    );

  return canvas;
}

/**
 * A stand-in sheet (one grey silhouette with a question mark) for a fighter
 * whose images are missing, so the game still runs.
 */
export function placeholderRawSheet(): RawSheet {
  const canvas = makeCanvas(RAW_COLS * RAW_CELL, RAW_CELL);
  const context = canvas.getContext('2d');
  const box = { x: 88, y: FEET_Y - BODY_HEIGHT, width: 80, height: BODY_HEIGHT };

  if (context) {
    context.fillStyle = '#64748b';
    context.fillRect(box.x, box.y + 50, box.width, box.height - 50);
    context.beginPath();
    context.arc(RAW_CELL / 2, box.y + 26, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f8fafc';
    context.font = 'bold 64px monospace';
    context.textAlign = 'center';
    context.fillText('?', RAW_CELL / 2, box.y + 140);
  }

  return { canvas, frames: 1, boxes: [box] };
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

/**
 * Make the flat background transparent. The background colour is read from the
 * image border, so green, magenta or white backgrounds all work. Images that
 * are already transparent are left alone.
 */
function removeBackground(data: Uint8ClampedArray, width: number, height: number): void {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];

  if (corners.some((corner) => data[corner * 4 + 3] < 16)) {
    return;
  }

  const [red, green, blue] = borderColour(data, width, height);
  const greenScreen = green > red + 50 && green > blue + 50;
  const solid = 85;
  const soft = 135;

  for (let offset = 0; offset < data.length; offset += 4) {
    const distance = Math.hypot(data[offset] - red, data[offset + 1] - green, data[offset + 2] - blue);

    if (distance < solid) {
      data[offset + 3] = 0;
    } else if (distance < soft) {
      data[offset + 3] = Math.round(((distance - solid) / (soft - solid)) * 255);

      if (greenScreen) {
        data[offset + 1] = Math.min(data[offset + 1], Math.max(data[offset], data[offset + 2]));
      }
    }
  }
}

function borderColour(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const samples: Array<[number, number, number]> = [];
  const push = (x: number, y: number): void => {
    const offset = (y * width + x) * 4;

    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };

  for (let x = 0; x < width; x += 8) {
    push(x, 0);
    push(x, height - 1);
  }

  for (let y = 0; y < height; y += 8) {
    push(0, y);
    push(width - 1, y);
  }

  const median = (channel: 0 | 1 | 2): number =>
    samples.map((sample) => sample[channel]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];

  return [median(0), median(1), median(2)];
}

/**
 * Segments individual fighter poses in 2D via connected components (5x5 bridge)
 * so extended fists or kicks overlapping in X with the next pose never merge two
 * fighters into one frame. Small specks (< 15% of largest body area) are dropped.
 */
export function extractConnectedPoses(
  mask: Uint8Array,
  width: number,
  height: number
): { poses: Pose[]; labels: Int32Array } {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  const rawComps: Array<{
    label: number;
    x: number;
    y: number;
    width: number;
    height: number;
    area: number;
  }> = [];
  let nextLabel = 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || labels[start] !== 0) continue;
      const label = nextLabel++;
      let top = 0;
      stack[top++] = start;
      labels[start] = label;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;

      while (top > 0) {
        const idx = stack[--top];
        const cy = Math.floor(idx / width);
        const cx = idx - cy * width;
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -2; dy <= 2; dy += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -2; dx <= 2; dx += 1) {
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (mask[nIdx] && labels[nIdx] === 0) {
              labels[nIdx] = label;
              stack[top++] = nIdx;
            }
          }
        }
      }

      rawComps.push({
        label,
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area
      });
    }
  }

  const maxArea = Math.max(0, ...rawComps.map((c) => c.area));
  const major = rawComps.filter((c) => c.area >= maxArea * 0.14);

  // Reading order: top-to-bottom across vertical bands, left-to-right within each band
  major.sort((a, b) => {
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    const minH = Math.min(a.height, b.height);
    if (overlapY >= minH * 0.3) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  const poses: Pose[] = [];
  for (const comp of major) {
    const measured = measurePose(
      mask,
      width,
      comp.x,
      comp.x + comp.width,
      comp.y,
      comp.y + comp.height,
      labels,
      comp.label
    );
    if (measured) {
      poses.push({ ...measured, label: comp.label });
    }
  }

  return { poses, labels };
}

/** Split the image into equal-width cells and take the pose inside each. */
function splitEvenly(mask: Uint8Array, width: number, height: number, frames: number): Pose[] {
  const poses: Pose[] = [];

  for (let frame = 0; frame < frames; frame += 1) {
    const pose = measurePose(
      mask,
      width,
      Math.round((frame * width) / frames),
      Math.round(((frame + 1) * width) / frames),
      0,
      height
    );

    if (pose) {
      poses.push(pose);
    }
  }

  return poses;
}

/** Tight box, pixel count and feet centre of the pose inside a region. */
function measurePose(
  mask: Uint8Array,
  width: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
  labels?: Int32Array,
  targetLabel?: number
): Pose | null {
  let minX = right;
  let maxX = left - 1;
  let minY = bottom;
  let maxY = top - 1;
  let area = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const idx = y * width + x;
      const matches = labels && targetLabel !== undefined ? labels[idx] === targetLabel : Boolean(mask[idx]);
      if (matches) {
        area += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (area === 0) {
    return null;
  }

  const poseHeight = maxY - minY + 1;
  const feetTop = maxY - Math.max(2, Math.round(poseHeight * 0.1));
  let feetLeft = maxX;
  let feetRight = minX;

  for (let y = feetTop; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const idx = y * width + x;
      const matches = labels && targetLabel !== undefined ? labels[idx] === targetLabel : Boolean(mask[idx]);
      if (matches) {
        feetLeft = Math.min(feetLeft, x);
        feetRight = Math.max(feetRight, x);
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: poseHeight,
    area,
    feetX: (feetLeft + feetRight) / 2
  };
}
