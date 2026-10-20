import {
  CUSTOM_ELEMENTS_SCHEMA,
  type WritableSignal,
  provideZonelessChangeDetection,
  signal,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
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
  let signedInUid: WritableSignal<{ uid: string } | null>;

  beforeEach(async () => {
    requestMock = vi.fn();
    signedInUid = signal<{ uid: string } | null>({ uid: "me" });

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
});
