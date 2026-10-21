import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { RecaptchaService } from "../../../core/recaptcha/recaptcha.service";
import { ToastService } from "../../../ui/toast/toast.service";
import type { MyEvent, PublicUserData } from "../data/profile.queries";
import { MySpottingsComponent } from "./my-spottings.component";

function makeEvent(id: string, overrides: Partial<MyEvent> = {}): MyEvent {
  return {
    id,
    spottingDate: "2026-09-18",
    notes: null,
    created: "2026-09-18T08:00:00Z",
    status: "IN_SERVICE",
    type: "AT_STATION",
    runNumber: null,
    mediaCount: 0,
    isMine: true,
    vehicle: {
      id: "29",
      status: "IN_SERVICE",
      identificationNo: "105",
      vehicleType: { internalName: "SCS" },
      lines: [{ id: "2", code: "MRT KGL" }],
    },
    ...overrides,
  };
}

function makeUser(spottings: MyEvent[] | null): PublicUserData {
  return {
    nickname: "Alice",
    spottingsCount: spottings?.length ?? 0,
    mediaCount: 0,
    spottingTrends: [],
    withMostEntriesMonth: null,
    withMostEntriesDay: null,
    favouriteVehicles: [],
    spottingDataPublic: spottings !== null,
    spottings,
  };
}

describe("MySpottingsComponent", () => {
  let fixture: ComponentFixture<MySpottingsComponent>;
  let requestMock: ReturnType<typeof vi.fn>;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    // The notes sheet's breakpoint observer and the hover-capability probe both read matchMedia.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    requestMock = vi.fn();
    toast = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MySpottingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { idToken: vi.fn(async () => "token") } },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: RecaptchaService, useValue: { execute: vi.fn() } },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
  });

  async function render(user: PublicUserData, isOwnProfile: boolean): Promise<void> {
    fixture = TestBed.createComponent(MySpottingsComponent);
    fixture.componentRef.setInput("user", user);
    fixture.componentRef.setInput("isOwnProfile", isOwnProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function vehicleLinks(): HTMLAnchorElement[] {
    const root = fixture.nativeElement as HTMLElement;
    return [...root.querySelectorAll<HTMLAnchorElement>('[data-testid="history-vehicle-link"]')];
  }

  describe("vehicle links", () => {
    it("links each row's identification number to the vehicle page under its first line", async () => {
      await render(
        makeUser([
          makeEvent("1"),
          makeEvent("2", {
            vehicle: {
              id: "81",
              status: "IN_SERVICE",
              identificationNo: "SCS 41",
              vehicleType: { internalName: "SCS" },
              lines: [
                { id: "4", code: "KJL" },
                { id: "5", code: "AGL" },
              ],
            },
          }),
        ]),
        false,
      );

      expect(vehicleLinks().map((a) => a.textContent?.trim())).toEqual(["105", "SCS 41"]);
      expect(vehicleLinks().map((a) => a.getAttribute("href"))).toEqual([
        "/spotting/2/vehicle/29",
        "/spotting/4/vehicle/81",
      ]);
    });

    it("keeps the type and line label beside the link", async () => {
      await render(makeUser([makeEvent("1")]), false);

      const label = fixture.nativeElement.querySelector("li span.text-muted-foreground");
      expect(label?.textContent?.replace(/\s+/g, " ").trim()).toBe("105 (SCS) — MRT KGL");
    });

    it("renders a vehicle on no line as plain text, not a dead link", async () => {
      await render(
        makeUser([
          makeEvent("1", {
            vehicle: {
              id: "7",
              status: "IN_SERVICE",
              identificationNo: "X 7",
              vehicleType: { internalName: "SCS" },
              lines: [],
            },
          }),
        ]),
        false,
      );

      expect(vehicleLinks()).toHaveLength(0);
      expect(fixture.nativeElement.textContent).toContain("X 7");
    });

    it("links the owner's own fetched history the same way", async () => {
      requestMock.mockResolvedValueOnce({ events: [makeEvent("1")] });

      await render(makeUser(null), true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(vehicleLinks()).toHaveLength(1);
      });

      expect(vehicleLinks()[0].getAttribute("href")).toBe("/spotting/2/vehicle/29");
    });
  });
});
