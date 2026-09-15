import { TestBed } from "@angular/core/testing";
import { HttpClient, HttpResponse } from "@angular/common/http";
import { PLATFORM_ID } from "@angular/core";
import { of } from "rxjs";
import { ImageUploadService, UPLOAD_ERROR_REPORTER } from "./image-upload.service";
import { AuthService } from "../auth/auth.service";

/**
 * jsdom has no IndexedDB, so the real `deletePendingUpload` rejects when its
 * transaction errors. The fake below lets `loadAllPendingUploads` (readonly)
 * succeed but makes `deletePendingUpload` (readwrite) fail. A relative `vi.mock`
 * cannot be used here — the Angular unit-test builder throws on relative mocks.
 *
 * `deleteDatabase` is stubbed too: other specs in the same bundle import
 * firebase/app+auth, whose persistence calls it on the shared globalThis mock.
 */
function installIndexedDbMock(): void {
  let nextId = 1;
  const store = new Map<number, unknown>();

  class FakeRequest {
    result: unknown;
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(result: unknown, fail = false) {
      this.result = result;
      queueMicrotask(() => (fail ? this.onerror?.() : this.onsuccess?.()));
    }
  }

  class FakeObjectStore {
    constructor(private readonly failDelete: boolean) {}
    add(item: unknown): FakeRequest {
      const id = nextId++;
      store.set(id, item);
      return new FakeRequest(id);
    }
    getAll(): FakeRequest {
      return new FakeRequest([...store.values()]);
    }
    delete(): FakeRequest {
      return new FakeRequest(undefined, this.failDelete);
    }
  }

  class FakeTransaction {
    store = new FakeObjectStore(false);
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(failDelete: boolean) {
      this.store = new FakeObjectStore(failDelete);
      queueMicrotask(() => (failDelete ? this.onerror?.() : this.oncomplete?.()));
    }
    objectStore(): FakeObjectStore {
      return this.store;
    }
  }

  class FakeDB {
    createObjectStore(): FakeObjectStore {
      return new FakeObjectStore(false);
    }
    transaction(_name: string, mode: string): FakeTransaction {
      return new FakeTransaction(mode === "readwrite");
    }
    close(): void {}
  }

  // Real IndexedDB returns a NEW request per `open()`; reusing one would fire its success
  // handler only once and hang the second `openDb()` (e.g. from deletePendingUpload).
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    open: () => {
      const db = new FakeDB();
      const openRequest = {
        result: db,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
      };
      queueMicrotask(() => {
        openRequest.onupgradeneeded?.();
        openRequest.onsuccess?.();
      });
      return openRequest;
    },
    deleteDatabase: () => {
      const request = {
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
}

describe("ImageUploadService", () => {
  let reportError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reportError = vi.fn();
    installIndexedDbMock();
    TestBed.configureTestingModule({
      providers: [
        ImageUploadService,
        { provide: PLATFORM_ID, useValue: "browser" },
        {
          provide: HttpClient,
          useValue: {
            post: vi.fn().mockReturnValue(of(new HttpResponse({ status: 200 }))),
          },
        },
        { provide: AuthService, useValue: { idToken: vi.fn().mockResolvedValue("token") } },
        { provide: UPLOAD_ERROR_REPORTER, useValue: reportError },
      ],
    });
  });

  it("routes deletePendingUpload failure to the error reporter", async () => {
    const service = TestBed.inject(ImageUploadService);
    (service as unknown as { pendingUploads: unknown[] }).pendingUploads = [
      {
        type: "SPOTTING_EVENT",
        relatedId: 1,
        file: { file: new File([], "x.png"), toCompress: false, isCompressed: true },
        dbId: 1,
      },
    ];
    await (service as unknown as { triggerUpload: () => Promise<void> }).triggerUpload();
    // triggerUpload() awaits the IndexedDB cleanup, so the failure report has
    // fired by the time it resolves — no polling needed.
    expect(reportError).toHaveBeenCalled();
  });
});
