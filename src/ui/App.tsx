import type { NotchService } from '../notch/types';
import { NotchWindow } from '../notch/NotchWindow';
import type { AIProvider } from '../ai/AIProvider';

export function App({ notch, provider }: { notch: NotchService; provider: AIProvider }) {
  return <NotchWindow service={notch} provider={provider} />;
}
