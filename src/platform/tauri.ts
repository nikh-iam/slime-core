import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DesktopServices } from './contracts';
import type { CoreStatus, PlatformInfo } from '../shared/types';
import type { NotchSnapshot } from '../notch/types';

// Transport only. OS selection and native implementations live in Rust.
function unavailable(service: string): Promise<never> {
  return Promise.reject({ code: 'unavailable', message: `${service} is unavailable in Phase 0.` });
}

export const desktop: DesktopServices = {
  notch: {
    snapshot: () => invoke<NotchSnapshot>('notch_snapshot'),
    ready: () => invoke<NotchSnapshot>('notch_ready'),
    motion: (bounds) => invoke('notch_motion', { bounds }),
    dispatch: (action) => invoke<NotchSnapshot>('notch_action', { action }),
    subscribe: async (listener) => {
      const unlisten = await listen<NotchSnapshot>('notch-state', (event) => listener(event.payload), { target: { kind: 'WebviewWindow', label: 'notch' } });
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        unlisten();
        window.removeEventListener('beforeunload', stop);
      };
      // A page reload does not destroy the native webview. Release its native listener explicitly.
      window.addEventListener('beforeunload', stop, { once: true });
      return stop;
    },
  },
  window: {
    hide: () => invoke('hide_window'),
  },
  application: { quit: () => invoke('quit_application') },
  screen: { scaleFactor: () => invoke<number>('screen_scale_factor') },
  platform: { info: () => invoke<PlatformInfo>('platform_info') },
  settings: { load: () => invoke<CoreStatus>('core_status') },
  fileSystem: { readText: () => unavailable('File access') },
  clipboard: { readText: () => unavailable('Clipboard'), writeText: () => unavailable('Clipboard') },
  notification: { notify: () => unavailable('Notifications') },
  secureStorage: { get: () => unavailable('Secure storage'), set: () => unavailable('Secure storage') },
};
