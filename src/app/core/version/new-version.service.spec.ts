import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildInfo } from "../../../build-info";
import { OnlineService } from "../network/online.service";
import { ToastService } from "../../ui/toast/toast.service";
import { NewVersionService } from "./new-version.service";

/** The server's /version.json naming the build with this hash. */
function versionResponse(hash: string): Response {
  return new Response(JSON.stringify({ hash }), { status: 200 });
}

describe("NewVersionService stale-chunk detection", () => {
  let service: NewVersionService;
  let toast: { info: ReturnType<typeof vi.fn> };
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  const isOnline = signal(true);

  beforeEach(() => {
    // The constructor starts a /version.json poll and a 10-minute interval; a request that never
    // settles keeps both out of these tests. A test that needs an answer queues one.
    vi.useFakeTimers();
    fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    toast = { info: vi.fn() };
    isOnline.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ToastService, useValue: toast },
        { provide: OnlineService, useValue: { isOnline } },
      ],
    });
    service = TestBed.inject(NewVersionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A `<script>` the browser failed to load: the error fires on the element and does not bubble,
   * so the listener has to be a capture-phase one on window — which is what it is. */
  function failScript(src: string): void {
    const script = document.createElement("script");
    script.src = src;
    document.body.append(script);
    script.dispatchEvent(new Event("error"));
    script.remove();
  }

  it("asks the server itself for /version.json, past the HTTP cache and the service worker", () => {
    expect(fetch).toHaveBeenCalledWith("/version.json", {
      cache: "no-store",
      headers: { "ngsw-bypass": "true" },
    });
  });

  it("skips the poll while offline", () => {
    isOnline.set(false);
    fetchMock.mockClear();

    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not prompt for a blocked cross-origin script such as adsbygoogle.js", () => {
    failScript("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1");

    expect(service.hasNewVersion()).toBe(false);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("prompts for a failed same-origin chunk once /version.json names a newer build", async () => {
    fetchMock.mockResolvedValueOnce(versionResponse("0000000"));

    failScript("/chunk-D4-DL31Z2.js");

    await vi.waitFor(() => expect(service.hasNewVersion()).toBe(true));
    expect(toast.info).toHaveBeenCalledExactlyOnceWith("Update available", expect.any(String));
    // The probe gives up after a few seconds: a dead link in a tunnel can hang for minutes.
    expect(fetch).toHaveBeenLastCalledWith("/version.json", {
      cache: "no-store",
      headers: { "ngsw-bypass": "true" },
      signal: expect.any(AbortSignal),
    });
  });

  it("gives no update prompt when the server still runs this build", async () => {
    fetchMock.mockResolvedValueOnce(versionResponse(buildInfo.hash));

    failScript("/chunk-D4-DL31Z2.js");

    await vi.waitFor(() =>
      expect(toast.info).toHaveBeenCalledExactlyOnceWith(
        "This page couldn't load",
        "Check your connection and try again.",
      ),
    );
    expect(service.hasNewVersion()).toBe(false);
  });

  it("says the page needs a connection when /version.json cannot be reached either", async () => {
    // navigator.onLine stays true on a connection that carries nothing, as in a tunnel.
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    failScript("/chunk-D4-DL31Z2.js");

    await vi.waitFor(() =>
      expect(toast.info).toHaveBeenCalledExactlyOnceWith(
        "You're offline",
        "This page needs a connection.",
      ),
    );
    expect(service.hasNewVersion()).toBe(false);
  });

  it("probes once for a failure that arrives by both paths", async () => {
    fetchMock.mockClear();
    let answer: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));

    failScript("/chunk-D4-DL31Z2.js");
    service.promptReloadForNewVersion();
    answer(versionResponse("0000000"));

    await vi.waitFor(() => expect(service.hasNewVersion()).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  describe("while offline", () => {
    it("says the page needs a connection instead of offering an update", () => {
      isOnline.set(false);

      failScript("/chunk-D4-DL31Z2.js");

      expect(toast.info).toHaveBeenCalledExactlyOnceWith(
        "You're offline",
        "This page needs a connection.",
      );
      // The update button stays dark: its click is the only path that clears caches and reloads.
      expect(service.hasNewVersion()).toBe(false);
    });

    it("answers the router's ErrorHandler path the same way", () => {
      isOnline.set(false);

      service.promptReloadForNewVersion();

      expect(toast.info).toHaveBeenCalledExactlyOnceWith(
        "You're offline",
        "This page needs a connection.",
      );
      expect(service.hasNewVersion()).toBe(false);
    });

    it("tells the user on every failed attempt", () => {
      isOnline.set(false);

      failScript("/chunk-D4-DL31Z2.js");
      failScript("/chunk-D4-DL31Z2.js");

      expect(toast.info).toHaveBeenCalledTimes(2);
    });

    it("goes back to the update prompt once the connection returns", async () => {
      isOnline.set(false);
      failScript("/chunk-D4-DL31Z2.js");

      isOnline.set(true);
      fetchMock.mockResolvedValueOnce(versionResponse("0000000"));
      failScript("/chunk-D4-DL31Z2.js");

      await vi.waitFor(() => expect(service.hasNewVersion()).toBe(true));
      expect(toast.info).toHaveBeenLastCalledWith("Update available", expect.any(String));
    });

    it("keeps the caches and the page when the update button is tapped", async () => {
      const cacheStorage = {
        keys: vi.fn(async () => ["ngsw:/:1:assets:app:cache"]),
        delete: vi.fn(),
      };
      vi.stubGlobal("caches", cacheStorage);
      service.hasNewVersion.set(true);
      isOnline.set(false);

      await service.reloadForNewVersion();

      // Clearing them would take the worker's offline copy of the app, and the reload would fail.
      expect(cacheStorage.keys).not.toHaveBeenCalled();
      expect(cacheStorage.delete).not.toHaveBeenCalled();
      expect(toast.info).toHaveBeenCalledExactlyOnceWith(
        "You're offline",
        "Reconnect to load the new version.",
      );
    });
  });
});
