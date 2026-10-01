import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { AIProvider } from '../ai/AIProvider';
import { AssistantController } from '../assistant/AssistantController';
import { CharacterController } from '../character/slime/CharacterController';
import { reportError } from '../shared/logging';
import type { NotchService } from './types';
import { presentationFor } from './types';
import { useNotch } from './useNotch';
import { useNotchMotion } from './useNotchMotion';
import { Slime } from '../character/slime';
export function NotchWindow({ service, provider }: { service: NotchService; provider: AIProvider }) {
  const { snapshot, ready, dispatch } = useNotch(service);
  const presentation = snapshot.presentation ?? presentationFor(snapshot.state);
  const surface = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = useMemo(() => new AssistantController(provider, () => { void service.dispatch('ACTIVITY').catch(reportError); }, reportError), [provider, service]);
  const activity = controller.interact;
  const assistant = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const responseLength = assistant.turns.at(-1)?.response.length ?? 0;
  const height = 220 + Math.min(140, Math.ceil(responseLength / 100) * 20);
  const interact = useNotchMotion(surface, service, snapshot, ready, height);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [text, setText] = useState('');
  const character = useMemo(() => ({ ...CharacterController.forAssistant((presentation === 'CHARACTER' || presentation === 'HIDDEN') && !assistant.busy ? 'idle' : assistant.state), gaze }), [presentation, assistant.state, assistant.busy, gaze]);
  useEffect(() => { if (presentation === 'PROMPT') void controller.attention(); }, [presentation, controller]);
  useEffect(() => {
    const element = surface.current!;
    const focus = () => { queueMicrotask(() => { if (element.dataset.presentation === 'PROMPT' || element.dataset.presentation === 'CHAT') input.current?.focus({ preventScroll: true }); }); };
    element.addEventListener('onContentReady', focus);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); dispatch('COLLAPSE'); } };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); element.removeEventListener('onContentReady', focus); };
  }, [dispatch]);
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!text.trim() || assistant.busy) return;
    const message = text; setText(''); activity(); dispatch('EXPAND'); void controller.submit(message);
  }
  return <div ref={surface} className="notch-surface" data-state={snapshot.state} data-presentation={presentation}
    onContextMenu={(event) => event.preventDefault()} onKeyDown={activity} onWheel={activity}
    onPointerEnter={() => { interact(true, false); activity(); }} onPointerLeave={() => { interact(false, false); setGaze({ x: 0, y: 0 }); }}
    onPointerDown={(event) => { if (event.button !== 0) return; interact(true, true); activity(); }} onPointerUp={() => interact(true, false)} onPointerCancel={() => interact(false, false)}
    onPointerMove={(event) => { activity(); const r = event.currentTarget.getBoundingClientRect(); setGaze({ x: (event.clientX - r.left) / r.width * 2 - 1, y: (event.clientY - r.top) / r.height * 2 - 1 }); }}>
    <button className="notch-hit" aria-label="Summon Slime" tabIndex={presentation === 'CHARACTER' ? 0 : -1} onClick={() => dispatch('SHOW')} />
    <div className="notch-character"><div className="notch-character-deformation"><Slime state={character} size={44} color="#f5f5f5" eyeColor="#000000" alt="" /></div></div>
    <div className="notch-content" inert>
      <form className="assistant-prompt" onSubmit={submit}>
        <input ref={input} aria-label="Message Slime" value={text} maxLength={1500} placeholder={assistant.error ? 'Model unavailable. Send to retry.' : 'Ask Slime…'} autoComplete="off" spellCheck={false} onChange={(event) => { setText(event.target.value); activity(); }} />
        {assistant.busy ? <button type="button" aria-label="Stop response" onClick={() => controller.cancel()}>■</button> : <button type="submit" aria-label="Send message" disabled={!text.trim()}>↑</button>}
      </form>
      <div className="assistant-conversation" onScroll={activity} aria-label="Conversation" aria-busy={assistant.busy}>
        {assistant.turns.map((turn) => <div key={turn.id} className="assistant-turn"><p className="user-message">{turn.request}</p><p>{turn.response || (turn.cancelled ? 'Cancelled.' : assistant.busy ? 'Thinking…' : '')}</p>{turn.cancelled && turn.response && <small>Stopped</small>}</div>)}
        {assistant.error && <p role="alert">{assistant.error}</p>}
      </div>
    </div>
  </div>;
}
