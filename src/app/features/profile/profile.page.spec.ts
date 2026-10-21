import {
  CUSTOM_ELEMENTS_SCHEMA,
  ErrorHandler,
  type WritableSignal,
  provideZonelessChangeDetection,
  signal,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../core/graphql/graphql-client";
import { SpottingActivityHeatmap } from "../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import {
  GET_PUBLIC_USER_QUERY,
  GET_USER_DATA_QUERY,
  type GetPublicUserData,
  type GetUserDataData,
  type UserData,
} from "./data/profile.queries";
import { FleetProgressComponent } from "./fleet-progress/fleet-progress.component";
import { MyLinksComponent } from "./my-links/my-links.component";
import { MySpottingsComponent } from "./my-spottings/my-spottings.component";
import { ProfilePage } from "./profile.page";
import { UserCardComponent } from "./user-card/user-card.component";

function makeUser(nickname: string): UserData {
  return {
    nickname,
    spottingsCount: 3,
    mediaCount: 1,
    spottingTrends: [],
    withMostEntriesMonth: null,
    withMostEntriesDay: null,
    favouriteVehicles: [],
    spottingDataPublic: true,
  };
}

function publicResponse(nickname: string): GetPublicUserData {
  return { publicUser: { ...makeUser(nickname), spottings: [] } };
}

/** A request the test resolves by hand, so two loads can be left in flight at once. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("ProfilePage", () => {
  let fixture: ComponentFixture<ProfilePage>;
  let requestMock: ReturnType<typeof vi.fn>;
  let handleErrorMock: ReturnType<typeof vi.fn>;
  let signedInUid: WritableSignal<{ uid: string } | null>;

  beforeEach(async () => {
    requestMock = vi.fn();
    handleErrorMock = vi.fn();
    signedInUid = signal<{ uid: string } | null>({ uid: "me" });
    // What the router's title strategy leaves behind for this route.
    document.title = "MLPTF | Profile";

    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: {
            whenReady: Promise.resolve(),
            user: signedInUid,
            idToken: vi.fn(async () => "token"),
          },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ErrorHandler, useValue: { handleError: handleErrorMock } },
      ],
    })
      // Shell, ad and feature children pull in live services; the page's own load logic is under test.
      .overrideComponent(ProfilePage, {
        remove: {
          imports: [
            AdSlotComponent,
            AppNavComponent,
            AppFooterComponent,
            UserCardComponent,
            FleetProgressComponent,
            SpottingActivityHeatmap,
            MySpottingsComponent,
            MyLinksComponent,
          ],
        },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  /** Mounts the page on `:id` and lets auth readiness flip so the load effect runs. */
  async function mount(id: string): Promise<void> {
    fixture = TestBed.createComponent(ProfilePage);
    fixture.componentRef.setInput("id", id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function cardNickname(): string | undefined {
    const card = fixture.nativeElement.querySelector("app-profile-user-card") as
      (HTMLElement & { user?: UserData }) | null;
    return card?.user?.nickname;
  }

  it("loads the public profile for the :id input", async () => {
    requestMock.mockResolvedValue(publicResponse("Alice"));

    await mount("alice");
    await vi.waitFor(() => expect(cardNickname()).toBe("Alice"));

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [query, vars] = requestMock.mock.calls[0];
    expect(query).toBe(GET_PUBLIC_USER_QUERY);
    expect(vars).toMatchObject({ id: "alice" });
  });

  it("uses the owner query when :id is the signed-in uid", async () => {
    const own: GetUserDataData = { user: makeUser("Me") };
    requestMock.mockResolvedValue(own);

    await mount("me");
    await vi.waitFor(() => expect(cardNickname()).toBe("Me"));

    expect(requestMock.mock.calls[0][0]).toBe(GET_USER_DATA_QUERY);
  });

  describe("fleet progress", () => {
    function fleetCard(): HTMLElement | null {
      return fixture.nativeElement.querySelector("app-fleet-progress");
    }

    it("mounts the fleet card on the owner's own profile, once the profile has loaded", async () => {
      requestMock.mockResolvedValue({ user: makeUser("Me") } satisfies GetUserDataData);

      await mount("me");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(fleetCard()).not.toBeNull();
      });
    });

    it("leaves the card to read its own list, so the page's first read never waits for it", async () => {
      requestMock.mockResolvedValue({ user: makeUser("Me") } satisfies GetUserDataData);

      await mount("me");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(fleetCard()).not.toBeNull();
      });

      // One request, and it is the profile's own. The card (stubbed here) makes the fleet read itself.
      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock.mock.calls[0][0]).toBe(GET_USER_DATA_QUERY);
    });

    it("never shows it on someone else's profile, whose query carries one vehicle only", async () => {
      requestMock.mockResolvedValue(publicResponse("Alice"));

      await mount("alice");
      await vi.waitFor(() => expect(cardNickname()).toBe("Alice"));

      expect(fleetCard()).toBeNull();
    });
  });

  it("reloads when the id input changes while the page stays mounted", async () => {
    requestMock.mockResolvedValueOnce(publicResponse("Alice"));
    await mount("alice");
    await vi.waitFor(() => expect(cardNickname()).toBe("Alice"));

    const bob = deferred<GetPublicUserData>();
    requestMock.mockReturnValueOnce(bob.promise);
    fixture.componentRef.setInput("id", "bob");
    fixture.detectChanges();

    // The previous user is never shown under the new id while the new load is in flight.
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    expect(requestMock.mock.calls[1][0]).toBe(GET_PUBLIC_USER_QUERY);
    expect(requestMock.mock.calls[1][1]).toMatchObject({ id: "bob" });
    expect(cardNickname()).toBeUndefined();

    bob.resolve(publicResponse("Bob"));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(cardNickname()).toBe("Bob");
    });
  });

  it("drops a slow response for a profile the page has already left", async () => {
    const alice = deferred<GetPublicUserData>();
    const bob = deferred<GetPublicUserData>();
    requestMock.mockReturnValueOnce(alice.promise).mockReturnValueOnce(bob.promise);

    await mount("alice");
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    fixture.componentRef.setInput("id", "bob");
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));

    bob.resolve(publicResponse("Bob"));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(cardNickname()).toBe("Bob");
    });

    // Alice's request lands last. It must not replace Bob.
    alice.resolve(publicResponse("Alice"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cardNickname()).toBe("Bob");
  });

  describe("when the load fails", () => {
    function banner(): HTMLElement | null {
      return fixture.nativeElement.querySelector("app-retry-banner");
    }

    it("shows the retry banner instead of an empty profile", async () => {
      requestMock.mockRejectedValueOnce(new GraphQLRequestError([{ message: "boom" }]));

      await mount("alice");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(banner()).not.toBeNull();
      });

      expect(banner()?.textContent).toContain("Couldn't load this profile.");
      expect(cardNickname()).toBeUndefined();
      // GraphQLClient already toasts and reports a GraphQLRequestError; the page must not double-report.
      expect(handleErrorMock).not.toHaveBeenCalled();
    });

    it("reports an unexpected failure to the ErrorHandler and still shows the banner", async () => {
      const failure = new Error("Network down");
      requestMock.mockRejectedValueOnce(failure);

      await mount("alice");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(banner()).not.toBeNull();
      });

      expect(handleErrorMock).toHaveBeenCalledWith(failure);
    });

    it("Try Now re-runs the load and recovers", async () => {
      requestMock
        .mockRejectedValueOnce(new GraphQLRequestError([{ message: "boom" }]))
        .mockResolvedValueOnce(publicResponse("Alice"));

      await mount("alice");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(banner()).not.toBeNull();
      });

      (banner()?.querySelector("button") as HTMLButtonElement).click();

      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(cardNickname()).toBe("Alice");
      });
      expect(banner()).toBeNull();
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(requestMock.mock.calls[1][1]).toMatchObject({ id: "alice" });
    });

    it("clears the error when the page moves to another profile", async () => {
      requestMock
        .mockRejectedValueOnce(new GraphQLRequestError([{ message: "boom" }]))
        .mockResolvedValueOnce(publicResponse("Bob"));

      await mount("alice");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(banner()).not.toBeNull();
      });

      fixture.componentRef.setInput("id", "bob");
      fixture.detectChanges();

      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(cardNickname()).toBe("Bob");
      });
      expect(banner()).toBeNull();
    });
  });

  describe("document title", () => {
    it("names the tab after the spotter once the profile loads", async () => {
      requestMock.mockResolvedValue(publicResponse("Alice"));

      await mount("alice");

      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(document.title).toBe("Alice | MLPTF");
      });
    });

    it("keeps the route title for a profile with no nickname", async () => {
      requestMock.mockResolvedValue(publicResponse("  "));

      await mount("alice");
      await vi.waitFor(() => expect(cardNickname()).toBe("  "));

      expect(document.title).toBe("MLPTF | Profile");
    });

    it("goes back to the route title while the next profile loads, then names that one", async () => {
      requestMock.mockResolvedValueOnce(publicResponse("Alice"));
      await mount("alice");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(document.title).toBe("Alice | MLPTF");
      });

      const bob = deferred<GetPublicUserData>();
      requestMock.mockReturnValueOnce(bob.promise);
      fixture.componentRef.setInput("id", "bob");
      fixture.detectChanges();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(document.title).toBe("MLPTF | Profile");
      });

      bob.resolve(publicResponse("Bob"));
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(document.title).toBe("Bob | MLPTF");
      });
    });

    it("follows a nickname edit", async () => {
      requestMock.mockResolvedValue({ user: makeUser("Me") } satisfies GetUserDataData);
      await mount("me");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(document.title).toBe("Me | MLPTF");
      });

      (
        fixture.componentInstance as unknown as { onNicknameSaved(nickname: string): void }
      ).onNicknameSaved("Mee");
      fixture.detectChanges();

      expect(document.title).toBe("Mee | MLPTF");
    });

    it("keeps the route title when the load fails", async () => {
      requestMock.mockRejectedValueOnce(new GraphQLRequestError([{ message: "boom" }]));

      await mount("alice");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector("app-retry-banner")).not.toBeNull();
      });

      expect(document.title).toBe("MLPTF | Profile");
    });

    it("puts the route title back when the page is left", async () => {
      requestMock.mockResolvedValue(publicResponse("Alice"));
      await mount("alice");
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(document.title).toBe("Alice | MLPTF");
      });

      fixture.destroy();

      expect(document.title).toBe("MLPTF | Profile");
    });
  });
});
