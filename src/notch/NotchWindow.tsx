import type { NotchService } from './types';
import { useNotch } from './useNotch';
import { Slime } from '../character/slime';

export function NotchWindow({ service }: { service: NotchService }) {
  const { state, dispatch } = useNotch(service);
  if (state === 'HIDDEN') return null;
  return <button
    className="notch-surface"
    data-state={state}
    aria-label="Slime assistant"
    aria-expanded={state === 'EXPANDED'}
    onClick={() => dispatch('TOGGLE_COMPACT')}
    onKeyDown={(event) => {
      if (event.key === 'Escape') dispatch('COLLAPSE');
    }}
  >
    <Slime.Neutre size={44} color="#f5f5f5" eyeColor="#000000" alt="" />
  </button>;
}
