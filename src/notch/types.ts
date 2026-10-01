export type NotchState = 'COLLAPSED' | 'COMPACT' | 'EXPANDED' | 'HIDDEN';
export type NotchAction = 'TOGGLE_COMPACT' | 'TOGGLE_ASSISTANT' | 'SHOW' | 'HIDE' | 'COLLAPSE' | 'COMPACT' | 'EXPAND' | 'ACTIVITY';
export type Presentation = 'HIDDEN' | 'CHARACTER' | 'PROMPT' | 'CHAT';
export const presentationFor = (state: NotchState): Presentation => ({ HIDDEN: 'HIDDEN', COLLAPSED: 'CHARACTER', COMPACT: 'PROMPT', EXPANDED: 'CHAT' } as const)[state];
export interface NotchSnapshot { state: NotchState; presentation?: Presentation; revision: number }
export interface MotionBounds { revision: number; width: number; height: number; settled: boolean }
export interface HostSize { width: number; height: number }
export interface NotchService {
  snapshot(): Promise<NotchSnapshot>;
  ready(): Promise<NotchSnapshot>;
  motion(bounds: MotionBounds): Promise<HostSize>;
  dispatch(action: NotchAction): Promise<NotchSnapshot>;
  subscribe(listener: (snapshot: NotchSnapshot) => void): Promise<() => void>;
}
