import { Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { VehicleStatusBadge } from "../../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { GridRow } from "./vehicle-spotting-grid.data.util";

/**
 * One vehicle's fixed name row in the desktop names table (`tr[app-vsg-name-row]` — host is the
 * `<tr>` so the table markup stays valid). Purely presentational; the parent applies the row
 * height and the surrounding table structure.
 */
@Component({
  selector: "tr[app-vsg-name-row]",
  imports: [RouterLink, VehicleStatusBadge],
  template: `
    <td class="bg-card border-b px-2 py-1 whitespace-nowrap">
      <div class="flex items-center justify-between gap-2">
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
export class VehicleSpottingGridNameRowComponent {
  readonly row = input.required<GridRow>();
  readonly lineId = input.required<string>();
}
