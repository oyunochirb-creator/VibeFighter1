import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface RendererContext {
  renderer: THREE.WebGLRenderer;
  pmremGenerator: THREE.PMREMGenerator;
  envMap: THREE.Texture;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
  startLoop: (step: (dtSeconds: number, elapsedMs: number) => void) => () => void;
  dispose: () => void;
}

/**
 * Probes the browser WebGL2 renderer string so software renderers (SwiftShader,
 * llvmpipe, softpipe) run at safe pixelRatio/antialias/shadow settings without
 * stalling the GPU thread.
 */
export function detectSoftwareWebGl(canvas: HTMLCanvasElement): boolean {
  try {
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) {
      return true;
    }

    const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugExt) {
      return false;
    }

    const rendererName = String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) ?? '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName);
  } catch {
    return false;
  }
}

/**
 * Creates a calibrated Three.js WebGLRenderer with ACESFilmic tone mapping,
 * sRGB output, RoomEnvironment IBL reflections, and software-GL pacing support.
 */
export function createRendererContext(
  container: HTMLElement,
  scene: THREE.Scene,
  onContextLostChange?: (lost: boolean) => void
): RendererContext {
  const probeCanvas = document.createElement('canvas');
  const isSoftwareGl = detectSoftwareWebGl(probeCanvas);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    alpha: false
  });
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !isSoftwareGl;
  if (!isSoftwareGl) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const width = Math.max(320, container.clientWidth || window.innerWidth);
  const height = Math.max(240, container.clientHeight || window.innerHeight);
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  roomEnv.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.72;

  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    onContextLostChange?.(true);
  };
  const handleContextRestored = (): void => {
    onContextLostChange?.(false);
  };
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

  const startLoop = (step: (dtSeconds: number, elapsedMs: number) => void): (() => void) => {
    let disposed = false;
    let rafId = 0;
    let timerId = 0;
    let lastTime = performance.now();
    const startTime = lastTime;

    const afterDraw = (callback: () => void): void => {
      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(callback);
        return;
      }

      const gl = renderer.getContext() as WebGL2RenderingContext | null;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl.flush();
          const poll = (): void => {
            if (disposed) {
              gl.deleteSync(sync);
              return;
            }
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED || status === gl.WAIT_FAILED) {
              gl.deleteSync(sync);
              timerId = window.setTimeout(callback, 65);
            } else {
              timerId = window.setTimeout(poll, 10);
            }
          };
          timerId = window.setTimeout(poll, 16);
          return;
        }
      }

      timerId = window.setTimeout(callback, 80);
    };

    const tick = (): void => {
      if (disposed) {
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      step(dt, now - startTime);
      afterDraw(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  };

  const dispose = (): void => {
    renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
    envTarget.dispose();
    pmremGenerator.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    pmremGenerator,
    envMap: envTarget.texture,
    isSoftwareGl,
    maxAnisotropy,
    startLoop,
    dispose
  };
}

/**
 * Recursively disposes geometries, materials, and embedded textures on a removed
 * 3D subtree so arena & fighter swaps never leak GPU memory.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (typeof obj.userData?.onDispose === 'function') {
      (obj.userData.onDispose as () => void)();
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (!mat) {
      return;
    }
    const materials = Array.isArray(mat) ? mat : [mat];
    for (const m of materials) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture && !value.userData?.shared) {
          value.dispose();
        }
      }
      m.dispose();
    }
  });
}
