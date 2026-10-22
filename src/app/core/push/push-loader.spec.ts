import { Component, ErrorHandler, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FCM_VAPID_KEY, injectPushService } from "./push-loader";
import { PushService } from "./push.service";

@Component({ template: "" })
class AlertControlHost {
  readonly push = injectPushService();
}

/** Lets a dynamic import that has already been asked for settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("injectPushService", () => {
  let service: { whenReady: Promise<void> };
  let handleError: ReturnType<typeof vi.fn>;

  function create(vapidKey: string) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FCM_VAPID_KEY, useValue: vapidKey },
        // The loader's dynamic import resolves this same class, so the stand-in is what it gets.
        { provide: PushService, useValue: service },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    });
    const fixture = TestBed.createComponent(AlertControlHost);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    service = { whenReady: Promise.resolve() };
    handleError = vi.fn();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("hands over the root PushService once the control has rendered", async () => {
    const fixture = create("vapid-key");
    expect(fixture.componentInstance.push()).toBeNull();

    await vi.waitFor(() => expect(fixture.componentInstance.push()).toBe(service));
    expect(handleError).not.toHaveBeenCalled();
  });

  it("waits for the session before it hands the service over", async () => {
    let restore: () => void = () => undefined;
    service.whenReady = new Promise<void>((resolve) => (restore = resolve));
    const fixture = create("vapid-key");

    await settle();
    expect(fixture.componentInstance.push()).toBeNull();

    restore();
    await vi.waitFor(() => expect(fixture.componentInstance.push()).toBe(service));
  });

  it("loads nothing in a build without a VAPID key", async () => {
    const fixture = create("  ");

    await settle();
    await fixture.whenStable();

    expect(fixture.componentInstance.push()).toBeNull();
  });

  it("leaves a control that is gone by the time the service lands", async () => {
    const fixture = create("vapid-key");
    const host = fixture.componentInstance;

    fixture.destroy();
    await settle();

    expect(host.push()).toBeNull();
    expect(handleError).not.toHaveBeenCalled();
  });
});
