import { DatePipe, NgTemplateOutlet } from "@angular/common";
import { Component, computed, effect, inject, input } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { RouterLink } from "@angular/router";

import { injectIsBrowser } from "../../core/composables/is-browser";
import { graphqlResource } from "../../core/graphql/graphql-client";
import { metricDoc, metricTooltip } from "../../core/methodology/methodology-render.util";
import { AssetStatusBadge } from "../../domain-ui/asset-status-badge/asset-status-badge";
import { LineStatusBadge } from "../../domain-ui/line-status-badge/line-status-badge";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { HlmBadge, type BadgeVariants } from "../../ui/badge/badge";
import { InfoPopover, type InfoPopoverLink } from "../../ui/info-popover/info-popover";
import { RetryBannerComponent } from "../../ui/retry-banner/retry-banner.component";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import {
  incidentDayKey,
  incidentDayLabel,
  incidentSeverityLabel,
  incidentSeverityVariant,
} from "../home/data/incident-notices.util";
import { passengerLabel, passengerVariant } from "../home/data/passenger-status.util";
import { NotFoundPage } from "../not-found/not-found.page";
import { humanizeSince } from "../spotting/data/humanize-since.util";
import { ASSET_TYPE_LABEL } from "../spotting/data/spotting.queries";
import { stationTaggedReports } from "./data/station-reports.util";
import {
  STATION_INCIDENT_HISTORY_LIMIT,
  STATION_PAGE_QUERY,
  type StationIncident,
  type StationPageQueryData,
  type StationPageQueryVars,
  type StationReportsQueryData,
  stationReportsRequest,
} from "./data/station.queries";

/** What the template draws for one incident row. */
interface IncidentRow {
  id: string;
  title: string;
  /** The start day (`22 Oct 2026`) read from the string and written in UTC, as the link is, so no
   *  machine's zone can change it; `null` when the datetime cannot be read. */
  dayLabel: string | null;
  severityLabel: string;
  severityVariant: BadgeVariants["variant"];
  /** `routerLink` commands: the calendar day the incident starts on, or the calendar's own landing
   *  day when the datetime cannot be read. Built from the string, so server and browser agree. */
  link: string[];
}

function incidentRow(incident: StationIncident): IncidentRow {
  const day = incidentDayKey(incident.startDatetime);
  return {
    id: incident.id,
    title: incident.title,
    dayLabel: incidentDayLabel(incident.startDatetime, "d MMM y"),
    severityLabel: incidentSeverityLabel(incident.severity),
    severityVariant: incidentSeverityVariant(incident.severity),
    link: day ? ["/insiden", day] : ["/insiden"],
  };
}

/** The title of the wildcard route (app.routes.ts), which a station that does not exist takes. */
const NOT_FOUND_TITLE = "MLPTF | Page not found";

/**
 * /station/:id — one station: the lines that serve it with their current status, the approved
 * incidents tagged with it (in effect now, then the newest others, each linking to its day on
 * /insiden), the rider reports that name it, and its lifts and escalators.
 *
 * Server-rendered (app.routes.server.ts) from ONE read whose only variable is the route's `id`, so
 * the server HTML already carries the station, its incidents and its share tags, and hydration reuses
 * the transferred answer. The reports read depends on the station's lines and is browser-only: the
 * server HTML must not wait on a supporting read.
 *
 * A non-numeric id, or one the backend has no station for, renders the app's 404 page (which sets
 * the HTTP 404 status on the server), not a redirect.
 */
@Component({
  selector: "app-station",
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    HlmBadge,
    HlmSkeleton,
    InfoPopover,
    RetryBannerComponent,
    AssetStatusBadge,
    LineStatusBadge,
    AppNavComponent,
    AppFooterComponent,
    NotFoundPage,
  ],
  templateUrl: "./station.page.html",
})
export class StationPage {
  readonly id = input.required<string>();

  private readonly isBrowser = injectIsBrowser();
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  protected readonly passengerLabel = passengerLabel;
  protected readonly passengerVariant = passengerVariant;
  protected readonly humanizeSince = humanizeSince;
  protected readonly assetTypeLabel: Record<string, string> = ASSET_TYPE_LABEL;

  protected readonly incidentsInfoTitle = metricDoc("incidents.station").title;
  protected readonly incidentsInfo = metricTooltip("incidents.station");
  protected readonly incidentsInfoLink: InfoPopoverLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "episodes",
  };
  protected readonly reportsInfoTitle = metricDoc("station.reports").title;
  protected readonly reportsInfo = metricTooltip("station.reports");
  protected readonly reportsInfoLink: InfoPopoverLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "line-status",
  };

  /** The backend rejects a non-numeric id with a GraphQL error, which would read as a failed load
   *  (retry banner, toast, Sentry event) rather than "no such station". Such an id is not found
   *  without asking, as on the vehicle page. */
  private readonly _hasNumericId = computed(() => /^\d+$/.test(this.id()));

  protected readonly resource = graphqlResource<StationPageQueryData, StationPageQueryVars>(() =>
    this._hasNumericId() ? { query: STATION_PAGE_QUERY, variables: { id: this.id() } } : undefined,
  );

  protected readonly station = computed(() => this.resource.data()?.stations[0]);

  /** The id cannot be a station, or the backend answered and has none. `data()` is `undefined`
   *  while a request is in flight and `hasError()` covers a failed one, so neither is "not found". */
  protected readonly isNotFound = computed(
    () => !this._hasNumericId() || this.resource.data()?.stations.length === 0,
  );

  protected readonly currentIncidents = computed(() =>
    (this.resource.data()?.current ?? []).map(incidentRow),
  );
  protected readonly recentIncidents = computed(() =>
    (this.resource.data()?.history ?? []).slice(0, STATION_INCIDENT_HISTORY_LIMIT).map(incidentRow),
  );

  /** Compared by value, so an equal station answer never sends the reports read again. */
  private readonly _lineIds = computed(() => this.station()?.lines.map((line) => line.id) ?? [], {
    equal: (a, b) => a.join() === b.join(),
  });

  protected readonly reportsResource = graphqlResource<StationReportsQueryData>(() => {
    const lineIds = this._lineIds();
    return this.isBrowser && lineIds.length > 0 ? stationReportsRequest(lineIds) : undefined;
  });

  /** `undefined` until the reports answer lands, so the template can tell loading from none. */
  protected readonly reports = computed(() => {
    const station = this.station();
    const data = this.reportsResource.data();
    return station && data ? stationTaggedReports(data, station.lines, station.id) : undefined;
  });

  constructor() {
    // The station's title and share tags, so the server HTML of a shared link previews as the
    // station. Read before setting, so the cleanup puts back what the router and index.html left
    // (index.html has no og:title or og:description, so those two are removed).
    effect((onCleanup) => {
      const name = this.station()?.displayName;
      if (!name) {
        return;
      }
      const title = `${name} | MLPTF`;
      const description = `${name} station on MLPTF: the lines that serve it, incidents in effect now and recent rider reports.`;
      const routeTitle = this.title.getTitle();
      const siteDescription = this.meta.getTag('name="description"')?.content;
      this.title.setTitle(title);
      this.meta.updateTag({ name: "description", content: description });
      this.meta.updateTag({ property: "og:title", content: title });
      this.meta.updateTag({ property: "og:description", content: description });
      onCleanup(() => {
        this.title.setTitle(routeTitle);
        if (siteDescription !== undefined) {
          this.meta.updateTag({ name: "description", content: siteDescription });
        }
        this.meta.removeTag('property="og:title"');
        this.meta.removeTag('property="og:description"');
      });
    });
    effect((onCleanup) => {
      if (!this.isNotFound()) {
        return;
      }
      const routeTitle = this.title.getTitle();
      this.title.setTitle(NOT_FOUND_TITLE);
      onCleanup(() => this.title.setTitle(routeTitle));
    });
  }
}
