import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import type { UserData } from "../data/profile.queries";
import { UserCardComponent } from "./user-card.component";

function makeUser(favouriteVehicles: UserData["favouriteVehicles"]): UserData {
  return {
    nickname: "Alice",
    spottingsCount: 3,
    mediaCount: 1,
    spottingTrends: [],
    withMostEntriesMonth: null,
    withMostEntriesDay: null,
    favouriteVehicles,
    spottingDataPublic: true,
  };
}

describe("UserCardComponent favourite train", () => {
  let fixture: ComponentFixture<UserCardComponent>;

  beforeEach(async () => {
    // The card reads matchMedia in afterNextRender (and the sheet's CDK breakpoint observer listens
    // on it), and the test DOM doesn't provide it.
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

    await TestBed.configureTestingModule({
      imports: [UserCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { user: signal(null), idToken: vi.fn() } },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
  });

  async function render(favouriteVehicles: UserData["favouriteVehicles"]): Promise<string> {
    fixture = TestBed.createComponent(UserCardComponent);
    fixture.componentRef.setInput("user", makeUser(favouriteVehicles));
    // A non-owner view skips the votes-cast request, which is not under test here.
    fixture.componentRef.setInput("isOwnProfile", false);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement.textContent ?? "";
  }

  it("shows the most-spotted train with its line codes", async () => {
    const text = await render([
      {
        vehicle: { identificationNo: "SCS 41", lines: [{ code: "KJL" }, { code: "AGL" }] },
        count: 7,
      },
    ]);

    expect(text).toContain("Favourite Train (7 spottings)");
    expect(text).toContain("SCS 41");
    expect(text).toContain("KJL, AGL");
  });

  it.each([
    ["an empty list", [] as UserData["favouriteVehicles"]],
    ["null", null as unknown as UserData["favouriteVehicles"]],
    ["undefined", undefined as unknown as UserData["favouriteVehicles"]],
  ])("renders without a favourite train card when favouriteVehicles is %s", async (_, value) => {
    const text = await render(value);

    expect(text).toContain("Total Spottings");
    expect(text).not.toContain("Favourite Train");
  });
});
