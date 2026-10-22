import { Component, ErrorHandler, afterNextRender, computed, inject, signal } from "@angular/core";

import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { HlmCardImports } from "../../../ui/card/card";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import {
  RetryBannerComponent,
  RetryableResource,
} from "../../../ui/retry-banner/retry-banner.component";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { buildFleetProgress } from "../data/fleet-progress.util";
import {
  FLEET_FAVOURITES_COUNT,
  FleetSpottedVehicle,
  GET_FLEET_PROGRESS_QUERY,
  GetFleetProgressData,
} from "../data/profile.queries";
import { FleetProgressLineComponent } from "./fleet-progress-line.component";

/**
 * The own profile's "Fleet progress" card: for each line the user has spotted on, how many distinct
 * vehicles they have logged out of the line's whole fleet, and which ones are still missing.
 *
 * It loads its own data, after the page has painted, and shows a skeleton until the answer lands.
 * The whole list of spotted vehicles is the slow part of the profile (`Vehicle.lines` resolves once
 * per vehicle on the backend), and the card sits below the fold, so the page's first read must not
 * wait for it. A failure shows a retry banner for this card only and leaves the rest of the profile
 * alone.
 *
 * OWN PROFILE ONLY, and that is a privacy rule rather than a layout choice. The read is the
 * caller's own `user.favouriteVehicles` with a count far above the default. The public query keeps
 * the default of one vehicle, because the resolver ignores `spottingDataPublic` and a longer list
 * would publish every vehicle an opted-out user has spotted (see `GET_FLEET_PROGRESS_QUERY`).
 *
 * The card is absent until there is something to show: a user with no spotted vehicle on any line
 * has no rows, and an empty card would only be a heading over nothing. Lines the user has not
 * spotted on do not appear, because the answer knows no others.
 *
 * What the numbers mean (what counts as spotted, what the total includes) is the `fleet.progress`
 * methodology metric, surfaced from the card title.
 */
@Component({
  selector: "app-fleet-progress",
  imports: [
    ...HlmCardImports,
    HlmSkeleton,
    InfoPopover,
    RetryBannerComponent,
    FleetProgressLineComponent,
  ],
  // The card is often absent (no spotted vehicle on any line). A box-less host takes no flex slot in
  // the page's `gap-6` column, so an absent card does not leave a double gap behind.
  host: { class: "contents" },
  template: `
    @if (_isLoading()) {
      <div
        hlmSkeleton
        class="h-40 w-full"
        role="status"
        aria-label="Loading your fleet progress"
        data-testid="fleet-progress-loading"
      ></div>
    } @else if (_isError()) {
      <app-retry-banner [resource]="_retry" message="Couldn't load your fleet progress." />
    } @else if (_rows().length > 0) {
      <div hlmCard data-testid="fleet-progress">
        <div hlmCardHeader>
          <h2 hlmCardTitle>
            <app-info-popover
              label="Fleet progress"
              iconPosition="end"
              testId="fleet-progress-popover"
              triggerClasses="cursor-help"
              [content]="_definition"
              [link]="_methodologyLink"
            >
              <span class="hover:underline">Fleet progress</span>
            </app-info-popover>
          </h2>
          <p hlmCardDescription>
            Distinct vehicles you have logged, out of each line's fleet. Only you see this.
          </p>
        </div>
        <div hlmCardContent>
          @for (row of _rows(); track row.lineId) {
            <app-fleet-progress-line [row]="row" />
          }
        </div>
      </div>
    }
  `,
})
export class FleetProgressComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly errorHandler = inject(ErrorHandler);

  private readonly _vehicles = signal<readonly FleetSpottedVehicle[]>([]);
  protected readonly _isLoading = signal(true);
  protected readonly _isError = signal(false);

  protected readonly _rows = computed(() => buildFleetProgress(this._vehicles()));

  /** Banner adapter: nothing retries by itself, so there is no countdown, and Try Now re-reads. */
  protected readonly _retry: RetryableResource = {
    retryCountdownSec: () => null,
    retryNow: () => void this.load(),
  };

  protected readonly _definition = metricTooltip("fleet.progress");
  protected readonly _methodologyLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "sightings",
  };

  constructor() {
    // After the first render, in the browser only: the read needs the caller's Firebase token, which
    // the server does not have, and the page has painted by then.
    afterNextRender(() => void this.load());
  }

  private async load(): Promise<void> {
    this._isLoading.set(true);
    this._isError.set(false);
    try {
      const data = await this.graphql.request<GetFleetProgressData, Record<string, never>>(
        GET_FLEET_PROGRESS_QUERY,
        {},
      );
      const vehicles = data.user.favouriteVehicles;
      if (vehicles.length >= FLEET_FAVOURITES_COUNT) {
        // The backend cuts the list at the count and says nothing, so a list this long may be
        // short of the user's real set. The card still shows what it has, but this must be loud.
        this.errorHandler.handleError(
          new Error(
            `Fleet progress: favouriteVehicles returned ${vehicles.length} entries, the cap ` +
              `(FLEET_FAVOURITES_COUNT = ${FLEET_FAVOURITES_COUNT}), so progress may be under-counted. Raise the cap.`,
          ),
        );
      }
      this._vehicles.set(vehicles);
    } catch (err) {
      this._isError.set(true);
      // A GraphQLRequestError is already toasted and reported by GraphQLClient. Anything else (a
      // transport failure, a bug in this method) is unexpected and must reach Sentry.
      if (!(err instanceof GraphQLRequestError)) {
        this.errorHandler.handleError(err);
      }
    } finally {
      this._isLoading.set(false);
    }
  }
}
