import type { GameSettings } from '../types';
import { getEffectiveVolume } from './audio';

let combatAudioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return null;
  }

  combatAudioCtx ??= new AudioContext();
  if (combatAudioCtx.state === 'suspended') {
    void combatAudioCtx.resume().catch(() => {});
  }
  return combatAudioCtx;
}

/**
 * Plays a pale-cold crystalline wind-up sound for Blue Striker's 0.8s ULTIMATE PUNCH charge.
 */
export function playUltimateChargeSfx(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.32, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;

  // Deep cold rumble
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sawtooth';
  sub.frequency.setValueAtTime(70, now);
  sub.frequency.exponentialRampToValueAtTime(140, now + 0.75);
  subGain.gain.setValueAtTime(0.001, now);
  subGain.gain.linearRampToValueAtTime(volume * 0.45, now + 0.12);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
  sub.connect(subGain).connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.8);

  // Shimmering ice chimes
  [880, 1320, 1760].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + idx * 0.18;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, start + 0.22);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(volume * 0.28, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.27);
  });
}

/**
 * Plays a heavy liver body-shot thud layered with an icy shatter burst.
 */
export function playIcyBodyShotSfx(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.48, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;

  // Heavy gut/liver thud
  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(145, now);
  thud.frequency.exponentialRampToValueAtTime(36, now + 0.28);
  thudGain.gain.setValueAtTime(volume, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
  thud.connect(thudGain).connect(ctx.destination);
  thud.start(now);
  thud.stop(now + 0.34);

  // Sharp frost shatter
  const ice = ctx.createOscillator();
  const iceGain = ctx.createGain();
  ice.type = 'square';
  ice.frequency.setValueAtTime(1480, now);
  ice.frequency.exponentialRampToValueAtTime(420, now + 0.16);
  iceGain.gain.setValueAtTime(volume * 0.22, now);
  iceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  ice.connect(iceGain).connect(ctx.destination);
  ice.start(now);
  ice.stop(now + 0.2);
}

/**
 * Plays fiery whoosh crackle when Bayasaa locks the flaming triangle choke ring.
 */
export function playFlameRingSfx(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.36, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(190, now);
  osc.frequency.exponentialRampToValueAtTime(85, now + 0.4);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume * 0.5, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.47);
}

/**
 * Plays a sharp mat/arm tap sound for each submission tap during Triangle Choke.
 */
export function playTriangleTapSfx(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.42, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(68, now + 0.11);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

/**
 * Speaks "Knock Out!" in a deep, gravelly announcer voice + sub-bass boom
 * when Bayasaa finishes the opponent with the 540 Roundhouse Kick (or submission KO).
 */
export function playKnockOutVoice(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.95, 'sfx', settings);
  if (volume <= 0) {
    return;
  }

  // Deep bass impact chord
  const ctx = getCtx();
  if (ctx) {
    const now = ctx.currentTime;
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'triangle';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(32, now + 0.55);
    boomGain.gain.setValueAtTime(Math.min(0.6, volume * 0.65), now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    boom.connect(boomGain).connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.6);
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance('Knock Out!');
    utterance.lang = 'en-US';
    utterance.pitch = 0.22; // Deep bass male announcer tone
    utterance.rate = 0.82;
    utterance.volume = Math.min(1, volume);

    const voices = synth.getVoices();
    const preferredVoice =
      voices.find((v) => /male|david|daniel|alex|fred|bruce|google uk english male/i.test(v.name)) ??
      voices.find((v) => v.lang.startsWith('en'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    synth.speak(utterance);
  } catch {
    // Ignore speech synthesis errors in restricted environments.
  }
}

/**
 * Plays a sharp blazing knee-impact boom + crimson whoosh for Muay Thai's Tiger Knee.
 */
export function playTigerKneeSfx(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.46, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;
  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(190, now);
  thud.frequency.exponentialRampToValueAtTime(42, now + 0.24);
  thudGain.gain.setValueAtTime(volume, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
  thud.connect(thudGain).connect(ctx.destination);
  thud.start(now);
  thud.stop(now + 0.28);

  const flame = ctx.createOscillator();
  const flameGain = ctx.createGain();
  flame.type = 'sawtooth';
  flame.frequency.setValueAtTime(480, now);
  flame.frequency.exponentialRampToValueAtTime(160, now + 0.2);
  flameGain.gain.setValueAtTime(volume * 0.35, now);
  flameGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  flame.connect(flameGain).connect(ctx.destination);
  flame.start(now);
  flame.stop(now + 0.24);
}

/**
 * Plays a swirling high-speed cyclone whoosh for Taekwondo's 720° Tornado Kick.
 */
export function playTornadoKickSfx(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.38, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;
  [320, 480, 660].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + idx * 0.08;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.45, start + 0.14);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(volume * 0.42, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  });
}

/**
 * Plays a heavy canvas-shaking earth boom for Mongol Bokh's Eagle Slam.
 */
export function playEagleSlamSfx(settings: GameSettings): void {
  const volume = getEffectiveVolume(0.55, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;
  const slam = ctx.createOscillator();
  const slamGain = ctx.createGain();
  slam.type = 'triangle';
  slam.frequency.setValueAtTime(130, now);
  slam.frequency.exponentialRampToValueAtTime(28, now + 0.42);
  slamGain.gain.setValueAtTime(volume, now);
  slamGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
  slam.connect(slamGain).connect(ctx.destination);
  slam.start(now);
  slam.stop(now + 0.48);
}

/**
 * Plays a crisp resonant spirit/weapon ultimate sound effect for world martial arts.
 */
export function playSpiritUltimateSfx(settings: GameSettings, isWeapon = false): void {
  const volume = getEffectiveVolume(0.45, 'sfx', settings);
  const ctx = getCtx();
  if (volume <= 0 || !ctx) {
    return;
  }

  const now = ctx.currentTime;

  const boom = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boom.type = isWeapon ? 'sawtooth' : 'triangle';
  boom.frequency.setValueAtTime(isWeapon ? 620 : 185, now);
  boom.frequency.exponentialRampToValueAtTime(isWeapon ? 180 : 48, now + 0.28);
  boomGain.gain.setValueAtTime(volume * 0.8, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  boom.connect(boomGain).connect(ctx.destination);
  boom.start(now);
  boom.stop(now + 0.32);

  if (isWeapon) {
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(1420, now);
    ring.frequency.exponentialRampToValueAtTime(980, now + 0.22);
    ringGain.gain.setValueAtTime(volume * 0.32, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    ring.connect(ringGain).connect(ctx.destination);
    ring.start(now);
    ring.stop(now + 0.25);
  }
}
