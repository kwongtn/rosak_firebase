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

/** A row of the admin queue. The defaults describe the overwhelmingly common
 *  case: a lone, ungrouped, childless link — which under the tree is a ROOT with
 *  a subtree of nothing, and therefore renders with no depth indent, no chip and
 *  no confirm before Hide. Every hierarchy test therefore has to opt IN to the
 *  tree fields it is about, which is what keeps "this row happens to be a root"
 *  from silently standing in for "this row has links under it".
 *
 *  `position: 10` is a REAL stored sibling rank, not a placeholder: the run order
 *  is `position` ASC with `id` as the tie-break, so fixtures that say nothing about
 *  the sequence all share one number and fall through to the documented tie-break
 *  — i.e. they read in `id` order, which is what a set of `a`, `b`, `c` rows means
 *  by "in order". A test about the sequence therefore has to opt into distinct
 *  positions, exactly as it has to opt into distinct parents. */
function makeLink(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow {
  return {
    id: "link-1",
    url: "https://x.com/prasarana/status/1",
    title: "Service alert",
    created: "2026-08-01T09:00:00",
    occurredAt: "2026-08-01T08:30:00",
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    position: 10,
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

/** A row whose payload came back WITHOUT `position`.
 *
 *  `SocialMediaLinkRow.position` is a required `number`, so the only honest way to
 *  build this fixture is to delete the key from a real row — loosening the factory
 *  instead would put the hole back into every other test. The runtime case it models
 *  is a stale cached payload or a host that stops selecting the field, and the rule
 *  under test is that a run whose stored order cannot be read is not reordered. */
function withoutStoredOrder(row: SocialMediaLinkRow): SocialMediaLinkRow {
  const copy = { ...row } as Record<string, unknown>;
  delete copy["position"];
  return copy as unknown as SocialMediaLinkRow;
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
  nestSelectionReady: () => boolean;
  allVisibleSelected: () => boolean;
  selectedIds: WritableSignal<string[]>;
  selectedCount: () => number;
  toggleRowSelection(id: string): void;
  toggleSelectAll(): void;
  clearSelection(): void;
  groupSelected(): Promise<boolean>;
  nestSelectedUnder(link: SocialMediaLinkRow): Promise<boolean>;
  canNestUnder(link: SocialMediaLinkRow): boolean;
  nestBlockedReason(link: SocialMediaLinkRow): string | null;
  ungroupLink(link: SocialMediaLinkRow): Promise<boolean>;
  /* Hierarchy: depth is per row, the rest are queue-wide. */
  depthOf(link: SocialMediaLinkRow): number;
  depthRails(link: SocialMediaLinkRow): number[];
  /* The accordion: which conversations are open, and which rows that puts on
   * screen. `renderedLinks`/`renderedLinkIds` are the DISPLAY set — deliberately
   * not the same list the mutations scope to (`links()`), see the component. */
  renderedLinks: () => SocialMediaLinkRow[];
  renderedLinkIds: () => string[];
  expandedIds: WritableSignal<ReadonlySet<string>>;
  isExpanded(id: string): boolean;
  toggleExpanded(id: string): void;
  childCountOf(link: SocialMediaLinkRow): number;
  queueIsComplete: WritableSignal<boolean>;
  canMoveUp(link: SocialMediaLinkRow): boolean;
  canMoveDown(link: SocialMediaLinkRow): boolean;
  moveBlockedReason(link: SocialMediaLinkRow, direction: "up" | "down"): string | null;
  moveLinkUp(link: SocialMediaLinkRow): Promise<boolean>;
  moveLinkDown(link: SocialMediaLinkRow): Promise<boolean>;
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
  showAllLinks(): void;
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
  approveFromPanel(): Promise<void>;
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

  /** The publish step of an Approve, matched on its OPERATION name for the same
   *  reason as the group verbs: the document also contains the field
   *  `updateSocialMediaLink`, and a field-level match on the shared helper
   *  `sendMarkCompleted` would be ambiguous across the two mutations. */
  function statusUpdateCalls(): [string, Record<string, unknown>][] {
    return callsFor("mutation UpdateSocialMediaLink");
  }

  /** The completion step. `markSocialMediaLinkCompleted` is unique across the
   *  documents this component sends, so a field-level match is unambiguous —
   *  but it is asserted through the same helper as the publish so the two
   *  step-ordering tests read identically. */
  function completeCalls(): [string, Record<string, unknown>][] {
    return callsFor("mutation MarkLinkCompleted");
  }

  /** The operation names in the order they were sent, so a two-step Approve can
   *  assert the SEQUENCE and not merely that both happened. */
  function operationSequence(): string[] {
    return requestMock.mock.calls
      .map((call) => (call[0] as string).match(/(?:query|mutation) (\w+)/)?.[1] ?? "")
      .filter((name) => name !== "ConsoleCategories");
  }

  /** Reorder, like the group verbs, is matched on its OPERATION name — the
   *  mutation field name `reorderSocialMediaLinks` is a substring of nothing
   *  here, but the document itself contains the argument name `parentId`, which
   *  IS shared with the group mutation, so a field-level match would be
   *  ambiguous. */
  function reorderCalls(): [string, Record<string, unknown>][] {
    return callsFor("mutation ReorderSocialMediaLinks");
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

  /** Open the given conversations. The accordion is COLLAPSED BY DEFAULT, so every
   *  spec that asserts on a CHILD row has to open its root first — this helper
   *  rather than a per-test chevron click, because "which rows is this test about"
   *  is then one line and cannot drift from the fixture.
   *
   *  Pass every level needed for the assertion: `expand("root", "mid")` for a
   *  grandchild, because a child only becomes reachable through its parent's own
   *  expansion. */
  async function expand(...ids: string[]): Promise<void> {
    const component = asTestable(fixture);
    for (const id of ids) {
      component.toggleExpanded(id);
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The rendered rows' URLs, in DOM order — the accordion's DISPLAY order read
   *  off the markup rather than off the signal, so a spec cannot pass on a correct
   *  `renderedLinks()` and a template that draws something else. */
  function renderedUrls(): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="link-depth"] a'),
    ).map((anchor) => anchor.textContent?.trim() ?? "");
  }

  /** The rendered rows' ids, in DOM order. */
  function renderedRowIds(): string[] {
    return asTestable(fixture)
      .renderedLinks()
      .map((link) => link.id);
  }

  /** The header labels, in column order. The select-all `<th>` is empty by
   *  design, so it reads as "" — which is what makes an exact-equality assertion
   *  on the whole list a COLUMN COUNT check as well as a naming one. */
  function headerLabels(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("thead th")).map(
      (th) => th.textContent?.trim() ?? "",
    );
  }

  /** One rendered row's cells. Off the MARKUP rather than off the signal, so a
   *  spec cannot pass on a correct row model and a template that draws fewer
   *  cells than the header declares. */
  function rowCells(index: number): HTMLTableCellElement[] {
    const row = (fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr")[index];
    return Array.from(row?.querySelectorAll("td") ?? []);
  }

  /** One cell of one rendered row — reads better than `rowCells(n)[m]` in the
   *  assertions about what a specific column CONTAINS, as opposed to how many
   *  columns there are. */
  function rowCell(row: number, cell: number): HTMLTableCellElement {
    return rowCells(row)[cell];
  }

  /** Every rendered `[data-testid="link-depth"]` wrapper, in DOM order. */
  function depthWrappers(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="link-depth"]'),
    );
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
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "pending-1" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    approveButton()?.click();
    await vi.waitFor(() => expect(statusUpdateCalls()).toHaveLength(1));

    const [, vars] = statusUpdateCalls()[0];
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

  it("approve also marks the link completed, publishing FIRST and reloading ONCE", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "pending-1" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const ok = await component.approveLink(makeLink({ id: "pending-1" }));

    expect(ok).toBe(true);
    // Both writes, in the one order that makes sense: completing a row that is
    // still PENDING_APPROVAL would retire a link nobody can see.
    expect(operationSequence()).toEqual([
      "UpdateSocialMediaLink",
      "MarkLinkCompleted",
      // ...and exactly ONE reload. A refetch between the two writes would render
      // the row as LIVE-and-still-pending, and a second one would race the next
      // click.
      "ConsoleSocialMediaLinks",
    ]);
    expect(completeCalls()[0][1]).toEqual({ linkId: "pending-1" });
    expect(callsFor("socialMediaLinks")).toHaveLength(1);
    expect(component.isLoading()).toBe(false);
  });

  it("does NOT mark completed when the publish fails — no completion call, no reload", async () => {
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
    expect(completeCalls()).toHaveLength(0);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);
    expect(toastMocks.error).toHaveBeenCalledWith("Couldn't approve link", "backend down");
    expect(component.links().map((l) => l.id)).toEqual(["pending-1"]);
  });

  it("says so explicitly when the publish lands but the completion fails, and still reloads", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.reject(new Error("completion down"));
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({
          socialMediaLinks: [makeLink({ id: "pending-1", status: "LIVE", completed: false })],
        });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "pending-1" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const ok = await component.approveLink(makeLink({ id: "pending-1" }));

    // The publish is the reported outcome: the row IS live, and the sheet closes.
    expect(ok).toBe(true);
    // 🔴 NEVER SWALLOWED, and never stated as a plain "couldn't complete": the
    // admin has to be able to tell a half-done approve from a failed one, or
    // they will assume the row left the queue and move on.
    expect(toastMocks.error).toHaveBeenCalledWith(
      "Link approved, but not marked completed",
      expect.stringContaining("completion down"),
    );
    // The reload still happens, so the row comes back as server truth: LIVE and
    // still pending, which is the state the toast described.
    expect(callsFor("socialMediaLinks")).toHaveLength(1);
    expect(component.links()).toEqual([
      makeLink({ id: "pending-1", status: "LIVE", completed: false }),
    ]);
    expect(component.isLoading()).toBe(false);
  });

  it("reloads the list after a successful approve so the row comes back LIVE", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
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
    await vi.waitFor(() => expect(statusUpdateCalls()).toHaveLength(1));
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

  it("Hide only changes visibility — it never marks the link completed", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "live-1", status: "LIVE" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    await component.hideLink(makeLink({ id: "live-1", status: "LIVE" }));

    // 🔴 The asymmetry with Approve is the whole point: `completed` is the triage
    // "handled" flag and hiding is a FEED decision. Auto-completing on Hide would
    // retire a row from the queue because an admin removed it from the feed.
    expect(completeCalls()).toHaveLength(0);
    expect(operationSequence()).toEqual(["UpdateSocialMediaLink", "ConsoleSocialMediaLinks"]);
  });

  it("approveLink un-hides a HIDDEN row by sending status LIVE", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });

    const component = asTestable(fixture);
    component.links.set([makeLink({ id: "hidden-1", status: "HIDDEN" })]);
    await fixture.whenStable();
    fixture.detectChanges();

    approveButton()?.click();
    await vi.waitFor(() => expect(statusUpdateCalls()).toHaveLength(1));

    const [, vars] = statusUpdateCalls()[0];
    expect(vars).toMatchObject({
      socialMediaLinkId: "hidden-1",
      input: { status: "LIVE" },
    });
    // Republishing is an Approve, so it retires the row as well — including one
    // an admin had previously hidden.
    await vi.waitFor(() => expect(completeCalls()).toHaveLength(1));
    expect(completeCalls()[0][1]).toEqual({ linkId: "hidden-1" });
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

  it("approveFromPanel runs the SAME two writes as the row action and closes the panel", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("updateSocialMediaLink")) {
        return Promise.resolve({ updateSocialMediaLink: { ok: true } });
      }
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });

    const component = asTestable(fixture);
    component.openLinkDetail(makeLink({ id: "pending-1" }));
    await fixture.whenStable();
    fixture.detectChanges();

    // The sheet renders its own Approve only while the row is not LIVE.
    byTestId("panel-approve")?.click();
    await vi.waitFor(() => expect(component.selectedLink()).toBeNull());

    // One sequence, not a second implementation: publish, complete, one reload.
    expect(operationSequence()).toEqual([
      "UpdateSocialMediaLink",
      "MarkLinkCompleted",
      "ConsoleSocialMediaLinks",
    ]);
    expect(completeCalls()[0][1]).toEqual({ linkId: "pending-1" });
  });

  it("offers the panel Approve only while the row is not LIVE", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const component = asTestable(fixture);
    component.openLinkDetail(makeLink({ id: "pending-1" }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byTestId("panel-approve")).not.toBeNull();

    component.openLinkDetail(makeLink({ id: "live-1", status: "LIVE" }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byTestId("panel-approve")).toBeNull();
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

  /* ---- Word wrap -------------------------------------------------------- */

  it("word-wraps the URL and title cells instead of clipping them", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([makeLink()]);

    const row = (fixture.nativeElement as HTMLElement).querySelector("tbody tr");
    const cells = Array.from(row?.querySelectorAll("td") ?? []);
    // Column order: select, URL, title, submitter, …
    const urlCell = cells[1];
    const titleCell = cells[2];

    // The URL is ONE unbroken token, so only `break-all` stops the tail of a long
    // address from running past `max-w-72` and being cut off by the table's
    // scroll container — an admin cannot judge a link whose last characters they
    // cannot see. Same class the detail sheet's URL anchor already carries.
    const urlAnchor = urlCell.querySelector("a");
    expect(urlAnchor?.className).toContain("break-all");
    // A title is prose, so it breaks only where it has no other opportunity.
    expect(titleCell.querySelector("span")?.className).toContain("break-words");
    // Neither column may carry a clipping/nowrap utility — that is the bug.
    expect(urlCell.className).not.toMatch(/truncate|whitespace-nowrap|overflow-hidden/);
    expect(titleCell.className).not.toMatch(/truncate|whitespace-nowrap|overflow-hidden/);
  });

  it("keeps each instant in the date cell on one line", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ created: "2026-08-01T09:00:00", occurredAt: "2026-08-01T08:30:00" }),
    ]);

    const headers = headerLabels();
    const cells = rowCells(0);
    // The wrap fix must not leak into the instants: a wrapped "Aug 1, 2026 08:30"
    // reads as two values, and the whole point of the two clocks is that each is
    // legible at a glance. Both are now lines of ONE cell, and the cell keeps the
    // utility.
    expect(headers.indexOf("Submitted")).toBe(6);
    expect(cells[headers.indexOf("Submitted")].className).toContain("whitespace-nowrap");
  });

  /* ---- The two clocks, merged into one cell ---------------------------- */

  it("puts the event instant under the report instant only when they differ", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({
        id: "backdated",
        created: "2026-08-01T09:00:00",
        occurredAt: "2026-07-28T21:15:00",
      }),
      makeLink({ id: "same", created: "2026-08-01T09:00:00", occurredAt: "2026-08-01T09:00:00" }),
    ]);

    const dates = rowCell(0, 6).querySelectorAll("[data-testid='link-occurred']");
    // 🔴 The back-dated report is the ONE case the two clocks disagree about, and
    // it is the only case that earns a second line — labelled in full, because
    // "which of these two is the event time" is not answerable from position.
    expect(dates).toHaveLength(1);
    expect(dates[0].textContent?.replace(/\s+/g, " ").trim()).toBe("Occurred Jul 28, 2026 21:15");
    // Quieter than the line above it, so a scan reads the report instant first.
    expect(dates[0].className).toContain("text-xs");
    expect(dates[0].className).toContain("text-muted-foreground");

    // Equal instants: one line, and no "Occurred" at all. The backend writes
    // `occurred_at = created` whenever the submitter stated no event time, so this
    // is the common case and a second identical line on every row would be noise.
    expect(rowCell(1, 6).querySelector("[data-testid='link-occurred']")).toBeNull();
    expect(rowCell(1, 6).textContent).toContain("9:00");
    expect(rowCell(1, 6).textContent).not.toContain("Occurred");
  });

  it("merged the two date columns into one and the Thread chip into the URL cell", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([makeLink()]);

    // Ten columns → eight: Thread moved under the URL it describes, Occurred under
    // Submitted. Neither is a column of its own any more.
    expect(headerLabels()).toEqual([
      "",
      "URL",
      "Title",
      "Submitter",
      "Categories",
      "Status",
      "Submitted",
      "Actions",
    ]);
    // …and the row agrees with the header: a cell count that disagrees is what
    // makes a table read as broken.
    expect(rowCells(0).length).toBe(8);
  });

  it("skeleton rows and the loading/empty messages span eight columns", async () => {
    const component = asTestable(fixture);
    // The loading branch draws only skeletons, so the flag has to be raised for
    // the assertions — and `links()` is empty, which is exactly what it gates.
    component.isLoading.set(true);
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr"));
    // 5 skeleton rows plus the screen-reader-only "Loading links…" row.
    expect(rows).toHaveLength(6);
    for (const row of rows.slice(0, -1)) {
      expect(row.querySelectorAll("td").length).toBe(8);
    }
    expect(rows.at(-1)?.querySelector("td")?.getAttribute("colspan")).toBe("8");

    // The empty branch shares the same colspan.
    component.isLoading.set(false);
    component.links.set([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector("tbody tr td")?.getAttribute("colspan"),
    ).toBe("8");
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

  it("groupSelected sends linkIds with no parentId so the backend elects a root", async () => {
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
    // Omitting the key is what means "start a new conversation"; the returned
    // root id is an Int the flat console list has no use for.
    expect("parentId" in calls[0][1]).toBe(false);
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
            makeLink({ id: "a", sublinkCount: 1 }),
            makeLink({ id: "b", parentId: "a", isThreadRoot: false }),
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
    expect(component.links().map((l) => l.parentId)).toEqual([null, "a"]);
    // Leaving it ticked would offer to group rows that are already one thread.
    expect(component.selectedIds()).toEqual([]);
    expect(component.isLoading()).toBe(false);
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Links grouped",
      "2 links are now one conversation.",
    );
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
    await renderRows([
      makeLink({ id: "a", sublinkCount: 1 }),
      makeLink({ id: "b", parentId: "a", isThreadRoot: false }),
    ]);

    const component = asTestable(fixture);
    const member = component.links()[1];
    const ok = await component.ungroupLink(member);

    expect(ok).toBe(true);
    const calls = ungroupCalls();
    expect(calls).toHaveLength(1);
    // Only the row, and no parentId — ungroup is not "group with parentId: null".
    expect(calls[0][1]).toEqual({ linkIds: ["b"] });
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
  });

  it("refuses to ungroup a row that is not a member", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    // A root: ungrouping one is a server-side no-op, so the action must not fire.
    const ok = await component.ungroupLink(
      makeLink({ id: "root", parentId: null, sublinkCount: 3 }),
    );

    expect(ok).toBe(false);
    expect(ungroupCalls()).toHaveLength(0);
  });

  it("offers Ungroup on a sublink and not on a root", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ id: "a", sublinkCount: 1 }),
      makeLink({ id: "b", parentId: "a", isThreadRoot: false }),
      makeLink({ id: "c", parentId: null }),
    ]);
    // The accordion is collapsed by default, so the sublink's row only exists once
    // its parent is open — the verb is per RENDERED row.
    await expand("a");

    const labels = rowActionLabels();
    expect(labels).toHaveLength(3);
    expect(labels[0]).not.toContain("Ungroup");
    expect(labels[1]).toContain("Ungroup");
    expect(labels[2]).not.toContain("Ungroup");
  });

  /* ---- Conversation chip, depth, sequence, nesting, hide coupling ------ */

  it("badges a row with its whole-subtree size and leaves a childless row bare", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      // A root whose descendants sit TWO levels down: the chip counts the whole
      // subtree at any depth, so it reads 3 links, not 2.
      makeLink({ id: "root", sublinkCount: 2 }),
      makeLink({ id: "mid", parentId: "root", isThreadRoot: false, sublinkCount: 1 }),
      makeLink({ id: "leaf", parentId: "mid", isThreadRoot: false, sublinkCount: 0 }),
    ]);
    // BOTH levels open: the mid-tree chip is a row of its own, so the accordion
    // has to be told to draw it.
    await expand("root", "mid");

    const chips = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="link-thread"]'),
    );
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(["3 links", "2 links"]);
    // The chip has to carry the coupling, not just the count — and the mid-tree
    // one is worded as "below this row", because it is not a root.
    expect(chips[0].getAttribute("title")).toContain("hides that whole subtree too");
    expect(chips[1].getAttribute("title")).toContain("Links below this row");
  });

  it("keeps a root with exactly ONE sublink badged (the +1 off-by-one)", async () => {
    await initialLoadsSettled(asTestable(fixture));
    // 🔴 `sublinkCount: 1` is the trap: handed to `threadLabel` RAW it is a
    // conversation size of 1, which answers "" and DELETES the chip on a row that
    // really does have something to expand. Only `sublinkCount + 1` keeps it.
    await renderRows([
      makeLink({ id: "root", sublinkCount: 1 }),
      makeLink({ id: "child", parentId: "root", isThreadRoot: false }),
    ]);

    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="link-thread"]',
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("2 links");
  });

  it("renders the conversation chip INSIDE the URL cell, under the anchor it belongs to", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ id: "root", sublinkCount: 1 }),
      makeLink({ id: "child", parentId: "root", isThreadRoot: false }),
    ]);
    await expand("root");

    // 🔴 THE CHIP BELONGS TO THE LINK, NOT TO A COLUMN OF ITS OWN. It is a
    // statement about the row whose URL is above it, and as a tenth column it spent
    // a tenth of the table's width saying what the URL cell's second line says
    // better — beside the link it counts. Asserted by CELL, not by testid alone:
    // a chip anywhere in the row would pass a testid-only check.
    const rootCell = rowCell(0, 1);
    const chip = rootCell.querySelector("[data-testid='link-thread']");
    expect(chip).not.toBeNull();
    // …and below its anchor, not beside or above it: the two share one `flex-col`,
    // so the chip's left edge IS the URL text's left edge by construction — there is
    // no `margin-left` to compute and therefore nothing that can drift when the
    // rail width, the chevron reserve or the gap changes.
    const anchor = rootCell.querySelector("a");
    expect(anchor).not.toBeNull();
    const siblings = Array.from(rootCell.querySelectorAll("[data-testid='link-thread'], a"));
    expect(siblings.map((el) => el.tagName)).toEqual(["A", "SPAN"]);
    expect((chip as HTMLElement).parentElement?.querySelector("a") === anchor).toBe(true);
    // No em dash where there is no chip: a lone ungrouped link is the overwhelming
    // majority of the queue, and a column of dashes would have been the loudest
    // thing on the row.
    expect(rowCell(1, 1).querySelector("[data-testid='link-thread']")).toBeNull();
    expect(rowCell(1, 1).textContent?.trim()).toBe("https://x.com/prasarana/status/1");
  });

  it("leaves a childless ROOT unbadged even though isThreadRoot is true", async () => {
    await initialLoadsSettled(asTestable(fixture));
    // The other half of the trap: `isThreadRoot` is a ROOT MARKER, true for every
    // ungrouped link, so gating the chip on it would badge the whole queue.
    await renderRows([makeLink({ id: "lonely", isThreadRoot: true, sublinkCount: 0 })]);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('tbody [data-testid="link-thread"]'),
    ).toBeNull();
  });

  it("indents a three-level chain 0/1/2 and treats a filtered-out parent as a root", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    const root = makeLink({ id: "root", sublinkCount: 2 });
    const mid = makeLink({ id: "mid", parentId: "root", isThreadRoot: false, sublinkCount: 1 });
    const leaf = makeLink({ id: "leaf", parentId: "mid", isThreadRoot: false });
    await renderRows([root, mid, leaf]);
    // Every level open, so all three rows are rendered; the indentation itself is
    // what this asserts, and it is asserted off `data-depth` rather than pixels.
    await expand("root", "mid");

    expect([root, mid, leaf].map((row) => component.depthOf(row))).toEqual([0, 1, 2]);
    const depths = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="link-depth"]'),
    ).map((cell) => cell.getAttribute("data-depth"));
    expect(depths).toEqual(["0", "1", "2"]);

    // A filter that hides the parent: the chain cannot be walked, so the row is
    // rendered AT THE ROOT LEVEL rather than at a depth nothing can justify.
    const orphan = makeLink({ id: "orphan", parentId: "not-loaded", isThreadRoot: false });
    await renderRows([orphan]);
    expect(component.depthOf(orphan)).toBe(0);
  });

  it("survives a parent cycle without hanging the queue", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    // Hand-edited (or migrated) data can point two rows at each other. The walk
    // must terminate, not spin.
    const a = makeLink({ id: "a", parentId: "b", isThreadRoot: false });
    const b = makeLink({ id: "b", parentId: "a", isThreadRoot: false });
    await renderRows([a, b]);

    expect(component.depthOf(a)).toBeGreaterThanOrEqual(0);
    expect(component.depthOf(b)).toBeGreaterThanOrEqual(0);
    // 🔴 AND NO ROW MAY VANISH. Every row of a cycle HAS a loaded parent, so the
    // accordion's walk skips all of them and the recursion never starts; whatever
    // the walk did not place is appended at the END of the rendered list, in relative
    // arrival order, because a queue that quietly swallows links is worse than one
    // that shows them untidily.
    expect(renderedRowIds()).toEqual(["a", "b"]);
  });

  /* ---- Rails and tint: making a child row LOOK nested ------------------- */

  it("draws one rail per ancestor level, and no rail at all on a root", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    await renderRows([
      makeLink({ id: "root", sublinkCount: 2 }),
      makeLink({ id: "mid", parentId: "root", isThreadRoot: false, sublinkCount: 1 }),
      makeLink({ id: "leaf", parentId: "mid", isThreadRoot: false }),
      makeLink({ id: "lonely" }),
    ]);
    await expand("root", "mid");

    // 🔴 THE RAILS ARE THE INDENT. The old `[style.padding-left.px]` is gone, and a
    // rail per level replaced it: a bare gap at the left of a row reads as indented
    // only while you are looking at that gap, whereas a guide line an eye can follow
    // downward still says "this hangs off THAT" three levels deep.
    const railCounts = depthWrappers().map(
      (wrapper) => wrapper.querySelectorAll("span[data-testid='link-rail']").length,
    );
    expect(railCounts).toEqual([0, 1, 2, 0]);
    expect(depthWrappers().map((w) => w.getAttribute("data-depth"))).toEqual(["0", "1", "2", "0"]);
    // The padding is really gone — a rail drawn *beside* the old padding would
    // double the offset and push the deepest row out of its cell.
    for (const wrapper of depthWrappers()) {
      expect(wrapper.style.paddingLeft).toBe("");
    }
    // `depthRails` is the one definition of the count the template reads.
    expect(component.depthRails(component.links()[0])).toEqual([]);
    expect(component.depthRails(component.links()[2])).toEqual([0, 1]);

    // 🔴 AND `depthIndentPx` REACHES THE DOM, or the constant is decoration. The
    // widths are style-bound rather than `w-5`/`-ml-5` classes precisely so that
    // `DEPTH_INDENT_PX` is the ONE place the rail step is defined; a class would
    // render identically and be a second definition nobody finds by grepping the
    // constant. The elbow's margin is the NEGATIVE of the same number because it
    // is what pulls the stub back onto the last rail's own line.
    const rails = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="link-rail"]'),
    ) as HTMLElement[];
    expect(rails).toHaveLength(3);
    for (const rail of rails) {
      expect(rail.style.width).toBe("20px");
    }
    const elbows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="link-elbow"]'),
    ) as HTMLElement[];
    for (const elbow of elbows) {
      expect(elbow.style.width).toBe("20px");
      expect(elbow.style.marginLeft).toBe("-20px");
    }
  });

  it("tints a child row and connects it to its rail with a single elbow", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ id: "root", sublinkCount: 2 }),
      makeLink({ id: "mid", parentId: "root", isThreadRoot: false, sublinkCount: 1 }),
      makeLink({ id: "leaf", parentId: "mid", isThreadRoot: false }),
      makeLink({ id: "lonely" }),
    ]);
    await expand("root", "mid");

    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr"));
    // 🔴 THE TINT IS THE ROW-WIDE HALF OF THE CUE. The rails say WHICH ancestor;
    // the tint says the weaker, scan-level fact that the row is not a root at all.
    // Only depth ≥ 1 rows carry it — a tinted root would make every row look nested
    // and the whole cue worthless.
    expect(rows[0].className).not.toContain("bg-muted/40");
    expect(rows[1].className).toContain("bg-muted/40");
    expect(rows[2].className).toContain("bg-muted/40");
    expect(rows[3].className).not.toContain("bg-muted/40");
    // Hover must survive the tint: `hover:bg-muted` is a stronger value of the same
    // token, so a pointer over a tinted row darkens it instead of cancelling it.
    for (const row of rows) {
      expect(row.className).toContain("hover:bg-muted");
    }

    // One elbow per NESTED row — the tick that turns a bare vertical rule into
    // "this row hangs off it". A root has nothing to connect to, so it has none,
    // and a row two levels down gets ONE, not one per level: a tick per level would
    // draw stubs that attach to nothing.
    const elbows = depthWrappers().map(
      (wrapper) => wrapper.querySelectorAll("span[data-testid='link-elbow']").length,
    );
    expect(elbows).toEqual([0, 1, 1, 0]);
  });

  /* ---- The accordion over the loaded tree ------------------------------ */

  it("collapses every conversation by default — children are loaded but not drawn", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    await renderRows([
      makeLink({ id: "root", sublinkCount: 1, url: "https://x.com/root" }),
      makeLink({ id: "child", parentId: "root", isThreadRoot: false, url: "https://x.com/child" }),
      makeLink({ id: "lonely", url: "https://x.com/lonely" }),
    ]);

    // Same rule as the public feed's `app-link-thread`, same reason: the queue is
    // read for its newest rows, so nothing is open on arrival.
    expect(component.isExpanded("root")).toBe(false);
    expect(component.renderedLinkIds()).toEqual(["root", "lonely"]);
    // …and the DOM agrees, so this is not a signal the template ignores.
    expect(renderedUrls()).toEqual(["https://x.com/root", "https://x.com/lonely"]);
    // The root's row and its own chip are untouched by having children: the chip
    // still counts the WHOLE subtree, including the hidden rows.
    expect(byTestId("link-thread")?.textContent).toContain("2 links");
  });

  it("puts the chevron only on a row with LOADED children, and reserves its width on the others", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([
      makeLink({ id: "root", sublinkCount: 2 }),
      makeLink({ id: "mid", parentId: "root", isThreadRoot: false, sublinkCount: 1 }),
      makeLink({ id: "leaf", parentId: "mid", isThreadRoot: false }),
      makeLink({ id: "lonely" }),
    ]);
    await expand("root", "mid");
    fixture.detectChanges();

    const toggles = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="thread-toggle"]',
    );
    // Root and mid are the two rows with loaded children, at two different
    // levels — every level gets its own control, which is what makes a deep tree
    // navigable one level at a time.
    expect(toggles).toHaveLength(2);
    expect((toggles[0] as HTMLButtonElement).getAttribute("aria-expanded")).toBe("true");
    expect((toggles[1] as HTMLButtonElement).getAttribute("aria-expanded")).toBe("true");
    // The chevron sits inside the rail stack, so a childless row needs an
    // equal-width stand-in or every open/close click shifts the columns. The
    // query is the placeholder's OWN testid and NOT `aria-hidden`: the rails and
    // the elbow are aria-hidden spans as well, so asking for aria-hidden here
    // would silently answer "is there any decoration on this row", which is true
    // on a root too — the query below would pass for the wrong reason.
    const reserved = depthWrappers().map(
      (wrapper) => wrapper.querySelector('[data-testid="chevron-placeholder"]') !== null,
    );
    expect(reserved).toEqual([false, false, true, true]);
  });

  it("reveals children directly beneath their parent, in STORED order", async () => {
    await initialLoadsSettled(asTestable(fixture));
    // 🔴 ARRIVED newest-first, STORED oldest-first — the conversation the backend
    // assembled oldest-first therefore arrives reversed, which is exactly the case
    // a flat queue got wrong. The root order below is still arrival order.
    await renderRows([
      makeLink({
        id: "second",
        parentId: "root",
        isThreadRoot: false,
        position: 20,
        url: "https://x.com/second",
      }),
      makeLink({
        id: "zebra",
        parentId: "root",
        isThreadRoot: false,
        position: 10,
        url: "https://x.com/zebra",
      }),
      makeLink({ id: "root", sublinkCount: 2, url: "https://x.com/root" }),
      makeLink({ id: "other", url: "https://x.com/other" }),
    ]);
    await expand("root");

    // Directly beneath the root — not where the arrival order put them — and in
    // `position` order.
    expect(renderedUrls()).toEqual([
      "https://x.com/root",
      "https://x.com/zebra",
      "https://x.com/second",
      "https://x.com/other",
    ]);
    // …and the root's own order is the queue's: untouched.
    expect(renderedUrls()[0]).toContain("root");
    expect(renderedUrls()[3]).toContain("other");
  });

  it("expands a nested level only once every level above it is open", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    await renderRows([
      makeLink({ id: "root", sublinkCount: 2, url: "https://x.com/root" }),
      makeLink({
        id: "mid",
        parentId: "root",
        isThreadRoot: false,
        sublinkCount: 1,
        url: "https://x.com/mid",
      }),
      makeLink({ id: "leaf", parentId: "mid", isThreadRoot: false, url: "https://x.com/leaf" }),
    ]);

    await expand("root");
    expect(renderedUrls()).toEqual(["https://x.com/root", "https://x.com/mid"]);
    // Opening the middle level is independent — the same rule as the feed's
    // per-instance expand signal, keyed here by id.
    await expand("mid");
    expect(renderedUrls()).toEqual([
      "https://x.com/root",
      "https://x.com/mid",
      "https://x.com/leaf",
    ]);
    // Closing the ROOT hides the whole subtree, because the grandchild's own
    // state survives the collapse: collapsing is not forgetting.
    component.toggleExpanded("root");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.isExpanded("mid")).toBe(true);
    expect(renderedUrls()).toEqual(["https://x.com/root"]);
  });

  it("renders a row whose parent is not loaded as a root, at its flat position", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    // A filter that hides the parent: the payload cannot support an indent, and a
    // gap where an invisible parent would be reads as a corrupted queue.
    await renderRows([
      makeLink({ id: "a", url: "https://x.com/a" }),
      makeLink({
        id: "orphan",
        parentId: "not-loaded",
        isThreadRoot: false,
        url: "https://x.com/orphan",
      }),
      makeLink({ id: "b", url: "https://x.com/b" }),
    ]);

    expect(component.depthOf(component.links()[1])).toBe(0);
    expect(component.renderedLinkIds()).toEqual(["a", "orphan", "b"]);
    expect(renderedUrls()).toEqual(["https://x.com/a", "https://x.com/orphan", "https://x.com/b"]);
    // And it is not mistaken for a conversation: nothing to expand.
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'tbody [data-testid="thread-toggle"]',
      ),
    ).toHaveLength(0);
  });

  it("Select-all ticks the RENDERED rows and leaves a collapsed conversation's children alone", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    await renderRows([
      makeLink({ id: "root", sublinkCount: 1 }),
      makeLink({ id: "child", parentId: "root", isThreadRoot: false }),
      makeLink({ id: "lonely" }),
    ]);

    byTestId("select-all")?.dispatchEvent(new Event("change"));

    // The children are not on screen, so they are not ticked — otherwise the
    // checkbox reads "all selected" while a whole conversation sits closed.
    expect(component.selectedIds()).toEqual(["root", "lonely"]);
    expect(component.allVisibleSelected()).toBe(true);

    // Open the conversation and the checkbox is honest again, without re-ticking.
    await expand("root");
    expect(component.allVisibleSelected()).toBe(false);
    component.toggleRowSelection("child");
    expect(component.allVisibleSelected()).toBe(true);

    // Second press clears what it can see — and leaves the closed-away rows as
    // they were, because they were never part of it.
    component.toggleSelectAll();
    expect(component.selectedIds()).toEqual([]);
  });

  it("scopes a grouping mutation to the LOADED rows, so collapsing never forgets a tick", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.resolve({ groupSocialMediaLinks: { ok: true, id: 3 } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    const component = asTestable(fixture);
    await renderRows([
      makeLink({ id: "root", sublinkCount: 2 }),
      makeLink({ id: "a", parentId: "root", isThreadRoot: false }),
      makeLink({ id: "b", parentId: "root", isThreadRoot: false }),
    ]);
    await expand("root");
    component.toggleRowSelection("a");
    component.toggleRowSelection("b");
    // The admin closes the conversation again before pressing the verb.
    component.toggleExpanded("root");
    await fixture.whenStable();
    fixture.detectChanges();

    // 🔴 Collapsing is a VIEW gesture. Scoping the payload to the rendered rows
    // would drop the two children the admin just ticked and send only the root —
    // and the server accepts that, so nothing would have looked wrong.
    expect(component.renderedLinkIds()).toEqual(["root"]);
    expect(groupCalls()).toHaveLength(0);
    await component.groupSelected();
    expect(groupCalls()[0][1]).toEqual({ linkIds: ["a", "b"] });
  });

  it("toggles a conversation from the chevron without opening the detail panel", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const component = asTestable(fixture);
    await renderRows([
      makeLink({ id: "root", sublinkCount: 1 }),
      makeLink({ id: "child", parentId: "root", isThreadRoot: false }),
    ]);
    fixture.detectChanges();

    const chevron = byTestId("thread-toggle") as HTMLButtonElement;
    chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isExpanded("root")).toBe(true);
    expect(renderedUrls()).toHaveLength(2);
    // stopPropagation is load-bearing: the `<tr>` opens the editor on click, and
    // "open the conversation" is not "open this row's editor".
    expect(component.selectedLink()).toBeNull();

    // …and clicking it again closes it, from the row it just revealed.
    const again = (fixture.nativeElement as HTMLElement).querySelector(
      'tbody [data-testid="thread-toggle"]',
    ) as HTMLButtonElement;
    again.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.isExpanded("root")).toBe(false);
    expect(renderedUrls()).toHaveLength(1);
    expect(component.selectedLink()).toBeNull();
  });

  /* ---- Sequence: move up / move down ---------------------------------- */

  /** The unfiltered queue is the precondition for a sequence action (see
   *  `queueIsComplete`); the specs below set it directly rather than driving
   *  eight filter controls, because the flag is exactly "no filter hid a
   *  sibling" and that is the thing under test. */
  function withCompleteQueue(): void {
    asTestable(fixture).queueIsComplete.set(true);
  }

  it("moveLinkUp sends the WHOLE sibling run reordered, with the row's own parentId", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation ReorderSocialMediaLinks")) {
        return Promise.resolve({ reorderSocialMediaLinks: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    // Two root runs: a, b are roots; c and d share the parent "root", which is
    // NOT in the loaded set (it stands in for any other conversation's parent).
    const rows = [
      makeLink({ id: "a" }),
      makeLink({ id: "b" }),
      makeLink({ id: "c", parentId: "root", isThreadRoot: false }),
      makeLink({ id: "d", parentId: "root", isThreadRoot: false }),
    ];
    await renderRows(rows);

    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    const ok = await component.moveLinkUp(rows[3]);

    expect(ok).toBe(true);
    const calls = reorderCalls();
    expect(calls).toHaveLength(1);
    // The entire run of THAT parent, in the intended order — never just the two
    // swapped rows, which the server would read as "move these to the front" —
    // and never the unrelated root run, which is a different sibling set.
    expect(calls[0][1]).toEqual({ linkIds: ["d", "c"], parentId: "root" });
    // The table is refetched rather than patched, and the reason is the mutation's payload: it
    // returns only `ok`, so a refetch is the ONLY way the next move reads the stored order back.
    // The order that was written is not the order this table shows, and `position` — which this
    // document DOES select, and which the reload brings back — is what carries it.
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    // A reorder changes no membership, so the ticks survive it.
    expect(component.selectedIds()).toEqual(["a"]);
  });

  it("moveLinkDown sends parentId null for a root run — the key is never omitted", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation ReorderSocialMediaLinks")) {
        return Promise.resolve({ reorderSocialMediaLinks: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    const rows = [makeLink({ id: "a" }), makeLink({ id: "b" })];
    await renderRows(rows);

    const ok = await asTestable(fixture).moveLinkDown(rows[0]);

    expect(ok).toBe(true);
    const [, vars] = reorderCalls()[0];
    expect(vars).toEqual({ linkIds: ["b", "a"], parentId: null });
    // 🔴 The key must be present even when its value is null. An omitted key IS an operation
    // error, but the argument is `ID` — nullable with no SDL default, so in GraphQL "required"
    // IS "non-null" and the omission is legal GraphQL; what refuses it is the RESOLVER'S OWN
    // GUARD (`interactions.py:287`), deliberately, at execution time.
    expect("parentId" in vars).toBe(true);
  });

  it("disables a move at either end of the run and says which end it is", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    const rows = [makeLink({ id: "a" }), makeLink({ id: "b" }), makeLink({ id: "c" })];
    await renderRows(rows);
    const component = asTestable(fixture);

    expect(component.canMoveUp(rows[0])).toBe(false);
    expect(component.canMoveUp(rows[2])).toBe(true);
    expect(component.canMoveDown(rows[2])).toBe(false);
    expect(component.canMoveDown(rows[0])).toBe(true);
    expect(component.moveBlockedReason(rows[0], "up")).toContain("Already first");
    expect(component.moveBlockedReason(rows[2], "down")).toContain("Already last");
    // A run of one has no sequence at all: both ends at once.
    const lonely = makeLink({ id: "solo" });
    await renderRows([lonely]);
    expect(component.canMoveUp(lonely)).toBe(false);
    expect(component.canMoveDown(lonely)).toBe(false);
  });

  it("sends the run in STORED position order, never the order the rows arrived in", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation ReorderSocialMediaLinks")) {
        return Promise.resolve({ reorderSocialMediaLinks: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    // 🔴 THE ORDERING THE PAYLOAD MUST CARRY. The queue renders `occurredAt DESC,
    // id DESC`; the stored sequence is a DIFFERENT ordering, and a conversation the
    // backend assembled oldest-first therefore ARRIVES REVERSED. Here the run
    // arrives [newest, oldest, middle] and is stored [oldest, middle, newest], so
    // any implementation that permutes the array's own order sends [newest, middle,
    // oldest] and writes the feed's timeline over the story.
    const rows = [
      makeLink({ id: "newest", position: 30 }),
      makeLink({ id: "oldest", position: 10 }),
      makeLink({ id: "middle", position: 20 }),
    ];
    await renderRows(rows);

    const component = asTestable(fixture);
    // "oldest" is FIRST in the stored run, so moving it down lands it in the middle
    // of the story. Under arrival order this same click would have moved it out of
    // the last slot instead — the payload is the assertion, not just the call.
    const ok = await component.moveLinkDown(rows[1]);

    expect(ok).toBe(true);
    const [, vars] = reorderCalls()[0];
    // Stored order [oldest, middle, newest] with "oldest" moved one place down.
    expect(vars).toEqual({ linkIds: ["middle", "oldest", "newest"], parentId: null });
  });

  it("breaks a position tie by id, so the payload is still deterministic", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation ReorderSocialMediaLinks")) {
        return Promise.resolve({ reorderSocialMediaLinks: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    // 🔴 NOT PARANOIA: `ungroupSocialMediaLinks` promotes a link to a root WITHOUT
    // renumbering it (backend `_ungroup_sync` writes `parent` only), so a promoted
    // root keeps the number it held under its old parent and can TIE with a root
    // that already holds it. Roots all share `parentId: null`, so the root run is
    // where the collision is observable — and `ORDER BY position` alone would be
    // arbitrary there. All three tie at 10, so ONLY the id tie-break can order them.
    const rows = [
      makeLink({ id: "b", position: 10 }),
      makeLink({ id: "a", position: 10 }),
      makeLink({ id: "c", position: 10 }),
    ];
    await renderRows(rows);

    const component = asTestable(fixture);
    await component.moveLinkDown(rows[0]);

    // Tied, so the run is [a, b, c] by id and "b" lands after "c". A sort on
    // `position` alone would keep the arrival order and send [a, b, c] — a
    // different write that reads as a successful no-op.
    expect(reorderCalls()[0][1]).toEqual({ linkIds: ["a", "c", "b"], parentId: null });
  });

  it("refuses to reorder a run whose stored order is unreadable", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    requestMock.mockClear();
    const component = asTestable(fixture);
    // One sibling's `position` is missing. `0` is NOT the answer: a gap-spaced series
    // has no meaning at 0, so a fallback that sorted the unknown row to the front
    // would send a payload that silently REWRITES a sequence nobody read.
    const rows = [
      makeLink({ id: "a", position: 10 }),
      withoutStoredOrder(makeLink({ id: "b", position: 20 })),
      makeLink({ id: "c", position: 30 }),
    ];
    await renderRows(rows);

    for (const row of rows) {
      expect(component.canMoveUp(row)).toBe(false);
      expect(component.canMoveDown(row)).toBe(false);
      expect(component.moveBlockedReason(row, "up")).toContain("stored order");
      expect(component.moveBlockedReason(row, "down")).toContain("stored order");
    }
    // And the method itself refuses, so a programmatic call cannot post one either.
    expect(await component.moveLinkUp(rows[1])).toBe(false);
    expect(await component.moveLinkDown(rows[2])).toBe(false);
    expect(reorderCalls()).toHaveLength(0);
  });

  it("judges the two ends against the STORED run, so a reversed conversation reads right", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    // Arrives [newest, oldest, middle]; stored [oldest, middle, newest]. Read on
    // arrival order, the FIRST row is "newest" and the LAST is "middle", so the
    // disabled reasons would be attached to the wrong rows — including on a run
    // where the visible table and the payload genuinely disagree.
    const rows = [
      makeLink({ id: "newest", position: 30 }),
      makeLink({ id: "oldest", position: 10 }),
      makeLink({ id: "middle", position: 20 }),
    ];
    await renderRows(rows);
    const component = asTestable(fixture);

    expect(component.canMoveUp(rows[1])).toBe(false);
    expect(component.moveBlockedReason(rows[1], "up")).toContain("Already first");
    expect(component.canMoveDown(rows[0])).toBe(false);
    expect(component.moveBlockedReason(rows[0], "down")).toContain("Already last");
    // …and the middle row is movable in both directions, exactly as stored.
    expect(component.canMoveUp(rows[2])).toBe(true);
    expect(component.canMoveDown(rows[2])).toBe(true);
    // The DOM follows the same rule, so the buttons a click can reach are the
    // buttons the stored order says are live. Row order on screen is still the
    // queue's — newest, oldest, middle — while the stored run is
    // oldest, middle, newest, so the disabled pattern is the INVERSE of what
    // reading the arrival order would produce.
    fixture.detectChanges();
    const up = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="move-link-up"]',
    );
    const down = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="move-link-down"]',
    );
    // "newest" leads the table and is LAST in the story: up live, down dead.
    expect(Array.from(up).map((b) => (b as HTMLButtonElement).disabled)).toEqual([
      false,
      true,
      false,
    ]);
    // "oldest" opens the story: down live, up dead.
    expect(Array.from(down).map((b) => (b as HTMLButtonElement).disabled)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("refuses to move while a filter may have hidden a sibling, and does not DRAW the buttons", async () => {
    await initialLoadsSettled(asTestable(fixture));
    // The queue loaded under a filter is NOT complete — the default status
    // filter (Pending) already proves it — so nothing may be reordered.
    const rows = [makeLink({ id: "a" }), makeLink({ id: "b" }), makeLink({ id: "c" })];
    await renderRows(rows);
    const component = asTestable(fixture);
    expect(component.queueIsComplete()).toBe(false);

    expect(component.canMoveUp(rows[1])).toBe(false);
    expect(component.canMoveDown(rows[1])).toBe(false);
    expect(component.moveBlockedReason(rows[1], "up")).toContain("Show all links");
    // The hint is on screen too, so a disabled control is never a mystery — and it
    // carries the one-click action that reaches the enabled state from the default
    // Pending view, because "Reset" cannot (it re-applies Pending).
    expect(byTestId("reorder-hint")).not.toBeNull();
    expect(byTestId("reorder-show-all")).not.toBeNull();

    // 🔴 ABSENT, NOT GREYED. Two permanently dead buttons on all three rows of the
    // default Pending queue read as a broken table rather than as unavailable. The
    // gate is untouched underneath, so the method still refuses — a programmatic
    // call cannot post the partial permutation the server would silently complete.
    const up = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="move-link-up"]',
    );
    const down = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="move-link-down"]',
    );
    expect(up).toHaveLength(0);
    expect(down).toHaveLength(0);
    requestMock.mockClear();
    expect(await component.moveLinkUp(rows[1])).toBe(false);
    expect(reorderCalls()).toHaveLength(0);
  });

  it("'Show all links' clears the Status filter in one click and turns reordering on", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    const rows = [makeLink({ id: "a", position: 10 }), makeLink({ id: "b", position: 20 })];
    requestMock.mockImplementation((query: string) => {
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: rows });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    const component = asTestable(fixture);
    // The default Pending snapshot is itself a filter, so the queue is not
    // provably whole and every move is off — the state the user is stuck in.
    expect(component.completedFilter()).toBe("pending");
    expect(component.queueIsComplete()).toBe(false);
    expect(component.canMoveDown(rows[0])).toBe(false);

    const showAll = byTestId("reorder-show-all") as HTMLButtonElement;
    expect(showAll).not.toBeNull();
    showAll.click();
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    await vi.waitFor(() => expect(component.isLoading()).toBe(false));
    fixture.detectChanges();

    // Every axis dropped, Status included — `undefined` is the "no completed
    // filter" spelling the resolver reads as All.
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: undefined });
    expect(component.completedFilter()).toBe("any");
    expect(component.queueIsComplete()).toBe(true);
    expect(component.canMoveDown(rows[0])).toBe(true);
    // The hint and its action are gone once the queue is provably whole.
    expect(byTestId("reorder-hint")).toBeNull();
    expect(byTestId("reorder-show-all")).toBeNull();
    // …and the sequence actions are now ON THE PAGE rather than merely enabled,
    // which is the whole point of hiding them: the enabled state the admin was
    // told to click towards actually arrives.
    expect(byTestId("move-link-up")).not.toBeNull();
    expect(byTestId("move-link-down")).not.toBeNull();
  });

  it("'Show all links' is never disabled and is pinned to the right of the hint row", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const hint = byTestId("reorder-hint") as HTMLElement;
    const showAll = byTestId("reorder-show-all") as HTMLButtonElement;
    expect(hint).not.toBeNull();
    expect(showAll).not.toBeNull();
    // A dead-looking version of the one action that unblocks the queue is the
    // complaint this replaced; it carries no `[disabled]` binding at all now.
    expect(showAll.hasAttribute("disabled")).toBe(false);
    // `ml-auto` on the button, over a `flex-1 min-w-0` sentence: the hint is a
    // full-width aside of the toolbar and the action belongs at the right edge,
    // where the eye lands after reading the reason.
    expect(hint.className).toContain("w-full");
    expect(hint.className).toContain("flex");
    const sentence = hint.firstElementChild as HTMLElement;
    expect(sentence.className).toContain("flex-1");
    expect(sentence.className).toContain("min-w-0");
    expect(showAll.className).toContain("ml-auto");
    expect(showAll.className).toContain("shrink-0");
  });

  it("keeps the move pair on every row and disables only the run ends once complete", async () => {
    await initialLoadsSettled(asTestable(fixture));
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);
    fixture.detectChanges();
    expect(byTestId("move-link-up")).toBeNull();
    expect(byTestId("move-link-down")).toBeNull();

    withCompleteQueue();
    await fixture.whenStable();
    fixture.detectChanges();

    const up = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="move-link-up"]',
    );
    expect(up).toHaveLength(2);
    // The two reasons that SURVIVE the gate are the run ends, and they still say
    // which end they are.
    expect((up[0] as HTMLButtonElement).getAttribute("title")).toContain("Already first");
    expect((up[0] as HTMLButtonElement).disabled).toBe(true);
    // A live button carries NO title at all — `?? null` really does remove it.
    expect((up[1] as HTMLButtonElement).getAttribute("title")).toBeNull();
    expect((up[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it("toasts and leaves the table and the selection alone when a reorder fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation ReorderSocialMediaLinks")) {
        return Promise.reject(new Error("link 9 is not a sublink of the named parent"));
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    const rows = [makeLink({ id: "a" }), makeLink({ id: "b" })];
    await renderRows(rows);
    const component = asTestable(fixture);
    component.toggleRowSelection("b");

    const ok = await component.moveLinkUp(rows[1]);

    expect(ok).toBe(false);
    // No reload, no local reordering, no selection change — a swallowed
    // rejection here would look exactly like a successful no-op.
    expect(callsFor("socialMediaLinks")).toHaveLength(0);
    expect(component.links().map((l) => l.id)).toEqual(["a", "b"]);
    expect(component.selectedIds()).toEqual(["b"]);
    expect(toastMocks.error).toHaveBeenCalledWith(
      "Couldn't reorder links",
      "link 9 is not a sublink of the named parent",
    );
  });

  it("offers the sequence as row buttons that follow the same enable rules", async () => {
    await initialLoadsSettled(asTestable(fixture));
    withCompleteQueue();
    await renderRows([makeLink({ id: "a" }), makeLink({ id: "b" })]);
    fixture.detectChanges();

    const up = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="move-link-up"]',
    );
    const down = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody [data-testid="move-link-down"]',
    );
    expect(up).toHaveLength(2);
    expect((up[0] as HTMLButtonElement).disabled).toBe(true);
    expect((up[1] as HTMLButtonElement).disabled).toBe(false);
    expect((down[0] as HTMLButtonElement).disabled).toBe(false);
    expect((down[1] as HTMLButtonElement).disabled).toBe(true);
  });

  /* ---- Nesting under a specific link ---------------------------------- */

  it("nestSelectedUnder sends the ticked links with the row's id as parentId", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.resolve({ groupSocialMediaLinks: { ok: true, id: 7 } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    const rows = [makeLink({ id: "target" }), makeLink({ id: "a" }), makeLink({ id: "b" })];
    await renderRows(rows);

    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    component.toggleRowSelection("b");
    const ok = await component.nestSelectedUnder(rows[0]);

    expect(ok).toBe(true);
    // The same verb with a target: the selected rows become the TARGET's direct
    // children, which is what makes the hierarchy a tree.
    expect(groupCalls()[0][1]).toEqual({ linkIds: ["a", "b"], parentId: "target" });
    // Grouping consumed the selection, exactly as "Group into thread" does.
    expect(component.selectedIds()).toEqual([]);
  });

  it("enables nest-under with ONE tick and refuses a target inside the selection", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const rows = [makeLink({ id: "target" }), makeLink({ id: "a" }), makeLink({ id: "b" })];
    await renderRows(rows);
    const component = asTestable(fixture);
    fixture.detectChanges();

    const nestButtons = (): HTMLButtonElement[] =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="nest-under"]'),
      );
    // Nothing ticked: there is no payload to move, so the button is NOT DRAWN at
    // all rather than sitting dead on every row of an untouched queue.
    expect(component.canNestUnder(rows[0])).toBe(false);
    expect(component.nestBlockedReason(rows[0])).toContain("Tick a link");
    expect(nestButtons()).toHaveLength(0);

    // ONE tick is enough, and that is the difference from "Group into thread":
    // with a target the link becomes a REAL child, while an untargeted one-link
    // group would elect the link as its own root and render no conversation.
    component.toggleRowSelection("a");
    fixture.detectChanges();
    expect(component.canNestUnder(rows[0])).toBe(true);
    expect(component.nestBlockedReason(rows[0])).toBeNull();
    expect(nestButtons()[0].disabled).toBe(false);
    // The ticked row itself can never be the target — the server rejects the
    // whole call for the cycle, so the client never sends one.
    expect(component.canNestUnder(rows[1])).toBe(false);

    component.toggleRowSelection("b");
    fixture.detectChanges();
    expect(component.canNestUnder(rows[0])).toBe(true);
    expect(component.canNestUnder(rows[2])).toBe(false);
    expect(component.nestBlockedReason(rows[2])).toContain("cycle");
    expect(nestButtons()[2].disabled).toBe(true);
    expect(nestButtons()[2].getAttribute("title")).toContain("cycle");
  });

  it("draws nest-under on every row after one tick, and withdraws it when the ticks go", async () => {
    await initialLoadsSettled(asTestable(fixture));
    const rows = [makeLink({ id: "target" }), makeLink({ id: "a" })];
    await renderRows(rows);
    const component = asTestable(fixture);
    fixture.detectChanges();
    const nestButtons = (): HTMLButtonElement[] =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('tbody [data-testid="nest-under"]'),
      );

    // 🔴 THE GATE IS THE SELECTION, NOT THE TARGET. `nestSelectionReady` asks
    // `canNest` — ONE tick — and not the per-row `canNestUnder`, because a target
    // that happens to be ticked is still a row the admin is looking at: it is drawn
    // and disabled with the cycle reason, not hidden. Hiding it there would hide
    // the very row whose state is the interesting part.
    expect(component.nestSelectionReady()).toBe(false);
    component.toggleRowSelection("a");
    expect(component.nestSelectionReady()).toBe(true);
    fixture.detectChanges();
    expect(nestButtons()).toHaveLength(2);
    expect(nestButtons().map((b) => b.disabled)).toEqual([false, true]);

    // Clearing the selection takes the affordance away again — the ticks are the
    // payload, so with no payload there is nothing for the button to do.
    component.clearSelection();
    fixture.detectChanges();
    expect(component.nestSelectionReady()).toBe(false);
    expect(nestButtons()).toHaveLength(0);
  });

  it("nests a SINGLE ticked link under a row — the first child of a conversation", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.resolve({ groupSocialMediaLinks: { ok: true, id: 7 } });
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    const rows = [makeLink({ id: "target" }), makeLink({ id: "a" })];
    await renderRows(rows);

    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    const ok = await component.nestSelectedUnder(rows[0]);

    expect(ok).toBe(true);
    // The same mutation as grouping, with a target: the backend accepts a one-id
    // list and makes "a" a direct child of "target" (`_normalize_ids` refuses only
    // the empty list; tests/incident/test_social_link_threads.py nests single ids).
    // Gating this on two — as the UI did — made the operation impossible.
    expect(groupCalls()[0][1]).toEqual({ linkIds: ["a"], parentId: "target" });
    // Nesting consumed the selection, exactly as grouping does.
    expect(component.selectedIds()).toEqual([]);
  });

  it("refuses to nest under a ticked row instead of posting a cycle", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    const rows = [makeLink({ id: "a" }), makeLink({ id: "b" })];
    await renderRows(rows);
    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    component.toggleRowSelection("b");

    // The server rejects such a call as a unit with nothing written, so the
    // client never sends one — not even from a programmatic call.
    expect(await component.nestSelectedUnder(rows[0])).toBe(false);
    expect(groupCalls()).toHaveLength(0);
  });

  it("keeps the table and the selection when a nest fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("mutation GroupSocialMediaLinks")) {
        return Promise.reject(new Error("nesting would exceed the maximum depth"));
      }
      return Promise.resolve({ socialMediaLinks: [] });
    });
    const rows = [makeLink({ id: "target" }), makeLink({ id: "a" }), makeLink({ id: "b" })];
    await renderRows(rows);
    const component = asTestable(fixture);
    component.toggleRowSelection("a");
    component.toggleRowSelection("b");

    const ok = await component.nestSelectedUnder(rows[0]);

    expect(ok).toBe(false);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);
    expect(component.links().map((l) => l.id)).toEqual(["target", "a", "b"]);
    expect(component.selectedIds()).toEqual(["a", "b"]);
    expect(toastMocks.error).toHaveBeenCalledWith(
      "Couldn't nest links",
      "nesting would exceed the maximum depth",
    );
  });

  /* ---- Hide coupling: recursive under the tree ------------------------ */

  it("asks before hiding a root and names the recursive blast radius", async () => {
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
    const root = makeLink({ id: "root", sublinkCount: 3 });

    const ok = await component.hideLink(root);

    expect(ok).toBe(false);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const message = confirmMock.mock.calls[0][0];
    expect(message).toContain("4 links");
    // Not "every member" — the subtree reaches further than one level.
    expect(message).toContain("at any depth");
    // Declining must not hide anything.
    expect(callsFor("updateSocialMediaLink")).toHaveLength(0);
  });

  it("asks before hiding a DEEP root whose only sublinks are two levels down", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    const confirmMock = vi.fn((_message: string) => true);
    vi.stubGlobal("confirm", confirmMock);

    const component = asTestable(fixture);
    const root = makeLink({ id: "root", sublinkCount: 1 });
    const mid = makeLink({ id: "mid", parentId: "root", isThreadRoot: false, sublinkCount: 1 });
    await renderRows([root, mid]);

    // A root with exactly ONE sublink is the off-by-one case: handed a raw
    // `sublinkCount` of 1, `threadLabel` answers "" and the confirm would be
    // SKIPPED for a row that still hides a whole subtree.
    await component.hideLink(root);

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock.mock.calls[0][0]).toContain("2 links");
  });

  it("asks before hiding a MID-TREE node, worded as a subtree", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    const confirmMock = vi.fn((_message: string) => true);
    vi.stubGlobal("confirm", confirmMock);

    const component = asTestable(fixture);
    const mid = makeLink({ id: "mid", parentId: "root", isThreadRoot: false, sublinkCount: 2 });

    await component.hideLink(mid);

    expect(confirmMock).toHaveBeenCalledTimes(1);
    const message = confirmMock.mock.calls[0][0];
    expect(message).toContain("3 links");
    expect(message).toContain("below it");
  });

  it("does not interrupt Hide on a childless row, whatever its root flag says", async () => {
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
    await component.hideLink(makeLink({ id: "plain", sublinkCount: 0 }));
    await component.hideLink(
      makeLink({ id: "leaf", parentId: "root", isThreadRoot: false, sublinkCount: 0 }),
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

/**
 * The mid-load window, in its own TOP-LEVEL describe because it has to own the
 * mock before the component is even constructed: the very first `socialMediaLinks`
 * request has to still be open while "Show all links" is clicked, and the outer
 * `beforeEach` resolves its requests immediately. Nesting it would also give the
 * outer `beforeEach`'s `httpMock.expectOne` two reference-data requests to match.
 *
 * This is the bug the whole change is about, in two halves:
 *   1. `load()`'s re-entrancy guard used to SWALLOW the click, while
 *      `showAllLinks` had already moved the filter controls — the admin clicks,
 *      the dials change, and nothing happens. It is now queued and replayed.
 *   2. `queueIsComplete` used to be read from the applied filters AFTER the await,
 *      so the PENDING query resolving after "Show all links" had rewritten them
 *      would set the flag true over pending-only rows and flash the move pair. It
 *      is now captured before the first await.
 */
describe("'Show all links' clicked while the first load is still in flight", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let httpMock: HttpTestingController;
  let fixture: ComponentFixture<SocialMediaLinksComponent>;
  /** One resolver per in-flight `socialMediaLinks` request, oldest first. */
  let pending: ((value: unknown) => void)[];

  beforeEach(async () => {
    pending = [];
    requestMock = vi.fn().mockImplementation((query: string) => {
      // Every links query is DEFERRED and released by the test, so the loading flag
      // really is held open across the click rather than raced past it.
      if (query.includes("socialMediaLinks")) {
        return new Promise((resolve) => {
          pending.push(resolve);
        });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    await TestBed.configureTestingModule({
      imports: [SocialMediaLinksComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClientTesting(),
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: AuthService, useValue: { idToken: async () => "token" } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();

    TestBed.overrideComponent(SocialMediaLinksComponent, {
      remove: { imports: [AppNavComponent, AppFooterComponent] },
      add: { imports: [StubNav, StubFooter] },
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SocialMediaLinksComponent);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({ data: { lines: [], stations: [], calendarIncidentCategories: [] } });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("is not disabled, is queued rather than swallowed, and the queued reload carries the unfiltered snapshot", async () => {
    const component = asTestable(fixture);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    fixture.detectChanges();

    // The window the old `[disabled]="isLoading()"` closed on the admin: the queue
    // is genuinely mid-flight and the one unblocking action is on screen.
    expect(component.isLoading()).toBe(true);
    const showAll = fixture.nativeElement.querySelector(
      '[data-testid="reorder-show-all"]',
    ) as HTMLButtonElement;
    expect(showAll).not.toBeNull();
    expect(showAll.hasAttribute("disabled")).toBe(false);

    showAll.click();

    // The click is PARKED, not lost: the snapshot has moved but no second query has
    // gone out yet, because the first still holds the loading flag.
    expect(component.completedFilter()).toBe("any");
    expect(pending).toHaveLength(1);

    // Release the PENDING query — the one whose rows cannot prove a whole queue.
    pending[0]({ socialMediaLinks: [makeLink({ id: "pending-only", position: 10 })] });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    fixture.detectChanges();

    // 🔴 AND THE FLAG STILL SAYS FALSE over those rows. Read after the await it
    // would have seen the snapshot "Show all links" just wrote and claimed a
    // complete queue over pending-only rows, flashing the move pair over rows whose
    // siblings are not loaded — the exact state the flag exists to prevent.
    expect(component.links().map((l) => l.id)).toEqual(["pending-only"]);
    expect(component.queueIsComplete()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="move-link-up"]')).toBeNull();

    // The replay went out with every axis dropped, status included — `undefined`
    // being the "no completed filter" spelling the resolver reads as All.
    const replay = requestMock.mock.calls.filter((call) =>
      (call[0] as string).includes("socialMediaLinks"),
    ) as [string, Record<string, unknown>][];
    expect(replay).toHaveLength(2);
    expect(replay[1][1]).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: undefined,
    });

    pending[1]({
      socialMediaLinks: [makeLink({ id: "a", position: 10 }), makeLink({ id: "b", position: 20 })],
    });
    await vi.waitFor(() => expect(component.queueIsComplete()).toBe(true));
    await vi.waitFor(() => expect(component.isLoading()).toBe(false));
    fixture.detectChanges();

    // The state the admin clicked for: provably whole, and the sequence actions on
    // the page rather than merely enabled somewhere.
    expect(component.queueIsComplete()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="reorder-show-all"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="move-link-up"]')).toHaveLength(2);
  });

  /**
   * 🔴 THE WINDOW THE FIRST TEST CANNOT REACH, and the reason `isLoading` has a
   * single owner.
   *
   * Every load-bearing verb except `load()` sets `isLoading` itself and runs
   * `fetchLinks()` directly, so none of them passes through `load()`'s `finally`.
   * An admin who clicks "Show all links" during one of THEIR post-write refetches
   * therefore parks a reload somewhere that would never be drained: the dials read
   * "All" over the PENDING rows the refetch returned, the hint stays on screen, and
   * the click appears to do nothing until it is pressed a second time — the exact
   * swallowed click this change exists to remove, relocated by one window. The
   * drain lives in `finishLoading()`, which every verb's `finally` calls, so no
   * in-flight request can strand it.
   */
  it("drains a click parked during a MUTATION's own refetch, when that mutation finishes", async () => {
    const component = asTestable(fixture);
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    // Settle the component's OWN constructor load first, or the in-flight request
    // under test would be the page's first paint rather than the mutation's
    // refetch — and the drain would then fire from `load()`'s own `finally`, which
    // is the path that already worked and therefore proves nothing.
    pending[0]({ socialMediaLinks: [makeLink({ id: "initial", position: 10 })] });
    await vi.waitFor(() => expect(component.isLoading()).toBe(false));
    expect(component.queueIsComplete()).toBe(false);
    fixture.detectChanges();

    // Start a mutation WITHOUT awaiting: its mutation request resolves at once
    // (the harness defers only `socialMediaLinks`), so the very next thing it does
    // is park a PENDING refetch — the in-flight request the admin clicks into.
    const completion = component.markCompleted(makeLink({ id: "a" }));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(component.isLoading()).toBe(true);

    // The click, through the DOM. The button carries no `[disabled]`, so it is
    // genuinely clickable in exactly the window that used to grey it out.
    const showAll = fixture.nativeElement.querySelector(
      '[data-testid="reorder-show-all"]',
    ) as HTMLButtonElement;
    expect(showAll.hasAttribute("disabled")).toBe(false);
    showAll.click();

    // Parked: the snapshot has moved, no new query has gone out, because the
    // mutation's refetch — not a `load()` — is holding the flag.
    expect(component.completedFilter()).toBe("any");
    expect(pending).toHaveLength(2);
    expect(component.queueIsComplete()).toBe(false);

    // Let the mutation's own refetch land, still carrying the PENDING snapshot it
    // captured before the click. It must NOT claim a complete queue.
    pending[1]({ socialMediaLinks: [makeLink({ id: "pending-only", position: 10 })] });
    // …and THAT is what has to release the parked reload. A drain that lived in
    // `load()`'s own `finally` would leave `pending` stuck at 2 here forever.
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    expect(component.links().map((l) => l.id)).toEqual(["pending-only"]);

    const linkQueries = requestMock.mock.calls.filter((call) =>
      (call[0] as string).includes("socialMediaLinks"),
    ) as [string, Record<string, unknown>][];
    expect(linkQueries).toHaveLength(3);
    // The mutation's refetch asked for Pending…
    expect(linkQueries[1][1]).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: false,
    });
    // …and the drained replay asked for All, which is what certifies the queue.
    expect(linkQueries[2][1]).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: undefined,
    });

    pending[2]({
      socialMediaLinks: [makeLink({ id: "a", position: 10 }), makeLink({ id: "b", position: 20 })],
    });
    expect(await completion).toBe(true);
    await vi.waitFor(() => expect(component.queueIsComplete()).toBe(true));
    await vi.waitFor(() => expect(component.isLoading()).toBe(false));
    fixture.detectChanges();

    // The admin's single click resolved the state: hint gone, sequence actions on.
    expect(fixture.nativeElement.querySelector('[data-testid="reorder-hint"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="move-link-up"]')).toHaveLength(2);
  });
});
