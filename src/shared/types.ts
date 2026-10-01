export interface Settings { alwaysOnTop: boolean }
export interface PlatformInfo { name: string; scaleFactor: number }
export interface CoreStatus { platform: PlatformInfo; settings: Settings }
export interface ServiceError { code: string; message: string }

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return String(error);
}
