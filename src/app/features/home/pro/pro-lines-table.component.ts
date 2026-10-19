import { Component, computed, inject } from "@angular/core";

import {
  PreferencesService,
  type ProLinesSort,
  type ProLinesSortColumn,
} from "../../../core/preferences/preferences.service";
import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { LINE_STATUS_LABEL } from "../../../domain-ui/line-status-badge/line-status-badge";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import type { LinePulse } from "../data/home-board.queries";
import { HomeStore } from "../data/home.store";
import { lastReportHour, sortProLines } from "./pro-lines-table.util";

interface TableColumn {
  key: ProLinesSortColumn;
  label: string;
}

/** Header order is the column order. Every column is sortable, so each header is a button. */
const COLUMNS: readonly TableColumn[] = [
  { key: "line", label: "Line" },
  { key: "status", label: "Status" },
  { key: "reports", label: "Reports" },
  { key: "inService", label: "In service" },
  { key: "lastReport", label: "Last report (hour)" },
];

/**
 * The Pro dashboard's compact lines table: one flat row per visible line, sortable by any column.
 *
 * 🔴 **It reads the same `HomeStore.visibleLines()` the board draws**, so the Pro filters, the operator
 * family and the export all narrow it the same way. It does not regroup by attention or pin: a table
 * whose job is comparison should not hide a line in a group, and the grouped view is one toggle away.
 *
 * **Keyboard and screen readers.** Each sortable header holds a real `<button>` inside its `<th>`, so
 * it takes focus and Enter/Space with no key handler of ours. The active column carries
 * `aria-sort` (`ascending` / `descending`); the others say `none`. The arrow glyph is decorative —
 * the `aria-sort` attribute is what a screen reader announces.
 *
 * **Last report is the HOUR.** The history read is hourly, so the column is the most recent service
 * hour with a report, shown as an age. It is blank ("—") until the history read has landed.
 *
 * The sort is stored in `PreferencesService` (versioned with the rest of the preferences), so a Pro
 * reader returns to the same order. A re-click on the active header flips its direction.
 */
@Component({
  selector: "app-pro-lines-table",
  imports: [InfoPopover],
  template: `
    <div class="overflow-x-auto" data-testid="pro-lines-table-wrap">
      <table class="w-full min-w-[32rem] text-left text-sm" data-testid="pro-lines-table">
        <caption class="sr-only">
          Lines, sorted by the column chosen in the header buttons
        </caption>
        <thead>
          <tr class="border-border text-muted-foreground border-b text-xs">
            @for (column of _columns; track column.key) {
              <th
                scope="col"
                class="px-2 py-2 font-medium whitespace-nowrap"
                [attr.aria-sort]="_ariaSort(column.key)"
              >
                <button
                  type="button"
                  class="focus-visible:ring-ring/50 hover:text-foreground inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
                  [attr.data-testid]="'pro-lines-sort-' + column.key"
                  (click)="sortBy(column.key)"
                >
                  {{ column.label }}
                  <span aria-hidden="true">{{ _arrow(column.key) }}</span>
                </button>
                @if (column.key === "lastReport") {
                  <app-info-popover
                    label="What the last report column means"
                    iconPosition="end"
                    [content]="_lastReportInfo"
                    testId="pro-lines-last-report-popover"
                    [showMethodologyLink]="true"
                  >
                    <span class="sr-only">About the last report column</span>
                  </app-info-popover>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of _rows(); track row.line.id) {
            <tr class="border-border border-b last:border-0" data-testid="pro-lines-row">
              <td class="px-2 py-2">
                <span class="font-medium">{{ row.line.code }}</span>
                <span class="text-muted-foreground ml-1.5 text-xs">{{ row.line.displayName }}</span>
              </td>
              <td class="px-2 py-2">{{ _statusLabel(row.line) }}</td>
              <td class="px-2 py-2 tabular-nums">{{ row.line.statusReportCount }}</td>
              <td class="px-2 py-2 tabular-nums" data-testid="pro-lines-in-service">
                {{ row.line.inServiceVehicleCount }}/{{ row.line.totalVehicleCount }}
              </td>
              <td
                class="text-muted-foreground px-2 py-2 text-xs"
                data-testid="pro-lines-last-report"
              >
                {{ _age(row.lastReport) }}
              </td>
            </tr>
          } @empty {
            <tr>
              <td class="text-muted-foreground px-2 py-6 text-center" colspan="5">
                No lines match the current filters.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ProLinesTableComponent {
  private readonly store = inject(HomeStore);
  private readonly preferences = inject(PreferencesService);

  protected readonly _columns = COLUMNS;

  /** The last-report column's popover copy, from the methodology registry. */
  protected readonly _lastReportInfo = metricTooltip("line-status.last-report-hour");

  /** The sort in force, read from the preferences signal so a re-sort re-renders the rows. */
  protected readonly _sort = this.preferences.proLinesSort;

  /**
   * The rows in the chosen order, each with its last-report hour. The hour is looked up once per line
   * here so the sort comparator and the cell read the same value.
   */
  protected readonly _rows = computed(() => {
    const lastOf = (line: LinePulse): string | null =>
      lastReportHour(this.store.linesHistoryFor(line.id));
    const sorted = sortProLines(this.store.visibleLines(), this._sort(), lastOf);
    return sorted.map((line) => ({ line, lastReport: lastOf(line) }));
  });

  constructor() {
    // The last-report column is the history read the heat grid also uses. Asking for it here makes
    // the table self-sufficient, and asking twice is harmless: the store's flag is only ever set.
    this.store.requestHistoryReads();
  }

  protected _statusLabel(line: LinePulse): string {
    return LINE_STATUS_LABEL[line.status];
  }

  /** The age of a service hour, or a dash when no hour in the read has a report. */
  protected _age(hourStart: string | null): string {
    return hourStart === null ? "—" : humanizeSince(hourStart);
  }

  protected _ariaSort(column: ProLinesSortColumn): "ascending" | "descending" | "none" {
    const sort = this._sort();
    if (sort.column !== column) {
      return "none";
    }
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  protected _arrow(column: ProLinesSortColumn): string {
    const sort = this._sort();
    if (sort.column !== column) {
      return "";
    }
    return sort.direction === "asc" ? "↑" : "↓";
  }

  /**
   * A header press. A new column starts ascending; the active column flips. One writer: the
   * preferences service, which persists the pair as a whole.
   */
  protected sortBy(column: ProLinesSortColumn): void {
    const current: ProLinesSort = this._sort();
    const next: ProLinesSort =
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" };
    this.preferences.setProLinesSort(next);
  }
}
