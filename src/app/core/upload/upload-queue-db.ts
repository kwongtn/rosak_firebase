import { PendingUploadType } from "./image-upload.service";

const DB_NAME = "rosak-upload-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending";

export interface PersistedUpload {
  /** IndexedDB's own key — undefined for a record that hasn't been saved yet. */
  id?: number;
  relatedId: number | string;
  type: PendingUploadType;
  file: File;
}

/**
 * IndexedDB-backed durability for ImageUploadService's queue: an in-memory-only queue (what both
 * this app and the old one shipped with) loses everything the instant the tab closes, refreshes,
 * or the browser crashes mid-upload — even for a photo that had *already* finished compressing
 * and was just waiting its turn. This persists exactly that "ready to upload" state so it survives
 * any of those, and gets picked back up the next time the app loads. It does not — cannot — make
 * an upload continue running while the tab/browser is actually closed; nothing in a standard web
 * app can do that (see ImageUploadService's own doc comment for the fuller honest breakdown).
 *
 * Every function here is best-effort and never throws to its caller: a failure (private browsing,
 * storage quota, an unsupported browser) should mean "this session's queue isn't backed up," not
 * "uploading is broken" — ImageUploadService already works perfectly well with an in-memory-only
 * queue, which is exactly what callers fall back to.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePendingUpload(item: Omit<PersistedUpload, "id">): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).add(item);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function deletePendingUpload(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllPendingUploads(): Promise<PersistedUpload[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as PersistedUpload[]);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
