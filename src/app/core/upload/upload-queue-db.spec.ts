import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deletePendingUpload, loadAllPendingUploads, savePendingUpload } from "./upload-queue-db";

/**
 * An in-memory IndexedDB with the parts the queue uses: one auto-increment `id` store, requests that
 * answer on a later microtask, and a transaction that completes after its requests. `failOpen`
 * makes `open()` fail the way a browser with storage off (private mode, quota) does.
 */
function installFakeIndexedDb(options: { failOpen?: boolean } = {}) {
  const rows = new Map<number, Record<string, unknown>>();
  let nextId = 1;
  const stats = { opens: 0, closes: 0 };
  const createObjectStore = vi.fn();

  const answer = <T>(result: T) => {
    const request = {
      result,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };

  const db = {
    createObjectStore,
    close: () => stats.closes++,
    transaction: () => {
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        objectStore: () => ({
          add: (item: Record<string, unknown>) => {
            const id = nextId++;
            rows.set(id, { ...item, id });
            return answer(id);
          },
          delete: (id: number) => {
            rows.delete(id);
            return answer(undefined);
          },
          getAll: () => answer([...rows.values()]),
        }),
      };
      // After the request callbacks above, as in a real transaction.
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
      return tx;
    },
  };

  vi.stubGlobal("indexedDB", {
    open: () => {
      stats.opens++;
      const request = {
        result: db,
        error: new DOMException(
          "The user denied permission to access the database.",
          "SecurityError",
        ),
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
      };
      queueMicrotask(() => {
        if (options.failOpen) {
          request.onerror?.();
          return;
        }
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  });

  return { rows, stats, createObjectStore };
}

describe("upload-queue-db", () => {
  const photo = (name: string) => new File(["bytes"], name, { type: "image/jpeg" });

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the store on first open, keyed by an auto-increment id", async () => {
    const { createObjectStore } = installFakeIndexedDb();

    await loadAllPendingUploads();

    expect(createObjectStore).toHaveBeenCalledExactlyOnceWith("pending", {
      keyPath: "id",
      autoIncrement: true,
    });
  });

  it("saves a photo under a new id each time, and loads them all back with their ids", async () => {
    installFakeIndexedDb();
    const first = photo("a.jpg");
    const second = photo("b.jpg");

    const ids = [
      await savePendingUpload({ relatedId: 7, type: "SPOTTING_EVENT", file: first }),
      await savePendingUpload({
        relatedId: "abc",
        type: "INCIDENT_CALENDAR_INCIDENT",
        file: second,
      }),
    ];

    expect(ids).toEqual([1, 2]);
    expect(await loadAllPendingUploads()).toEqual([
      { id: 1, relatedId: 7, type: "SPOTTING_EVENT", file: first },
      { id: 2, relatedId: "abc", type: "INCIDENT_CALENDAR_INCIDENT", file: second },
    ]);
  });

  it("loads nothing from an empty queue", async () => {
    installFakeIndexedDb();

    expect(await loadAllPendingUploads()).toEqual([]);
  });

  it("deletes the one photo that was uploaded and keeps the rest", async () => {
    installFakeIndexedDb();
    const done = await savePendingUpload({
      relatedId: 1,
      type: "SPOTTING_EVENT",
      file: photo("a.jpg"),
    });
    await savePendingUpload({ relatedId: 2, type: "SPOTTING_EVENT", file: photo("b.jpg") });

    await deletePendingUpload(done);

    expect((await loadAllPendingUploads()).map((row) => row.relatedId)).toEqual([2]);
  });

  it("does not reuse the id of a deleted photo", async () => {
    installFakeIndexedDb();
    const first = await savePendingUpload({
      relatedId: 1,
      type: "SPOTTING_EVENT",
      file: photo("a.jpg"),
    });
    await deletePendingUpload(first);

    const second = await savePendingUpload({
      relatedId: 2,
      type: "SPOTTING_EVENT",
      file: photo("b.jpg"),
    });

    expect(second).not.toBe(first);
  });

  it("closes the database after each call", async () => {
    const { stats } = installFakeIndexedDb();

    const id = await savePendingUpload({
      relatedId: 1,
      type: "SPOTTING_EVENT",
      file: photo("a.jpg"),
    });
    await loadAllPendingUploads();
    await deletePendingUpload(id);

    expect(stats.opens).toBe(3);
    expect(stats.closes).toBe(3);
  });

  it("rejects every call when the browser refuses storage, for the caller to report", async () => {
    installFakeIndexedDb({ failOpen: true });

    await expect(
      savePendingUpload({ relatedId: 1, type: "SPOTTING_EVENT", file: photo("a.jpg") }),
    ).rejects.toMatchObject({ name: "SecurityError" });
    await expect(loadAllPendingUploads()).rejects.toMatchObject({ name: "SecurityError" });
    await expect(deletePendingUpload(1)).rejects.toMatchObject({ name: "SecurityError" });
  });
});
