import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastService } from "../../ui/toast/toast.service";
import { NewVersionService } from "./new-version.service";

describe("NewVersionService stale-chunk detection", () => {
  let service: NewVersionService;
  let toast: { info: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // The constructor starts a /version.json poll and a 10-minute interval; a request that never
    // settles keeps both out of these tests.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    toast = { info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ToastService, useValue: toast }],
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
});
