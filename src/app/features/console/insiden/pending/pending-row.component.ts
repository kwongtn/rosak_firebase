import { Component, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmTableImports } from "../../../../ui/table/table";
import { linesLabel } from "../../../../core/util/lines-label.util";
import { isPendingIncidentStatus } from "../../../insiden/data/incident-status.util";
import type { PendingIncident } from "../data/insiden-console.queries";
import { severityBadgeVariant, severityLabelText } from "./pending-incident.util";

/**
 * One row of the incident approval queue: the row's data cells plus its Approve / Reject verbs
 * (or the "Pending deletion" tag for a LIVE row). Purely presentational — the host IS the
 * `<tr>` (attribute selector), so the parent still owns the row-level `hlmTr` class, tabindex
 * and click/keydown handlers; this child only renders the cells and reports verb clicks.
 */
@Component({
  selector: "tr[app-pending-row]",
  imports: [DatePipe, HlmBadge, HlmButton, ...HlmTableImports],
  template: `
    <td hlmTd class="py-3 font-medium">{{ row().title }}</td>
    <td hlmTd class="max-w-72 py-3">
      <p class="line-clamp-2">{{ row().brief }}</p>
    </td>
    <td hlmTd class="py-3">
      <span hlmBadge [variant]="severityBadgeVariant(row().severity)">
        {{ severityLabel(row().severity) }}
      </span>
    </td>
    <td hlmTd class="py-3 whitespace-nowrap">
      {{ row().startDatetime | date: "MMM d, y HH:mm" }}
    </td>
    <td hlmTd class="py-3">
      {{ linesLabel(row().lines) || "—" }}
    </td>
    <td hlmTd class="py-3">{{ row().chronologies.length }}</td>
    <td hlmTd class="py-3 whitespace-nowrap">
      {{ row().created | date: "MMM d, y HH:mm" }}
    </td>
    <td hlmTd class="py-3">
      @if (row().status && !isPendingIncidentStatus(row().status)) {
        <span hlmBadge variant="destructive">Pending deletion</span>
      } @else {
        <div class="flex items-center gap-2">
          <button
            hlmBtn
            size="sm"
            [disabled]="mutating()"
            (click)="$event.stopPropagation(); approve.emit()"
          >
            Approve
          </button>
          <button
            hlmBtn
            size="sm"
            variant="destructive"
            [disabled]="mutating()"
            (click)="$event.stopPropagation(); reject.emit()"
          >
            Reject
          </button>
        </div>
      }
    </td>
  `,
})
export class PendingRowComponent {
  readonly row = input.required<PendingIncident>();
  readonly mutating = input.required<boolean>();

  readonly approve = output<void>();
  readonly reject = output<void>();

  protected readonly linesLabel = linesLabel;
  protected readonly isPendingIncidentStatus = isPendingIncidentStatus;
  protected readonly severityBadgeVariant = severityBadgeVariant;
  protected readonly severityLabel = severityLabelText;
}
