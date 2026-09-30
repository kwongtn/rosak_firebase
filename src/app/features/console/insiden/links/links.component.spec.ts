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
    created: "2026-08-01T09:00:00",
    occurredAt: "2026-08-01T08:30:00",
    threadId: null,
    isThreadRoot: true,
    threadSize: 1,
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
  canGroupSelection: () => boolean;
  allVisibleSelected: () => boolean;
  selectedIds: WritableSignal<string[]>;
  selectedCount: () => number;
  toggleRowSelection(id: string): void;
  toggleSelectAll(): void;
  clearSelection(): void;
  groupSelected(): Promise<boolean>;
  ungroupLink(link: SocialMediaLinkRow): Promise<boolean>;
  editOccurredAt: WritableSignal<string>;
  onEditOccurredAtInput(value: string): void;
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

  /** The two grouping mutations are matched on their OPERATION name, never on
   *  the field name: "groupSocialMediaLinks" is a literal substring of
   *  "ungroupSocialMediaLinks", so a field-level fragment match reports every
   *  ungroup call as a group call and both assertions below become vacuous. */
  function groupCalls(): [string, Record<string, unknown>][] {
    return callsFor("mutation GroupSocialMediaLinks");
  }

  function ungroupCalls(): [string, Record<string, unknown>][] {
    return callsFor("mutation UngroupSocialMediaLinks");
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

  function byTestId(id: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
  }

  /** Renders a set of rows and flushes change detection, so the assertions that
   *  follow see markup rather than the default view. */
  async function renderRows(rows: SocialMediaLinkRow[]): Promise<void> {
    const component = asTestable(fixture);
    component.links.set(rows);
    await fixture.whenStable();
    fixture.detectChanges();
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
    expect("occurredAfter" in linkVars).toBe(false);
    expect("occurredBefore" in linkVars).toBe(false);
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
    expect("occurredAfter" in vars).toBe(false);
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
      occurredAfter: dateInputToIsoStart("2026-08-01"),
      occurredBefore: dateInputToIsoEnd("2026-08-03"),
    });

    requestMock.mockClear();
    component.onDateFromInput("");
    component.onDateToInput("");
    await vi.advanceTimersByTimeAsync(300);
    [, vars] = callsFor("socialMediaLinks")[0];
    expect("occurredAfter" in vars).toBe(false);
    expect("occurredBefore" in vars).toBe(false);
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
    expect("occurredAfter" in vars).toBe(false);
    expect("occurredBefore" in vars).toBe(false);
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
        // linkStatusInput re-sends the row's event time verbatim: the input is
        // replace-not-patch and an explicit null RESETS occurred_at to created.
        occurredAt: "2026-08-01T08:30:00",
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
        // linkStatusInput re-sends the row's event time verbatim: the input is
        // replace-not-patch and an explicit null RESETS occurred_at to created.
        occurredAt: "2026-08-01T08:30:00",
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
        // ALWAYS present, never omitted: the input is replace-not-patch, and an
        // explicit null is a RESET to `created` rather than "unchanged".
        occurredAt: "2026-08-01T08:30:00",
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

  /* ---- Occurred column + relabelled date filter ----------------------- */

  it("shows the event instant beside the report instant, in its own column", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ created: "2026-08-01T09:00:00", occurredAt: "2026-08-01T08:30:00" }),
    ]);

    const headers = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("thead th"),
    ).map((th) => th.textContent?.trim() ?? "");
    // Adjacent, and both explicitly named: neither instant is guessable from
    // the other, and the queue is sorted by the Occurred one.
    expect(headers.indexOf("Occurred")).toBe(headers.indexOf("Submitted") + 1);

    const cells = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr")[0].querySelectorAll("td"),
    ).map((td) => td.textContent?.trim() ?? "");
    const occurred = cells[headers.indexOf("Occurred")];
    expect(occurred).toContain("8:30");
    expect(cells[headers.indexOf("Submitted")]).toContain("9:00");
  });

  it("labels the date-range filter for the instant it actually windows", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Occurred between");
    expect(text).not.toContain("Submitted between");
    const from = (fixture.nativeElement as HTMLElement).querySelector(
      'input[aria-label="Occurred from date"]',
    );
    expect(from).not.toBeNull();
  });

  /* ---- Multi-select grouping ------------------------------------------ */

  it("ticking a row selects it without opening the detail panel", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([makeLink({ id: "a" })]);

    byTestId("link-select")?.dispatchEvent(new Event("click"));
    byTestId("link-select")?.dispatchEvent(new Event("change"));

    expect(asTestable(fixture).selectedIds()).toEqual(["a"]);
    // stopPropagation on the checkbox's click: the row itself opens the editor.
    expect(asTestable(fixture).selectedLink()).toBeNull();
  });

  it("Select-all ticks the whole page and unticks on a second press", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);
    const component = asTestable(fixture);

    byTestId("select-all")?.dispatchEvent(new Event("change"));
    expect(component.selectedIds()).toEqual(["a", "b"]);
    expect(component.allVisibleSelected()).toBe(true);

    byTestId("select-all")?.dispatchEvent(new Event("change"));
    expect(component.selectedIds()).toEqual([]);
  });

  it("keeps Group into thread disabled for zero and for one ticked row", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);
    const component = asTestable(fixture);

    const groupButton = byTestId("group-selected") as HTMLButtonElement;
    // Zero rows: a one-link thread (or none) is a no-op that renders as a thread.
    expect(groupButton.disabled).toBe(true);
    expect(component.canGroupSelection()).toBe(false);

    component.toggleRowSelection("a");
    fixture.detectChanges();
    expect(groupButton.disabled).toBe(true);

    component.toggleRowSelection("b");
    fixture.detectChanges();
    expect(groupButton.disabled).toBe(false);
    expect(byTestId("selection-count")?.textContent).toContain("2 selected");
  });

  it("groupSelected sends linkIds with no threadId so the backend elects a root", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.resolve({ groupSocialMediaLinks: { ok: true, id: 42 } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);

    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    component.toggleRowSelection("b");

    const ok = await component.groupSelected();

    expect(ok).toBe(true);
    const calls = groupCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ linkIds: ["a", "b"] });
    // Omitting the key is what means "start a new thread"; the returned root id
    // is an Int the flat console list has no use for.
    expect("threadId" in calls[0][1]).toBe(false);
  });

  it("groupSelected only ever sends the ticked rows that are still on screen", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.resolve({ groupSocialMediaLinks: { ok: true, id: 1 } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.selectedIds.set(["a", "b", "gone"]);
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);

    await component.groupSelected();

    expect(groupCalls()[0][1]).toEqual({ linkIds: ["a", "b"] });
  });

  it("reloads the list and clears the selection after a successful group", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.resolve({ groupSocialMediaLinks: { ok: true, id: 7 } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({
          socialMediaLinks: [
            makeLink({ id: "a", threadSize: 2 }),
            makeLink({ id: "b", threadId: "a", isThreadRoot: false }),
          ],
        });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);

    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    component.toggleRowSelection("b");
    await component.groupSelected();

    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    // Server truth, not an optimistic guess of which row became the root.
    expect(component.links().map((l) => l.threadId)).toEqual([null, "a"]);
    // Leaving it ticked would offer to group rows that are already one thread.
    expect(component.selectedIds()).toEqual([]);
    expect(component.isLoading()).toBe(false);
    expect(toastMocks.success).toHaveBeenCalledWith("Links grouped", "2 links are now one thread.");
  });

  it("toasts and leaves the list and the selection alone when grouping fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.reject(new Error("link 9 is not yours"));
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);

    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    component.toggleRowSelection("b");

    const ok = await component.groupSelected();

    // All-or-nothing server-side: no reload, no optimistic regroup, and the
    // selection survives so the admin can adjust it and retry.
    expect(ok).toBe(false);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);
    expect(component.links().map((l) => l.id)).toEqual(["a", "b"]);
    expect(component.selectedIds()).toEqual(["a", "b"]);
    expect(toastMocks.error).toHaveBeenCalledWith("Couldn't group links", "link 9 is not yours");
    expect(component.isLoading()).toBe(false);
  });

  /* ---- Per-row Ungroup ------------------------------------------------- */

  it("ungroupLink sends only the member's own id and reloads", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation UngroupSocialMediaLinks")) {
        return Promise.resolve({ ungroupSocialMediaLinks: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [makeLink({ id: "a" })] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    await renderRows([makeLink({ id: "a", threadSize: 2 }), makeLink({ id: "b", threadId: "a" })]);

    const component = asTestable(fixture);
    const member = component.links()[1];
    const ok = await component.ungroupLink(member);

    expect(ok).toBe(true);
    const calls = ungroupCalls();
    expect(calls).toHaveLength(1);
    // Only the member, and no threadId — ungroup is not "group with threadId: null".
    expect(calls[0][1]).toEqual({ linkIds: ["b"] });
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
  });

  it("refuses to ungroup a row that is not a member", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    // A root: ungrouping one is a server-side no-op, so the action must not fire.
    const ok = await component.ungroupLink(makeLink({ id: "root", threadId: null, threadSize: 3 }));

    expect(ok).toBe(false);
    expect(ungroupCalls()).toHaveLength(0);
  });

  it("offers Ungroup on a thread member and not on the root", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ id: "a", threadSize: 2 }),
      makeLink({ id: "b", threadId: "a", isThreadRoot: false }),
      makeLink({ id: "c", threadId: null }),
    ]);

    const labels = rowActionLabels();
    expect(labels[0]).not.toContain("Ungroup");
    expect(labels[1]).toContain("Ungroup");
    expect(labels[2]).not.toContain("Ungroup");
  });

  /* ---- Thread chip + the hide coupling -------------------------------- */

  it("badges a thread root with its member count and leaves other rows bare", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ id: "root", threadSize: 3 }),
      makeLink({ id: "member", threadId: "root", isThreadRoot: false, threadSize: 1 }),
    ]);

    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="link-thread"]',
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("3 links");
    // The chip has to carry the coupling, not just the count.
    expect(chips[0].getAttribute("title")).toContain("hides every member too");
  });

  it("asks before hiding a thread root and names the blast radius", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    // Typed with its parameter so `mock.calls[0][0]` is the message, not a
    // zero-length tuple: the assertion is about the WORDING of the guard.
    const confirmMock = vi.fn((_message: string) => false);
    vi.stubGlobal("confirm", confirmMock);

    const component = asTestable(fixture);
    const root = makeLink({ id: "root", threadSize: 4 });

    const ok = await component.hideLink(root);

    expect(ok).toBe(false);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const message = confirmMock.mock.calls[0][0];
    expect(message).toContain("4 links");
    expect(message).toContain("hides every member too");
    // Declining must not hide anything.
    expect(callsFor("updateSocialMediaLink")).toHaveLength(0);
  });

  it("does not interrupt Hide on an ordinary row or a thread member", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    const component = asTestable(fixture);
    await component.hideLink(makeLink({ id: "plain", threadSize: 1 }));
    await component.hideLink(
      makeLink({ id: "member", threadId: "root", isThreadRoot: false, threadSize: 1 }),
    );

    expect(confirmMock).not.toHaveBeenCalled();
    expect(callsFor("updateSocialMediaLink")).toHaveLength(2);
  });

  /* ---- Event-time field in the console's edit sheet -------------------- */

  it("hydrates the event-time control from occurredAt, not from created", async () => {
    const component = asTestable(fixture);

    component.openLinkDetail(
      makeLink({ created: "2026-08-01T09:00:00", occurredAt: "2026-07-28T21:15:00" }),
    );

    expect(component.editOccurredAt()).toBe("2026-07-28T21:15");
  });

  it("saveLinkEdit sends the control's value as occurredAt", async () => {
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
    // The optimistic patch rewrites the ROW, so the queue has to hold it.
    component.links.set([link]);
    component.openLinkDetail(link);
    component.onEditOccurredAtInput("2026-07-28T21:15");

    await component.saveLinkEdit();

    const [, vars] = callsFor("updateSocialMediaLink")[0];
    // Full `YYYY-MM-DDTHH:mm:ss`, no offset and no Z: the backend column is naive
    // local wall time, so a UTC spelling here would shift it by 8 hours.
    expect((vars["input"] as { occurredAt: string }).occurredAt).toBe("2026-07-28T21:15:00");
    expect(component.links()[0].occurredAt).toBe("2026-07-28T21:15:00");
  });

  it("an untouched event-time control round-trips the link's current value", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    const link = makeLink({ created: "2026-08-01T09:00:00", occurredAt: "2026-07-28T21:15:00" });
    component.openLinkDetail(link);
    // The admin edits the title and nothing else.
    component.onEditTitleInput("Corrected");

    await component.saveLinkEdit();

    const [, vars] = callsFor("updateSocialMediaLink")[0];
    expect((vars["input"] as { occurredAt: string }).occurredAt).toBe("2026-07-28T21:15:00");
  });

  it("a cleared event-time control sends the explicit null that resets it to created", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    const link = makeLink({ created: "2026-08-01T09:00:00", occurredAt: "2026-07-28T21:15:00" });
    component.links.set([link]);
    component.openLinkDetail(link);
    component.onEditOccurredAtInput("");

    await component.saveLinkEdit();

    const [, vars] = callsFor("updateSocialMediaLink")[0];
    // `null` (not an omitted key) is what the backend reads as "reset to the
    // submission time" — and omitting it would make a visible-but-empty control
    // un-clearable.
    expect((vars["input"] as { occurredAt: string | null }).occurredAt).toBeNull();
    // The optimistic row mirrors the server's reset, not the stale value.
    expect(component.links()[0].occurredAt).toBe("2026-08-01T09:00:00");
  });

  it("closing the panel clears the event-time control", async () => {
    const component = asTestable(fixture);
    component.openLinkDetail(makeLink());
    component.onEditOccurredAtInput("2026-07-28T21:15");

    component.closeLinkPanel();

    expect(component.editOccurredAt()).toBe("");
  });
});
