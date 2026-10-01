import { error as logError } from '@tauri-apps/plugin-log';
import { errorMessage } from './types';

export function reportError(error: unknown): string {
  const message = errorMessage(error);
  console.error(message);
  void logError(message).catch(() => { /* Console remains available if native logging fails. */ });
  return message;
}
