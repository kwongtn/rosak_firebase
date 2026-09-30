import { Component, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { provideZonelessChangeDetection } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  CONSOLE_CATEGORIES_QUERY,
  DELETE_SOCIAL_MEDIA_LINK_MUTATION,
  MARK_LINK_COMPLETED_MUTATION,
  SOCIAL_MEDIA_LINKS_QUERY,
  UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
  type SocialMediaLinkRow,
} from "../data/insiden-console.queries";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { SocialMediaLinksComponent } from "./links.component";
import { dateInputToIsoStart, dateInputToIsoEnd } from "../data/date-range.util";
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
    completedBy: null,
    status: "PENDING_APPROVAL",
    isAutomated: false,
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
  onFilterLineChange(value: string): void;
  onFilterVehicleChange(value: string): void;
  onFilterStationChange(value: string): void;
  onDateFromInput(value: string): void;
  onDateToInput(value: string): void;
  resetFilters(): void;
  completedFilter: WritableSignal<"any" | "pending" | "completed">;
  filterLineId: WritableSignal<string>;
  filterVehicleId: WritableSignal<string>;
  filterStationId: WritableSignal<string>;
  filterDateFrom: WritableSignal<string>;
  filterDateTo: WritableSignal<string>;
  approveLink(link: SocialMediaLinkRow): Promise<boolean>;
  hideLink(link: SocialMediaLinkRow): Promise<boolean>;
  markCompleted(link: SocialMediaLinkRow): Promise<boolean>;
  openLinkDetail(link: SocialMediaLinkRow): void;
  closeLinkPanel(): void;
  markCompletedFromPanel(): Promise<void>;
  isDeleting: WritableSignal<boolean>;
  deleteLink(link: SocialMediaLinkRow): Promise<void>;
  onEditUrlInput(value: string): void;
  onEditTitleInput(value: string): void;
  saveLinkEdit(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<SocialMediaLinksComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

describe("SocialMediaLinksComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let toastMocks: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<SocialMediaLinksComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    requestMock = vi.fn().mockImplementation((query: string) => {
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    toastMocks = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SocialMediaLinksComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClientTesting(),
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: AuthService, useValue: { idToken: async () => "token" } },
        { provide: ToastService, useValue: toastMocks },
      ],
    }).compileComponents();

    TestBed.overrideComponent(SocialMediaLinksComponent, {
      remove: { imports: [AppNavComponent, AppFooterComponent] },
      add: { imports: [StubNav, StubFooter] },
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SocialMediaLinksComponent);
    fixture.detectChanges();
    // The reference dropdown data goes through graphqlResource's own HttpClient
    // (not the GraphQLClient mock) — flush it so no real request leaves the suite.
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({ data: { lines: [], stations: [], calendarIncidentCategories: [] } });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  /** Per-queue-row button labels, in DOM order. Scoped to `tbody` so the
   *  detail sheet's own action row is never counted. */
  function rowActionLabels(): string[][] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr")).map(
      (row) => Array.from(row.querySelectorAll("button")).map((b) => b.textContent?.trim() ?? ""),
    );
  }

  function approveButton(): HTMLButtonElement | null {
    return rowButton("Approve");
  }

  function hideButton(): HTMLButtonElement | null {
    return rowButton("Hide");
  }

  /** First tbody row button with the given label (the sheet's own buttons never match). */
  function rowButton(label: string): HTMLButtonElement | null {
    for (const row of (fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr")) {
      for (const button of Array.from(row.querySelectorAll("button"))) {
        if (button.textContent?.trim() === label) {
          return button;
        }
      }
    }
    return null;
  }

  it("loads links and categories on init with the pending default filter", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const component = asTestable(fixture);
    expect(component.completedFilter()).toBe("pending");

    const [, linkVars] = callsFor("socialMediaLinks")[0];
    expect(linkVars).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: false,
    });
    // Optional filter args stay absent from the wire until set (no nulls).
    expect("lineId" in linkVars).toBe(false);
    expect("vehicleId" in linkVars).toBe(false);
    expect("stationId" in linkVars).toBe(false);
    expect("createdAfter" in linkVars).toBe(false);
    expect("createdBefore" in linkVars).toBe(false);
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
    expect(vars).toEqual({ search: "twitter lrt", categoryId: undefined, completed: false });
  });

  it("category select refetches immediately with the chosen id", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onCategoryChange("7");

    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: undefined, categoryId: "7", completed: false });
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

  it("debounces line/vehicle/station filters into one query carrying the resolver args", async () => {
    await initialLoadsSettled(asTestable(fixture));
    vi.useFakeTimers();
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onFilterLineChange("l1");
    component.onFilterVehicleChange("v9");
    component.onFilterStationChange("s3");
    await vi.advanceTimersByTimeAsync(299);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(callsFor("socialMediaLinks")).toHaveLength(1);
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: false,
      lineId: "l1",
      vehicleId: "v9",
      stationId: "s3",
    });
    expect("createdAfter" in vars).toBe(false);
  });

  it("changing the line filter clears dependent vehicle/station selections", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const component = asTestable(fixture);
    component.filterVehicleId.set("v9");
    component.filterStationId.set("s3");

    component.onFilterLineChange("l2");

    expect(component.filterVehicleId()).toBe("");
    expect(component.filterStationId()).toBe("");
  });

  it("converts the date range to ISO instants and omits them when cleared", async () => {
    await initialLoadsSettled(asTestable(fixture));
    vi.useFakeTimers();
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onDateFromInput("2026-08-01");
    component.onDateToInput("2026-08-03");
    await vi.advanceTimersByTimeAsync(300);

    let [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: false,
      createdAfter: dateInputToIsoStart("2026-08-01"),
      createdBefore: dateInputToIsoEnd("2026-08-03"),
    });

    requestMock.mockClear();
    component.onDateFromInput("");
    component.onDateToInput("");
    await vi.advanceTimersByTimeAsync(300);
    [, vars] = callsFor("socialMediaLinks")[0];
    expect("createdAfter" in vars).toBe(false);
    expect("createdBefore" in vars).toBe(false);
  });

  it("resetFilters clears every control and returns to the pending default", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.filterLineId.set("l1");
    component.filterVehicleId.set("v9");
    component.filterStationId.set("s3");
    component.filterDateFrom.set("2026-08-01");
    component.filterDateTo.set("2026-08-03");
    component.completedFilter.set("completed");

    component.resetFilters();

    expect(component.completedFilter()).toBe("pending");
    expect(component.filterLineId()).toBe("");
    expect(component.filterVehicleId()).toBe("");
    expect(component.filterStationId()).toBe("");
    expect(component.filterDateFrom()).toBe("");
    expect(component.filterDateTo()).toBe("");

    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: false });
    expect("lineId" in vars).toBe(false);
    expect("vehicleId" in vars).toBe(false);
    expect("stationId" in vars).toBe(false);
    expect("createdAfter" in vars).toBe(false);
    expect("createdBefore" in vars).toBe(false);
  });

  it("detail panel shows the completing admin and completion timestamp", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const component = asTestable(fixture);
    const link = makeLink({
      completed: true,
      completedAt: "2026-08-02T12:00:00Z",
      completedBy: "Zul",
    });
    component.openLinkDetail(link);
    expect(component.selectedLink()?.completedBy).toBe("Zul");
    expect(component.selectedLink()?.completedAt).toBe("2026-08-02T12:00:00Z");

    // The sheet panel body is only mounted one effect-tick after open() flips
    // true — poll CD so the assertion sees the rendered markup, not default.
    await vi.waitFor(() => {
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain("Marked completed");
      expect(text).toContain("by Zul");
    });
  });

  it("offers Approve only on rows whose approval status is not LIVE", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const component = asTestable(fixture);
    component.links.set([
      makeLink({ id: "pending-1" }),
      makeLink({ id: "live-1", status: "LIVE" }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const labels = rowActionLabels();
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain("Approve");
    expect(labels[1]).not.toContain("Approve");
  });

  it("approveLink sends status LIVE with the row id and its current fields", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "pending-1" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    approveButton()?.click();
    await vi.waitFor(() => expect(callsFor("updateSocialMediaLink")).toHaveLength(1));

    const [, vars] = callsFor("updateSocialMediaLink")[0];
    // The backend replaces the title and the M2M tag sets verbatim, so the
    // approve payload must carry them — a status-only input would wipe them.
    expect(vars).toEqual({
      socialMediaLinkId: "pending-1",
      input: {
        url: "https://x.com/prasarana/status/1",
        title: "Service alert",
        lineIds: ["l1"],
        vehicleIds: ["v1"],
        stationIds: ["s1"],
        categoryIds: ["c1"],
        status: "LIVE",
      },
    });
    // stopPropagation on the row action keeps the click off the row's open-panel handler.
    expect(component.selectedLink()).toBeNull();
  });

  it("reloads the list after a successful approve so the row comes back LIVE", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({
          socialMediaLinks: [makeLink({ id: "pending-1", status: "LIVE" })],
        });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "pending-1" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    approveButton()?.click();
    await vi.waitFor(() => expect(callsFor("updateSocialMediaLink")).toHaveLength(1));
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    expect(component.links().map((l) => l.status)).toEqual(["LIVE"]);
    expect(component.isLoading()).toBe(false);
  });

  it("keeps the list untouched and toasts when the approve mutation fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.reject(new Error("backend down"));
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "pending-1" })]);

    const ok = await component.approveLink(makeLink({ id: "pending-1" }));

    expect(ok).toBe(false);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);
    expect(toastMocks.error).toHaveBeenCalledWith("Couldn't approve link", "backend down");
    expect(component.links().map((l) => l.id)).toEqual(["pending-1"]);
  });

  it("offers Hide on every non-HIDDEN row and keeps Approve as the un-hide verb", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const component = asTestable(fixture);
    component.links.set([
      makeLink({ id: "pending-1" }),
      makeLink({ id: "live-1", status: "LIVE" }),
      makeLink({ id: "hidden-1", status: "HIDDEN" }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const labels = rowActionLabels();
    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain("Hide");
    expect(labels[1]).toContain("Hide");
    // Already hidden: nothing to hide, but Approve stays so the row can be republished.
    expect(labels[2]).not.toContain("Hide");
    expect(labels[2]).toContain("Approve");
  });

  it("hideLink sends status HIDDEN with the row id and its current fields", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "live-1", status: "LIVE" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    hideButton()?.click();
    await vi.waitFor(() => expect(callsFor("updateSocialMediaLink")).toHaveLength(1));

    // Same replace-not-patch payload as Approve: a status-only input would wipe the
    // title and all four tag sets server-side.
    const [, vars] = callsFor("updateSocialMediaLink")[0];
    expect(vars).toEqual({
      socialMediaLinkId: "live-1",
      input: {
        url: "https://x.com/prasarana/status/1",
        title: "Service alert",
        lineIds: ["l1"],
        vehicleIds: ["v1"],
        stationIds: ["s1"],
        categoryIds: ["c1"],
        status: "HIDDEN",
      },
    });
    expect(component.selectedLink()).toBeNull();
  });

  it("reloads the list after a successful hide so the row comes back HIDDEN", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({
          socialMediaLinks: [makeLink({ id: "live-1", status: "HIDDEN" })],
        });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "live-1", status: "LIVE" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    hideButton()?.click();
    await vi.waitFor(() => expect(callsFor("updateSocialMediaLink")).toHaveLength(1));
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));

    expect(component.links().map((l) => l.status)).toEqual(["HIDDEN"]);
    expect(component.isLoading()).toBe(false);
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Link hidden",
      "https://x.com/prasarana/status/1",
    );
  });

  it("keeps the list untouched and toasts when the hide mutation fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.reject(new Error("backend down"));
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "live-1", status: "LIVE" })]);

    const ok = await component.hideLink(makeLink({ id: "live-1", status: "LIVE" }));

    expect(ok).toBe(false);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);
    expect(toastMocks.error).toHaveBeenCalledWith("Couldn't hide link", "backend down");
    expect(component.links().map((l) => l.status)).toEqual(["LIVE"]);
  });

  it("approveLink un-hides a HIDDEN row by sending status LIVE", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "hidden-1", status: "HIDDEN" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    approveButton()?.click();
    await vi.waitFor(() => expect(callsFor("updateSocialMediaLink")).toHaveLength(1));

    const [, vars] = callsFor("updateSocialMediaLink")[0];
    expect(vars).toMatchObject({
      socialMediaLinkId: "hidden-1",
      input: { status: "LIVE" },
    });
  });

  it("badges an ingested row as Official and leaves a community row unbadged", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const component = asTestable(fixture);
    component.links.set([
      makeLink({ id: "auto-1", isAutomated: true }),
      makeLink({ id: "human-1", isAutomated: false }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="link-official"]',
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("Official");
    expect(chips[0].getAttribute("title")).toBe(
      "Captured automatically from an official operator account",
    );
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr");
    expect(rows[0].querySelector('[data-testid="link-official"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="link-official"]')).toBeNull();
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

  it("deleteLink confirms, calls the delete mutation, drops the row and closes the panel", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("deleteSocialMediaLink")) {
        return Promise.resolve({ deleteSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );

    const component = asTestable(fixture);
    const link = makeLink();
    component.links.set([link]);
    component.openLinkDetail(link);

    await component.deleteLink(link);

    const mutationCalls = callsFor("deleteSocialMediaLink");
    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0][1]).toEqual({ linkId: "link-1" });
    expect(component.links()).toEqual([]);
    expect(component.selectedLink()).toBeNull();
  });

  it("deleteLink does nothing when the confirm is dismissed", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );

    const component = asTestable(fixture);
    const link = makeLink();
    component.links.set([link]);

    await component.deleteLink(link);

    expect(callsFor("deleteSocialMediaLink")).toHaveLength(0);
    expect(component.links().map((l) => l.id)).toEqual(["link-1"]);
  });
});
