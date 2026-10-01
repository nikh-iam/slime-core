import type { CoreStatus, PlatformInfo } from '../shared/types';
import type { NotchService } from '../notch/types';

export interface WindowService {
  hide(): Promise<void>;
}
export interface FileSystemService { readText(path: string): Promise<string> }
export interface ClipboardService { readText(): Promise<string>; writeText(text: string): Promise<void> }
export interface ScreenService { scaleFactor(): Promise<number> }
export interface ApplicationService { quit(): Promise<void> }
export interface NotificationService { notify(title: string, body: string): Promise<void> }
export interface SecureStorageService { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }
export interface PlatformService { info(): Promise<PlatformInfo> }
export interface SettingsService { load(): Promise<CoreStatus> }
export interface DesktopServices {
  notch: NotchService;
  window: WindowService;
  fileSystem: FileSystemService;
  clipboard: ClipboardService;
  screen: ScreenService;
  application: ApplicationService;
  notification: NotificationService;
  secureStorage: SecureStorageService;
  platform: PlatformService;
  settings: SettingsService;
}
