/**
 * Stable per-tab client write id used to identify mutations that originated in
 * this browser session. Realtime payloads carrying this id (or that arrive
 * within a short window after a local save) are treated as echoes and skipped
 * by `useComputeFlowRealtime`, preventing the flicker caused by the local tab
 * re-importing its own writes.
 *
 * This is intentionally module-scoped (one id per tab/load), not persisted.
 */
const CLIENT_WRITE_ID = `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export function getClientWriteId(): string {
  return CLIENT_WRITE_ID;
}

export function withClientWriteId<T extends Record<string, unknown> | undefined | null>(
  metadata: T
): Record<string, unknown> {
  return {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    clientWriteId: CLIENT_WRITE_ID,
  };
}

export function isOwnClientWriteId(metadata: unknown): boolean {
  return (
    Boolean(metadata) &&
    typeof metadata === 'object' &&
    (metadata as Record<string, unknown>).clientWriteId === CLIENT_WRITE_ID
  );
}

// Track the timestamp of the most recent local save per project so the
// realtime hook can ignore echo payloads that arrive within the echo window.
const lastLocalSaveAt = new Map<string, number>();
const ECHO_WINDOW_MS = 2500;

export function markLocalSave(projectId: string): void {
  lastLocalSaveAt.set(projectId, Date.now());
}

export function isWithinEchoWindow(projectId: string): boolean {
  const ts = lastLocalSaveAt.get(projectId);
  if (!ts) return false;
  return Date.now() - ts < ECHO_WINDOW_MS;
}
