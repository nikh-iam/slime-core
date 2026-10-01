import attentif from '../../../common/slime-cercle-attentif-encre-anime.svg?raw';
import blase from '../../../common/slime-cercle-blase-encre-anime.svg?raw';
import colere from '../../../common/slime-cercle-colere-encre-anime.svg?raw';
import confus from '../../../common/slime-cercle-confus-encre-anime.svg?raw';
import curieux from '../../../common/slime-cercle-curieux-encre-anime.svg?raw';
import effraye from '../../../common/slime-cercle-effraye-encre-anime.svg?raw';
import excite from '../../../common/slime-cercle-excite-encre-anime.svg?raw';
import fier from '../../../common/slime-cercle-fier-encre-anime.svg?raw';
import heureux from '../../../common/slime-cercle-heureux-encre-anime.svg?raw';
import hilare from '../../../common/slime-cercle-hilare-encre-anime.svg?raw';
import mefiant from '../../../common/slime-cercle-mefiant-encre-anime.svg?raw';
import neutre from '../../../common/slime-cercle-neutre-encre-anime.svg?raw';
import somnolent from '../../../common/slime-cercle-somnolent-encre-anime.svg?raw';
import surpris from '../../../common/slime-cercle-surpris-encre-anime.svg?raw';
import timide from '../../../common/slime-cercle-timide-encre-anime.svg?raw';
import triste from '../../../common/slime-cercle-triste-encre-anime.svg?raw';

export const slimeAssets = {
  attentif, blase, colere, confus, curieux, effraye, excite, fier,
  heureux, hilare, mefiant, neutre, somnolent, surpris, timide, triste,
} as const;

export type SlimeEmotion = keyof typeof slimeAssets;
export const slimeEmotions = Object.keys(slimeAssets) as SlimeEmotion[];
