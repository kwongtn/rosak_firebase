import { Component, computed, input } from "@angular/core";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { HlmCardImports } from "../../../ui/card/card";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { buildFleetProgress } from "../data/fleet-progress.util";
import type { FavouriteVehicle } from "../data/profile.queries";
import { FleetProgressLineComponent } from "./fleet-progress-line.component";

/**
 * The own profile's "Fleet progress" card: for each line the user has spotted on, how many distinct
 * vehicles they have logged out of the line's whole fleet, and which ones are still missing.
 *
 * OWN PROFILE ONLY, and that is a privacy rule rather than a layout choice. The numbers come from
 * the owner query's full `favouriteVehicles` list. The public query keeps the default of one
 * vehicle, because the resolver ignores `spottingDataPublic` and a longer list would publish every
 * vehicle an opted-out user has spotted (see `GET_USER_DATA_QUERY`).
 *
 * The card is absent until there is something to show: a user with no spotted vehicle on any line
 * has no rows, and an empty card would only be a heading over nothing. Lines the user has not
 * spotted on do not appear, because the profile payload knows no others.
 *
 * What the numbers mean (what counts as spotted, what the total includes) is the `fleet.progress`
 * methodology metric, surfaced from the card title.
 */
@Component({
  selector: "app-fleet-progress",
  imports: [...HlmCardImports, InfoPopover, FleetProgressLineComponent],
  template: `
    @if (_rows().length > 0) {
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
  /** `UserData.favouriteVehicles` from the OWNER query (the one carrying each line's fleet size). */
  readonly favouriteVehicles = input.required<readonly FavouriteVehicle[] | null | undefined>();

  protected readonly _rows = computed(() => buildFleetProgress(this.favouriteVehicles()));

  protected readonly _definition = metricTooltip("fleet.progress");
  protected readonly _methodologyLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "sightings",
  };
}
