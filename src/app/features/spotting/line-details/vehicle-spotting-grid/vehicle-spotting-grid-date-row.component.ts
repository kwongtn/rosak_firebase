import { Component, input, output } from "@angular/core";
import { spottingIntensityClass } from "../../../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import { GridColumn, spottingCountFor } from "./vehicle-spotting-grid.data.util";
import { dayCellClass as buildDayCellClass } from "./vehicle-spotting-grid.layout.util";

/** Emitted on cell hover so the parent can anchor and orient the shared tooltip. */
export interface GridCellHover {
  vehicleId: string;
  label: string;
  dateKey: string;
  event: Event;
}

/**
 * One vehicle's row of date cells — the horizontally-scrolling body row shared by the desktop
 * and mobile layouts (the mobile layout stacks a full-width name row directly above this same
 * date row). Host is the `<tr>` itself (`tr[app-vsg-date-row]`) so the table markup stays valid;
 * the parent applies the row height and the per-cell hover wiring lives here because the cells are
 * rendered inside this component.
 */
@Component({
  selector: "tr[app-vsg-date-row]",
  template: `
    @for (col of columns(); track col.dateKey) {
      <td
        [class]="dayCellClass(col)"
        (mouseenter)="
          cellHoverStart.emit({
            vehicleId: vehicleId(),
            label: label(),
            dateKey: col.dateKey,
            event: $event,
          })
        "
        (mouseleave)="cellHoverEnd.emit()"
      >
        @if (col.isToday) {
          <!-- The breathing wash, separated from the pill below rather
                                                   than an animate-pulse class on the <td> itself — the <td>
                                                   also contains the spotting-intensity pill, and pulsing
                                                   the whole cell's opacity would fade that pill in and out
                                                   along with the background, which reads as "this vehicle's
                                                   spotting data is flickering", not "this is today". z-0 +
                                                   the pill's own z-10 (below) keep this wash strictly behind
                                                   it despite both being absolutely/normally positioned
                                                   siblings. -->
          <div
            class="bg-amber-400/15 dark:bg-amber-400/20 pointer-events-none absolute inset-0 z-0 animate-pulse"
            aria-hidden="true"
          ></div>
        }
        <div class="relative z-10 mx-auto size-4 rounded-sm" [class]="cellClass(col)"></div>
      </td>
    }
  `,
})
export class VehicleSpottingGridDateRowComponent {
  readonly columns = input.required<GridColumn[]>();
  readonly vehicleId = input.required<string>();
  readonly label = input.required<string>();
  readonly countsByKey = input.required<ReadonlyMap<string, number>>();
  readonly maxCount = input.required<number>();

  readonly cellHoverStart = output<GridCellHover>();
  readonly cellHoverEnd = output<void>();

  protected readonly dayCellClass = buildDayCellClass;

  protected cellClass(col: GridColumn): string {
    return spottingIntensityClass(
      spottingCountFor(this.countsByKey(), this.vehicleId(), col.dateKey),
      this.maxCount(),
    );
  }
}
