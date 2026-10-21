import { Component, computed, effect, inject, input, linkedSignal, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { injectIsBrowser } from "../../core/composables/is-browser";
import { downloadCsv, downloadIcs } from "../../core/export/csv.util";
import { graphqlResource } from "../../core/graphql/graphql-client";
import { PreferencesService } from "../../core/preferences/preferences.service";
import { klDateKey } from "../../core/time/kl-date";
import { writeQueryParams } from "../../core/url-state/query-param.util";
import { resolveAdSlot } from "../../core/ads/ads.config";
import { HlmButton } from "../../ui/button/button";
import { HlmBadge } from "../../ui/badge/badge";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../ui/retry-banner/retry-banner.component";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { IncidentCardComponent } from "./incident-card/incident-card.component";
import { IncidentCalendarComponent } from "./calendar/calendar.component";
import { IncidentFormComponent } from "./incident-form/incident-form.component";
import { IncidentHistoryComponent } from "./incident-history/incident-history.component";
import { LinkSheetComponent } from "./link-sheet/link-sheet.component";
import { IncidentSheetService } from "./data/incident-sheet.service";
import { LinkSheetService } from "./data/link-sheet.service";
import {
  CalendarIncident,
  INSIDEN_INCIDENTS_QUERY,
  InsidenIncidentsQueryData,
} from "./data/insiden.queries";
import {
  CALENDAR_WINDOW_PAD_DAYS,
  calendarMonthRange,
  incidentCoversDate,
} from "./data/calendar-date.util";
import {
  emptyIncidentFilterUrlState,
  filterIncidents,
  incidentFilterQueryPatch,
  incidentLineOptions,
  isIncidentFilterActive,
  isMineActive,
  readIncidentFilterUrlState,
  resolveIncidentFilter,
  severityFromSelectValue,
  unlistedLineIds,
  withLineToggled,
  withMineToggled,
  type IncidentFilterUrlState,
  type IncidentLineOption,
} from "./data/incident-filter.util";
import {
  exportFilterTokens,
  incidentsForMonthExport,
  incidentsToCsv,
  incidentsToIcs,
  monthExportFilename,
} from "./data/incident-export.util";
import { isPendingIncidentStatus } from "./data/incident-status.util";
import { LinksSectionComponent } from "./links-section/links-section.component";

/**
 * /insiden — line/vehicle/station-level service disruptions (signal failures, breakdowns, train
 * crashes...). A month calendar (dots per severity present each day) drives a day-scoped incident
 * list, plus an always-visible "ongoing/long-running" section. Community members report new
 * incidents through the right-side sheet (same idiom as the spotting shell): the sheet is opened
 * by the header button and hosted here, with its footer driving the form like spotting does.
 */
@Component({
  selector: "app-insiden",
  imports: [
    DatePipe,
    HlmButton,
    HlmBadge,
    HlmSkeleton,
    RetryBannerComponent,
    AdSlotComponent,
    AppNavComponent,
    AppFooterComponent,
    IncidentCardComponent,
    IncidentCalendarComponent,
    IncidentFormComponent,
    IncidentHistoryComponent,
    LinkSheetComponent,
    LinksSectionComponent,
  ],
  templateUrl: "./insiden.page.html",
})
export class InsidenPage {
  /** Absent on the bare `/insiden` route (see app.routes.ts) — that one defaults to today
   * rather than redirecting into a dated URL, so the common case doesn't wear a date in its
   * address bar that's just restating "today". */
  readonly dateParam = input<string | undefined>(undefined, { alias: "date" });

  /** Client-side tab state only — no URL/query-param sync, no tab library. */
  protected readonly activeTab = signal<"incidents" | "links">("incidents");

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly preferences = inject(PreferencesService);
  private readonly isBrowser = injectIsBrowser();

  protected readonly auth = inject(AuthService);
  protected readonly incidentSheet = inject(IncidentSheetService);
  protected readonly linkSheet = inject(LinkSheetService);

  protected readonly footerEndSlotId = resolveAdSlot("footerEnd");
  protected readonly footerEndRightSlotId = resolveAdSlot("footerEndRight");

  /**
   * 2-ad-per-page cap coordination. Every incident card reports its details-toggle state through
   * the `detailsExpandedChange` output; while ANY card is expanded, `insidenFeedSlotId` resolves
   * to `undefined` so the feed slot renders nothing — footerEnd + (feed OR expanded-details)
   * never exceeds two visible units at once. The optional between-sections unit was skipped for
   * the same reason: together with footerEnd it would exceed the cap.
   */
  private readonly expandedDetailsCount = signal(0);

  /** `undefined` → AdSlotComponent renders zero DOM, so suppression costs no reserved space. */
  protected readonly insidenFeedSlotId = computed(() =>
    this.expandedDetailsCount() === 0 ? resolveAdSlot("insidenFeed") : undefined,
  );

  /** The bare route defaults to today on the Kuala Lumpur clock (not UTC), the frame the incident
   * filter's naive wall dates are in. */
  protected readonly selectedDate = computed(() => this.dateParam() ?? klDateKey());
  protected readonly selectedDateObj = computed(() => new Date(`${this.selectedDate()}T00:00:00Z`));

  protected readonly selectedMonth = computed(() => this.selectedDate().slice(0, 7));

  protected readonly incidentsResource = graphqlResource<InsidenIncidentsQueryData>(() => ({
    query: INSIDEN_INCIDENTS_QUERY,
    variables: {
      filters: {
        date: { range: calendarMonthRange(this.selectedMonth()) },
        OR: { ongoing: true },
      },
    },
  }));

  /** Previous sheet state, so the effect below can detect the open→closed edge. */
  private readonly sheetWasOpen = signal(false);

  /** Refresh seam: the incident form is the only success-knower (it toasts + closes the sheet),
   * and the form itself is out of scope — so a sheet open→closed transition is the tightest
   * available signal. Success AND cancel both close the sheet (a reload on cancel is harmless);
   * a failed submit keeps it open → no reload → lists untouched. Bonus: also fixes a stale list
   * after create, whose close flows through the same transition. */
  constructor() {
    effect(() => {
      const open = this.incidentSheet.isOpen();
      const wasOpen = this.sheetWasOpen();
      this.sheetWasOpen.set(open);
      if (wasOpen && !open) {
        this.incidentsResource.reload();
      }
    });
  }

  protected readonly isLoading = this.incidentsResource.isLoading;
  protected readonly hasError = this.incidentsResource.hasError;

  /** The query params as a signal, SEEDED FROM THE SNAPSHOT so the server render and the first
   * client render read the same filters (an empty seed would paint the unfiltered list over a
   * `?lines=` deep link on hydration). */
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** What the URL says (`?lines=` / `?severity=` / `?mine=`) — the single source of filter state.
   * There is no second copy to drift: every control writes the URL and reads it back through here. */
  private readonly filterUrlState = computed(() =>
    readIncidentFilterUrlState(this.queryParamMap()),
  );

  /** The filter in force: the URL's, with "My lines" resolved against the reader's live pins. The
   * pins are read from `PreferencesService`, which hydrates from localStorage after first render, so
   * a `?mine=1` deep link shows the unfiltered month on the server and narrows once the browser has
   * them — never a hydration mismatch, because server and first client render both read no pins. */
  protected readonly filterCriteria = computed(() =>
    resolveIncidentFilter(this.filterUrlState(), this.preferences.pinnedLineIds()),
  );
  protected readonly filterActive = computed(() => isIncidentFilterActive(this.filterCriteria()));
  /** "My lines" reads as pressed only while it is what drives the line axis. */
  protected readonly mineActive = computed(() => isMineActive(this.filterUrlState()));
  protected readonly pinnedCount = computed(() => this.preferences.pinnedLineIds().length);
  /** False on the server and on the first client render, true once the pins have been read back from
   * localStorage. "You have not pinned any lines" must wait for it, or a rider WITH pins sees it
   * flash on a `?mine=1` link before their pins arrive. */
  protected readonly pinsHydrated = this.preferences.hydrated;
  /** The width of the loaded window either side of the month, for the scope note's copy. */
  protected readonly windowPadDays = CALENDAR_WINDOW_PAD_DAYS;
  protected readonly selectedLineIds = computed(() => new Set(this.filterCriteria().lineIds));
  protected readonly severityValue = computed(
    () => this.filterCriteria().severity?.toLowerCase() ?? "all",
  );
  /** The severity chips, in order. Chips rather than a `<select>`: they match the line chips beside
   * them, and a page-level `<select>` would be the first one in the DOM, ahead of the report
   * form's (`page.locator("select").first()` in the e2e suite targets the form's). */
  protected readonly severityOptions = [
    { value: "all", label: "All" },
    { value: "major", label: "Major" },
    { value: "minor", label: "Minor" },
  ] as const;

  /** Everything the month's read returned, before any filter. The line chips come from THIS, so
   * narrowing to one line never removes the other lines' chips. */
  private readonly loadedIncidents = computed(
    () => this.incidentsResource.data()?.calendarIncidents ?? [],
  );
  protected readonly loadedCount = computed(() => this.loadedIncidents().length);
  /** Whether an answer for the CURRENT month is in hand. `data()` is dropped the moment the month
   * changes, so every note that counts the loaded incidents ("Showing 2 of 5", "no incident in this
   * window") waits for it instead of announcing "0 of 0" for the length of the request. */
  protected readonly hasLoaded = computed(() => this.incidentsResource.data() !== undefined);

  /** The incidents every list and the calendar render: the loaded window narrowed by the filter.
   * `dayIncidents`, `pinned` and the calendar's dots all derive from this, so a filter applies to
   * them uniformly. */
  protected readonly allIncidents = computed(() =>
    filterIncidents(this.loadedIncidents(), this.filterCriteria()),
  );

  /** What "Export month" writes: the filtered, APPROVED incidents that STARTED in the month shown,
   * oldest first (see `incidentsForMonthExport` for why approved-only and why start-based). Unapproved
   * reports stay on the page behind "Pending Approval" and never reach a file, so the button's count
   * is the same number as the "Last 12 months" bar for the month (when no filter is on). */
  protected readonly exportIncidents = computed(() =>
    incidentsForMonthExport(this.allIncidents(), this.selectedMonth()),
  );

  /** The line chips: rebuilt from every month's read, but HELD while the next month is on its way.
   * `data()` is dropped when the month changes, so a plain `computed` would empty the strip for the
   * length of the request and remount every chip (a chip that had keyboard focus would lose it). */
  protected readonly lineOptions = linkedSignal<
    { options: IncidentLineOption[]; fetching: boolean },
    IncidentLineOption[]
  >({
    source: () => ({
      options: incidentLineOptions(this.loadedIncidents(), this.preferences.pinnedLineIds()),
      fetching: this.incidentsResource.isFetching(),
    }),
    computation: ({ options, fetching }, previous) =>
      fetching && previous !== undefined ? previous.value : options,
  });
  /** Selected lines that have no chip (a shared link naming a line with no incident this month, or a
   * pinned line with none), counted so an active filter is never invisible. */
  protected readonly unlistedLineCount = computed(
    () => unlistedLineIds(this.filterCriteria().lineIds, this.lineOptions()).length,
  );

  private readonly _sorted = computed(() =>
    [...this.allIncidents()].sort((a, b) => b.startDatetime.localeCompare(a.startDatetime)),
  );

  /** Everything covering the selected day (see calendar-date.util's coverage semantics —
   * multi-day incidents show here on every day they span, not just their start day). */
  protected readonly dayIncidents = computed(() => {
    const date = this.selectedDate();
    return this._sorted().filter((incident) => incidentCoversDate(incident, date));
  });

  /** Still-unresolved incidents NOT already covering the selected day — kept out of this list
   * once they show up in `dayIncidents()` instead, so nothing appears twice on screen. Gated on
   * `endDatetime === null` alone: `longTerm` is a separate, independent classification (an admin
   * judgment call shown as its own badge on the card, see IncidentCardComponent) rather than a
   * synonym for "unresolved" — a long-term incident that has since been given an end date is
   * resolved and must drop out of this section like any other, not stay pinned forever. */
  protected readonly pinned = computed(() => {
    const date = this.selectedDate();
    return this._sorted().filter(
      (incident) => incident.endDatetime === null && !incidentCoversDate(incident, date),
    );
  });

  private readonly _isPending = (incident: CalendarIncident): boolean =>
    isPendingIncidentStatus(incident.status);

  /** Approve-then-pending splitting for both incident lists (pinned + day): approved render
   * first, pending collapse behind a "Pending Approval (N)" toggle. "Approved" = not pending
   * (status may be LIVE or missing entirely — see incident-status.util's graceful fallback). */
  protected readonly pinnedApproved = computed(() =>
    this.pinned().filter((incident) => !this._isPending(incident)),
  );
  protected readonly pinnedPending = computed(() =>
    this.pinned().filter((incident) => this._isPending(incident)),
  );
  protected readonly dayApproved = computed(() =>
    this.dayIncidents().filter((incident) => !this._isPending(incident)),
  );
  protected readonly dayPending = computed(() =>
    this.dayIncidents().filter((incident) => this._isPending(incident)),
  );

  /** Collapsed-by-default toggle state, one per list so expanding the pinned pending approvals
   * doesn't also expand the (date-scoped) day list's. */
  protected readonly pinnedPendingExpanded = signal(false);
  protected readonly dayPendingExpanded = signal(false);

  /** Routes the selection rather than just writing to a local signal, so the viewed day is a
   * real, shareable/bookmarkable URL (and Back/Forward walks through previously viewed days). */
  protected onDaySelected(dateKey: string): void {
    // `preserve` keeps `?lines=` / `?severity=` / `?mine=`: picking a day must not silently drop them.
    this.router.navigate(["/insiden", dateKey], { queryParamsHandling: "preserve" });
  }

  /** The calendar header's "Export month": builds the file from the filtered month and downloads it
   * (a no-op on the server, and when there is nothing to write — the buttons are disabled then). */
  protected onExportMonth(format: "csv" | "ics"): void {
    const incidents = this.exportIncidents();
    if (incidents.length === 0) {
      return;
    }
    // A filtered file says so in its name: a CSV has nowhere else to.
    const filename = monthExportFilename(
      this.selectedMonth(),
      format,
      exportFilterTokens(this.filterCriteria(), this.lineOptions()),
    );
    if (format === "csv") {
      downloadCsv(filename, incidentsToCsv(incidents), this.isBrowser);
    } else {
      downloadIcs(filename, incidentsToIcs(incidents), this.isBrowser);
    }
  }

  protected toggleMine(): void {
    this.writeFilter(withMineToggled(this.filterUrlState()));
  }

  protected toggleLine(lineId: string): void {
    this.writeFilter(withLineToggled(this.filterUrlState(), this.filterCriteria().lineIds, lineId));
  }

  protected setSeverity(value: string): void {
    this.writeFilter({ ...this.filterUrlState(), severity: severityFromSelectValue(value) });
  }

  protected clearFilters(): void {
    this.writeFilter(emptyIncidentFilterUrlState());
  }

  /** Browser-gated merge-and-replace write (a reactive `router.navigate()` during SSR hangs the
   * render, and a filter toggle is not a step the reader wants to walk back through). */
  private writeFilter(next: IncidentFilterUrlState): void {
    writeQueryParams(this.router, this.route, incidentFilterQueryPatch(next), this.isBrowser);
  }

  /** Clamped at 0 so an unbalanced collapse can never drive the count negative. */
  protected onDetailsExpandedChange(expanded: boolean): void {
    this.expandedDetailsCount.update((count) => Math.max(0, count + (expanded ? 1 : -1)));
  }

  protected openReportSheet(): void {
    this.incidentSheet.open();
  }

  protected openLinkSheet(): void {
    this.linkSheet.open();
  }
}
