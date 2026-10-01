import { invoke } from '@tauri-apps/api/core';
import type { DesktopServices } from './contracts';
import type { CoreStatus, PlatformInfo, Settings } from '../shared/types';

// Transport only. OS selection and native implementations live in Rust.
function unavailable(service: string): Promise<never> {
  return Promise.reject({ code: 'unavailable', message: `${service} is unavailable in Phase 0.` });
}

export const desktop: DesktopServices = {
  window: {
    startDragging: () => invoke('start_dragging'),
    hide: () => invoke('hide_window'),
    setAlwaysOnTop: (enabled) => invoke<Settings>('set_always_on_top', { enabled }),
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
