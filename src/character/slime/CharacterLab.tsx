import { useEffect, useRef, useState } from 'react';
import { Slime } from './Slime';
import { slimeAssets, slimeEmotions } from './assets';
import type { SlimeEmotion } from './assets';
import { initialCharacterState } from './CharacterController';
import type { CharacterActivity } from './CharacterController';
import { themeSlimeSvg } from './svg';
import './lab.css';
const sequences: SlimeEmotion[][] = [
  ['neutre', 'attentif', 'curieux', 'heureux', 'neutre'], ['triste', 'heureux'], ['mefiant', 'surpris'],
  ['excite', 'blase', 'effraye', 'hilare', 'colere', 'timide', 'neutre'],
];
export function CharacterLab() {
  const [state, setState] = useState(initialCharacterState);
  const [reduced, setReduced] = useState(false);
  const [animated, setAnimated] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  const select = (emotion: SlimeEmotion) => { stop(); setState((s) => ({ ...s, emotion })); };
  const sequence = (items: SlimeEmotion[], delay: number) => {
    stop(); let index = 0;
    const next = () => { setState((s) => ({ ...s, emotion: items[index++] })); if (index < items.length) timer.current = setTimeout(next, delay); };
    next();
  };
  return <main className="character-lab">
    <h1>Character Lab (development only)</h1>
    <p>Left: persistent character. Right: supplied source at its first frame. Disable animation for settled-pose comparison.</p>
    <div className="lab-preview" onPointerEnter={() => setState((s) => ({ ...s, hover: true }))}
      onPointerLeave={() => setState((s) => ({ ...s, hover: false, pressed: false, dragging: false, gaze: { x: 0, y: 0 } }))}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setState((s) => ({ ...s, pressed: true })); }}
      onPointerUp={() => setState((s) => ({ ...s, pressed: false, dragging: false }))}
      onPointerCancel={() => setState((s) => ({ ...s, pressed: false, dragging: false }))}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setState((s) => ({ ...s, dragging: s.pressed, gaze: { x: (e.clientX - r.left) / r.width * 2 - 1, y: (e.clientY - r.top) / r.height * 2 - 1 } })); }}>
      <Slime state={state} size={250} animated={animated} reducedMotion={reduced} />
      <img width={250} height={250} alt="Source pose reference" src={`data:image/svg+xml,${encodeURIComponent(themeSlimeSvg(slimeAssets[state.emotion], '#f5f5f5', '#000000', false))}`} />
    </div>
    <p>Emotion: {state.emotion}; activity: {state.activity}. Move, hover, or press/drag in the preview.</p>
    <label><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />Reduced motion</label>
    <label><input type="checkbox" checked={animated} onChange={(e) => setAnimated(e.target.checked)} />Animation</label>
    <label>Activity <select value={state.activity} onChange={(e) => setState((s) => ({ ...s, activity: e.target.value as CharacterActivity }))}>
      {['idle', 'listening', 'thinking', 'working', 'responding', 'notifying', 'speaking'].map((v) => <option key={v}>{v}</option>)}
    </select></label>
    <div>{slimeEmotions.map((emotion) => <button key={emotion} onClick={() => select(emotion)}>{emotion}</button>)}</div>
    <div>{sequences.map((items, i) => <button key={i} onClick={() => sequence(items, i === 3 ? 70 : 800)}>{items.join(' ? ')}</button>)}<button onClick={stop}>Stop sequence</button></div>
  </main>;
}
