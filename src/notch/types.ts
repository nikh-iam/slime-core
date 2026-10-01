export type NotchState = 'COLLAPSED' | 'COMPACT' | 'EXPANDED' | 'HIDDEN';
export type NotchAction = 'TOGGLE_COMPACT' | 'TOGGLE_ASSISTANT' | 'SHOW' | 'HIDE' | 'COLLAPSE';
export interface NotchSnapshot { state: NotchState; revision: number }
export interface NotchService {
  snapshot(): Promise<NotchSnapshot>;
  ready(): Promise<NotchSnapshot>;
  dispatch(action: NotchAction): Promise<NotchSnapshot>;
  subscribe(listener: (snapshot: NotchSnapshot) => void): Promise<() => void>;
}
