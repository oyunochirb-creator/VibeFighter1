import { AUDIO_KEYS, getEffectiveVolume, STARTER_AUDIO_ASSETS } from '../game/core/audio';
import {
  playEagleSlamSfx,
  playFlameRingSfx,
  playIcyBodyShotSfx,
  playKnockOutVoice,
  playSpiritUltimateSfx,
  playTigerKneeSfx,
  playTornadoKickSfx,
  playTriangleTapSfx,
  playUltimateChargeSfx
} from '../game/core/combatAudio';
import type { Store } from '../game/store';
import type { GameSettings } from '../game/types';

export type MusicMood = 'preFight' | 'fight' | 'victory';

/**
 * Unified Three.js/DOM audio controller that plays pre-fight, live-fight, and
 * post-KO victory music tracks, UI confirm cues, and WebAudio combat SFX
 * synchronized with `settingsStore`.
 */
export class Game3DAudio {
  private readonly settingsStore: Store<GameSettings>;
  private readonly preFightEl: HTMLAudioElement | null = null;
  private readonly fightEl: HTMLAudioElement | null = null;
  private readonly victoryEl: HTMLAudioElement | null = null;
  private readonly uiConfirmUrl: string;
  private sfxCtx: AudioContext | null = null;
  private unlocked = false;
  private currentMood: MusicMood = 'preFight';
  private unsubscribe: () => void;

  constructor(settingsStore: Store<GameSettings>) {
    this.settingsStore = settingsStore;

    const preAsset = STARTER_AUDIO_ASSETS.find((a) => a.key === AUDIO_KEYS.preFightMusic);
    const fightAsset = STARTER_AUDIO_ASSETS.find((a) => a.key === AUDIO_KEYS.fightMusic);
    const victoryAsset = STARTER_AUDIO_ASSETS.find((a) => a.key === AUDIO_KEYS.victoryMusic);
    const confirmAsset = STARTER_AUDIO_ASSETS.find((a) => a.key === AUDIO_KEYS.uiConfirm);
    this.uiConfirmUrl = confirmAsset?.url ?? '/assets/audio/sfx/ui-confirm.mp3';

    if (typeof Audio !== 'undefined') {
      if (preAsset) {
        this.preFightEl = new Audio(preAsset.url);
        this.preFightEl.loop = true;
        this.preFightEl.preload = 'auto';
      }
      if (fightAsset) {
        this.fightEl = new Audio(fightAsset.url);
        this.fightEl.loop = true;
        this.fightEl.preload = 'auto';
      }
      if (victoryAsset) {
        this.victoryEl = new Audio(victoryAsset.url);
        this.victoryEl.loop = true;
        this.victoryEl.preload = 'auto';
      }
    }

    this.unsubscribe = this.settingsStore.subscribe(() => this.syncMusic());

    const unlock = (): void => {
      this.unlocked = true;
      void this.ensureCtx()?.resume().catch(() => {});
      this.syncMusic();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      return null;
    }
    this.sfxCtx ??= new AudioContext();
    return this.sfxCtx;
  }

  setMusicMood(mood: MusicMood): void {
    this.currentMood = mood;
    this.syncMusic();
  }

  syncMusic(): void {
    const settings = this.settingsStore.getState();
    const baseVol = this.currentMood === 'victory' ? 0.5 : 0.45;
    const vol = getEffectiveVolume(baseVol, 'music', settings);
    const activeEl =
      this.currentMood === 'preFight'
        ? this.preFightEl
        : this.currentMood === 'fight'
          ? this.fightEl
          : this.victoryEl;

    for (const track of [this.preFightEl, this.fightEl, this.victoryEl]) {
      if (track && track !== activeEl && !track.paused) {
        track.pause();
        track.currentTime = 0;
      }
    }

    if (!activeEl) {
      return;
    }

    activeEl.volume = Math.max(0, Math.min(1, vol));
    if (vol <= 0) {
      if (!activeEl.paused) {
        activeEl.pause();
      }
      return;
    }

    if (this.unlocked && activeEl.paused) {
      void activeEl.play().catch(() => {});
    }
  }

  playUiConfirm(): void {
    const settings = this.settingsStore.getState();
    const vol = getEffectiveVolume(0.38, 'sfx', settings);
    if (vol <= 0 || typeof Audio === 'undefined') {
      return;
    }
    const cue = new Audio(this.uiConfirmUrl);
    cue.volume = Math.max(0, Math.min(1, vol));
    void cue.play().catch(() => {});
  }

  playSwing(heavy = false): void {
    const settings = this.settingsStore.getState();
    const vol = getEffectiveVolume(0.22, 'sfx', settings);
    const ctx = this.ensureCtx();
    if (vol <= 0 || !ctx) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(heavy ? 240 : 360, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 80 : 120, now + 0.11);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playHit(heavy = false, blocked = false): void {
    const settings = this.settingsStore.getState();
    const vol = getEffectiveVolume(blocked ? 0.28 : heavy ? 0.44 : 0.34, 'sfx', settings);
    const ctx = this.ensureCtx();
    if (vol <= 0 || !ctx) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = blocked ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(blocked ? 320 : heavy ? 175 : 230, now);
    osc.frequency.exponentialRampToValueAtTime(blocked ? 140 : 42, now + (blocked ? 0.08 : 0.16));
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (blocked ? 0.09 : 0.18));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playUltimateCharge(): void {
    playUltimateChargeSfx(this.settingsStore.getState());
  }

  playIcyBodyShot(): void {
    playIcyBodyShotSfx(this.settingsStore.getState());
  }

  playFlameRing(): void {
    playFlameRingSfx(this.settingsStore.getState());
  }

  playTriangleTap(): void {
    playTriangleTapSfx(this.settingsStore.getState());
  }

  playKnockOut(phrase = 'Knock Out!'): void {
    playKnockOutVoice(this.settingsStore.getState(), phrase);
  }

  playAnnouncerPhrase(phrase: string): void {
    const settings = this.settingsStore.getState();
    const vol = getEffectiveVolume(0.72, 'sfx', settings);
    if (vol <= 0 || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(phrase);
      u.rate = 0.94;
      u.pitch = 0.7;
      u.volume = Math.max(0, Math.min(1, vol));
      window.speechSynthesis.speak(u);
    } catch {
      // Ignore speechSynthesis sandbox errors
    }
  }

  playTigerKnee(): void {
    playTigerKneeSfx(this.settingsStore.getState());
  }

  playTornadoKick(): void {
    playTornadoKickSfx(this.settingsStore.getState());
  }

  playEagleSlam(): void {
    playEagleSlamSfx(this.settingsStore.getState());
  }

  playSpiritUltimate(isWeapon = false): void {
    playSpiritUltimateSfx(this.settingsStore.getState(), isWeapon);
  }

  dispose(): void {
    this.unsubscribe();
    this.preFightEl?.pause();
    this.fightEl?.pause();
    this.victoryEl?.pause();
  }
}
