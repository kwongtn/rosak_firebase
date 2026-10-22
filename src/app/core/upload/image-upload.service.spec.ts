import { TestBed } from "@angular/core/testing";
import { HttpClient, HttpErrorResponse, HttpResponse } from "@angular/common/http";
import { PLATFORM_ID } from "@angular/core";
import { of, throwError } from "rxjs";
import { ImageUploadService, UPLOAD_ERROR_REPORTER } from "./image-upload.service";
import { ImageFile } from "./image-file";
import { savePendingUpload } from "./upload-queue-db";
import { environment } from "../../../environments/environment";

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

/**
 * A little-endian Exif JPEG: IFD0 {Make "Canon", GPSInfo} and a GPS IFD {GPSLatitudeRef,
 * GPSLatitude} whose 24 coordinate bytes are all 0xab, so a surviving coordinate is easy to spot.
 */
function jpegWithGps(): Uint8Array<ArrayBuffer> {
  const ascii = (text: string) => Array.from(text, (ch) => ch.charCodeAt(0));
  const tiff = [
    ...[0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00], // "II", 42, IFD0 at 8
    ...[0x02, 0x00], // IFD0: 2 entries
    ...[0x0f, 0x01, 0x02, 0x00, 0x06, 0x00, 0x00, 0x00, 38, 0x00, 0x00, 0x00], // Make: 6 ASCII at 38
    ...[0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 44, 0x00, 0x00, 0x00], // GPSInfo: GPS IFD at 44
    ...[0x00, 0x00, 0x00, 0x00], // no IFD1
    ...ascii("Canon\0"), // 38
    ...[0x02, 0x00], // GPS IFD at 44: 2 entries
    ...[0x01, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x4e, 0x00, 0x00, 0x00], // GPSLatitudeRef "N"
    ...[0x02, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00, 0x00, 74, 0x00, 0x00, 0x00], // GPSLatitude: 3 RATIONAL at 74
    ...[0x00, 0x00, 0x00, 0x00],
    ...new Array<number>(24).fill(0xab), // 74: the coordinates
  ];
  const app1 = [0xff, 0xe1, 0x00, 2 + 6 + tiff.length, ...ascii("Exif\0\0"), ...tiff];
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9]);
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

  describe("GPS stripping", () => {
    const queue = (service: ImageUploadService, file: File): void => {
      (service as unknown as { pendingUploads: unknown[] }).pendingUploads = [
        {
          type: "SPOTTING_EVENT",
          relatedId: 1,
          file: { file, toCompress: false, isCompressed: true },
        },
      ];
    };
    const trigger = (service: ImageUploadService): Promise<void> =>
      (service as unknown as { triggerUpload: () => Promise<void> }).triggerUpload();
    const sentImages = (): File[] =>
      (TestBed.inject(HttpClient).post as ReturnType<typeof vi.fn>).mock.calls.map(
        ([, body]) => (body as FormData).get("image") as File,
      );

    it("sends a JPEG without its GPS and keeps its name, type and lastModified", async () => {
      const service = TestBed.inject(ImageUploadService);
      queue(
        service,
        new File([jpegWithGps()], "train.jpg", {
          type: "image/jpeg",
          lastModified: 1_700_000_000_000,
        }),
      );

      await trigger(service);

      const [sent] = sentImages();
      const bytes = new Uint8Array(await sent.arrayBuffer());
      expect(bytes.includes(0xab)).toBe(false);
      expect(String.fromCharCode(...bytes)).toContain("Canon");
      expect([sent.name, sent.type, sent.lastModified]).toEqual([
        "train.jpg",
        "image/jpeg",
        1_700_000_000_000,
      ]);
    });

    it("sends a file that is not a JPEG exactly as it is", async () => {
      const service = TestBed.inject(ImageUploadService);
      const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xe1])], "map.png", {
        type: "image/png",
      });
      queue(service, png);

      await trigger(service);

      expect(sentImages()).toHaveLength(1);
      expect(sentImages()[0]).toBe(png);
    });

    it("also cleans a photo resumed from the IndexedDB queue", async () => {
      // Queued by an older build, so it was saved with its GPS and is only cleaned at send time.
      await savePendingUpload({
        relatedId: 7,
        type: "SPOTTING_EVENT",
        file: new File([jpegWithGps()], "old.jpg", { type: "image/jpeg" }),
      });
      const service = TestBed.inject(ImageUploadService);
      await vi.waitFor(() => expect(service.pendingCount()).toBe(1));

      await trigger(service);

      const [sent] = sentImages();
      expect(new Uint8Array(await sent.arrayBuffer()).includes(0xab)).toBe(false);
    });

    it("retries with the cleaned file, not the original", async () => {
      const service = TestBed.inject(ImageUploadService);
      (TestBed.inject(HttpClient).post as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        throwError(() => new Error("offline")),
      );
      queue(service, new File([jpegWithGps()], "train.jpg", { type: "image/jpeg" }));

      await trigger(service);
      await trigger(service);

      const [first, second] = sentImages();
      expect(second).toBe(first);
      expect(new Uint8Array(await second.arrayBuffer()).includes(0xab)).toBe(false);
    });

    it("reads a file without GPS once across retries", async () => {
      const service = TestBed.inject(ImageUploadService);
      (TestBed.inject(HttpClient).post as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        throwError(() => new Error("offline")),
      );
      const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "map.png", {
        type: "image/png",
      });
      const read = vi.spyOn(png, "arrayBuffer");
      queue(service, png);

      await trigger(service);
      await trigger(service);

      expect(sentImages()).toHaveLength(2);
      expect(sentImages()[1]).toBe(png);
      expect(read).toHaveBeenCalledTimes(1);
    });

    it("re-queues a file it cannot read instead of sending it raw or losing it", async () => {
      const service = TestBed.inject(ImageUploadService);
      const file = new File([jpegWithGps()], "train.jpg", { type: "image/jpeg" });
      const read = vi.spyOn(file, "arrayBuffer").mockRejectedValueOnce(new Error("read failed"));
      queue(service, file);

      await trigger(service);

      expect(TestBed.inject(HttpClient).post).not.toHaveBeenCalled();
      expect(service.pendingCount()).toBe(1);

      await trigger(service);

      expect(read).toHaveBeenCalledTimes(2);
      const [sent] = sentImages();
      expect(new Uint8Array(await sent.arrayBuffer()).includes(0xab)).toBe(false);
    });
  });

  describe("the queue", () => {
    const READY = (file: File): ImageFile => ({ file, toCompress: false, isCompressed: true });
    const post = () => TestBed.inject(HttpClient).post as ReturnType<typeof vi.fn>;
    const photo = (name = "train.jpg") => new File(["bytes"], name, { type: "image/jpeg" });

    beforeEach(() => {
      // The queue ticks once a second: fake time makes a tick exact.
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("posts a photo as multipart form data with its owner and its type", async () => {
      const service = TestBed.inject(ImageUploadService);
      const file = photo();

      service.addToQueue(7, READY(file), "SPOTTING_EVENT");
      await vi.advanceTimersByTimeAsync(1000);

      expect(post()).toHaveBeenCalledTimes(1);
      const [url, body, options] = post().mock.calls[0];
      expect(url).toBe(`${environment.backendUrl}upload/`);
      expect((body as FormData).get("related_id")).toBe("7");
      expect((body as FormData).get("upload_type")).toBe("SPOTTING_EVENT");
      expect(((body as FormData).get("image") as File).name).toBe("train.jpg");
      // The viewer's token is the auth interceptor's (core/http/auth.interceptor.spec.ts).
      expect(options).toBeUndefined();
    });

    it("counts the queue down as photos go out, and stops its timer once it is empty", async () => {
      const service = TestBed.inject(ImageUploadService);

      service.addToQueue(1, READY(photo("a.jpg")), "SPOTTING_EVENT");
      service.addToQueue(1, READY(photo("b.jpg")), "SPOTTING_EVENT");
      expect([service.pendingCount(), service.totalCount(), service.percentUploaded()]).toEqual([
        2, 2, 0,
      ]);
      await vi.advanceTimersByTimeAsync(1000);

      expect([service.pendingCount(), service.totalCount(), service.percentUploaded()]).toEqual([
        0, 2, 100,
      ]);
      expect(vi.getTimerCount()).toBe(0);
    });

    // Pins today's behaviour: a failed photo is sent again, with no backoff and no giving up. The
    // time advanced is generous so that adding a backoff (F045) does not fail this test.
    it("keeps a photo whose upload failed and sends it again", async () => {
      const service = TestBed.inject(ImageUploadService);
      post().mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

      service.addToQueue(1, READY(photo()), "SPOTTING_EVENT");
      await vi.advanceTimersByTimeAsync(1000);
      expect(service.pendingCount()).toBe(1);
      expect(service.percentUploaded()).toBe(0);

      await vi.advanceTimersByTimeAsync(30_000);

      expect(post()).toHaveBeenCalledTimes(2);
      expect(service.pendingCount()).toBe(0);
      expect(service.percentUploaded()).toBe(100);
    });

    it("holds a photo that is still compressing until it is ready, and does not save it to IndexedDB", async () => {
      const service = TestBed.inject(ImageUploadService);
      const compressing: ImageFile = { file: photo(), toCompress: true, isCompressed: false };
      const queue = () =>
        (service as unknown as { pendingUploads: { dbId?: number }[] }).pendingUploads;

      service.addToQueue(1, compressing, "SPOTTING_EVENT");
      service.addToQueue(1, READY(photo("b.jpg")), "SPOTTING_EVENT");
      await vi.advanceTimersByTimeAsync(0);
      // Only the ready photo has a record.
      expect(queue().map((entry) => typeof entry.dbId)).toEqual(["undefined", "number"]);

      await vi.advanceTimersByTimeAsync(3000);
      expect(post()).toHaveBeenCalledTimes(1);
      expect(service.pendingCount()).toBe(1);

      compressing.isCompressed = true;
      await vi.advanceTimersByTimeAsync(1000);

      expect(post()).toHaveBeenCalledTimes(2);
      expect(service.pendingCount()).toBe(0);
    });

    it("reports a photo it could not save to IndexedDB and still uploads it", async () => {
      const service = TestBed.inject(ImageUploadService);
      const failure = new DOMException("quota", "QuotaExceededError");
      vi.stubGlobal("indexedDB", {
        open: () => {
          const request = { error: failure, onerror: null as (() => void) | null };
          queueMicrotask(() => request.onerror?.());
          return request;
        },
      });

      service.addToQueue(1, READY(photo()), "SPOTTING_EVENT");
      await vi.advanceTimersByTimeAsync(1000);

      expect(reportError).toHaveBeenCalledWith(failure);
      expect(post()).toHaveBeenCalledTimes(1);
    });
  });
});
