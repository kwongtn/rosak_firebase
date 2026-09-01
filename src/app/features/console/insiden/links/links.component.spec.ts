import { Component, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { provideZonelessChangeDetection } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  CONSOLE_CATEGORIES_QUERY,
  MARK_LINK_COMPLETED_MUTATION,
  SOCIAL_MEDIA_LINKS_QUERY,
  UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
  type SocialMediaLinkRow,
} from "../data/insiden-console.queries";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { SocialMediaLinksComponent } from "./links.component";
/* The real app-nav/footer pull in browser-only services (ThemeService needs
 * matchMedia); the shell chrome is irrelevant to these specs, so swap in
 * empty stand-ins. */
@Component({ selector: "app-nav", template: "" })
class StubNav {}

@Component({ selector: "app-footer", template: "" })
class StubFooter {}

function makeLink(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow {
  return {
    id: "link-1",
    url: "https://x.com/prasarana/status/1",
    title: "Service alert",
    created: "2026-08-01T09:00:00Z",
    completed: false,
    completedAt: null,
    user: { nickname: "Zul", shortId: "abcd1234" },
    lines: [{ id: "l1", code: "KJL", displayName: "Kelana Jaya Line" }],
    vehicles: [{ id: "v1", identificationNo: "V-123" }],
    stations: [{ id: "s1", displayName: "KL Sentral" }],
    categories: [{ id: "c1", name: "Disruption" }],
    ...overrides,
  };
}

/** The component's template-facing surface is `protected`; tests reach it
 * through this typed projection instead of leaking `any` into the suite. */
interface ComponentUnderTest {
  isLoading: WritableSignal<boolean>;
  links: WritableSignal<SocialMediaLinkRow[]>;
  categories: WritableSignal<{ id: string; name: string }[]>;
  selectedLink: WritableSignal<SocialMediaLinkRow | null>;
  editUrl: WritableSignal<string>;
  editTitle: WritableSignal<string>;
  urlTouched: WritableSignal<boolean>;
  isEditing: WritableSignal<boolean>;
  canSave: () => boolean;
  selectedLineIds: WritableSignal<string[]>;
  selectedVehicleIds: WritableSignal<string[]>;
  selectedStationIds: WritableSignal<string[]>;
  selectedCategoryIds: WritableSignal<string[]>;
  onSearchInput(value: string): void;
  onCategoryChange(value: string): void;
  onCompletedFilterChange(value: "any" | "pending" | "completed"): void;
  markCompleted(link: SocialMediaLinkRow): Promise<boolean>;
  openLinkDetail(link: SocialMediaLinkRow): void;
  closeLinkPanel(): void;
  markCompletedFromPanel(): Promise<void>;
  onEditUrlInput(value: string): void;
  onEditTitleInput(value: string): void;
  saveLinkEdit(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<SocialMediaLinksComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

describe("SocialMediaLinksComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<SocialMediaLinksComponent>;

  beforeEach(async () => {
    requestMock = vi.fn().mockImplementation((query: string) => {
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    await TestBed.configureTestingModule({
      imports: [SocialMediaLinksComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: AuthService, useValue: { idToken: async () => "token" } },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
      ],
    }).compileComponents();

    TestBed.overrideComponent(SocialMediaLinksComponent, {
      remove: { imports: [AppNavComponent, AppFooterComponent] },
      add: { imports: [StubNav, StubFooter] },
    });
    fixture = TestBed.createComponent(SocialMediaLinksComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Zoneless whenStable() does not track the constructor's fire-and-forget
   * load promises — wait for both queries AND for the loading flag to drop,
   * otherwise a follow-up load() hits its own re-entrancy guard. */
  async function initialLoadsSettled(component: ComponentUnderTest): Promise<void> {
    await fixture.whenStable();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(component.isLoading()).toBe(false));
  }

  function callsFor(queryFragment: string): [string, Record<string, unknown>][] {
    return requestMock.mock.calls.filter((call) => (call[0] as string).includes(queryFragment)) as [
      string,
      Record<string, unknown>,
    ][];
  }

  it("loads links and categories on init without filters", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const [, linkVars] = callsFor("socialMediaLinks")[0];
    expect(linkVars).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: undefined,
    });
    const [, categoryVars] = callsFor("calendarIncidentCategories")[0];
    expect(categoryVars).toBeUndefined();
  });

  it("debounces typing and refetches once with the trimmed term after 300ms", async () => {
    await initialLoadsSettled(asTestable(fixture));
    vi.useFakeTimers();
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onSearchInput("  twitter");
    component.onSearchInput("  twitter lrt ");
    await vi.advanceTimersByTimeAsync(299);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(callsFor("socialMediaLinks")).toHaveLength(1);
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: "twitter lrt", categoryId: undefined, completed: undefined });
  });

  it("category select refetches immediately with the chosen id", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onCategoryChange("7");

    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: undefined, categoryId: "7", completed: undefined });
  });

  it("status toggle maps pending/completed to false/true and any to undefined", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);

    component.onCompletedFilterChange("pending");
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    let [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: false });

    component.onCompletedFilterChange("completed");
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(2));
    [, vars] = callsFor("socialMediaLinks")[1];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: true });

    component.onCompletedFilterChange("any");
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(3));
    [, vars] = callsFor("socialMediaLinks")[2];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: undefined });
  });

  it("markCompleted calls the mutation and reloads the list", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({
          socialMediaLinks: [makeLink({ id: "link-2", completed: true })],
        });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });

    const component = asTestable(fixture);
    await component.markCompleted(makeLink());

    const mutationCalls = callsFor("markSocialMediaLinkCompleted");
    expect(mutationCalls).toHaveLength(1);
    const [, vars] = mutationCalls[0];
    expect(vars).toEqual({ linkId: "link-1" });
    expect(component.links().map((l) => l.id)).toEqual(["link-2"]);
  });

  it("keeps the list untouched when the mutation fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockRejectedValueOnce(new Error("backend down"));

    const component = asTestable(fixture);
    component.links.set([makeLink()]);
    await component.markCompleted(makeLink());

    expect(component.links().map((l) => l.id)).toEqual(["link-1"]);
  });

  it("openLinkDetail selects the row for the panel", () => {
    const component = asTestable(fixture);
    const link = makeLink({ id: "link-7" });

    component.openLinkDetail(link);

    expect(component.selectedLink()).toEqual(link);
  });

  it("closeLinkPanel clears the selection", () => {
    const component = asTestable(fixture);
    component.openLinkDetail(makeLink());
    component.closeLinkPanel();
    expect(component.selectedLink()).toBeNull();
  });

  it("markCompletedFromPanel completes the link and closes the panel", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [makeLink({ id: "link-2", completed: true })] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });

    const component = asTestable(fixture);
    component.openLinkDetail(makeLink());
    await component.markCompletedFromPanel();

    expect(callsFor("markSocialMediaLinkCompleted")).toHaveLength(1);
    expect(component.selectedLink()).toBeNull();
  });

  it("openLinkDetail prefills the edit form from the selected row", () => {
    const component = asTestable(fixture);
    const link = makeLink({
      url: "https://x.com/prasarana/status/2",
      title: "Updated title",
      lines: [{ id: "l9", code: "MRL", displayName: "Monorail" }],
      vehicles: [{ id: "v9", identificationNo: "V-999" }],
      stations: [{ id: "s9", displayName: "KLCC" }],
      categories: [{ id: "c9", name: "Incident" }],
    });

    component.openLinkDetail(link);

    expect(component.selectedLink()).toEqual(link);
    expect(component.editUrl()).toBe("https://x.com/prasarana/status/2");
    expect(component.editTitle()).toBe("Updated title");
    expect(component.isEditing()).toBe(true);
    expect(component.selectedLineIds()).toEqual(["l9"]);
    expect(component.selectedVehicleIds()).toEqual(["v9"]);
    expect(component.selectedStationIds()).toEqual(["s9"]);
    expect(component.selectedCategoryIds()).toEqual(["c9"]);
  });

  it("closeLinkPanel clears the selection and resets the edit form", () => {
    const component = asTestable(fixture);
    component.openLinkDetail(makeLink());
    component.onEditUrlInput("https://example.com/status/3");

    component.closeLinkPanel();

    expect(component.selectedLink()).toBeNull();
    expect(component.isEditing()).toBe(false);
    expect(component.editUrl()).toBe("");
    expect(component.editTitle()).toBe("");
    expect(component.selectedLineIds()).toEqual([]);
    expect(component.selectedVehicleIds()).toEqual([]);
    expect(component.selectedStationIds()).toEqual([]);
    expect(component.selectedCategoryIds()).toEqual([]);
  });

  it("saveLinkEdit calls the update mutation with the complete form state", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    const link = makeLink();
    component.links.set([link]);
    component.openLinkDetail(link);
    component.onEditUrlInput("https://x.com/prasarana/status/42");
    component.onEditTitleInput("Fixed alert");
    component.selectedLineIds.set(["l1", "l2"]);
    component.selectedCategoryIds.set(["c1", "c2"]);

    await component.saveLinkEdit();

    const mutationCalls = callsFor("updateSocialMediaLink");
    expect(mutationCalls).toHaveLength(1);
    const [, vars] = mutationCalls[0];
    expect(vars).toEqual({
      socialMediaLinkId: "link-1",
      input: {
        url: "https://x.com/prasarana/status/42",
        title: "Fixed alert",
        lineIds: ["l1", "l2"],
        vehicleIds: ["v1"],
        stationIds: ["s1"],
        categoryIds: ["c1", "c2"],
      },
    });
    expect(component.links()[0].url).toBe("https://x.com/prasarana/status/42");
    expect(component.selectedLink()?.title).toBe("Fixed alert");
    expect(component.selectedLink()?.categories.map((c) => c.id)).toEqual(["c1"]);
  });

  it("saveLinkEdit refuses to fire without a URL", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.openLinkDetail(makeLink());
    component.onEditUrlInput("   ");

    await component.saveLinkEdit();

    expect(callsFor("updateSocialMediaLink")).toHaveLength(0);
    expect(component.urlTouched()).toBe(true);
  });
});
