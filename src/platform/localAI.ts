import { Channel, invoke } from '@tauri-apps/api/core';
import { LocalSlimeAIProvider } from '../ai/AIProvider';
export const localAI = new LocalSlimeAIProvider({
  initialize: () => invoke('ai_initialize'),
  cancel: () => invoke('ai_cancel'),
  shutdown: () => invoke('ai_shutdown'),
  generate: (messages, delta) => {
    const onEvent = new Channel<{ type: 'delta'; text: string } | { type: 'ready' | 'done' }>();
    onEvent.onmessage = (event) => { if (event.type === 'delta') delta(event.text); };
    return invoke<string>('ai_generate', { messages, onEvent });
  },
});
