import type { AIProvider, ConversationMessage } from '../ai/AIProvider';
export type AssistantState = 'idle' | 'attention' | 'loading' | 'thinking' | 'responding' | 'success' | 'error' | 'permission' | 'notable';
export interface Turn { id: number; request: string; response: string; complete: boolean; cancelled?: boolean }
export interface AssistantSnapshot { state: AssistantState; turns: Turn[]; error: string | null; busy: boolean }
/** Keep recent complete pairs, never orphan assistant messages or retain failed partial output as context. */
export function boundedContext(turns: Turn[], request: string): ConversationMessage[] {
  const result: ConversationMessage[] = [{ role: 'user', content: request }];
  let remaining = 6000 - request.length;
  for (const turn of turns.filter((t) => t.complete).slice(-6).reverse()) {
    if (turn.request.length + turn.response.length > remaining) break;
    result.unshift({ role: 'user', content: turn.request }, { role: 'assistant', content: turn.response });
    remaining -= turn.request.length + turn.response.length;
  }
  return result;
}
export class AssistantController {
  private snapshot: AssistantSnapshot = { state: 'idle', turns: [], error: null, busy: false };
  private listeners = new Set<() => void>();
  private abort?: AbortController;
  private nextId = 0;
  private lastActivity = 0;
  constructor(private provider: AIProvider, private activity: () => void, private log: (error: unknown) => void = () => {}) {}
  interact = () => { const now = performance.now(); if (now - this.lastActivity >= 250) { this.lastActivity = now; this.activity(); } };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AssistantSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((listener) => listener()); }
  async attention() {
    if (this.snapshot.busy) return;
    this.update({ state: this.provider.readiness === 'ready' ? 'attention' : 'loading', error: null });
    try { await this.provider.initialize(); if (!this.snapshot.busy) this.update({ state: 'attention' }); }
    catch (error) { this.log(error); if (!this.snapshot.busy) this.update({ state: 'error', error: 'The local model could not start. Send a message to retry.' }); }
  }
  async submit(text: string) {
    const request = text.trim();
    if (!request || this.snapshot.busy) return;
    if (request.length > 1500) { this.update({ error: 'Please keep messages under 1,500 characters.' }); return; }
    const messages = boundedContext(this.snapshot.turns, request);
    const turn: Turn = { id: ++this.nextId, request, response: '', complete: false };
    const abort = new AbortController(); this.abort = abort;
    this.update({ state: this.provider.readiness === 'ready' ? 'thinking' : 'loading', busy: true, error: null, turns: [...this.snapshot.turns.slice(-11), turn] });
    this.activity();
    const patchTurn = (patch: Partial<Turn>) => this.snapshot.turns.map((t) => t.id === turn.id ? { ...t, ...patch } : t);
    try {
      const response = await this.provider.generate(messages, (delta) => {
        const current = this.snapshot.turns.find((t) => t.id === turn.id)!;
        this.update({ state: 'responding', turns: patchTurn({ response: current.response + delta }) }); this.interact();
      }, abort.signal);
      if (abort.signal.aborted) throw new Error('Cancelled');
      this.update({ state: 'success', turns: patchTurn({ response, complete: true }) });
    } catch (error) {
      if (abort.signal.aborted) this.update({ state: 'attention', turns: patchTurn({ cancelled: true }) });
      else { this.log(error); this.update({ state: 'error', error: 'The local model could not finish. Please try again.' }); }
    } finally { this.abort = undefined; this.update({ busy: false }); this.activity(); }
  }
  cancel() { this.abort?.abort(); }
  dispose() { this.cancel(); this.listeners.clear(); }
}
