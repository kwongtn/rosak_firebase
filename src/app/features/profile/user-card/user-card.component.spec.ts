import { provideZonelessChangeDetection, signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { ToastService } from "../../../ui/toast/toast.service";
import { UPDATE_USER_MUTATION, type UserData } from "../data/profile.queries";
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

function makeUser(
  favouriteVehicles: UserData["favouriteVehicles"],
  nickname = "Alice",
  spottingDataPublic = true,
): UserData {
  return {
    nickname,
    spottingsCount: 3,
    mediaCount: 1,
    spottingTrends: [],
    withMostEntriesMonth: null,
    withMostEntriesDay: null,
    favouriteVehicles,
    spottingDataPublic,
  };
}

describe("UserCardComponent", () => {
  let fixture: ComponentFixture<UserCardComponent>;
  let viewer: WritableSignal<typeof VIEWER | null>;
  let request: ReturnType<typeof vi.fn>;
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
    request = vi.fn().mockResolvedValue({ myVotesCast: 0 });
    await TestBed.configureTestingModule({
      imports: [UserCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: viewer } },
        { provide: GraphQLClient, useValue: { request } },
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
      spottingDataPublic = true,
    }: { isOwnProfile?: boolean; nickname?: string; spottingDataPublic?: boolean } = {},
  ): Promise<string> {
    fixture = TestBed.createComponent(UserCardComponent);
    fixture.componentRef.setInput(
      "user",
      makeUser(favouriteVehicles, nickname, spottingDataPublic),
    );
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

    it("looks like a link before anyone hovers it, and shows where keyboard focus is", async () => {
      // A phone has no hover, so an underline at rest is the only sign the number opens a page.
      await render([
        {
          vehicle: { id: "9", identificationNo: "SCS 3", lines: [{ id: "4", code: "KJL" }] },
          count: 2,
        },
      ]);

      const classes = favouriteLink()?.classList;
      expect(classes?.contains("underline")).toBe(true);
      expect(classes?.contains("focus-visible:ring-2")).toBe(true);
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

  describe("nickname editing", () => {
    const nicknameInput = (): HTMLInputElement | null =>
      fixture.nativeElement.querySelector("input");

    function buttonWithText(text: string): HTMLButtonElement {
      const match = [...fixture.nativeElement.querySelectorAll("button")].find(
        (b) => (b as HTMLButtonElement).textContent?.trim() === text,
      );
      if (!match) throw new Error(`button "${text}" not rendered`);
      return match as HTMLButtonElement;
    }

    /** Opens the editor on the owner's card and types `value` into it. */
    async function typeNickname(value: string): Promise<string[]> {
      viewer.set(VIEWER);
      await render([], { isOwnProfile: true });
      const saved: string[] = [];
      fixture.componentInstance.nicknameSaved.subscribe((nickname) => saved.push(nickname));
      buttonWithText("Edit").click();
      fixture.detectChanges();
      await fixture.whenStable(); // ngModel writes the draft into the input a microtask later
      const input = nicknameInput()!;
      expect(input.value).toBe("Alice");
      input.value = value;
      input.dispatchEvent(new Event("input"));
      return saved;
    }

    const updateCalls = () =>
      request.mock.calls.filter(([query]) => query === UPDATE_USER_MUTATION);

    it("offers Edit to the owner only", async () => {
      await render([], { isOwnProfile: false });

      expect(fixture.nativeElement.querySelector("button")).toBeNull();
    });

    it("saves the draft, shows it at once and tells the parent", async () => {
      request.mockImplementation(async (query: string) =>
        query === UPDATE_USER_MUTATION ? { updateUser: { nickname: "Bob" } } : { myVotesCast: 0 },
      );
      const saved = await typeNickname("Bob");

      buttonWithText("✓").click();

      await vi.waitFor(() => expect(saved).toEqual(["Bob"]));
      fixture.detectChanges();
      expect(updateCalls()).toHaveLength(1);
      expect(updateCalls()[0][1]).toEqual({ data: { nickname: "Bob" } });
      expect(nicknameInput()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain("Bob");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("keeps the editor open and says so when the save fails", async () => {
      request.mockImplementation(async (query: string) => {
        if (query === UPDATE_USER_MUTATION) throw new Error("Nickname taken");
        return { myVotesCast: 0 };
      });
      const saved = await typeNickname("Bob");

      buttonWithText("✓").click();

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Save failed", "Nickname taken"),
      );
      fixture.detectChanges();
      expect(saved).toEqual([]);
      expect(nicknameInput()?.value).toBe("Bob");
      expect(buttonWithText("✓").disabled).toBe(false);
    });

    it("drops the draft on cancel without asking the backend", async () => {
      await typeNickname("Bob");

      buttonWithText("✕").click();
      fixture.detectChanges();

      expect(updateCalls()).toHaveLength(0);
      expect(nicknameInput()).toBeNull();
      expect(heading()).toBe(VIEWER.displayName);
      expect(fixture.nativeElement.textContent).toContain("Alice");
    });
  });

  describe("privacy setting", () => {
    let confirm: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    });

    afterEach(() => {
      confirm.mockRestore();
    });

    /** Opens the sheet on the owner's card, as the Privacy Settings button does. */
    async function openSheet(spottingDataPublic: boolean): Promise<boolean[]> {
      viewer.set(VIEWER);
      await render([], { isOwnProfile: true, spottingDataPublic });
      const saved: boolean[] = [];
      fixture.componentInstance.privacySaved.subscribe((value) => saved.push(value));
      const open = [...fixture.nativeElement.querySelectorAll("button")].find((b) =>
        (b as HTMLButtonElement).textContent?.includes("Privacy Settings"),
      ) as HTMLButtonElement;
      open.click();
      fixture.detectChanges();
      return saved;
    }

    const checkbox = () => fixture.debugElement.query(By.directive(HlmCheckbox));
    const isChecked = (): boolean => (checkbox().componentInstance as HlmCheckbox).checkedInput();
    const toggle = (value: boolean): void => {
      checkbox().triggerEventHandler("checkedChange", value);
    };
    const updateCalls = () =>
      request.mock.calls.filter(([query]) => query === UPDATE_USER_MUTATION);

    it("starts from the saved setting", async () => {
      await openSheet(true);
      expect(isChecked()).toBe(true);
      fixture.destroy();

      await openSheet(false);
      expect(isChecked()).toBe(false);
    });

    it("asks first, then saves with the nickname and tells the parent", async () => {
      request.mockImplementation(async (query: string) =>
        query === UPDATE_USER_MUTATION ? { updateUser: { nickname: "Alice" } } : { myVotesCast: 0 },
      );
      const saved = await openSheet(false);

      toggle(true);

      await vi.waitFor(() => expect(saved).toEqual([true]));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(updateCalls()[0][1]).toEqual({
        data: { nickname: "Alice", spottingDataPublic: true },
      });
      expect(toast.success).toHaveBeenCalledWith("Spotting history is now public");
      fixture.detectChanges();
      expect(isChecked()).toBe(true);
    });

    it("does nothing when the owner declines to go public", async () => {
      confirm.mockReturnValue(false);
      const saved = await openSheet(false);

      toggle(true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(updateCalls()).toHaveLength(0);
      expect(saved).toEqual([]);
      expect(isChecked()).toBe(false);
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("puts the checkbox back and says so when going public fails", async () => {
      request.mockImplementation(async (query: string) => {
        if (query === UPDATE_USER_MUTATION) throw new Error("Network down");
        return { myVotesCast: 0 };
      });
      const saved = await openSheet(false);

      toggle(true);

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Save failed", "Network down"),
      );
      fixture.detectChanges();
      expect(saved).toEqual([]);
      expect(isChecked()).toBe(false);
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("turns it off without asking, and puts it back on when that save fails", async () => {
      request.mockImplementation(async (query: string) => {
        if (query === UPDATE_USER_MUTATION) throw new Error("Network down");
        return { myVotesCast: 0 };
      });
      const saved = await openSheet(true);

      toggle(false);

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Save failed", "Network down"),
      );
      fixture.detectChanges();
      expect(confirm).not.toHaveBeenCalled();
      expect(updateCalls()[0][1]).toEqual({
        data: { nickname: "Alice", spottingDataPublic: false },
      });
      expect(saved).toEqual([]);
      expect(isChecked()).toBe(true);
    });
  });
});
