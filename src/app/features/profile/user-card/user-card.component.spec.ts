import { provideZonelessChangeDetection, signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import type { UserData } from "../data/profile.queries";
import { UserCardComponent } from "./user-card.component";

/** The signed-in Firebase user. On someone else's profile this is the viewer, not the owner. */
const VIEWER = {
  uid: "viewer-uid-1",
  displayName: "Viewer Vee",
  email: "viewer@example.com",
  emailVerified: true,
  phoneNumber: "+60123456789",
  photoURL: "https://example.com/viewer.png",
};

function makeUser(favouriteVehicles: UserData["favouriteVehicles"], nickname = "Alice"): UserData {
  return {
    nickname,
    spottingsCount: 3,
    mediaCount: 1,
    spottingTrends: [],
    withMostEntriesMonth: null,
    withMostEntriesDay: null,
    favouriteVehicles,
    spottingDataPublic: true,
  };
}

describe("UserCardComponent", () => {
  let fixture: ComponentFixture<UserCardComponent>;
  let viewer: WritableSignal<typeof VIEWER | null>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

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

    viewer = signal<typeof VIEWER | null>(null);
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [UserCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: viewer, idToken: vi.fn() } },
        {
          provide: GraphQLClient,
          useValue: { request: vi.fn().mockResolvedValue({ myVotesCast: 0 }) },
        },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
  });

  async function render(
    favouriteVehicles: UserData["favouriteVehicles"],
    {
      isOwnProfile = false,
      nickname = "Alice",
    }: { isOwnProfile?: boolean; nickname?: string } = {},
  ): Promise<string> {
    fixture = TestBed.createComponent(UserCardComponent);
    fixture.componentRef.setInput("user", makeUser(favouriteVehicles, nickname));
    // A non-owner view skips the votes-cast request, which is not under test here.
    fixture.componentRef.setInput("isOwnProfile", isOwnProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement.textContent ?? "";
  }

  /** The identity heading, the card's only h1. */
  function heading(): string {
    return fixture.nativeElement.querySelector("h1")?.textContent?.trim() ?? "";
  }

  it("shows the most-spotted train with its line codes", async () => {
    const text = await render([
      {
        vehicle: {
          id: "81",
          identificationNo: "SCS 41",
          lines: [
            { id: "4", code: "KJL" },
            { id: "5", code: "AGL" },
          ],
        },
        count: 7,
      },
    ]);

    expect(text).toContain("Favourite Train (7 spottings)");
    expect(text).toContain("SCS 41");
    expect(text).toContain("KJL, AGL");
  });

  describe("favourite train link", () => {
    function favouriteLink(): HTMLAnchorElement | null {
      return fixture.nativeElement.querySelector('[data-testid="favourite-vehicle-link"]');
    }

    it("links the identification number to the vehicle page under its first line", async () => {
      await render([
        {
          vehicle: {
            id: "81",
            identificationNo: "SCS 41",
            lines: [
              { id: "4", code: "KJL" },
              { id: "5", code: "AGL" },
            ],
          },
          count: 7,
        },
      ]);

      expect(favouriteLink()?.textContent?.trim()).toBe("SCS 41");
      expect(favouriteLink()?.getAttribute("href")).toBe("/spotting/4/vehicle/81");
    });

    it("also links on someone else's profile, the vehicle page is public", async () => {
      await render(
        [
          {
            vehicle: { id: "9", identificationNo: "SCS 3", lines: [{ id: "4", code: "KJL" }] },
            count: 2,
          },
        ],
        { isOwnProfile: false },
      );

      expect(favouriteLink()?.getAttribute("href")).toBe("/spotting/4/vehicle/9");
    });

    it("shows plain text for a vehicle on no line, which has no page to open", async () => {
      const text = await render([
        { vehicle: { id: "9", identificationNo: "SCS 3", lines: [] }, count: 2 },
      ]);

      expect(favouriteLink()).toBeNull();
      expect(text).toContain("SCS 3");
    });
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

  it("shows the owner's nickname, not the viewer's identity, on someone else's profile", async () => {
    viewer.set(VIEWER);

    const text = await render([]);

    expect(heading()).toBe("Alice");
    expect(text).not.toContain(VIEWER.displayName);
    expect(text).not.toContain(VIEWER.email);
    expect(text).not.toContain(VIEWER.phoneNumber);
    expect(fixture.nativeElement.querySelector("img")).toBeNull();
  });

  it("falls back to 'Anonymous spotter' on someone else's profile with no nickname", async () => {
    viewer.set(VIEWER);

    await render([], { nickname: "" });

    expect(heading()).toBe("Anonymous spotter");
  });

  it("shows the viewer's own name, photo, email and phone on their own profile", async () => {
    viewer.set(VIEWER);

    const text = await render([], { isOwnProfile: true });

    expect(heading()).toBe(VIEWER.displayName);
    expect(text).toContain(VIEWER.email);
    expect(text).toContain(VIEWER.phoneNumber);
    expect(fixture.nativeElement.querySelector("img")?.getAttribute("src")).toBe(VIEWER.photoURL);
  });

  describe("copy profile link", () => {
    function copyButton(): HTMLButtonElement | null {
      return fixture.nativeElement.querySelector('[data-testid="copy-profile-link"]');
    }

    function profileUrl(): string {
      return `${window.location.origin}/profile/${VIEWER.uid}`;
    }

    /** jsdom has no clipboard, so each spec installs the one it wants (or none). */
    function setClipboard(clipboard: unknown): void {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    }

    afterEach(() => {
      Reflect.deleteProperty(navigator, "clipboard");
    });

    it("is offered to the owner only", async () => {
      viewer.set(VIEWER);

      await render([], { isOwnProfile: true });
      expect(copyButton()?.textContent?.trim()).toBe("Copy profile link");
      fixture.destroy();

      await render([], { isOwnProfile: false });
      expect(copyButton()).toBeNull();
    });

    it("copies the public profile URL and says so", async () => {
      viewer.set(VIEWER);
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      await render([], { isOwnProfile: true });

      copyButton()?.click();

      await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
      expect(writeText).toHaveBeenCalledWith(profileUrl());
      expect(toast.success.mock.calls[0][0]).toBe("Profile link copied");
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("shows the URL in the toast when the browser has no clipboard", async () => {
      viewer.set(VIEWER);
      await render([], { isOwnProfile: true });

      copyButton()?.click();

      await vi.waitFor(() =>
        expect(toast.info).toHaveBeenCalledWith("Copy your profile link", profileUrl()),
      );
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("shows the URL in the toast when the browser refuses the write", async () => {
      viewer.set(VIEWER);
      setClipboard({
        writeText: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      });
      await render([], { isOwnProfile: true });

      copyButton()?.click();

      await vi.waitFor(() =>
        expect(toast.info).toHaveBeenCalledWith("Copy your profile link", profileUrl()),
      );
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
