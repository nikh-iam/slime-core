import type { SlimeEmotion } from './assets';

export type CharacterActivity = 'idle' | 'listening' | 'thinking' | 'working' | 'responding' | 'notifying' | 'speaking';
export interface CharacterState {
  emotion: SlimeEmotion;
  activity: CharacterActivity;
  gaze: { x: number; y: number };
  hover: boolean;
  pressed: boolean;
  dragging: boolean;
  notification?: { id: string; priority: 'normal' | 'urgent' };
}
export const initialCharacterState: CharacterState = {
  emotion: 'neutre', activity: 'idle', gaze: { x: 0, y: 0 }, hover: false, pressed: false, dragging: false,
};
/** Semantic state only. Operational activity never implicitly changes emotion. */
export class CharacterController {
  state: CharacterState;
  constructor(state: CharacterState = initialCharacterState) { this.state = { ...state }; }
  update(patch: Partial<CharacterState>) { this.state = { ...this.state, ...patch }; return this.state; }
}
