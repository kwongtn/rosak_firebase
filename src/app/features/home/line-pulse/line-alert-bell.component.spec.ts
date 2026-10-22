import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { FCM_VAPID_KEY } from "../../../core/push/push-loader";
import type { PushLine } from "../../../core/push/push-storage";
import { PushAvailability, PushService } from "../../../core/push/push.service";
import { LineAlertBellComponent } from "./line-alert-bell.component";

const LINE = { id: "7", code: "KJL", displayName: "Kelana Jaya Line" };
const KJL: PushLine = { id: "7", code: "KJL" };

/** The slice of `PushService` the bell reads, over real signals so a spec can move it. */
function fakePush() {
  const lines = signal<PushLine[]>([]);
  return {
    availability: signal<PushAvailability>("ready"),
    needsPermission: signal(true),
    busy: signal(false),
    lines,
    isSubscribed: (lineId: string) => lines().some((line) => line.id === lineId),
    subscribe: vi.fn(async () => undefined),
    unsubscribe: vi.fn(async () => undefined),
  };
}

describe("LineAlertBellComponent", () => {
  let fixture: ComponentFixture<LineAlertBellComponent>;
  let push: ReturnType<typeof fakePush>;
  let login: ReturnType<typeof vi.fn>;

  function render(vapidKey = "vapid-key"): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: FCM_VAPID_KEY, useValue: vapidKey },
        // The bell reaches it through the loader's dynamic import, which resolves this same class.
        { provide: PushService, useValue: push },
        { provide: AuthService, useValue: { login } },
      ],
    });
    fixture = TestBed.createComponent(LineAlertBellComponent);
    fixture.componentRef.setInput("line", LINE);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const bell = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="line-alert-bell"]',
    )!;
  const byTestId = <T extends HTMLElement>(testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
  /** The sheet host is pointer-events-none exactly while it is closed. */
  const promptIsOpen = () =>
    !(fixture.nativeElement as HTMLElement)
      .querySelector("hlm-sheet")!
      .classList.contains("pointer-events-none");
  const tooltipTitle = () =>
    byTestId("line-alert-bell-popover")?.querySelector("p")?.textContent?.trim();

  async function waitForState(state: string): Promise<void> {
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(bell().getAttribute("data-state")).toBe(state);
    });
  }

  async function click(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    push = fakePush();
    login = vi.fn(async () => undefined);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("stays a disabled 'not set up' bell in a build without a VAPID key", async () => {
    render("");
    await fixture.whenStable();

    expect(bell().getAttribute("data-state")).toBe("unconfigured");
    expect(bell().getAttribute("aria-disabled")).toBe("true");
    expect(bell().getAttribute("aria-pressed")).toBeNull();
    expect(bell().getAttribute("aria-label")).toBe(
      "Alerts for Kelana Jaya Line: Alerts are not set up yet",
    );

    await click(bell());
    expect(tooltipTitle()).toBe("Alerts are not set up yet");
    expect(promptIsOpen()).toBe(false);
    expect(push.subscribe).not.toHaveBeenCalled();
  });

  it("is an inert placeholder until the push service has loaded", async () => {
    render();
    // The service lands after the first render, through a dynamic import.
    expect(bell().getAttribute("data-state")).toBe("loading");
    expect(bell().getAttribute("aria-disabled")).toBe("true");

    await waitForState("off");
    expect(bell().getAttribute("aria-disabled")).toBeNull();
  });

  it("starts the sign-in when the rider is signed out", async () => {
    push.availability.set("signed-out");
    render();
    await waitForState("signed-out");

    expect(bell().getAttribute("aria-label")).toBe("Sign in to get alerts for Kelana Jaya Line");
    expect(bell().getAttribute("aria-pressed")).toBeNull();

    await click(bell());
    expect(login).toHaveBeenCalledTimes(1);
    expect(tooltipTitle()).toBe("Sign in to get alerts");
    expect(push.subscribe).not.toHaveBeenCalled();
  });

  it("asks first with a soft pre-prompt, whose Allow turns the line on", async () => {
    render();
    await waitForState("off");
    expect(bell().getAttribute("aria-pressed")).toBe("false");
    expect(bell().getAttribute("aria-label")).toBe("Alerts for Kelana Jaya Line");

    await click(bell());

    expect(promptIsOpen()).toBe(true);
    const dialog = byTestId("line-alert-prompt")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    const title = dialog.querySelector(`#${dialog.getAttribute("aria-labelledby")}`);
    expect(title?.textContent?.trim()).toBe(
      "Get an alert when Kelana Jaya Line has a major incident?",
    );
    // The prompt explains with the published rule, the same copy the tooltip shows.
    expect(dialog.textContent).toContain(metricTooltip("incidents.push-alerts"));
    expect(push.subscribe).not.toHaveBeenCalled();

    await click(byTestId("line-alert-allow")!);

    expect(push.subscribe).toHaveBeenCalledExactlyOnceWith(KJL);
    expect(promptIsOpen()).toBe(false);
    expect(document.activeElement).toBe(bell());
  });

  it("closes the pre-prompt on Not now without asking anything", async () => {
    render();
    await waitForState("off");

    await click(bell());
    await click(byTestId("line-alert-dismiss")!);

    expect(promptIsOpen()).toBe(false);
    expect(push.subscribe).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(bell());
  });

  it("leaves nothing of the closed pre-prompt to tab into or to read as a dialog", async () => {
    render();
    await waitForState("off");
    await click(bell());
    expect(byTestId("line-alert-prompt")!.getAttribute("aria-modal")).toBe("true");

    await click(byTestId("line-alert-dismiss")!);

    // The sheet stays mounted after it closes. A focus-trap anchor that kept its tabindex sent the
    // next Tab from the bell into the hidden panel, with no way out.
    const sheet = (fixture.nativeElement as HTMLElement).querySelector("hlm-sheet")!;
    expect(sheet.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0);
    expect(byTestId("line-alert-prompt")!.closest("[inert]")).not.toBeNull();
    expect(sheet.querySelector("[aria-modal]")).toBeNull();
    expect(sheet.querySelector('[role="dialog"]')).toBeNull();
  });

  it("toggles the line without a prompt once notifications are allowed", async () => {
    push.needsPermission.set(false);
    render();
    await waitForState("off");

    await click(bell());
    expect(push.subscribe).toHaveBeenCalledExactlyOnceWith(KJL);
    expect(byTestId("line-alert-prompt")).toBeNull();

    push.lines.set([KJL]);
    await waitForState("on");
    expect(bell().getAttribute("aria-pressed")).toBe("true");
    expect(bell().querySelector("ng-icon")?.getAttribute("class")).toContain("fill-current");
    // The first tap opened the tooltip, and it follows the state.
    expect(tooltipTitle()).toBe("Alerts are on for this line");

    await click(bell());
    expect(push.unsubscribe).toHaveBeenCalledExactlyOnceWith("7");
  });

  it("explains a blocked browser and an iOS tab, and a tap changes nothing", async () => {
    push.availability.set("blocked");
    render();
    await waitForState("blocked");

    expect(bell().getAttribute("aria-disabled")).toBe("true");
    expect(bell().getAttribute("aria-label")).toBe(
      "Alerts for Kelana Jaya Line: Notifications are blocked in your browser settings",
    );
    await click(bell());
    expect(tooltipTitle()).toBe("Notifications are blocked in your browser settings");

    push.availability.set("install");
    await waitForState("install");
    expect(tooltipTitle()).toBe("Install MLPTF to your Home Screen to get alerts");
    await click(bell());

    expect(push.subscribe).not.toHaveBeenCalled();
    expect(promptIsOpen()).toBe(false);
    expect(login).not.toHaveBeenCalled();
  });

  it("ignores taps while a change is on its way", async () => {
    push.needsPermission.set(false);
    push.busy.set(true);
    render();
    await waitForState("off");

    expect(bell().getAttribute("aria-disabled")).toBe("true");
    await click(bell());

    expect(push.subscribe).not.toHaveBeenCalled();
  });
});
