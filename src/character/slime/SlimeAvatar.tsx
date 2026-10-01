import { useMemo } from 'react';
import type { SlimeEmotion } from './assets';
import { CharacterController, initialCharacterState } from './CharacterController';
import type { CharacterState } from './CharacterController';
import { SlimeRenderer } from './SlimeRenderer';
import './slime.css';
export interface SlimeAppearanceProps {
  size?: number;
  color?: string;
  eyeColor?: string;
  animated?: boolean;
  reducedMotion?: boolean;
  alt?: string;
  className?: string;
}
export interface SlimeProps extends SlimeAppearanceProps { emotion?: SlimeEmotion; state?: Partial<CharacterState> }
export function SlimeAvatar({ emotion = 'neutre', state, ...appearance }: SlimeProps) {
  const character = useMemo(() => new CharacterController(), []);
  const resolved = useMemo(() => character.update({ ...initialCharacterState, ...state, emotion: state?.emotion ?? emotion }), [character, state, emotion]);
  return <SlimeRenderer state={resolved} {...appearance} />;
}
