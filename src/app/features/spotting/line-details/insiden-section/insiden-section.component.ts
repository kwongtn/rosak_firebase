import { Component, computed, inject, input } from "@angular/core";
import { graphqlResource } from "../../../../core/graphql/graphql-client";
import { PollingSource } from "../../../../core/polling/polling-source";
import { HlmButton } from "../../../../ui/button/button";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../../ui/retry-banner/retry-banner.component";
import { IncidentCardComponent } from "../../../insiden/incident-card/incident-card.component";
import {
  INSIDEN_INCIDENTS_QUERY,
  InsidenIncidentsQueryData,
} from "../../../insiden/data/insiden.queries";
import { incidentsForLine } from "./insiden-section.util";

interface RefreshIntervalOption {
  label: string;
  value: string;
}

const REFRESH_INTERVAL_OPTIONS: RefreshIntervalOption[] = [
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "1 min", value: "60000" },
  { label: "2 min", value: "120000" },
  { label: "5 min", value: "300000" },
  { label: "Never", value: "off" },
];

function refreshIntervalToOptionValue(ms: number | null): string {
  return ms == null ? "off" : String(ms);
}

function optionValueToRefreshInterval(value: string): number | null {
  return value === "off" ? null : Number(value);
}

/**
 * The "Insiden" tab of /spotting/:lineId/details — this line's calendar incidents (the same
 * `calendarIncidents` feed /insiden uses, filtered client-side by line id). Ongoing incidents
 * (endDatetime === null) come first, then resolved ones newest-first by startDatetime. Refresh
 * behavior mirrors SituasiSectionComponent: a PollingSource wired to reload() with the
 * layer-checklist interval select and countdown.
 */
@Component({
  selector: "app-insiden-section",
  imports: [HlmButton, HlmSkeleton, RetryBannerComponent, IncidentCardComponent],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">Insiden</h2>
        <div class="flex items-center gap-2">
          <select
            class="border-input bg-background rounded-md border px-1.5 py-1 text-xs font-normal"
            (click)="$event.stopPropagation()"
            (change)="onRefreshIntervalChange($event)"
          >
            @for (option of REFRESH_INTERVAL_OPTIONS; track option.value) {
              <option
                [value]="option.value"
                [selected]="option.value === refreshIntervalOptionValue()"
              >
                {{ option.label }}
              </option>
            }
          </select>
          @if (polling.intervalMs() !== null) {
            <svg
              class="text-muted-foreground size-3.5 [animation-direction:reverse]"
              style="animation: spin 1s linear infinite"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                stroke-width="2"
                stroke-opacity="0.25"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span class="text-muted-foreground text-xs">
              Refreshing in {{ polling.secondsRemaining() }}s
            </span>
          }
          <button hlmBtn variant="ghost" size="sm" (click)="polling.refreshNow()">
            Refresh now
          </button>
        </div>
      </div>

      @if (resource.isLoading()) {
        <div class="flex flex-col gap-4">
          <div hlmSkeleton class="h-28 w-full"></div>
          <div hlmSkeleton class="h-28 w-full"></div>
        </div>
      } @else if (resource.hasError()) {
        <app-retry-banner [resource]="resource" message="Couldn't load incidents for this line." />
      } @else if (incidents().length === 0) {
        <p class="text-muted-foreground text-sm">No incidents recorded for this line.</p>
      } @else {
        <div class="flex flex-col gap-4">
          @for (incident of incidents(); track incident.id) {
            <app-incident-card [incident]="incident" />
          }
        </div>
      }
    </div>
  `,
})
export class InsidenSectionComponent {
  readonly lineId = input.required<string>();

  protected readonly REFRESH_INTERVAL_OPTIONS = REFRESH_INTERVAL_OPTIONS;

  protected readonly resource = graphqlResource<InsidenIncidentsQueryData>(() => ({
    query: INSIDEN_INCIDENTS_QUERY,
  }));

  protected readonly polling = new PollingSource(() => this.resource.reload());

  protected readonly refreshIntervalOptionValue = computed(() =>
    refreshIntervalToOptionValue(this.polling.intervalMs()),
  );

  /** This line's incidents — filter + ordering live in incidentsForLine (single place to change
   * if the requested order is revised). */
  protected readonly incidents = computed(() =>
    incidentsForLine(this.resource.data()?.calendarIncidents ?? [], this.lineId()),
  );

  protected onRefreshIntervalChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.polling.setIntervalMs(optionValueToRefreshInterval(value));
  }
}
