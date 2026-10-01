import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { NotchService } from './types';
import { useNotch } from './useNotch';
import { useNotchMotion } from './useNotchMotion';
import { Slime } from '../character/slime';
export function NotchWindow({ service, children }: { service: NotchService; children?: ReactNode }) {
  const { snapshot, ready, dispatch } = useNotch(service);
  const surface = useRef<HTMLDivElement>(null);
  const interact = useNotchMotion(surface, service, snapshot, ready);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); dispatch('COLLAPSE'); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [dispatch]);
  return <div ref={surface} className="notch-surface" data-state={snapshot.state}
    onPointerEnter={() => interact(true, false)} onPointerLeave={() => { interact(false, false); setGaze({ x: 0, y: 0 }); }}
    onPointerDown={() => interact(true, true)} onPointerUp={() => interact(true, false)} onPointerCancel={() => interact(false, false)}
    onPointerMove={(event) => { const r = event.currentTarget.getBoundingClientRect(); setGaze({ x: (event.clientX - r.left) / r.width * 2 - 1, y: (event.clientY - r.top) / r.height * 2 - 1 }); }}
    >
    <button className="notch-hit" aria-label="Slime assistant" aria-expanded={snapshot.state === 'EXPANDED'} onClick={() => dispatch('TOGGLE_COMPACT')} />
    <div className="notch-character"><Slime emotion="neutre" state={{ gaze }} size={44} color="#f5f5f5" eyeColor="#000000" alt="" /></div>
    <div className="notch-content" inert>{children}</div>
  </div>;
}
