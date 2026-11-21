import * as Phaser from 'phaser';

import type { Store } from '../store';
import type { GameSettings } from '../types';
import { AUDIO_KEYS, stopAudioAsset, syncLoopingAudioAsset } from './audio';

export type MusicTrackKey = typeof AUDIO_KEYS.preFightMusic | typeof AUDIO_KEYS.fightMusic;

export const MUSIC_TRACK_KEYS: readonly MusicTrackKey[] = [
  AUDIO_KEYS.preFightMusic,
  AUDIO_KEYS.fightMusic
];

export interface SceneMusicController {
  setTrack: (track: MusicTrackKey) => void;
  sync: () => void;
}

/**
 * Ensures only the requested background track plays, stopping any other music track
 * and syncing looping playback + volume against the current settings.
 */
export function switchBackgroundMusic(
  scene: Phaser.Scene,
  track: MusicTrackKey,
  settings: GameSettings
): void {
  MUSIC_TRACK_KEYS.forEach((candidate) => {
    if (candidate !== track) {
      stopAudioAsset(scene, candidate);
    }
  });

  syncLoopingAudioAsset(scene, track, settings);
}

/**
 * Manages background music for a Phaser scene: keeps track volume synced with
 * settingsStore, retries playback automatically when browser audio unlocks,
 * and cleans up all listeners when the scene shuts down.
 */
export function createSceneMusicController(
  scene: Phaser.Scene,
  settingsStore: Store<GameSettings>,
  initialTrack?: MusicTrackKey
): SceneMusicController {
  let activeTrack: MusicTrackKey | null = initialTrack ?? null;

  const sync = (): void => {
    if (!activeTrack) {
      return;
    }

    switchBackgroundMusic(scene, activeTrack, settingsStore.getState());
  };

  const unsubscribe = settingsStore.subscribe(() => {
    sync();
  });

  const onUnlocked = (): void => {
    sync();
  };

  if (scene.sound.locked) {
    scene.sound.once(Phaser.Sound.Events.UNLOCKED, onUnlocked);
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsubscribe();
    scene.sound.off(Phaser.Sound.Events.UNLOCKED, onUnlocked);
  });

  if (activeTrack) {
    sync();
  }

  return {
    setTrack(track: MusicTrackKey): void {
      if (activeTrack === track) {
        sync();
        return;
      }

      activeTrack = track;
      sync();
    },
    sync
  };
}
