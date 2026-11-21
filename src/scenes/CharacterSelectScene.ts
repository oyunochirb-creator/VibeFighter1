import * as Phaser from 'phaser';

import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { FIGHTER_CHARACTER_DEFINITIONS, type CharacterDefinition } from '../game/hero';
import { SCENE_KEYS, type MatchMode } from '../game/types';
import {
  getMartialArtMeta,
  MARTIAL_ART_CATEGORIES,
  type MartialArtCategoryId
} from '../game/worldMartialArts';
import { BaseScene } from './BaseScene';

interface CharacterSelectData {
  mode: MatchMode;
  stageId: string;
}

const P1_COLOR = 0x38bdf8;
const P2_COLOR = 0xf43f5e;
const GRID_COLS = 6;
const GRID_ROWS = 2;
const PAGE_SIZE = GRID_COLS * GRID_ROWS; // 12 cards per page

const CARD_WIDTH = 176;
const CARD_HEIGHT = 178;
const CARD_GAP_X = 18;
const CARD_GAP_Y = 16;

const ORIGINAL_FEATURED_IDS = ['mongol-bokh', 'bayasaa', 'blue-striker', 'muay-thai', 'taekwondo', 'red-brawler', 'jiujitsu-fighter'];

const CHARACTER_BY_ID = new Map(FIGHTER_CHARACTER_DEFINITIONS.map((c) => [c.id, c]));

function getRosterForCategory(category: MartialArtCategoryId): CharacterDefinition[] {
  if (category === 'all') {
    const ordered: CharacterDefinition[] = [];
    const seen = new Set<string>();
    for (const id of ORIGINAL_FEATURED_IDS) {
      const char = CHARACTER_BY_ID.get(id);
      if (char) {
        ordered.push(char);
        seen.add(id);
      }
    }
    for (const char of FIGHTER_CHARACTER_DEFINITIONS) {
      if (!seen.has(char.id)) {
        ordered.push(char);
        seen.add(char.id);
      }
    }
    return ordered;
  }

  return FIGHTER_CHARACTER_DEFINITIONS.filter((char) => {
    if (category === 'mongolian' && char.id === 'bayasaa') {
      return true;
    }
    const meta = getMartialArtMeta(char.id);
    return Boolean(meta?.categories.includes(category));
  });
}

interface GridCardSlot {
  globalIndex: number;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  flash: Phaser.GameObjects.Rectangle;
  titleText: Phaser.GameObjects.Text;
}

interface PlayerCursor {
  index: number;
  locked: boolean;
  outline: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface CategoryTabUi {
  id: MartialArtCategoryId;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

/**
 * Character Select featuring 6 martial-art category tabs + 2x6 paginated grid
 * showcasing all 68 martial arts, each fighter's country & national spirit animal,
 * weapon indicator, and L-key Ultimate info.
 */
export class CharacterSelectScene extends BaseScene {
  private mode: MatchMode = '1v1';
  private stageId = '';
  private category: MartialArtCategoryId = 'all';
  private roster: CharacterDefinition[] = [];
  private page = 0;

  private tabUis: CategoryTabUi[] = [];
  private gridContainer?: Phaser.GameObjects.Container;
  private pageSlots: GridCardSlot[] = [];
  private cardPositions: Array<{ x: number; y: number }> = [];

  private pageText!: Phaser.GameObjects.Text;
  private prevPageBtn!: Phaser.GameObjects.Text;
  private nextPageBtn!: Phaser.GameObjects.Text;
  private previewText!: Phaser.GameObjects.Text;

  private p1!: PlayerCursor;
  private p2!: PlayerCursor;
  private transitioning = false;

  constructor() {
    super(SCENE_KEYS.CharacterSelect);
  }

  init(data: CharacterSelectData): void {
    this.mode = data?.mode ?? '1v1';
    this.stageId = data?.stageId ?? '';
  }

  create(): void {
    this.transitioning = false;
    this.category = 'all';
    this.page = 0;
    this.roster = getRosterForCategory(this.category);
    this.tabUis = [];
    this.pageSlots = [];
    this.cardPositions = [];

    this.markActiveScene(SCENE_KEYS.CharacterSelect);
    this.bindMusic(AUDIO_KEYS.preFightMusic);
    this.cameras.main.setBackgroundColor(0x020617);

    const subtitle =
      this.mode === '1v1'
        ? 'P1: WASD + Space/F   •   P2: Arrows + Enter   •   Q/E Ангилал'
        : 'WASD / Сум + Enter / Дараад сонгох   •   Q/E Ангилал';
    this.createHeading('Дэлхийн 68 Тулааны Урлаг — Дүр Сонголт', subtitle);

    this.buildCategoryTabs();
    this.buildCursors();
    this.buildPaginationAndPreview();
    this.rebuildGridPage();
    this.registerInput();

    this.createFooterHint('Esc Буцах  •  F: Хөнгөн цохилт  •  G: Хүнд өшиглөлт  •  L: Ultimate');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gridContainer?.destroy(true);
      this.tabUis = [];
      this.pageSlots = [];
    });
  }

  private buildCategoryTabs(): void {
    const { centerX } = this.cameras.main;
    const tabWidth = 148;
    const gap = 10;
    const count = MARTIAL_ART_CATEGORIES.length;
    const totalW = count * tabWidth + (count - 1) * gap;
    const startX = centerX - totalW / 2 + tabWidth / 2;
    const y = 112;

    MARTIAL_ART_CATEGORIES.forEach((cat, idx) => {
      const x = startX + idx * (tabWidth + gap);
      const countInCat = getRosterForCategory(cat.id).length;
      const bg = this.add
        .rectangle(x, y, tabWidth, 34, 0x0f172a, 0.95)
        .setStrokeStyle(2, 0x334155, 1)
        .setInteractive({ useHandCursor: true });

      const text = this.add
        .text(x, y, `${cat.label} (${countInCat})`, {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontSize: '12px',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);

      bg.on('pointerdown', () => this.selectCategory(cat.id));
      this.tabUis.push({ id: cat.id, bg, text });
    });

    this.refreshCategoryTabs();
  }

  private refreshCategoryTabs(): void {
    this.tabUis.forEach((tab) => {
      const active = tab.id === this.category;
      tab.bg.setFillStyle(active ? 0x0ea5e9 : 0x0f172a, active ? 0.25 : 0.95);
      tab.bg.setStrokeStyle(active ? 2.5 : 1.5, active ? 0x38bdf8 : 0x334155, 1);
      tab.text.setColor(active ? '#f8fafc' : '#94a3b8');
    });
  }

  private selectCategory(category: MartialArtCategoryId): void {
    if (this.transitioning || this.category === category) {
      return;
    }

    this.category = category;
    this.roster = getRosterForCategory(category);
    this.page = 0;

    if (!this.p1.locked) {
      this.p1.index = 0;
    } else {
      this.p1.index = Phaser.Math.Clamp(this.p1.index, 0, this.roster.length - 1);
    }

    if (!this.p2.locked) {
      this.p2.index = this.mode === '1v1' ? Math.min(1, Math.max(0, this.roster.length - 1)) : 0;
    } else {
      this.p2.index = Phaser.Math.Clamp(this.p2.index, 0, this.roster.length - 1);
    }

    this.refreshCategoryTabs();
    this.rebuildGridPage();
  }

  private buildPaginationAndPreview(): void {
    const { centerX, height } = this.cameras.main;

    this.prevPageBtn = this.add
      .text(centerX - 240, height - 104, '< Өмнөх', {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '14px',
        backgroundColor: '#0f172a',
        padding: { x: 12, y: 6 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.prevPageBtn.on('pointerdown', () => this.changePage(-1));

    this.nextPageBtn = this.add
      .text(centerX + 240, height - 104, 'Дараах >', {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '14px',
        backgroundColor: '#0f172a',
        padding: { x: 12, y: 6 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.nextPageBtn.on('pointerdown', () => this.changePage(1));

    this.pageText = this.add
      .text(centerX, height - 104, '', {
        color: '#cbd5e1',
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);

    this.previewText = this.add
      .text(centerX, height - 66, '', {
        color: '#facc15',
        fontFamily: 'monospace',
        fontSize: '13px',
        backgroundColor: 'rgba(15, 23, 42, 0.88)',
        padding: { x: 14, y: 6 }
      })
      .setOrigin(0.5);
  }

  private changePage(delta: number): void {
    if (this.transitioning) {
      return;
    }

    const totalPages = Math.max(1, Math.ceil(this.roster.length / PAGE_SIZE));
    const nextPage = Phaser.Math.Wrap(this.page + delta, 0, totalPages);
    if (nextPage === this.page) {
      return;
    }

    this.page = nextPage;
    if (!this.p1.locked) {
      this.p1.index = Math.min(this.roster.length - 1, this.page * PAGE_SIZE);
    }
    this.rebuildGridPage();
  }

  private rebuildGridPage(): void {
    this.gridContainer?.destroy(true);
    this.gridContainer = this.add.container(0, 0).setDepth(10);
    this.pageSlots = [];
    this.cardPositions = [];

    const totalPages = Math.max(1, Math.ceil(this.roster.length / PAGE_SIZE));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);

    const startIdx = this.page * PAGE_SIZE;
    const endIdx = Math.min(this.roster.length, startIdx + PAGE_SIZE);

    const { centerX } = this.cameras.main;
    const gridTotalW = GRID_COLS * CARD_WIDTH + (GRID_COLS - 1) * CARD_GAP_X;
    const startX = centerX - gridTotalW / 2 + CARD_WIDTH / 2;
    const startY = 238;

    for (let globalIndex = startIdx; globalIndex < endIdx; globalIndex += 1) {
      const localIndex = globalIndex - startIdx;
      const col = localIndex % GRID_COLS;
      const row = Math.floor(localIndex / GRID_COLS);
      const x = startX + col * (CARD_WIDTH + CARD_GAP_X);
      const y = startY + row * (CARD_HEIGHT + CARD_GAP_Y);
      this.cardPositions[globalIndex] = { x, y };

      const character = this.roster[globalIndex];
      const meta = getMartialArtMeta(character.id);
      const accentColor = meta?.primaryColor ?? 0x334155;
      const accentHex = `#${accentColor.toString(16).padStart(6, '0')}`;

      const background = this.add
        .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x0f172a, 0.94)
        .setStrokeStyle(2, accentColor, 0.55);

      const children: Phaser.GameObjects.GameObject[] = [background];

      // Subtle country aura glow circle behind portrait
      const auraGlow = this.add.circle(0, -24, 46, accentColor, 0.14);
      children.push(auraGlow);

      if (this.textures.exists(character.portrait.key)) {
        const image = this.add.image(0, -24, character.portrait.key).setOrigin(0.5);
        const maxSize = 96;
        const sourceSize = Math.max(image.width, image.height) || maxSize;
        image.setScale(maxSize / sourceSize);
        if (meta && meta.tintColor !== 0xffffff && !character.portrait.key.endsWith('-portrait')) {
          image.setTint(meta.tintColor);
        }
        children.push(image);
      }

      // Country code badge top-right
      const codeLabel = meta ? `[${meta.countryCode}]` : character.id === 'bayasaa' ? '[MGL]' : '[PRO]';
      const codeBadge = this.add
        .text(CARD_WIDTH / 2 - 8, -CARD_HEIGHT / 2 + 8, codeLabel, {
          color: meta ? accentHex : '#38bdf8',
          fontFamily: 'monospace',
          fontSize: '11px',
          fontStyle: 'bold'
        })
        .setOrigin(1, 0);
      children.push(codeBadge);

      // Weapon tag top-left if armed
      if (meta && meta.weapon !== 'none') {
        const weaponTag = this.add
          .text(-CARD_WIDTH / 2 + 8, -CARD_HEIGHT / 2 + 8, '⚔ Зэвсэгт', {
            color: '#facc15',
            fontFamily: 'monospace',
            fontSize: '10px',
            fontStyle: 'bold'
          })
          .setOrigin(0, 0);
        children.push(weaponTag);
      }

      const titleText = this.add
        .text(0, CARD_HEIGHT / 2 - 42, character.label, {
          color: '#f8fafc',
          fontFamily: 'monospace',
          fontSize: '14px',
          fontStyle: 'bold',
          align: 'center'
        })
        .setOrigin(0.5);
      if (titleText.width > CARD_WIDTH - 14) {
        titleText.setScale((CARD_WIDTH - 14) / titleText.width);
      }
      children.push(titleText);

      const subtitleStr = meta
        ? `${meta.countryMn} • ${meta.animalMn}`
        : character.id === 'bayasaa'
          ? 'Монгол • Галт гурвалжин'
          : character.id === 'blue-striker'
            ? 'Хүйтэн цохилт • Super Armor'
            : 'Тусгай тулаанч';

      const subText = this.add
        .text(0, CARD_HEIGHT / 2 - 20, subtitleStr, {
          color: '#94a3b8',
          fontFamily: 'monospace',
          fontSize: '10px',
          align: 'center'
        })
        .setOrigin(0.5);
      if (subText.width > CARD_WIDTH - 12) {
        subText.setScale((CARD_WIDTH - 12) / subText.width);
      }
      children.push(subText);

      const flash = this.add
        .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0)
        .setOrigin(0.5);
      children.push(flash);

      const container = this.add.container(x, y, children);
      background.setInteractive({ useHandCursor: true });
      background.on('pointerover', () => this.hoverCard(globalIndex));
      background.on('pointerdown', () => this.clickCard(globalIndex));

      this.gridContainer.add(container);
      this.pageSlots.push({ globalIndex, container, background, flash, titleText });
    }

    this.pageText.setText(`Хуудас ${this.page + 1} / ${totalPages}  (${this.roster.length} тулаанч)`);
    this.prevPageBtn.setVisible(totalPages > 1);
    this.nextPageBtn.setVisible(totalPages > 1);

    this.refreshCursors();
    this.refreshPreviewBanner();
  }

  private buildCursors(): void {
    this.p1 = this.createCursor('P1', P1_COLOR, 0);
    const p2Start = this.mode === '1v1' ? Math.min(1, Math.max(0, this.roster.length - 1)) : 0;
    this.p2 = this.createCursor('P2', P2_COLOR, p2Start);

    if (this.mode === '1vcpu') {
      this.p2.outline.setVisible(false);
      this.p2.label.setVisible(false);
    }
  }

  private createCursor(label: string, color: number, index: number): PlayerCursor {
    const outline = this.add
      .rectangle(0, 0, CARD_WIDTH + 10, CARD_HEIGHT + 10, color, 0)
      .setStrokeStyle(4, color, 1)
      .setDepth(20);

    const text = this.add
      .text(0, 0, label, {
        color: '#020617',
        backgroundColor: colorToCss(color),
        fontFamily: 'monospace',
        fontSize: '13px',
        fontStyle: 'bold',
        padding: { x: 7, y: 2 }
      })
      .setOrigin(0.5)
      .setDepth(21);

    return { index, locked: false, outline, label: text };
  }

  private refreshCursors(): void {
    this.refreshCursor(this.p1, -24);
    this.refreshCursor(this.p2, 24);
  }

  private refreshCursor(cursor: PlayerCursor, labelOffsetX: number): void {
    if (this.mode === '1vcpu' && cursor === this.p2 && !this.transitioning) {
      cursor.outline.setVisible(false);
      cursor.label.setVisible(false);
      return;
    }

    const position = this.cardPositions[cursor.index];
    if (!position) {
      cursor.outline.setVisible(false);
      cursor.label.setVisible(false);
      return;
    }

    cursor.outline.setVisible(true);
    cursor.label.setVisible(true);
    cursor.outline.setPosition(position.x, position.y);
    cursor.outline.setStrokeStyle(cursor.locked ? 6 : 4, cursor.outline.strokeColor, 1);
    cursor.label.setPosition(
      position.x + (this.mode === '1v1' ? labelOffsetX : 0),
      position.y - CARD_HEIGHT / 2 - 11
    );
  }

  private refreshPreviewBanner(): void {
    const p1Char = this.roster[this.p1.index] ?? this.roster[0];
    if (!p1Char) {
      return;
    }

    const meta = getMartialArtMeta(p1Char.id);
    if (meta) {
      const weaponTxt = meta.weapon === 'none' ? 'Гардан тулаан' : `Зэвсэг: ${meta.weapon.toUpperCase()}`;
      this.previewText.setText(
        `${p1Char.label}  |  Улс: ${meta.countryMn}  |  Аура амьтан: ${meta.animalMn}  |  ${weaponTxt}  |  L Ultimate: ${meta.ultimateCallout}`
      );
      return;
    }

    const specialNote =
      p1Char.id === 'bayasaa'
        ? 'L: Duck Under -> Галтай Triangle Choke  |  3x G Combo + 540° KO'
        : p1Char.id === 'blue-striker'
          ? 'Super Armor (цохилтод гацахгүй)  |  L: ULTIMATE PUNCH (2s элэгний цохилт)'
          : 'L / V: Тусгай хүчирхэг цохилт';
    this.previewText.setText(`${p1Char.label}  |  ${specialNote}`);
  }

  private registerInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    if (this.mode === '1v1') {
      keyboard.on('keydown-A', () => this.movePlayer(this.p1, -1));
      keyboard.on('keydown-D', () => this.movePlayer(this.p1, 1));
      keyboard.on('keydown-W', () => this.movePlayer(this.p1, -GRID_COLS));
      keyboard.on('keydown-S', () => this.movePlayer(this.p1, GRID_COLS));

      keyboard.on('keydown-LEFT', () => this.movePlayer(this.p2, -1));
      keyboard.on('keydown-RIGHT', () => this.movePlayer(this.p2, 1));
      keyboard.on('keydown-UP', () => this.movePlayer(this.p2, -GRID_COLS));
      keyboard.on('keydown-DOWN', () => this.movePlayer(this.p2, GRID_COLS));

      keyboard.on('keydown-SPACE', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-F', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-ENTER', () => this.confirmPlayer(this.p2));
    } else {
      const move = (delta: number): void => this.movePlayer(this.p1, delta);
      keyboard.on('keydown-A', () => move(-1));
      keyboard.on('keydown-LEFT', () => move(-1));
      keyboard.on('keydown-D', () => move(1));
      keyboard.on('keydown-RIGHT', () => move(1));
      keyboard.on('keydown-W', () => move(-GRID_COLS));
      keyboard.on('keydown-UP', () => move(-GRID_COLS));
      keyboard.on('keydown-S', () => move(GRID_COLS));
      keyboard.on('keydown-DOWN', () => move(GRID_COLS));

      keyboard.on('keydown-SPACE', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-F', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-ENTER', () => this.confirmPlayer(this.p1));
    }

    keyboard.on('keydown-Q', () => this.cycleCategory(-1));
    keyboard.on('keydown-E', () => this.cycleCategory(1));
    keyboard.on('keydown-ESC', () => this.goBack());
    keyboard.on('keydown-BACKSPACE', () => this.goBack());
  }

  private cycleCategory(dir: -1 | 1): void {
    const idx = MARTIAL_ART_CATEGORIES.findIndex((c) => c.id === this.category);
    const nextIdx = Phaser.Math.Wrap(idx + dir, 0, MARTIAL_ART_CATEGORIES.length);
    this.selectCategory(MARTIAL_ART_CATEGORIES[nextIdx].id);
  }

  private movePlayer(cursor: PlayerCursor, delta: number): void {
    if (this.transitioning || cursor.locked || this.roster.length === 0) {
      return;
    }

    const count = this.roster.length;
    const other = cursor === this.p1 ? this.p2 : this.p1;
    let next = Phaser.Math.Wrap(cursor.index + delta, 0, count);

    if (this.mode === '1v1' && next === other.index) {
      const skip = Phaser.Math.Wrap(next + Math.sign(delta || 1), 0, count);
      if (skip !== cursor.index) {
        next = skip;
      } else if (!other.locked) {
        other.index = cursor.index;
      }
    }

    cursor.index = next;

    const targetPage = Math.floor(cursor.index / PAGE_SIZE);
    if (targetPage !== this.page) {
      this.page = targetPage;
      this.rebuildGridPage();
    } else {
      this.refreshCursors();
      this.refreshPreviewBanner();
    }
  }

  private hoverCard(globalIndex: number): void {
    if (this.transitioning || this.p1.locked) {
      return;
    }

    if (this.mode === '1vcpu') {
      this.p1.index = globalIndex;
      this.refreshCursors();
      this.refreshPreviewBanner();
    }
  }

  private clickCard(globalIndex: number): void {
    if (this.transitioning) {
      return;
    }

    if (this.mode === '1vcpu') {
      this.p1.index = globalIndex;
      this.refreshCursors();
      this.refreshPreviewBanner();
      this.confirmPlayer(this.p1);
      return;
    }

    if (!this.p1.locked) {
      this.p1.index = globalIndex;
      this.refreshCursors();
      this.refreshPreviewBanner();
      this.confirmPlayer(this.p1);
    } else if (!this.p2.locked && globalIndex !== this.p1.index) {
      this.p2.index = globalIndex;
      this.refreshCursors();
      this.confirmPlayer(this.p2);
    }
  }

  private flashSlot(globalIndex: number, onComplete: () => void): void {
    const slot = this.pageSlots.find((s) => s.globalIndex === globalIndex);
    if (!slot) {
      onComplete();
      return;
    }

    this.tweens.add({
      targets: slot.flash,
      alpha: { from: 0, to: 0.85 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        slot.flash.setAlpha(0);
        onComplete();
      }
    });
  }

  private confirmPlayer(cursor: PlayerCursor): void {
    if (this.transitioning || cursor.locked || !this.roster[cursor.index]) {
      return;
    }

    cursor.locked = true;
    this.refreshCursors();
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());

    this.flashSlot(cursor.index, () => {
      if (this.mode === '1vcpu') {
        this.runCpuSelection();
        return;
      }

      if (this.p1.locked && this.p2.locked) {
        this.startMatch();
      }
    });
  }

  private runCpuSelection(): void {
    if (this.transitioning) {
      return;
    }

    this.transitioning = true;

    const p1Id = this.roster[this.p1.index].id;
    const allChoices = FIGHTER_CHARACTER_DEFINITIONS.filter((c) => c.id !== p1Id);
    const picked = allChoices.length > 0 ? Phaser.Math.RND.pick(allChoices) : this.roster[this.p1.index];
    const inRosterIdx = this.roster.findIndex((c) => c.id === picked.id);

    if (inRosterIdx >= 0) {
      this.p2.index = inRosterIdx;
      this.p2.label.setText('CPU');
      this.p2.locked = true;
      this.refreshCursors();
    }

    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());

    this.time.delayedCall(380, () => {
      this.scene.start(SCENE_KEYS.Match, {
        mode: this.mode,
        stageId: this.stageId,
        p1CharacterId: p1Id,
        p2CharacterId: picked.id
      });
    });
  }

  private startMatch(): void {
    if (this.transitioning && this.mode === '1v1') {
      return;
    }

    this.transitioning = true;
    this.scene.start(SCENE_KEYS.Match, {
      mode: this.mode,
      stageId: this.stageId,
      p1CharacterId: this.roster[this.p1.index].id,
      p2CharacterId: this.roster[this.p2.index].id
    });
  }

  private goBack(): void {
    if (this.transitioning) {
      return;
    }

    this.scene.start(SCENE_KEYS.LevelSelect, { mode: this.mode });
  }
}

function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
