export type NotchState = 'COLLAPSED' | 'COMPACT' | 'EXPANDED' | 'HIDDEN';
export type NotchAction = 'TOGGLE_COMPACT' | 'TOGGLE_ASSISTANT' | 'SHOW' | 'HIDE' | 'COLLAPSE' | 'COMPACT' | 'EXPAND';
export interface NotchSnapshot { state: NotchState; revision: number }
export interface MotionBounds { revision: number; width: number; height: number; settled: boolean }
export interface HostSize { width: number; height: number }
export interface NotchService {
  snapshot(): Promise<NotchSnapshot>;
  ready(): Promise<NotchSnapshot>;
  motion(bounds: MotionBounds): Promise<HostSize>;
  dispatch(action: NotchAction): Promise<NotchSnapshot>;
  subscribe(listener: (snapshot: NotchSnapshot) => void): Promise<() => void>;
}
