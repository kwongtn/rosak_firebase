/**
 * Which Web Storage area a value lives in. `local` survives the tab being closed or killed;
 * `session` belongs to one tab, survives a reload, and is gone once the tab is closed.
 */
export type WebStorageArea = "local" | "session";

/**
 * Best-effort Web Storage access, the same wrappers `PreferencesService` keeps for itself.
 * `localStorage` and `sessionStorage` can throw on any access (blocked site data, some private
 * windows, a full quota), and the property itself is missing on the server. A failed read returns
 * `null` and a failed write or removal is dropped: the rider loses persistence for this visit, not
 * the page. Callers gate on `injectIsBrowser()` first.
 */
function areaOf(area: WebStorageArea): Storage {
  return area === "local" ? globalThis.localStorage : globalThis.sessionStorage;
}

/** The stored string, or `null` when nothing is stored or storage is unavailable. */
export function readStorageItem(area: WebStorageArea, key: string): string | null {
  try {
    return areaOf(area).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageItem(area: WebStorageArea, key: string, value: string): void {
  try {
    areaOf(area).setItem(key, value);
  } catch {
    // Persistence is best-effort; the in-memory signals still drive this visit's UI.
  }
}

export function removeStorageItem(area: WebStorageArea, key: string): void {
  try {
    areaOf(area).removeItem(key);
  } catch {
    // Same as a failed write: the value may outlive this call, and nothing else depends on it.
  }
}
