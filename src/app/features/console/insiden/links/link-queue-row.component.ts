import { DatePipe } from "@angular/common";
import { Component, input, output } from "@angular/core";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmTableImports } from "../../../../ui/table/table";
import type { SocialMediaLinkRow } from "../data/insiden-console.queries";
import { LinkUrlCellComponent } from "./link-url-cell.component";

/**
 * ONE row of the `/console/links` triage table, extracted so the parent's template
 * is only the table shell and the row loop. Purely presentational: it owns no state
 * and calls nothing — every action is an `output()` the parent handles, and every
 * gate is a boolean/string INPUT the parent computes (`canMoveUp`, `moveUpTitle`,
 * `chipLabel` …). The parent keeps the whole behaviour surface the spec drives.
 *
 * The host IS the `<tr>` (attribute selector), so the table markup stays valid and
 * the parent supplies the row-level attributes/events (`hlmTr`, `(click)`,
 * `[class.bg-muted/40]`) exactly as before — the child only renders the cells.
 */
@Component({
  selector: "tr[app-link-queue-row]",
  imports: [DatePipe, HlmBadge, HlmButton, ...HlmTableImports, LinkUrlCellComponent],
  templateUrl: "./link-queue-row.component.html",
})
export class LinkQueueRowComponent {
  readonly link = input.required<SocialMediaLinkRow>();
  readonly depth = input(0);
  readonly childCount = input(0);
  readonly expanded = input(false);
  readonly selected = input(false);
  readonly queueIsComplete = input(false);
  readonly nestSelectionReady = input(false);
  readonly isLoading = input(false);
  readonly isDeleting = input(false);
  readonly canMoveUp = input(false);
  readonly canMoveDown = input(false);
  readonly canNestUnder = input(false);
  /** The constant hover/aria help copy for each icon-only verb (from the parent). */
  readonly moveUpHelp = input("");
  readonly moveDownHelp = input("");
  readonly nestHelp = input("");
  /** The blocked reason for the row, or `null` when the verb is live. */
  readonly moveUpBlocked = input<string | null>(null);
  readonly moveDownBlocked = input<string | null>(null);
  readonly nestBlocked = input<string | null>(null);
  /** `threadLabel(sublinkCount + 1)` — the chip's visible text, `""` when absent. */
  readonly chipLabel = input("");
  /** `threadLabel(childCount + 1)` — the chevron's aria-label count. */
  readonly toggleLabel = input("");
  /** `!isSameMinute(created, occurredAt)` — whether the Submitted cell gets its second line. */
  readonly showOccurred = input(false);

  readonly selectionToggle = output<void>();
  readonly conversationToggle = output<void>();
  readonly approve = output<void>();
  readonly hide = output<void>();
  readonly markCompleted = output<void>();
  readonly moveUp = output<void>();
  readonly moveDown = output<void>();
  readonly nestUnder = output<void>();
  readonly ungroup = output<void>();
  readonly remove = output<void>();
}
