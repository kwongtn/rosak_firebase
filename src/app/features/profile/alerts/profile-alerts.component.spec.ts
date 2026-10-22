import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FCM_VAPID_KEY } from "../../../core/push/push-loader";
import type { PushLine } from "../../../core/push/push-storage";
import { PushAvailability, PushService } from "../../../core/push/push.service";
import { ProfileAlertsComponent } from "./profile-alerts.component";

const KJL: PushLine = { id: "1", code: "KJL" };
const AGL: PushLine = { id: "2", code: "AGL" };

/** The slice of `PushService` the card reads; its actions update the lines the way the service does. */
function fakePush(initial: PushLine[]) {
  const lines = signal<PushLine[]>(initial);
  return {
    availability: signal<PushAvailability>("ready"),
    busy: signal(false),
    lines,
    unsubscribe: vi.fn(async (lineId: string) =>
      lines.update((all) => all.filter((line) => line.id !== lineId)),
    ),
    turnOff: vi.fn(async () => lines.set([])),
  };
}

describe("ProfileAlertsComponent", () => {
  let fixture: ComponentFixture<ProfileAlertsComponent>;
  let push: ReturnType<typeof fakePush>;

  function render(vapidKey = "vapid-key"): void {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: FCM_VAPID_KEY, useValue: vapidKey },
        { provide: PushService, useValue: push },
      ],
    });
    fixture = TestBed.createComponent(ProfileAlertsComponent);
    fixture.detectChanges();
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const all = (testId: string) =>
    Array.from(root().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));
  const one = (testId: string) => root().querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  /** The card appears once the loader's dynamic import has handed over the service. */
  async function waitForCard(): Promise<HTMLElement> {
    return vi.waitFor(async () => {
      await fixture.whenStable();
      const card = one("profile-alerts");
      expect(card).not.toBeNull();
      return card!;
    });
  }

  beforeEach(() => {
    push = fakePush([KJL, AGL]);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("is absent in a build without a VAPID key", async () => {
    render("");
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(one("profile-alerts")).toBeNull();
  });

  it("lists this browser's lines, each with its own remove button", async () => {
    render();
    await waitForCard();

    expect(all("profile-alert-line").map((chip) => chip.textContent?.trim())).toEqual([
      "KJL",
      "AGL",
    ]);
    expect(all("profile-alert-remove").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Turn off alerts for KJL",
      "Turn off alerts for AGL",
    ]);
    expect(one("profile-alerts-empty")).toBeNull();
    expect(one("profile-alerts-note")).toBeNull();
  });

  it("turns one line off and hands focus to the heading, not to the page", async () => {
    render();
    await waitForCard();
    const remove = all("profile-alert-remove")[0];
    remove.focus();

    remove.click();

    expect(push.unsubscribe).toHaveBeenCalledExactlyOnceWith("1");
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(all("profile-alert-line").map((chip) => chip.textContent?.trim())).toEqual(["AGL"]);
      expect(document.activeElement).toBe(root().querySelector("h2"));
    });
  });

  it("turns every alert off at once, then points at the front page", async () => {
    render();
    await waitForCard();

    one("profile-alerts-off")!.click();

    expect(push.turnOff).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(one("profile-alerts-empty")?.querySelector("a")?.getAttribute("href")).toBe("/");
    });
    expect(all("profile-alert-line")).toEqual([]);
    expect(one("profile-alerts-off")).toBeNull();
  });

  it("does nothing while a change is on its way", async () => {
    push.busy.set(true);
    render();
    await waitForCard();

    expect(one("profile-alerts-off")?.getAttribute("aria-disabled")).toBe("true");
    all("profile-alert-remove")[0].click();
    one("profile-alerts-off")!.click();

    expect(push.unsubscribe).not.toHaveBeenCalled();
    expect(push.turnOff).not.toHaveBeenCalled();
  });

  it("says why this browser cannot take new alerts, and keeps the lines it has", async () => {
    push.availability.set("blocked");
    render();
    await waitForCard();

    expect(one("profile-alerts-note")?.textContent?.trim()).toBe(
      "Notifications are blocked in your browser settings.",
    );
    expect(all("profile-alert-line")).toHaveLength(2);

    push.availability.set("install");
    await fixture.whenStable();
    expect(one("profile-alerts-note")?.textContent?.trim()).toBe(
      "Install MLPTF to your Home Screen to get alerts.",
    );
  });
});
