import { SlimeAvatar } from './SlimeAvatar';
import * as emotions from './emotions';

/** Both <Slime emotion="heureux" /> and <Slime.Heureux /> share the same renderer. */
export const Slime = Object.assign(SlimeAvatar, emotions);
