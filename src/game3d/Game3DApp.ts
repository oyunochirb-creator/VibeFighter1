import * as THREE from 'three';

import { FIGHTER_CHARACTER_DEFINITIONS } from '../game/hero';
import { getStageDefinition, STAGE_DEFINITIONS } from '../game/stageConfig';
import type { GameSettings, MatchMode } from '../game/types';
import type { Store } from '../game/store';
import { buildArena3D, type Arena3DInstance } from './arenas3d';
import { Game3DAudio } from './audio3d';
import { Match3DSimulation } from './combat3d';
import { createFighterRig3D, type FighterRig3D } from './fighterRig3d';
import { createRendererContext, disposeObject3D, type RendererContext } from './rendererSetup';
import { createContactShadowTexture } from './textures3d';
import { UIOverlay3D, type OverlayState, type Screen3D } from './uiOverlay';
import { Vfx3DManager } from './vfx3d';

/**
 * Root 3D Application driving a continuous WebGL Three.js viewport across all
 * screens (Splash, Main Menu, Mode Select, Live 3D Stage Preview, Dual-Pedestal
 * 68-Fighter 3D Roster Showcase, Settings, and Real-Time 3D Arena Combat).
 */
export class Game3DApp {
  private readonly container: HTMLElement;
  private readonly settingsStore: Store<GameSettings>;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rendererCtx: RendererContext;
  private readonly audio: Game3DAudio;
  private readonly vfx: Vfx3DManager;
  private readonly overlay: UIOverlay3D;
  private readonly contactShadowTex: THREE.CanvasTexture;
  private readonly resizeObserver: ResizeObserver;
  private readonly _projVec = new THREE.Vector3();

  private arena: Arena3DInstance | null = null;
  private showcaseRig1: FighterRig3D | null = null;
  private showcaseRig2: FighterRig3D | null = null;
  private matchSim: Match3DSimulation | null = null;
  private stopLoop: (() => void) | null = null;
  private unsubSettings: () => void;

  private state: OverlayState = {
    screen: 'splash',
    mode: '1vcpu',
    stageId: STAGE_DEFINITIONS[0].id,
    p1CharacterId: 'mongol-bokh',
    p2CharacterId: 'bayasaa',
    pickingSlot: 1,
    category: 'all',
    settings: { musicVolume: 0.7, sfxVolume: 0.85, muted: false },
    contextLost: false,
    controlsExpanded: false
  };

  constructor(container: HTMLElement, settingsStore: Store<GameSettings>) {
    this.container = container;
    this.settingsStore = settingsStore;
    this.state.settings = settingsStore.getState();

    this.scene = new THREE.Scene();
    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 140);
    this.camera.position.set(0, 2.3, 7.6);

    this.rendererCtx = createRendererContext(container, this.scene, (lost) => {
      this.state.contextLost = lost;
      this.overlay.render(this.state);
    });

    this.contactShadowTex = createContactShadowTexture();
    this.contactShadowTex.userData.shared = true;
    this.audio = new Game3DAudio(settingsStore);
    this.vfx = new Vfx3DManager(this.scene);

    this.overlay = new UIOverlay3D(container, {
      goToScreen: (screen) => this.navigateTo(screen),
      selectMode: (mode) => this.handleSelectMode(mode),
      previewStage: (stageId) => this.loadArena(stageId, false),
      confirmStage: (stageId) => this.handleConfirmStage(stageId),
      setCategory: (category) => {
        this.state.category = category;
        this.overlay.render(this.state);
      },
      setPickingSlot: (slot) => {
        this.audio.playUiConfirm();
        this.state.pickingSlot = slot;
        this.overlay.render(this.state);
      },
      previewCharacter: (characterId) => this.handlePreviewCharacter(characterId),
      pickCharacter: (characterId) => this.handlePickCharacter(characterId),
      randomizeFighters: () => this.handleRandomize(),
      startMatch: () => this.startMatch(),
      rematch: () => this.startMatch(),
      updateSettings: (patch) => this.settingsStore.patchState(patch),
      resetSettings: () => this.settingsStore.setState({ sfxVolume: 0.85, musicVolume: 0.7, muted: false }),
      toggleControls: () => {
        this.state.controlsExpanded = !this.state.controlsExpanded;
        this.overlay.render(this.state);
      }
    });

    this.unsubSettings = this.settingsStore.subscribe((next) => {
      this.state.settings = next;
      if (this.state.screen === 'settings') {
        this.overlay.render(this.state);
      }
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.loadArena(this.state.stageId, false);
    this.rebuildShowcaseFighters();
    this.overlay.render(this.state);
    this.audio.setMusicMood('preFight');

    this.stopLoop = this.rendererCtx.startLoop((dt, elapsedMs) => this.tick(dt, elapsedMs));
  }

  private handleResize(): void {
    const w = Math.max(320, this.container.clientWidth || window.innerWidth);
    const h = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rendererCtx.renderer.setSize(w, h, false);
  }

  private loadArena(stageId: string, updateState = true): void {
    const resolved = getStageDefinition(stageId).id;
    if (updateState) {
      this.state.stageId = resolved;
    }
    if (this.arena && this.arena.stageId === resolved) {
      return;
    }

    if (this.arena) {
      this.scene.remove(this.arena.group);
      disposeObject3D(this.arena.group);
      this.arena = null;
    }

    const built = buildArena3D(resolved, this.rendererCtx.maxAnisotropy, !this.rendererCtx.isSoftwareGl);
    this.arena = built;
    this.scene.background = new THREE.Color(built.backgroundColor);
    this.scene.fog = new THREE.Fog(built.fogColor, built.fogNear, built.fogFar);
    this.scene.add(built.group);
  }

  private clearShowcaseFighters(): void {
    if (this.showcaseRig1) {
      this.scene.remove(this.showcaseRig1.root);
      disposeObject3D(this.showcaseRig1.root);
      this.showcaseRig1 = null;
    }
    if (this.showcaseRig2) {
      this.scene.remove(this.showcaseRig2.root);
      disposeObject3D(this.showcaseRig2.root);
      this.showcaseRig2 = null;
    }
  }

  private rebuildShowcaseFighters(): void {
    this.clearShowcaseFighters();
    this.showcaseRig1 = createFighterRig3D(this.state.p1CharacterId, this.contactShadowTex);
    this.showcaseRig1.root.position.set(-1.95, 0, 0);
    this.showcaseRig1.setFacing(1);
    this.scene.add(this.showcaseRig1.root);

    this.showcaseRig2 = createFighterRig3D(this.state.p2CharacterId, this.contactShadowTex);
    this.showcaseRig2.root.position.set(1.95, 0, 0);
    this.showcaseRig2.setFacing(-1);
    this.scene.add(this.showcaseRig2.root);
  }

  private navigateTo(screen: Screen3D): void {
    this.audio.playUiConfirm();
    this.matchSim?.clearKeys();
    this.matchSim = null;
    this.vfx.clear();

    this.state.screen = screen;
    if (screen !== 'match') {
      this.audio.setMusicMood('preFight');
      this.loadArena(this.state.stageId, false);
      this.rebuildShowcaseFighters();
    }
    this.overlay.render(this.state);
  }

  private handleSelectMode(mode: MatchMode): void {
    this.audio.playUiConfirm();
    this.state.mode = mode;
    this.state.pickingSlot = 1;
    this.navigateTo('stage');
  }

  private handleConfirmStage(stageId: string): void {
    this.audio.playUiConfirm();
    this.state.stageId = stageId;
    this.loadArena(stageId, true);
    this.navigateTo('character');
  }

  private handlePreviewCharacter(characterId: string): void {
    if (this.state.pickingSlot === 1) {
      if (this.state.p1CharacterId !== characterId) {
        this.state.p1CharacterId = characterId;
        this.rebuildShowcaseFighters();
      }
    } else if (this.state.p2CharacterId !== characterId) {
      this.state.p2CharacterId = characterId;
      this.rebuildShowcaseFighters();
    }
  }

  private handlePickCharacter(characterId: string): void {
    this.audio.playUiConfirm();
    if (this.state.pickingSlot === 1) {
      this.state.p1CharacterId = characterId;
      this.state.pickingSlot = 2;
    } else {
      this.state.p2CharacterId = characterId;
    }
    this.rebuildShowcaseFighters();
    this.overlay.render(this.state);
  }

  private handleRandomize(): void {
    this.audio.playUiConfirm();
    const list = FIGHTER_CHARACTER_DEFINITIONS;
    const p1 = list[Math.floor(Math.random() * list.length)].id;
    const p2 = list[Math.floor(Math.random() * list.length)].id;
    this.state.p1CharacterId = p1;
    this.state.p2CharacterId = p2;
    this.rebuildShowcaseFighters();
    this.overlay.render(this.state);
  }

  private startMatch(): void {
    this.audio.playUiConfirm();
    this.state.screen = 'match';
    this.vfx.clear();
    this.loadArena(this.state.stageId, true);
    this.rebuildShowcaseFighters();

    this.matchSim = new Match3DSimulation(
      {
        mode: this.state.mode,
        stageId: this.state.stageId,
        p1CharacterId: this.state.p1CharacterId,
        p2CharacterId: this.state.p2CharacterId
      },
      this.showcaseRig1!,
      this.showcaseRig2!,
      {
        characterId: this.state.p1CharacterId,
        stats: {},
        combat: {},
        bounds: { visual: false, collision: false, hit: false, attack: false, guard: false },
        reverseWalk: false,
        fillSpecial: false,
        saveStatus: ''
      },
      this.vfx,
      this.audio
    );
    this.overlay.render(this.state);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.state.screen === 'match' && this.matchSim) {
      if (event.code === 'Escape') {
        this.navigateTo('menu');
        return;
      }
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)
      ) {
        event.preventDefault();
      }
      this.matchSim.onKeyDown(event.code);
      return;
    }

    if (event.code === 'Enter' || event.code === 'Space') {
      if (this.state.screen === 'splash') {
        event.preventDefault();
        this.navigateTo('menu');
      } else if (this.state.screen === 'menu') {
        event.preventDefault();
        this.navigateTo('mode');
      } else if (this.state.screen === 'stage') {
        event.preventDefault();
        this.handleConfirmStage(this.state.stageId);
      } else if (this.state.screen === 'character') {
        event.preventDefault();
        this.startMatch();
      }
    } else if (event.code === 'Escape') {
      if (this.state.screen === 'mode' || this.state.screen === 'settings') {
        this.navigateTo('menu');
      } else if (this.state.screen === 'stage') {
        this.navigateTo('mode');
      } else if (this.state.screen === 'character') {
        this.navigateTo('stage');
      }
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.matchSim?.onKeyUp(event.code);
  };

  private projectToScreen = (wx: number, wy: number): { x: number; y: number } | null => {
    this._projVec.set(wx, wy, 0);
    this._projVec.project(this.camera);
    if (this._projVec.z > 1) {
      return null;
    }
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    return {
      x: (this._projVec.x * 0.5 + 0.5) * w,
      y: (-this._projVec.y * 0.5 + 0.5) * h
    };
  };

  private tick(dt: number, elapsedMs: number): void {
    const elapsedSec = elapsedMs / 1000;
    this.arena?.update(dt, elapsedSec);
    this.vfx.update(dt);

    if (this.state.screen === 'match' && this.matchSim) {
      this.matchSim.update(dt, this.camera);
      this.overlay.updateHud(
        this.matchSim.getSnapshot(),
        this.vfx.getCallouts(),
        this.projectToScreen,
        this.state.p1CharacterId,
        this.state.p2CharacterId
      );
    } else {
      this.updateShowcaseCameraAndFighters(dt, elapsedSec);
    }

    this.rendererCtx.renderer.render(this.scene, this.camera);
  }

  private updateShowcaseCameraAndFighters(dt: number, elapsedSec: number): void {
    const r1 = this.showcaseRig1;
    const r2 = this.showcaseRig2;
    const isChar = this.state.screen === 'character';
    const isStage = this.state.screen === 'stage';
    const isMenu = this.state.screen === 'menu' || this.state.screen === 'settings';

    if (r1 && r2) {
      r1.root.visible = !isStage;
      r2.root.visible = !isStage;

      if (isChar) {
        r1.root.position.set(-1.65, 0, 0.3);
        r2.root.position.set(1.65, 0, 0.3);
        r1.setTurntableYaw(Math.PI * 0.16 + Math.sin(elapsedSec * 0.9) * 0.45);
        r2.setTurntableYaw(-Math.PI * 0.16 - Math.sin(elapsedSec * 0.9) * 0.45);
      } else {
        r1.root.position.set(-1.95, 0, 0);
        r2.root.position.set(1.95, 0, 0);
        r1.setFacing(1);
        r2.setFacing(-1);
      }
      r1.updatePose(dt, 'idle', 0, elapsedSec, 0, 1);
      r2.updatePose(dt, 'idle', 0, elapsedSec + 1.4, 0, 1);
    }

    let camX = Math.sin(elapsedSec * 0.25) * 1.4;
    let camY = 2.15;
    let camZ = 6.9;
    let lookX = 0;
    let lookY = 1.05;

    if (isStage) {
      camX = Math.sin(elapsedSec * 0.35) * 4.8;
      camY = 3.2;
      camZ = 8.4 + Math.cos(elapsedSec * 0.35) * 1.6;
      lookY = 0.8;
    } else if (isChar) {
      camX = 0;
      camY = 1.72;
      camZ = 5.45;
      lookY = 0.95;
    } else if (isMenu) {
      camX = 1.5 + Math.sin(elapsedSec * 0.28) * 0.7;
      camY = 2.05;
      camZ = 6.8;
      lookX = -0.8;
    }

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX, 4.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camY, 4.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, camZ, 4.5, dt);
    this.camera.lookAt(lookX, lookY, 0);
  }

  dispose(): void {
    this.stopLoop?.();
    this.unsubSettings();
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.vfx.clear();
    this.clearShowcaseFighters();
    if (this.arena) {
      this.scene.remove(this.arena.group);
      disposeObject3D(this.arena.group);
    }
    this.contactShadowTex.dispose();
    this.audio.dispose();
    this.overlay.destroy();
    this.rendererCtx.dispose();
  }
}
