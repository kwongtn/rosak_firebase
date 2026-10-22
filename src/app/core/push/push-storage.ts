import { readStorageItem, removeStorageItem, writeStorageItem } from "../util/web-storage.util";

/** A line this browser gets alerts for, in the shape `pushSubscription` returns it. */
export interface PushLine {
  id: string;
  code: string;
}

/** What this browser keeps about its alerts: its FCM token and the lines registered with it. */
export interface StoredPushState {
  token: string;
  lines: PushLine[];
}

/**
 * `localStorage`, versioned by the key like `rosak:preferences:v1`. Nothing is stored while no line
 * has alerts, so "a token is stored" and "alerts are on" are one fact.
 *
 * Its own module, apart from `push.service.ts`, so `AuthService` can ask "does this browser have
 * alerts?" on every sign-in and sign-out without loading the push chunk.
 */
export const PUSH_STORAGE_KEY = "rosak:push:v1";

function isPushLine(value: unknown): value is PushLine {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const line = value as Record<string, unknown>;
  return typeof line["id"] === "string" && typeof line["code"] === "string";
}

/**
 * The stored state, or `null` when none is stored, storage cannot be read, or the payload is not a
 * token with at least one well-formed line. A half-readable payload is dropped whole: alerts are
 * re-registered from a tap, which beats sending the backend a guessed line list.
 */
export function readPushState(): StoredPushState | null {
  const raw = readStorageItem("local", PUSH_STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const { token, lines } = parsed as Record<string, unknown>;
  if (typeof token !== "string" || token === "" || !Array.isArray(lines)) {
    return null;
  }
  return lines.length > 0 && lines.every(isPushLine) ? { token, lines } : null;
}

/** Stores `state`, or clears the key for `null`. Best effort, like every web-storage write here. */
export function writePushState(state: StoredPushState | null): void {
  if (state === null) {
    removeStorageItem("local", PUSH_STORAGE_KEY);
  } else {
    writeStorageItem("local", PUSH_STORAGE_KEY, JSON.stringify(state));
  }
}
