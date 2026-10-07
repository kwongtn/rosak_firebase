import { Component, computed, input, output } from "@angular/core";
import {
  aggregateSpottingsFor,
  COL_W,
  GridColumn,
  GridSection,
  MOBILE_PINNED_H,
  ROW_H,
} from "./vehicle-spotting-grid.data.util";
import { MOBILE_TYPE_LABEL_CLASS } from "./vehicle-spotting-grid.layout.util";

/**
 * The mobile sticky pinned band (`div[app-vsg-mobile-pinned]` — host is the outer zero-height
 * sticky wrapper). Shows the currently-pinned type label plus its per-date totals while the grid
 * scrolls. Purely presentational; the parent owns all measurement/scrolling state and the
 * collapse toggle.
 */
@Component({
  selector: "div[app-vsg-mobile-pinned]",
  template: `
    <div
      data-testid="grid-mobile-pinned"
      class="overflow-hidden bg-muted"
      [style.height.px]="section() && !pastGrid() ? MOBILE_PINNED_H : 0"
      [style.transform]="'translateY(-' + pushProgress() + 'px)'"
    >
      <div
        data-testid="grid-mobile-pinned-label"
        [class]="labelClass"
        [style.height.px]="ROW_H"
        (click)="toggled.emit()"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-3 shrink-0 transition-transform duration-150"
          [class.-rotate-90]="collapsed()"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        {{ section()?.typeName }}
      </div>
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
                class="border-b p-0 text-center text-[10px] tabular-nums"
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
export class VehicleSpottingGridMobilePinnedComponent {
  readonly section = input.required<GridSection | null>();
  readonly columns = input.required<GridColumn[]>();
  readonly countsByKey = input.required<ReadonlyMap<string, number>>();
  readonly headerScrollLeft = input.required<number>();
  readonly pushProgress = input.required<number>();
  readonly pastGrid = input.required<boolean>();
  readonly collapsed = input.required<boolean>();

  readonly toggled = output<void>();

  protected readonly ROW_H = ROW_H;
  protected readonly COL_W = COL_W;
  protected readonly MOBILE_PINNED_H = MOBILE_PINNED_H;
  protected readonly labelClass = MOBILE_TYPE_LABEL_CLASS;
  protected readonly gridWidth = computed(() => this.columns().length * COL_W);

  protected aggregateFor(section: GridSection, dateKey: string): number {
    return aggregateSpottingsFor(section, dateKey, this.countsByKey());
  }
}
