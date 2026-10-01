import type { SlimeEmotion } from './assets';
import type { AssistantState } from '../../assistant/AssistantController';

export type CharacterActivity = 'idle' | 'listening' | 'thinking' | 'working' | 'responding' | 'notifying' | 'speaking' | 'error';
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
  static forAssistant(state: AssistantState): CharacterState {
    const reaction: Record<AssistantState, [SlimeEmotion, CharacterActivity]> = {
      idle: ['neutre', 'idle'], attention: ['attentif', 'listening'], loading: ['curieux', 'thinking'], thinking: ['curieux', 'thinking'],
      responding: ['curieux', 'responding'], success: ['heureux', 'idle'], error: ['confus', 'error'], permission: ['mefiant', 'idle'], notable: ['fier', 'idle'],
    };
    const [emotion, activity] = reaction[state]; return { ...initialCharacterState, emotion, activity };
  }
}
/** Optional metadata is never applied directly. No classifier is installed in this phase. */
export function normalizeModelAffect(value: unknown): SlimeEmotion | undefined {
  const allowed = ['neutre','attentif','curieux','confus','heureux','hilare','surpris','excite','triste','colere','effraye','mefiant','fier','timide','blase','somnolent'];
  return typeof value === 'string' && allowed.includes(value) ? value as SlimeEmotion : undefined;
}
