import { Injectable, signal } from "@angular/core";

/** Per-incident targeting context for a link submission (Task 14): set when the sheet is
 * opened from an incident card; `null` means the plain "just-dumping" flow. */
export interface LinkSheetContext {
  incidentId: string;
  /** Optional incident title for the read-only context line; falls back to the id. */
  incidentTitle?: string | null;
}

@Injectable({
  providedIn: "root",
})
export class LinkSheetService {
  readonly isOpen = signal(false);

  /** Incident being targeted — `null` means the just-dumping flow. The form renders a
   * read-only context line from this and resets it in `clear()` (close/submit) so no stale
   * context survives. */
  readonly context = signal<LinkSheetContext | null>(null);

  /** Opens the sheet. Call with a per-incident context to target an incident, or with no
   * argument to keep the just-dumping flow (backward compatible with all existing `open()`
   * call sites). */
  open(context?: LinkSheetContext): void {
    this.context.set(context ?? null);
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
  }

  setOpen(open: boolean) {
    this.isOpen.set(open);
  }
}
