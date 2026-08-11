import { Component, computed, inject, input } from "@angular/core";
import { DatePipe } from "@angular/common";
import { Router } from "@angular/router";
import { graphqlResource } from "../../core/graphql/graphql-client";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../ui/retry-banner/retry-banner.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { IncidentCardComponent } from "./incident-card/incident-card.component";
import { IncidentCalendarComponent } from "./calendar/calendar.component";
import { INSIDEN_INCIDENTS_QUERY, InsidenIncidentsQueryData } from "./data/insiden.queries";
import { dateKeyOf, incidentCoversDate } from "./data/calendar-date.util";

/**
 * /insiden — line/vehicle/station-level service disruptions (signal failures, breakdowns, train
 * crashes...), authored by admins via Django admin. Fully public/read-only except attaching a
 * photo to an existing incident. Ported from src/app/insiden/: a month calendar (dots per
 * severity present each day) drives a day-scoped incident list, same shape as the old app's
 * ng-zorro calendar + event-list pairing — plus an always-visible "ongoing/long-running" section,
 * since those matter regardless of which day happens to be selected.
 */
@Component({
  selector: "app-insiden",
  imports: [
    DatePipe,
    HlmSkeleton,
    RetryBannerComponent,
    AppNavComponent,
    AppFooterComponent,
    IncidentCardComponent,
    IncidentCalendarComponent,
  ],
  templateUrl: "./insiden.page.html",
})
export class InsidenPage {
  /** Absent on the bare `/insiden` route (see app.routes.ts) — that one defaults to today
   * rather than redirecting into a dated URL, so the common case doesn't wear a date in its
   * address bar that's just restating "today". */
  readonly dateParam = input<string | undefined>(undefined, { alias: "date" });

  private readonly router = inject(Router);

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
}
