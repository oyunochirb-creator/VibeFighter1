import { FIGHTER_CHARACTER_DEFINITIONS } from '../game/hero';
import { STAGE_DEFINITIONS } from '../game/stageConfig';
import {
  getMartialArtMeta,
  MARTIAL_ART_CATEGORIES,
  type MartialArtCategoryId
} from '../game/worldMartialArts';
import type { GameSettings, MatchMode } from '../game/types';
import type { MatchHudSnapshot } from './combat3d';
import type { CalloutItem } from './vfx3d';

export type Screen3D =
  | 'splash'
  | 'menu'
  | 'mode'
  | 'stage'
  | 'character'
  | 'settings'
  | 'match';

export interface OverlayState {
  screen: Screen3D;
  mode: MatchMode;
  stageId: string;
  p1CharacterId: string;
  p2CharacterId: string;
  pickingSlot: 1 | 2;
  category: MartialArtCategoryId;
  settings: GameSettings;
  contextLost: boolean;
  controlsExpanded: boolean;
}

export interface OverlayActions {
  goToScreen: (screen: Screen3D) => void;
  selectMode: (mode: MatchMode) => void;
  previewStage: (stageId: string) => void;
  confirmStage: (stageId: string) => void;
  setCategory: (category: MartialArtCategoryId) => void;
  setPickingSlot: (slot: 1 | 2) => void;
  previewCharacter: (characterId: string) => void;
  pickCharacter: (characterId: string) => void;
  randomizeFighters: () => void;
  startMatch: () => void;
  rematch: () => void;
  updateSettings: (patch: Partial<GameSettings>) => void;
  resetSettings: () => void;
  toggleControls: () => void;
}

function fighterLabel(characterId: string): { name: string; sub: string; color: string } {
  const def = FIGHTER_CHARACTER_DEFINITIONS.find((c) => c.id === characterId);
  const meta = getMartialArtMeta(characterId);
  const name = meta?.label ?? def?.label ?? characterId;
  const sub = meta ? `${meta.countryMn} · ${meta.animalMn}` : 'Тулаанч';
  const color = meta ? `#${meta.primaryColor.toString(16).padStart(6, '0')}` : '#38bdf8';
  return { name, sub, color };
}

function getFilteredCharacters(category: MartialArtCategoryId) {
  if (category === 'all') {
    return FIGHTER_CHARACTER_DEFINITIONS;
  }
  return FIGHTER_CHARACTER_DEFINITIONS.filter((def) => {
    const meta = getMartialArtMeta(def.id);
    if (meta) {
      return meta.categories.includes(category);
    }
    return category === 'hybrid';
  });
}

/**
 * Semantic DOM overlay manager rendered cleanly atop the full-bleed Three.js
 * 3D WebGL viewport without `backdrop-filter` blur passes.
 */
export class UIOverlay3D {
  private readonly root: HTMLElement;
  private readonly actions: OverlayActions;
  private calloutLayer: HTMLElement | null = null;
  private hudRefs: {
    p1Hp: HTMLElement;
    p1HpTrail: HTMLElement;
    p2Hp: HTMLElement;
    p2HpTrail: HTMLElement;
    p1Meter: HTMLElement;
    p2Meter: HTMLElement;
    p1Rage: HTMLElement;
    p2Rage: HTMLElement;
    timer: HTMLElement;
    roundLabel: HTMLElement;
    p1Pips: HTMLElement;
    p2Pips: HTMLElement;
    bannerWrap: HTMLElement;
    banner: HTMLElement;
    bannerSub: HTMLElement;
    cutIn: HTMLElement;
    cutInTitle: HTMLElement;
    cutInSub: HTMLElement;
    ultBanner: HTMLElement;
    winnerBanner: HTMLElement;
    winnerBannerTitle: HTMLElement;
    winnerBannerSub: HTMLElement;
    winnerBannerName: HTMLElement;
    matchOverModal: HTMLElement;
    matchOverWinner: HTMLElement;
  } | null = null;

  constructor(container: HTMLElement, actions: OverlayActions) {
    this.root = document.createElement('div');
    this.root.className = 'vf3d-overlay';
    container.appendChild(this.root);
    this.actions = actions;
  }

  render(state: OverlayState): void {
    this.hudRefs = null;
    this.calloutLayer = null;

    if (state.contextLost) {
      this.root.innerHTML = `
        <div class="vf3d-center-card">
          <h2>WebGL Context Paused</h2>
          <p>3D график орчин түр сэргээгдэж байна...</p>
        </div>
      `;
      return;
    }

    switch (state.screen) {
      case 'splash':
        this.renderSplash();
        break;
      case 'menu':
        this.renderMenu();
        break;
      case 'mode':
        this.renderModeSelect(state.mode);
        break;
      case 'stage':
        this.renderStageSelect(state.stageId);
        break;
      case 'character':
        this.renderCharacterSelect(state);
        break;
      case 'settings':
        this.renderSettings(state.settings);
        break;
      case 'match':
        this.renderMatchHud(state);
        break;
    }
  }

  private renderSplash(): void {
    this.root.innerHTML = `
      <div class="vf3d-splash">
        <div class="vf3d-splash__badge">KING OF IRON FIST 3D · 68 MARTIAL ARTS</div>
        <h1 class="vf3d-title">VIBE FIGHTER <span>7</span></h1>
        <p class="vf3d-subtitle">3D Sidestep · Rage Art · Slow-Mo K.O. · 68 тулааны урлаг · 6 талбар</p>
        <button class="vf3d-btn vf3d-btn--primary" data-action="enter-menu">ЭХЛЭХ (PRESS ENTER)</button>
      </div>
    `;
    this.root.querySelector('[data-action="enter-menu"]')?.addEventListener('click', () => {
      this.actions.goToScreen('menu');
    });
  }

  private renderMenu(): void {
    this.root.innerHTML = `
      <div class="vf3d-menu-wrap">
        <div class="vf3d-menu-panel">
          <div class="vf3d-splash__badge">IRON FIST EDITION</div>
          <h1 class="vf3d-title vf3d-title--sm">VIBE FIGHTER <span>7</span></h1>
          <p class="vf3d-subtitle">Үндсэн цэс · 3D Sidestep болон Rage Art тулаан</p>
          <div class="vf3d-menu-actions">
            <button class="vf3d-btn vf3d-btn--primary" data-action="play">ТУЛАЛДАХ (VS BATTLE)</button>
            <button class="vf3d-btn" data-action="stages">ТАЛБАР ҮЗЭХ (STAGES)</button>
            <button class="vf3d-btn" data-action="settings">ТОХИРГОО (SETTINGS)</button>
          </div>
          <div class="vf3d-menu-foot">Enter / Space — сонгох · Дэлгэц дээр 3D тулаанчид бэлдэж байна</div>
        </div>
      </div>
    `;
    this.root.querySelector('[data-action="play"]')?.addEventListener('click', () => this.actions.goToScreen('mode'));
    this.root.querySelector('[data-action="stages"]')?.addEventListener('click', () => this.actions.goToScreen('stage'));
    this.root.querySelector('[data-action="settings"]')?.addEventListener('click', () => this.actions.goToScreen('settings'));
  }

  private renderModeSelect(currentMode: MatchMode): void {
    this.root.innerHTML = `
      <div class="vf3d-top-bar">
        <button class="vf3d-btn vf3d-btn--ghost" data-action="back">← БУЦАХ</button>
        <span class="vf3d-bar-title">ТОГЛОЛТЫН ГОРИМ СОНГОХ</span>
        <span></span>
      </div>
      <div class="vf3d-mode-grid">
        <button class="vf3d-card ${currentMode === '1vcpu' ? 'is-selected' : ''}" data-mode="1vcpu">
          <span class="vf3d-card__tag">SINGLE PLAYER</span>
          <strong>1 VS CPU</strong>
          <small>Хиймэл оюун ухааны эсрэг 3D тулаан</small>
        </button>
        <button class="vf3d-card ${currentMode === '1v1' ? 'is-selected' : ''}" data-mode="1v1">
          <span class="vf3d-card__tag">LOCAL VERSUS</span>
          <strong>1 VS 1</strong>
          <small>Нэг гар дээр хоёр тоглогчийн тулаан</small>
        </button>
      </div>
    `;
    this.root.querySelector('[data-action="back"]')?.addEventListener('click', () => this.actions.goToScreen('menu'));
    this.root.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = el.dataset.mode as MatchMode;
        this.actions.selectMode(mode);
      });
    });
  }

  private renderStageSelect(stageId: string): void {
    const active = STAGE_DEFINITIONS.find((s) => s.id === stageId) ?? STAGE_DEFINITIONS[0];
    this.root.innerHTML = `
      <div class="vf3d-top-bar">
        <button class="vf3d-btn vf3d-btn--ghost" data-action="back">← БУЦАХ</button>
        <span class="vf3d-bar-title">3D ТУЛААНЫ ТАЛБАР — ${active.label.toUpperCase()}</span>
        <button class="vf3d-btn vf3d-btn--primary" data-action="confirm">СОНГОХ →</button>
      </div>
      <div class="vf3d-bottom-dock">
        <div class="vf3d-stage-strip">
          ${STAGE_DEFINITIONS.map(
            (s, i) => `
              <button class="vf3d-stage-chip ${s.id === stageId ? 'is-selected' : ''}" data-stage="${s.id}">
                <span>0${i + 1}</span>
                <strong>${s.label}</strong>
              </button>
            `
          ).join('')}
        </div>
      </div>
    `;

    this.root.querySelector('[data-action="back"]')?.addEventListener('click', () => this.actions.goToScreen('mode'));
    this.root.querySelector('[data-action="confirm"]')?.addEventListener('click', () => this.actions.confirmStage(stageId));
    this.root.querySelectorAll<HTMLElement>('[data-stage]').forEach((el) => {
      const id = el.dataset.stage!;
      el.addEventListener('mouseenter', () => this.actions.previewStage(id));
      el.addEventListener('click', () => this.actions.confirmStage(id));
    });
  }

  private renderCharacterSelect(state: OverlayState): void {
    const p1Info = fighterLabel(state.p1CharacterId);
    const p2Info = fighterLabel(state.p2CharacterId);
    const list = getFilteredCharacters(state.category);

    this.root.innerHTML = `
      <div class="vf3d-top-bar">
        <button class="vf3d-btn vf3d-btn--ghost" data-action="back">← ТАЛБАР</button>
        <span class="vf3d-bar-title">68 ТУЛААНЧААС СОНГОХ (3D ЗАГВАР)</span>
        <div class="vf3d-row-actions">
          <button class="vf3d-btn" data-action="random">САНАМСАРГҮЙ</button>
          <button class="vf3d-btn vf3d-btn--primary" data-action="fight">ТУЛАЛДАХ!</button>
        </div>
      </div>

      <div class="vf3d-char-banners">
        <button class="vf3d-fighter-badge ${state.pickingSlot === 1 ? 'is-picking' : ''}" data-slot="1" style="--accent-c:${p1Info.color}">
          <span class="vf3d-slot-tag">P1 ${state.pickingSlot === 1 ? '▸ СОНГОЖ БАЙНА' : ''}</span>
          <strong>${p1Info.name}</strong>
          <small>${p1Info.sub}</small>
        </button>
        <button class="vf3d-fighter-badge ${state.pickingSlot === 2 ? 'is-picking' : ''}" data-slot="2" style="--accent-c:${p2Info.color}">
          <span class="vf3d-slot-tag">${state.mode === '1vcpu' ? 'CPU' : 'P2'} ${state.pickingSlot === 2 ? '▸ СОНГОЖ БАЙНА' : ''}</span>
          <strong>${p2Info.name}</strong>
          <small>${p2Info.sub}</small>
        </button>
      </div>

      <div class="vf3d-bottom-dock vf3d-char-dock">
        <div class="vf3d-cat-tabs">
          ${MARTIAL_ART_CATEGORIES.map(
            (cat) => `
              <button class="vf3d-tab ${state.category === cat.id ? 'is-active' : ''}" data-cat="${cat.id}">
                ${cat.label}
              </button>
            `
          ).join('')}
        </div>
        <div class="vf3d-roster-grid">
          ${list
            .map((char) => {
              const meta = getMartialArtMeta(char.id);
              const color = meta ? `#${meta.primaryColor.toString(16).padStart(6, '0')}` : '#38bdf8';
              const isP1 = state.p1CharacterId === char.id;
              const isP2 = state.p2CharacterId === char.id;
              return `
                <button class="vf3d-roster-item ${isP1 ? 'is-p1' : ''} ${isP2 ? 'is-p2' : ''}" data-char="${char.id}" style="--item-c:${color}">
                  <span class="vf3d-roster-code">${meta?.countryCode ?? 'MMA'}</span>
                  <strong class="vf3d-roster-name">${meta?.label ?? char.label}</strong>
                  <span class="vf3d-roster-animal">${meta?.animalMn ?? 'Тулаанч'}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    this.root.querySelector('[data-action="back"]')?.addEventListener('click', () => this.actions.goToScreen('stage'));
    this.root.querySelector('[data-action="random"]')?.addEventListener('click', () => this.actions.randomizeFighters());
    this.root.querySelector('[data-action="fight"]')?.addEventListener('click', () => this.actions.startMatch());

    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.addEventListener('click', () => this.actions.setPickingSlot(Number(el.dataset.slot) as 1 | 2));
    });
    this.root.querySelectorAll<HTMLElement>('[data-cat]').forEach((el) => {
      el.addEventListener('click', () => this.actions.setCategory(el.dataset.cat as MartialArtCategoryId));
    });
    this.root.querySelectorAll<HTMLElement>('[data-char]').forEach((el) => {
      const id = el.dataset.char!;
      el.addEventListener('mouseenter', () => this.actions.previewCharacter(id));
      el.addEventListener('click', () => this.actions.pickCharacter(id));
    });
  }

  private renderSettings(settings: GameSettings): void {
    this.root.innerHTML = `
      <div class="vf3d-top-bar">
        <button class="vf3d-btn vf3d-btn--ghost" data-action="back">← ЦЭС</button>
        <span class="vf3d-bar-title">ДУУ БОЛОН ТОХИРГОО</span>
        <span></span>
      </div>
      <div class="vf3d-center-card">
        <label class="vf3d-slider-row">
          <span>Хөгжмийн дуу (Music)</span>
          <input type="range" min="0" max="1" step="0.05" value="${settings.musicVolume}" data-setting="music" />
          <strong>${Math.round(settings.musicVolume * 100)}%</strong>
        </label>
        <label class="vf3d-slider-row">
          <span>Эффект дуу (SFX)</span>
          <input type="range" min="0" max="1" step="0.05" value="${settings.sfxVolume}" data-setting="sfx" />
          <strong>${Math.round(settings.sfxVolume * 100)}%</strong>
        </label>
        <div class="vf3d-row-actions">
          <button class="vf3d-btn ${settings.muted ? 'vf3d-btn--hot' : ''}" data-action="mute">
            ${settings.muted ? 'ДУУ ХААСАН (MUTED)' : 'ДУУ НЭЭЛТТЭЙ'}
          </button>
          <button class="vf3d-btn" data-action="reset">АНХНЫ БАЙДАЛ</button>
        </div>
      </div>
    `;

    this.root.querySelector('[data-action="back"]')?.addEventListener('click', () => this.actions.goToScreen('menu'));
    this.root.querySelector('[data-action="mute"]')?.addEventListener('click', () =>
      this.actions.updateSettings({ muted: !settings.muted })
    );
    this.root.querySelector('[data-action="reset"]')?.addEventListener('click', () => this.actions.resetSettings());
    this.root.querySelector<HTMLInputElement>('[data-setting="music"]')?.addEventListener('input', (e) => {
      this.actions.updateSettings({ musicVolume: Number((e.target as HTMLInputElement).value) });
    });
    this.root.querySelector<HTMLInputElement>('[data-setting="sfx"]')?.addEventListener('input', (e) => {
      this.actions.updateSettings({ sfxVolume: Number((e.target as HTMLInputElement).value) });
    });
  }

  private renderMatchHud(state: OverlayState): void {
    const p1 = fighterLabel(state.p1CharacterId);
    const p2 = fighterLabel(state.p2CharacterId);

    this.root.innerHTML = `
      <div class="vf3d-hud">
        <div class="vf3d-hud-top">
          <div class="vf3d-hud-side vf3d-hud-side--left">
            <div class="vf3d-hud-meta">
              <strong style="color:${p1.color}">${p1.name}</strong>
              <span>${p1.sub}</span>
              <div class="vf3d-pips" data-ref="p1-pips"></div>
              <span class="vf3d-rage-badge" data-ref="p1-rage" hidden>RAGE!</span>
            </div>
            <div class="vf3d-hp-track vf3d-hp-track--p1">
              <div class="vf3d-hp-trail vf3d-hp-trail--p1" data-ref="p1-hp-trail"></div>
              <div class="vf3d-hp-fill vf3d-hp-fill--p1" data-ref="p1-hp"></div>
            </div>
            <div class="vf3d-meter-track vf3d-meter-track--p1">
              <div class="vf3d-meter-fill" data-ref="p1-meter"></div>
            </div>
          </div>

          <div class="vf3d-hud-clock">
            <span data-ref="round-label">R1</span>
            <strong data-ref="timer">60</strong>
          </div>

          <div class="vf3d-hud-side vf3d-hud-side--right">
            <div class="vf3d-hud-meta">
              <span class="vf3d-rage-badge" data-ref="p2-rage" hidden>RAGE!</span>
              <div class="vf3d-pips" data-ref="p2-pips"></div>
              <span>${p2.sub}</span>
              <strong style="color:${p2.color}">${p2.name}</strong>
            </div>
            <div class="vf3d-hp-track vf3d-hp-track--p2">
              <div class="vf3d-hp-trail vf3d-hp-trail--p2" data-ref="p2-hp-trail"></div>
              <div class="vf3d-hp-fill vf3d-hp-fill--p2" data-ref="p2-hp"></div>
            </div>
            <div class="vf3d-meter-track vf3d-meter-track--p2">
              <div class="vf3d-meter-fill" data-ref="p2-meter"></div>
            </div>
          </div>
        </div>

        <div class="vf3d-callout-layer" data-ref="callouts"></div>
        <div class="vf3d-banner-wrap" data-ref="banner-wrap" hidden>
          <div class="vf3d-banner-sub" data-ref="banner-sub" hidden></div>
          <div class="vf3d-banner" data-ref="banner"></div>
        </div>
        <div class="vf3d-ult-banner" data-ref="ult-banner" hidden></div>

        <div class="vf3d-winner-banner" data-ref="winner-banner" hidden>
          <div class="vf3d-winner-banner__ribbon">
            <span class="vf3d-winner-banner__tag" data-ref="winner-banner-sub"></span>
            <strong class="vf3d-winner-banner__title" data-ref="winner-banner-title">WINNER</strong>
            <div class="vf3d-winner-banner__name" data-ref="winner-banner-name"></div>
          </div>
        </div>

        <div class="vf3d-cutin" data-ref="cutin" hidden>
          <strong data-ref="cutin-title"></strong>
          <span data-ref="cutin-sub"></span>
        </div>

        <div class="vf3d-match-over" data-ref="match-over" hidden>
          <div class="vf3d-center-card">
            <span class="vf3d-splash__badge">MATCH COMPLETE</span>
            <h2 data-ref="winner-text">P1 WINS!</h2>
            <div class="vf3d-row-actions">
              <button class="vf3d-btn vf3d-btn--primary" data-action="rematch">ДАХИН ТУЛАЛДАХ</button>
              <button class="vf3d-btn" data-action="chars">ТУЛААНЧ СОЛИХ</button>
              <button class="vf3d-btn vf3d-btn--ghost" data-action="menu">ҮНДСЭН ЦЭС</button>
            </div>
          </div>
        </div>

        <div class="vf3d-hud-foot">
          <button class="vf3d-btn vf3d-btn--sm" data-action="exit-match">✕ ГАРАХ</button>
          <button class="vf3d-btn vf3d-btn--sm" data-action="toggle-help">? УДИРДЛАГА</button>
        </div>

        ${
          state.controlsExpanded
            ? `
          <div class="vf3d-controls-box">
            <div><strong>P1:</strong> A/D Хөдлөх · <strong>Q/Z</strong> 3D Хажуу шилжилт (Sidestep) · W Үсрэх · S Суух · C Хаах · F Цохих · G Өшиглөх · E Шидэх · V Супер / <strong>Rage Art</strong> · <strong>L / H</strong> Ultimate</div>
            <div><strong>P2 (1v1):</strong> ←/→ Хөдлөх · <strong>[ / N</strong> 3D Sidestep · ↑ Үсрэх · ↓ Суух · M Хаах · , Цохих · . Өшиглөх · K Шидэх · / Супер / Rage Art · <strong>;</strong> Ultimate</div>
          </div>
        `
            : ''
        }
      </div>
    `;

    this.calloutLayer = this.root.querySelector('[data-ref="callouts"]');
    this.hudRefs = {
      p1Hp: this.root.querySelector('[data-ref="p1-hp"]')!,
      p1HpTrail: this.root.querySelector('[data-ref="p1-hp-trail"]')!,
      p2Hp: this.root.querySelector('[data-ref="p2-hp"]')!,
      p2HpTrail: this.root.querySelector('[data-ref="p2-hp-trail"]')!,
      p1Meter: this.root.querySelector('[data-ref="p1-meter"]')!,
      p2Meter: this.root.querySelector('[data-ref="p2-meter"]')!,
      p1Rage: this.root.querySelector('[data-ref="p1-rage"]')!,
      p2Rage: this.root.querySelector('[data-ref="p2-rage"]')!,
      timer: this.root.querySelector('[data-ref="timer"]')!,
      roundLabel: this.root.querySelector('[data-ref="round-label"]')!,
      p1Pips: this.root.querySelector('[data-ref="p1-pips"]')!,
      p2Pips: this.root.querySelector('[data-ref="p2-pips"]')!,
      bannerWrap: this.root.querySelector('[data-ref="banner-wrap"]')!,
      banner: this.root.querySelector('[data-ref="banner"]')!,
      bannerSub: this.root.querySelector('[data-ref="banner-sub"]')!,
      cutIn: this.root.querySelector('[data-ref="cutin"]')!,
      cutInTitle: this.root.querySelector('[data-ref="cutin-title"]')!,
      cutInSub: this.root.querySelector('[data-ref="cutin-sub"]')!,
      ultBanner: this.root.querySelector('[data-ref="ult-banner"]')!,
      winnerBanner: this.root.querySelector('[data-ref="winner-banner"]')!,
      winnerBannerTitle: this.root.querySelector('[data-ref="winner-banner-title"]')!,
      winnerBannerSub: this.root.querySelector('[data-ref="winner-banner-sub"]')!,
      winnerBannerName: this.root.querySelector('[data-ref="winner-banner-name"]')!,
      matchOverModal: this.root.querySelector('[data-ref="match-over"]')!,
      matchOverWinner: this.root.querySelector('[data-ref="winner-text"]')!
    };

    this.root.querySelector('[data-action="exit-match"]')?.addEventListener('click', () => this.actions.goToScreen('menu'));
    this.root.querySelector('[data-action="toggle-help"]')?.addEventListener('click', () => this.actions.toggleControls());
    this.root.querySelector('[data-action="rematch"]')?.addEventListener('click', () => this.actions.rematch());
    this.root.querySelector('[data-action="chars"]')?.addEventListener('click', () => this.actions.goToScreen('character'));
    this.root.querySelector('[data-action="menu"]')?.addEventListener('click', () => this.actions.goToScreen('menu'));
  }

  updateHud(
    snap: MatchHudSnapshot,
    callouts: readonly CalloutItem[],
    projectToScreen: (wx: number, wy: number) => { x: number; y: number } | null,
    p1Name: string,
    p2Name: string
  ): void {
    const r = this.hudRefs;
    if (!r) {
      return;
    }

    const p1Pct = `${Math.max(0, Math.min(100, snap.p1Health01 * 100))}%`;
    const p2Pct = `${Math.max(0, Math.min(100, snap.p2Health01 * 100))}%`;
    r.p1Hp.style.width = p1Pct;
    r.p1HpTrail.style.width = p1Pct;
    r.p2Hp.style.width = p2Pct;
    r.p2HpTrail.style.width = p2Pct;
    r.p1Meter.style.width = `${Math.max(0, Math.min(100, snap.p1Meter01 * 100))}%`;
    r.p2Meter.style.width = `${Math.max(0, Math.min(100, snap.p2Meter01 * 100))}%`;
    r.p1Meter.dataset.ready = snap.p1Meter01 >= 1 ? 'super' : snap.p1Meter01 >= 0.5 ? 'ex' : 'low';
    r.p2Meter.dataset.ready = snap.p2Meter01 >= 1 ? 'super' : snap.p2Meter01 >= 0.5 ? 'ex' : 'low';
    r.p1Rage.hidden = !snap.p1Rage;
    r.p2Rage.hidden = !snap.p2Rage;

    r.timer.textContent = String(snap.timeSeconds);
    r.roundLabel.textContent = `R${snap.roundNumber}`;

    r.p1Pips.innerHTML = Array.from({ length: 2 }, (_, i) => `<i class="${i < snap.p1Wins ? 'is-won' : ''}"></i>`).join('');
    r.p2Pips.innerHTML = Array.from({ length: 2 }, (_, i) => `<i class="${i < snap.p2Wins ? 'is-won' : ''}"></i>`).join('');

    if (snap.bannerText) {
      r.bannerWrap.hidden = false;
      r.banner.textContent = snap.bannerText;
      if (snap.bannerSubtext) {
        r.bannerSub.hidden = false;
        r.bannerSub.textContent = snap.bannerSubtext;
      } else {
        r.bannerSub.hidden = true;
      }
    } else {
      r.bannerWrap.hidden = true;
    }

    if (snap.ultimateBanner) {
      r.ultBanner.hidden = false;
      r.ultBanner.textContent = snap.ultimateBanner;
    } else {
      r.ultBanner.hidden = true;
    }

    if (snap.winnerBanner) {
      const wasHidden = r.winnerBanner.hidden;
      const winLabel = fighterLabel(snap.winnerBanner.side === 1 ? p1Name : p2Name);
      r.winnerBannerTitle.textContent = snap.winnerBanner.title;
      r.winnerBannerSub.textContent = snap.winnerBanner.subtitle;
      r.winnerBannerName.textContent = `${winLabel.name.toUpperCase()} · P${snap.winnerBanner.side}`;
      r.winnerBanner.style.setProperty('--winner-c', snap.winnerBanner.color);
      r.winnerBanner.hidden = false;
      if (wasHidden) {
        r.winnerBanner.classList.remove('is-animating');
        void r.winnerBanner.offsetWidth;
        r.winnerBanner.classList.add('is-animating');
      }
    } else {
      r.winnerBanner.hidden = true;
      r.winnerBanner.classList.remove('is-animating');
    }

    if (snap.superCutIn) {
      r.cutIn.hidden = false;
      r.cutIn.style.borderColor = snap.superCutIn.color;
      r.cutInTitle.textContent = snap.superCutIn.title;
      r.cutInSub.textContent = snap.superCutIn.subtitle;
    } else {
      r.cutIn.hidden = true;
    }

    if (snap.phase === 'matchOver' && snap.winnerSide !== null) {
      r.matchOverModal.hidden = false;
      const champ = fighterLabel(snap.winnerSide === 1 ? p1Name : p2Name);
      r.matchOverWinner.textContent = `${champ.name.toUpperCase()} WINS!`;
    } else {
      r.matchOverModal.hidden = true;
    }

    if (this.calloutLayer) {
      const nodes: string[] = [];
      for (const c of callouts) {
        const pt = projectToScreen(c.worldX, c.worldY);
        if (!pt) {
          continue;
        }
        const alpha = Math.max(0, 1 - c.age / c.duration);
        nodes.push(
          `<span class="vf3d-callout" style="left:${pt.x.toFixed(1)}px;top:${pt.y.toFixed(1)}px;color:${c.color};opacity:${alpha.toFixed(2)}">${c.text}</span>`
        );
      }
      this.calloutLayer.innerHTML = nodes.join('');
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
