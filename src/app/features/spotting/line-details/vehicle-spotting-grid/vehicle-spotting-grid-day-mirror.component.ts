import { Component, computed, input } from "@angular/core";
import {
  aggregateSpottingsFor,
  COL_W,
  GridColumn,
  GridSection,
  ROW_H,
} from "./vehicle-spotting-grid.data.util";

/**
 * The desktop sticky mirror band (`div[app-vsg-day-mirror]` — host is the outer zero-height
 * sticky wrapper, which carries `data-testid="grid-day-mirror"` and the sticky `top` offset). It
 * shows the currently-pinned section's per-date totals on the day-grid side, mirroring the
 * names-table label's pinned state. Purely presentational; all measurement/scrolling state is
 * owned by the parent, which passes the derived signals down.
 */
@Component({
  selector: "div[app-vsg-day-mirror]",
  template: `
    <div
      class="overflow-hidden bg-muted"
      [style.height.px]="section() && !pastGrid() ? ROW_H : 0"
      [style.transform]="'translateY(-' + pushProgress() + 'px)'"
    >
      <table
        class="border-collapse text-xs"
        style="table-layout: fixed"
        [style.width.px]="gridWidth()"
        [style.transform]="'translateX(-' + headerScrollLeft() + 'px)'"
      >
        <colgroup>
          @for (col of columns(); track col.dateKey) {
            <col [style.width.px]="COL_W" />
          }
        </colgroup>
        <tbody>
          <tr [style.height.px]="ROW_H" class="text-muted-foreground">
            @for (col of columns(); track col.dateKey) {
              <td
                class="border-t p-0 text-center text-[10px] tabular-nums"
                [class.border-l]="col.isMonthStart"
              >
                @if (section(); as section) {
                  {{ aggregateFor(section, col.dateKey) || "—" }}
                }
              </td>
            }
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class VehicleSpottingGridDayMirrorComponent {
  readonly section = input.required<GridSection | null>();
  readonly columns = input.required<GridColumn[]>();
  readonly countsByKey = input.required<ReadonlyMap<string, number>>();
  readonly headerScrollLeft = input.required<number>();
  readonly pushProgress = input.required<number>();
  readonly pastGrid = input.required<boolean>();

  protected readonly ROW_H = ROW_H;
  protected readonly COL_W = COL_W;
  protected readonly gridWidth = computed(() => this.columns().length * COL_W);

  protected aggregateFor(section: GridSection, dateKey: string): number {
    return aggregateSpottingsFor(section, dateKey, this.countsByKey());
  }
}
