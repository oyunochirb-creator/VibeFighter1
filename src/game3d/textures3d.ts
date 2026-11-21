import * as THREE from 'three';

function finalizeTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial ground contact shadow blob applied under fighters & props. */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Octagonal championship canvas mat texture. */
export function createOctagonMatTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#334155');
  grad.addColorStop(0.6, '#1e293b');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle canvas weave
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Center championship emblem circles
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.52)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 130, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(239, 68, 68, 0.58)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(248, 250, 252, 0.16)';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VIBE MMA', size / 2, size / 2);

  return finalizeTexture(canvas, anisotropy);
}

/** Mongol Steppe Naadam packed earth & grass circle texture. */
export function createSteppeGroundTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4c7c38';
  ctx.fillRect(0, 0, size, size);

  // Organic grass blades & earth speckles
  for (let i = 0; i < 1800; i += 1) {
    const x = (Math.sin(i * 19.3) * 0.5 + 0.5) * size;
    const y = (Math.cos(i * 37.7) * 0.5 + 0.5) * size;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(92, 145, 58, 0.55)' : 'rgba(54, 92, 37, 0.45)';
    ctx.fillRect(x, y, 4, 2);
  }

  // Center packed clay Naadam circle
  const earth = ctx.createRadialGradient(size / 2, size / 2, 24, size / 2, size / 2, 175);
  earth.addColorStop(0, '#b58d54');
  earth.addColorStop(0.75, '#9d753f');
  earth.addColorStop(1, 'rgba(76, 124, 56, 0)');
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 175, 0, Math.PI * 2);
  ctx.fill();

  return finalizeTexture(canvas, anisotropy);
}

/** Warm Hinoki cedar hardwood dojo plank floor texture. */
export function createDojoWoodTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#7c4e29';
  ctx.fillRect(0, 0, size, size);

  const plankHeight = 32;
  for (let y = 0; y < size; y += plankHeight) {
    const toneShift = ((y / plankHeight) % 3) * 8;
    ctx.fillStyle = `rgb(${120 + toneShift}, ${76 + Math.round(toneShift * 0.6)}, ${42 + Math.round(toneShift * 0.3)})`;
    ctx.fillRect(0, y, size, plankHeight - 2);

    ctx.fillStyle = '#472812';
    ctx.fillRect(0, y + plankHeight - 2, size, 2);

    const seamX = ((y * 7) % 240) + 80;
    ctx.fillRect(seamX, y, 2, plankHeight);
    ctx.fillRect((seamX + 256) % size, y, 2, plankHeight);
  }

  return finalizeTexture(canvas, anisotropy, 2, 2);
}

/** Reflective Cyber Colosseum dark hex-grid floor texture. */
export function createCyberGridTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070b18';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.lineWidth = 2;
  const step = 32;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(244, 63, 94, 0.72)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 165, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 128, 0, Math.PI * 2);
  ctx.stroke();

  return finalizeTexture(canvas, anisotropy);
}

/** Helipad concrete rooftop deck with yellow/black markings. */
export function createHelipadTexture(anisotropy: number, warmTint: boolean): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = warmTint ? '#3b333a' : '#262b38';
  ctx.fillRect(0, 0, size, size);

  // Subtle concrete grain
  for (let i = 0; i < 1200; i += 1) {
    const x = ((i * 73) % size);
    const y = ((i * 139) % size);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, 3, 3);
  }

  // Circle border
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 148, 0, Math.PI * 2);
  ctx.stroke();

  // Giant "H"
  ctx.fillStyle = 'rgba(250, 204, 21, 0.85)';
  ctx.fillRect(size / 2 - 54, size / 2 - 66, 22, 132);
  ctx.fillRect(size / 2 + 32, size / 2 - 66, 22, 132);
  ctx.fillRect(size / 2 - 54, size / 2 - 12, 108, 24);

  return finalizeTexture(canvas, anisotropy);
}
