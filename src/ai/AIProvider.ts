export type ProviderReadiness = 'uninitialized' | 'loading' | 'ready' | 'error';
export interface ConversationMessage { role: 'user' | 'assistant'; content: string }
export interface AIProvider {
  readonly readiness: ProviderReadiness;
  initialize(): Promise<void>;
  generate(messages: ConversationMessage[], onDelta: (text: string) => void, signal: AbortSignal): Promise<string>;
  cancel(): Promise<void>;
  shutdown(): Promise<void>;
}
export interface LocalAITransport {
  initialize(): Promise<void>;
  generate(messages: ConversationMessage[], onDelta: (text: string) => void): Promise<string>;
  cancel(): Promise<void>;
  shutdown(): Promise<void>;
}
/** Process and model specifics stay behind the native transport. No speech imports. */
export class LocalSlimeAIProvider implements AIProvider {
  readiness: ProviderReadiness = 'uninitialized';
  private loading?: Promise<void>;
  constructor(private transport: LocalAITransport) {}
  initialize() {
    if (this.readiness === 'ready') return Promise.resolve();
    if (!this.loading) {
      this.readiness = 'loading';
      this.loading = this.transport.initialize().then(() => { this.readiness = 'ready'; }).catch((error: unknown) => { this.readiness = 'error'; throw error; }).finally(() => { this.loading = undefined; });
    }
    return this.loading;
  }
  async generate(messages: ConversationMessage[], onDelta: (text: string) => void, signal: AbortSignal) {
    const cancel = () => { void this.cancel(); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (signal.aborted) throw new Error('Cancelled');
      const result = await this.transport.generate(messages, (text) => { if (!signal.aborted) onDelta(text); });
      this.readiness = 'ready'; return result;
    } catch (error) { if (!signal.aborted) this.readiness = 'error'; throw error; }
    finally { signal.removeEventListener('abort', cancel); }
  }
  cancel() { return this.transport.cancel(); }
  async shutdown() { await this.transport.shutdown(); this.readiness = 'uninitialized'; }
}
