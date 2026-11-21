import { preloadStarterAssets, registerStarterAnimations } from '../game/assets';
import { prepareWorldMartialArtPortraits } from '../game/fighterPortraits';
import { registerGeneratedAssets } from '../game/generatedAssets';
import { prepareMyFighters } from '../game/myFighterLoader';
import { registerTileAtlasFrames } from '../game/tileAtlas';
import { registerQuestUiAtlasFrames } from '../game/uiAtlas';
import { registerFightingUiAtlasFrames } from '../game/fightingUiAtlas';
import { SCENE_KEYS } from '../game/types';
import { BaseScene } from './BaseScene';

export class BootScene extends BaseScene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  preload(): void {
    preloadStarterAssets(this);
  }

  create(): void {
    this.markActiveScene(SCENE_KEYS.Boot);
    registerGeneratedAssets(this);
    registerTileAtlasFrames(this);
    registerQuestUiAtlasFrames(this);
    registerFightingUiAtlasFrames(this);

    // Fighters from myFighters.ts are sliced from raw pictures first, because
    // their frame counts are only known once the pictures are read.
    void prepareMyFighters(this)
      .catch((error) => console.error('[my-fighter] could not prepare fighters', error))
      .then(() => {
        prepareWorldMartialArtPortraits(this);
        registerStarterAnimations(this);
        this.scene.start(SCENE_KEYS.Splash);
      });
  }
}
