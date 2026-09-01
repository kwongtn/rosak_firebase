import { Component, computed, inject, input, signal, viewChild } from "@angular/core";
import { DatePipe } from "@angular/common";
import { Router } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { graphqlResource } from "../../core/graphql/graphql-client";
import { resolveAdSlot } from "../../core/ads/ads.config";
import { HlmButton } from "../../ui/button/button";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../ui/sheet/sheet";
import { RetryBannerComponent } from "../../ui/retry-banner/retry-banner.component";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { IncidentCardComponent } from "./incident-card/incident-card.component";
import { IncidentCalendarComponent } from "./calendar/calendar.component";
import { IncidentFormComponent } from "./incident-form/incident-form.component";
import { LinkFormComponent } from "./link-form/link-form.component";
import { IncidentSheetService } from "./data/incident-sheet.service";
import { LinkSheetService } from "./data/link-sheet.service";
import { INSIDEN_INCIDENTS_QUERY, InsidenIncidentsQueryData } from "./data/insiden.queries";
import { dateKeyOf, incidentCoversDate } from "./data/calendar-date.util";

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
    HlmSkeleton,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    RetryBannerComponent,
    AdSlotComponent,
    AppNavComponent,
    AppFooterComponent,
    IncidentCardComponent,
    IncidentCalendarComponent,
    IncidentFormComponent,
    LinkFormComponent,
  ],
  templateUrl: "./insiden.page.html",
})
export class InsidenPage {
  /** Absent on the bare `/insiden` route (see app.routes.ts) — that one defaults to today
   * rather than redirecting into a dated URL, so the common case doesn't wear a date in its
   * address bar that's just restating "today". */
  readonly dateParam = input<string | undefined>(undefined, { alias: "date" });

  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly incidentSheet = inject(IncidentSheetService);
  protected readonly linkSheet = inject(LinkSheetService);

  protected readonly linkFormRef = viewChild(LinkFormComponent);

  protected readonly footerEndSlotId = resolveAdSlot("footerEnd");

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

  protected readonly selectedDate = computed(() => this.dateParam() ?? dateKeyOf(new Date()));
  protected readonly selectedDateObj = computed(() => new Date(`${this.selectedDate()}T00:00:00Z`));

  protected readonly incidentsResource = graphqlResource<InsidenIncidentsQueryData>(() => ({
    query: INSIDEN_INCIDENTS_QUERY,
  }));

  protected readonly isLoading = this.incidentsResource.isLoading;
  protected readonly hasError = this.incidentsResource.hasError;

  protected readonly allIncidents = computed(
    () => this.incidentsResource.data()?.calendarIncidents ?? [],
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

  /** Routes the selection rather than just writing to a local signal, so the viewed day is a
   * real, shareable/bookmarkable URL (and Back/Forward walks through previously viewed days). */
  protected onDaySelected(dateKey: string): void {
    this.router.navigate(["/insiden", dateKey]);
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
