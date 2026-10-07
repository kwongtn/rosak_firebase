import { Component, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { chronologyStatusLabel } from "../../../insiden/data/chronology-status.util";
import type { PendingIncidentChronology } from "../data/insiden-console.queries";

/**
 * The detail panel's "Chronology deletion requests" block (spec E1): one card per LIVE
 * incident chronology flagged PENDING_DELETION, each with its admin Approve/Reject decision.
 * Purely presentational — the host IS the parent's `<section>` (attribute selector), and the
 * parent still gates its rendering on `pendingDeletionChronologies().length > 0`. The child
 * only renders and reports the two verb clicks.
 */
@Component({
  selector: "section[app-pending-deletion-requests]",
  imports: [DatePipe, HlmBadge, HlmButton],
  template: `
    <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
      Chronology deletion requests
    </h3>
    @for (chronology of chronologies(); track chronology.id) {
      <div class="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="text-muted-foreground text-xs whitespace-nowrap">
            {{ chronology.datetime | date: "MMM d, HH:mm" }}
          </span>
          <span class="text-xs">{{ chronology.content || "—" }}</span>
          @if (chronologyStatusLabel(chronology.status); as statusLabel) {
            <span hlmBadge variant="destructive">{{ statusLabel }}</span>
          }
        </div>
        <div class="flex items-center gap-2">
          <button
            hlmBtn
            size="sm"
            variant="destructive"
            class="shrink-0"
            [disabled]="mutating() || deletingId() !== null"
            (click)="approve.emit(chronology)"
          >
            {{ deletingId() === chronology.id ? "Approving…" : "Approve deletion" }}
          </button>
          <button
            hlmBtn
            size="sm"
            variant="outline"
            class="shrink-0"
            [disabled]="mutating() || deletingId() !== null"
            (click)="reject.emit(chronology)"
          >
            {{ deletingId() === chronology.id ? "Rejecting…" : "Reject deletion" }}
          </button>
        </div>
      </div>
    }
  `,
})
export class PendingDeletionRequestsComponent {
  readonly chronologies = input.required<PendingIncidentChronology[]>();
  readonly mutating = input.required<boolean>();
  readonly deletingId = input.required<string | null>();

  readonly approve = output<PendingIncidentChronology>();
  readonly reject = output<PendingIncidentChronology>();

  protected readonly chronologyStatusLabel = chronologyStatusLabel;
}
