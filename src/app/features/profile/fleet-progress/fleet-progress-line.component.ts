import { Component, computed, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

import { graphqlResource } from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { LineProgress, unspottedVehicles } from "../data/fleet-progress.util";
import { LINE_FLEET_QUERY, LineFleetData, LineFleetVars } from "../data/profile.queries";
import { vehiclePagePath } from "../data/vehicle-link.util";

/**
 * One line of the Fleet progress card: its code, "N of M spotted", a progress bar, and an
 * expandable list of the vehicles on the line the user has not spotted yet, each linking to its
 * vehicle page.
 *
 * The missing vehicles are not in the profile payload (only the spotted ones are), so the line's
 * roster is read the first time the row is expanded, and only then. Every row owns its own
 * `graphqlResource`, so several lines can be open at once, each with its own loading and retry
 * state. The request stays configured after the first open, so collapsing and re-opening a row
 * shows the list it already has instead of fetching again.
 *
 * The bar is a `progressbar` in the unit the reader counts in (vehicles, not percent), and its value
 * text says the same thing as the visible "N of M", so a sighted reader and a screen reader get one fact.
 */
@Component({
  selector: "app-fleet-progress-line",
  imports: [RouterLink, HlmButton, RetryBannerComponent],
  host: { class: "block" },
  template: `
    <div class="flex flex-col gap-1.5" data-testid="fleet-line" [attr.data-line-id]="row().lineId">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-sm font-medium" data-testid="fleet-line-code">{{ row().code }}</span>
        <span class="text-muted-foreground text-xs tabular-nums" data-testid="fleet-line-count">
          {{ row().spotted }} of {{ row().total }} spotted
        </span>
      </div>

      <div
        role="progressbar"
        class="bg-muted h-2 w-full overflow-hidden rounded-full"
        aria-valuemin="0"
        data-testid="fleet-line-bar"
        [attr.aria-label]="row().code + ' fleet progress'"
        [attr.aria-valuemax]="row().total"
        [attr.aria-valuenow]="row().spotted"
        [attr.aria-valuetext]="_valueText()"
      >
        <div class="bg-primary h-full rounded-full" [style.width.%]="row().percent"></div>
      </div>

      @if (_unspottedCount() > 0) {
        <button
          type="button"
          hlmBtn
          variant="ghost"
          size="xs"
          class="-ml-2 self-start"
          data-testid="fleet-line-toggle"
          [attr.aria-expanded]="_open()"
          [attr.aria-controls]="_open() ? _panelId() : null"
          (click)="toggle()"
        >
          {{ _open() ? "Hide" : "Show" }} {{ _unspottedCount() }} not yet spotted
        </button>
      } @else {
        <p class="text-primary text-xs font-medium" data-testid="fleet-line-complete">
          All spotted
        </p>
      }

      @if (_open()) {
        <div [id]="_panelId()" data-testid="fleet-line-unspotted">
          @if (_fleet.hasError()) {
            <app-retry-banner [resource]="_fleet" message="Couldn't load this line's vehicles." />
          } @else if (_unspotted(); as list) {
            <ul class="flex flex-wrap gap-1.5">
              @for (vehicle of list; track vehicle.id) {
                <li>
                  <a
                    hlmBtn
                    variant="outline"
                    size="xs"
                    data-testid="fleet-line-vehicle"
                    [routerLink]="_pathFor(vehicle.id)"
                    >{{ vehicle.identificationNo }}</a
                  >
                </li>
              } @empty {
                <li class="text-muted-foreground text-xs">No other vehicles on this line.</li>
              }
            </ul>
          } @else {
            <p class="text-muted-foreground text-xs" role="status">Loading vehicles…</p>
          }
        </div>
      }
    </div>
  `,
})
export class FleetProgressLineComponent {
  readonly row = input.required<LineProgress>();

  protected readonly _open = signal(false);
  /** Set by the first open and never cleared: it is what configures the roster request. */
  private readonly _wantRoster = signal(false);

  protected readonly _fleet = graphqlResource<LineFleetData, LineFleetVars>(() =>
    this._wantRoster()
      ? { query: LINE_FLEET_QUERY, variables: { lineId: this.row().lineId } }
      : undefined,
  );

  protected readonly _panelId = computed(() => `fleet-unspotted-${this.row().lineId}`);
  /** From the line's fleet size, so the button is right before the roster has loaded. */
  protected readonly _unspottedCount = computed(() => this.row().total - this.row().spotted);
  protected readonly _valueText = computed(
    () => `${this.row().spotted} of ${this.row().total} vehicles spotted`,
  );

  /**
   * The roster minus the spotted vehicles, or `null` until the answer has arrived. An answer with no
   * such line (it was removed meanwhile) is an empty roster, not a spinner that never ends.
   */
  protected readonly _unspotted = computed(() => {
    const answer = this._fleet.data();
    return answer
      ? unspottedVehicles(answer.lines[0]?.vehicles ?? [], this.row().spottedIds)
      : null;
  });

  protected _pathFor(vehicleId: string): string {
    return vehiclePagePath(this.row().lineId, vehicleId);
  }

  protected toggle(): void {
    this._wantRoster.set(true);
    this._open.update((open) => !open);
  }
}
