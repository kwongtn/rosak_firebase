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

/**
 * Prefix of every report draft kept in `sessionStorage` (home's line-status sheet, spotting's report
 * form). A draft is one person's typing, so {@link claimSessionDrafts} removes every key under it
 * when the signed-in account changes.
 */
export const SESSION_DRAFT_PREFIX = "rosak:draft:";

/** `sessionStorage`: the uid that was signed in while this tab's drafts were saved. */
const DRAFT_OWNER_KEY = "rosak:draft-owner";

/**
 * Hands this tab's drafts to the account now signed in (`null`: nobody). `AuthService` calls it on
 * every auth state change. When the recorded owner is someone else, or nobody is signed in any
 * more, every draft is removed first: on a shared device the next person must not get the last
 * person's notes back. A draft saved while signed out has no owner and survives a sign-in, so the
 * login popup never costs the reader their typing.
 */
export function claimSessionDrafts(uid: string | null): void {
  const owner = readStorageItem("session", DRAFT_OWNER_KEY);
  if (owner !== null && owner !== uid) {
    removeSessionDrafts();
  }
  if (uid === null) {
    removeStorageItem("session", DRAFT_OWNER_KEY);
  } else {
    writeStorageItem("session", DRAFT_OWNER_KEY, uid);
  }
}

/**
 * A saved draft, or `null` when there is none or it was saved for an account other than `uid` (the
 * signed-in uid, `null` when signed out). This covers the moment before Firebase has restored the
 * session on a new page, when {@link claimSessionDrafts} has not run for it yet.
 */
export function readSessionDraft(key: string, uid: string | null): string | null {
  const owner = readStorageItem("session", DRAFT_OWNER_KEY);
  return owner === null || owner === uid ? readStorageItem("session", key) : null;
}

function removeSessionDrafts(): void {
  try {
    const storage = globalThis.sessionStorage;
    // Backwards, because a removal shifts the keys after it.
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key?.startsWith(SESSION_DRAFT_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Storage that cannot be read cannot hand a draft to anyone either.
  }
}
