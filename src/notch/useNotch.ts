import { useEffect, useState } from 'react';
import type { NotchService, NotchSnapshot, NotchAction } from './types';
import { reportError } from '../shared/logging';

// A projection of native state, never a second transition policy.
export function useNotch(service: NotchService) {
  const [snapshot, setSnapshot] = useState<NotchSnapshot>({ state: 'COLLAPSED', revision: -1 });
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let frame = 0;
    const accept = (next: NotchSnapshot) => {
      if (active) setSnapshot((current) => next.revision >= current.revision ? next : current);
    };
    void (async () => {
      const stop = await service.subscribe(accept);
      if (!active) { stop(); return; }
      unsubscribe = stop;
      accept(await service.snapshot());
      if (!active) return;
      // Native host stays hidden until React has painted the surface.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (active) void service.ready().then(accept).catch(reportError);
        });
      });
    })().catch(reportError);
    return () => { active = false; cancelAnimationFrame(frame); unsubscribe?.(); };
  }, [service]);

  function dispatch(action: NotchAction) {
    void service.dispatch(action).then((next) => {
      setSnapshot((current) => next.revision >= current.revision ? next : current);
    }).catch(reportError);
  }
  return { state: snapshot.state, dispatch };
}
