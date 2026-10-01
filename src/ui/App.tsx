import type { NotchService } from '../notch/types';
import { NotchWindow } from '../notch/NotchWindow';

export function App({ notch }: { notch: NotchService }) {
  return <NotchWindow service={notch} />;
}
