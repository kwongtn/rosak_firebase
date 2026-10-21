import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { OnlineService } from "../../core/network/online.service";
import { OfflineStripComponent } from "./offline-strip.component";

describe("OfflineStripComponent", () => {
  const isOnline = signal(true);

  beforeEach(() => {
    isOnline.set(true);
    TestBed.configureTestingModule({
      imports: [OfflineStripComponent],
      providers: [{ provide: OnlineService, useValue: { isOnline } }],
    });
  });

  function render(): { host: HTMLElement; detectChanges: () => void } {
    const fixture = TestBed.createComponent(OfflineStripComponent);
    fixture.detectChanges();
    return {
      host: fixture.nativeElement as HTMLElement,
      detectChanges: () => fixture.detectChanges(),
    };
  }

  it("renders nothing while online, but keeps the polite status region in place", () => {
    const { host } = render();

    expect(host.querySelector("[data-testid='offline-strip']")).toBeNull();
    expect(host.getAttribute("role")).toBe("status");
    expect(host.getAttribute("aria-live")).toBe("polite");
  });

  it("shows the offline strip while offline and removes it on reconnect", () => {
    const { host, detectChanges } = render();

    isOnline.set(false);
    detectChanges();
    expect(host.querySelector("[data-testid='offline-strip']")?.textContent).toContain(
      "You're offline.",
    );

    isOnline.set(true);
    detectChanges();
    expect(host.querySelector("[data-testid='offline-strip']")).toBeNull();
  });
});
