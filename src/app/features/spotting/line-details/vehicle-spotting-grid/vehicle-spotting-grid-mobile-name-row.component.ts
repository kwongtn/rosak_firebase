import { Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { VehicleStatusBadge } from "../../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { GridRow } from "./vehicle-spotting-grid.data.util";

/**
 * One vehicle's full-width mobile name row (`tr[app-vsg-mobile-name-row]` — host is the `<tr>`,
 * which itself carries `data-testid="grid-mobile-vehicle-row"`), sitting directly above that
 * vehicle's own date row. The name stays pinned left while the date row scrolls. Purely
 * presentational; the parent applies the row height and colspan.
 */
@Component({
  selector: "tr[app-vsg-mobile-name-row]",
  imports: [RouterLink, VehicleStatusBadge],
  template: `
    <td [attr.colspan]="colspan()" class="bg-card">
      <div
        data-testid="grid-mobile-name-pin"
        class="sticky left-0 flex w-fit items-center gap-2 bg-card px-2 py-1 whitespace-nowrap"
      >
        <a
          [routerLink]="['/spotting', lineId(), 'vehicle', row().vehicleId]"
          class="hover:underline"
        >
          {{ row().identificationNo }}
        </a>
        <vehicle-status-badge [status]="row().status" />
      </div>
    </td>
  `,
})
export class VehicleSpottingGridMobileNameRowComponent {
  readonly row = input.required<GridRow>();
  readonly lineId = input.required<string>();
  readonly colspan = input.required<number>();
}
