import { create } from 'zustand';
import * as Sentry from '@sentry/react-native';

// SECURITY: everything is run through redact() so a device key/secret can't reach the buffer, console, or Sentry.

export interface DebugLogEntry {
  t: string;
  stage: string;
  detail?: string;
}

interface DebugLogState {
  entries: DebugLogEntry[];
  push: (e: DebugLogEntry) => void;
  clear: () => void;
}

const MAX_ENTRIES = 200;

export const useDebugLog = create<DebugLogState>(set => ({
  entries: [],
  push: e => set(s => ({ entries: [...s.entries, e].slice(-MAX_ENTRIES) })),
  clear: () => set({ entries: [] }),
}));

// Device key wire format is `{32hex}.{64hex}`, also carried in a `DeviceKey ` Authorization header.
const DEVICE_KEY_RE = /\b[0-9a-fA-F]{32}\.[0-9a-fA-F]{16,}\b/g;
const DEVICE_KEY_HEADER_RE = /DeviceKey\s+\S+/g;

export function redact(value: string): string {
  return value.replace(DEVICE_KEY_HEADER_RE, 'DeviceKey [redacted]').replace(DEVICE_KEY_RE, '[redacted-key]');
}

export function logDebug(stage: string, detail?: string): void {
  const t = new Date().toISOString();
  const safeStage = redact(stage);
  const safeDetail = detail !== undefined ? redact(detail) : undefined;
  useDebugLog.getState().push({ t, stage: safeStage, detail: safeDetail });
  console.log('[debug]', safeStage, safeDetail ?? '');
  try {
    Sentry.addBreadcrumb({
      category: 'debug',
      level: 'info',
      message: safeStage,
      data: safeDetail ? { detail: safeDetail } : undefined,
    });
  } catch {
    // Sentry not initialised yet.
  }
}

export function clearDebugLog(): void {
  useDebugLog.getState().clear();
}
