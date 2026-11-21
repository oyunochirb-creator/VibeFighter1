import { createSettingsStore } from '../game/settings';
import { Game3DApp } from '../game3d/Game3DApp';

/**
 * Mounts the full-viewport Vibe Fighter 3D application inside `#app` using the
 * persisted `settingsStore`.
 */
export function createApp(root: HTMLElement): void {
  root.innerHTML = `<div id="game-root" class="vf3d-root"></div>`;
  const gameRoot = root.querySelector<HTMLElement>('#game-root');

  if (!gameRoot) {
    throw new Error('Failed to mount #game-root');
  }

  const settingsStore = createSettingsStore();
  const app = new Game3DApp(gameRoot, settingsStore);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      app.dispose();
    });
  }
}
