import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnlineService } from "../network/online.service";
import { ToastService } from "../../ui/toast/toast.service";
import { NewVersionService } from "./new-version.service";

describe("NewVersionService stale-chunk detection", () => {
  let service: NewVersionService;
  let toast: { info: ReturnType<typeof vi.fn> };
  const isOnline = signal(true);

  beforeEach(() => {
    // The constructor starts a /version.json poll and a 10-minute interval; a request that never
    // settles keeps both out of these tests.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
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

  it("does not prompt for a blocked cross-origin script such as adsbygoogle.js", () => {
    failScript("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1");

    expect(service.hasNewVersion()).toBe(false);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("prompts for a failed same-origin chunk", () => {
    failScript("/chunk-D4-DL31Z2.js");

    expect(service.hasNewVersion()).toBe(true);
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

    it("goes back to the update prompt once the connection returns", () => {
      isOnline.set(false);
      failScript("/chunk-D4-DL31Z2.js");

      isOnline.set(true);
      failScript("/chunk-D4-DL31Z2.js");

      expect(service.hasNewVersion()).toBe(true);
      expect(toast.info).toHaveBeenLastCalledWith("Update available", expect.any(String));
    });
  });
});
