import { useEffect, useRef, useState } from 'react';
import { NotchMotionDriver } from './NotchMotionDriver';
import type { MotionFrame } from './NotchMotionController';
import { motionTargets } from './NotchMotionController';
import { paintNotch } from './useNotchMotion';
import type { NotchAction, NotchState } from './types';
import { Slime } from '../character/slime';
import './motion-lab.css';
export function NotchMotionLab() {
  const surface = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const driver = useRef<NotchMotionDriver | null>(null);
  const revision = useRef(0);
  const state = useRef<NotchState>('HIDDEN');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduced = useRef(false);
  const stress = useRef(false);
  const [frame, setFrame] = useState<MotionFrame>();
  const [metrics, setMetrics] = useState<NotchMotionDriver['metrics']>();
  const [interval, setInterval] = useState(32);
  const [events, setEvents] = useState<string[]>([]);
  const [result, setResult] = useState('');
  useEffect(() => {
    const motion = new NotchMotionDriver({ motion: async (bounds) => {
      host.current!.style.width = `${bounds.width}px`; host.current!.style.height = `${bounds.height}px`;
      return bounds;
    } }, { now: () => performance.now(), request: (callback) => window.requestAnimationFrame(callback), cancel: (id) => window.cancelAnimationFrame(id) }, (next) => {
      paintNotch(surface.current!, next); setFrame(next); setMetrics({ ...motion.metrics });
      if (stress.current && next.settled && next.state === 'COLLAPSED') {
        stress.current = false;
        setResult(next.width === 90 && next.height === 48 && next.anchorX === 0 ? 'PASS: converged without drift' : 'FAIL: final geometry drift');
      }
    }, (event, target) => setEvents((log) => [`${event}: ${target}`, ...log].slice(0, 8)), undefined, interval);
    driver.current = motion;
    motion.onDiagnostics = setMetrics;
    return () => { clearTimeout(timer.current); motion.dispose(); driver.current = null; };
  }, [interval]);
  function send(action: NotchAction) {
    let next = state.current;
    if (action === 'HIDE') next = 'HIDDEN';
    if (action === 'COLLAPSE' || action === 'SHOW') next = 'COLLAPSED';
    if (action === 'EXPAND') next = 'EXPANDED';
    if (action === 'COMPACT') next = 'COMPACT';
    if (action === 'TOGGLE_ASSISTANT') next = next === 'EXPANDED' ? 'COLLAPSED' : 'EXPANDED';
    if (action === 'TOGGLE_COMPACT') next = next === 'COLLAPSED' ? 'COMPACT' : 'COLLAPSED';
    state.current = next;
    driver.current?.request({ state: next, revision: ++revision.current }, reduced.current);
  }
  function sequence(actions: NotchAction[], delay: number, verify = false) {
    clearTimeout(timer.current); stress.current = verify; setResult(''); let index = 0;
    const tick = () => { send(actions[index++]); if (index < actions.length) timer.current = setTimeout(tick, delay); };
    tick();
  }
  return <main className="motion-lab">
    <h1>Notch Motion Lab — development only</h1>
    <label>Native resize interval <select value={interval} onChange={(event) => { state.current = 'HIDDEN'; setInterval(Number(event.target.value)); }}>{[16, 24, 32, 40].map((ms) => <option key={ms} value={ms}>{ms}ms</option>)}</select></label>
    <p>The outline is the native host envelope. The dark surface is the continuous visual geometry.</p>
    <div className="motion-stage"><div ref={host} className="motion-host"><div ref={surface} className="notch-surface"
      onPointerEnter={() => driver.current?.interact(true, false)} onPointerLeave={() => driver.current?.interact(false, false)}
      onPointerDown={() => driver.current?.interact(true, true)} onPointerUp={() => { driver.current?.interact(true, false); send('TOGGLE_COMPACT'); }}>
      <div className="notch-character"><Slime size={44} alt="Slime" /></div>
      <div className="notch-content"><div className="lab-content" aria-label="Content reveal test geometry" /></div>
    </div></div></div>
    <div>{(['SHOW', 'HIDE', 'COLLAPSE', 'COMPACT', 'EXPAND', 'TOGGLE_ASSISTANT'] as NotchAction[]).map((action) => <button key={action} onClick={() => send(action)}>{action}</button>)}</div>
    <button onClick={() => sequence(['EXPAND', 'COLLAPSE'], 100)}>Interrupt expansion</button>
    <button onClick={() => sequence(['COLLAPSE', 'EXPAND'], 100)}>Interrupt collapse</button>
    <button onClick={() => sequence(['COMPACT', 'COLLAPSE'], 1500)}>Notification-equivalent compact</button>
    <button onClick={() => sequence([...Array.from({ length: 50 }, (_, i): NotchAction => i % 7 === 0 ? 'HIDE' : i % 2 ? 'EXPAND' : 'COMPACT'), 'COLLAPSE'], 80, true)}>4-second rapid reversal stress</button>
    <label><input type="checkbox" onChange={(event) => { reduced.current = event.target.checked; driver.current?.request({ state: state.current, revision: ++revision.current }, reduced.current); }} />Reduced motion</label>
    <pre>{JSON.stringify({ state: frame?.state, geometry: frame, target: frame ? motionTargets[frame.state] : undefined, metrics }, null, 2)}</pre>
    <p>{result}</p><pre>{events.join('\n')}</pre>
  </main>;
}

