import { Injectable, signal } from "@angular/core";
import type { CalendarIncident } from "./insiden.queries";

@Injectable({
  providedIn: "root",
})
export class IncidentSheetService {
  readonly isOpen = signal(false);

  /** Incident being edited — `null` means the sheet is in create mode. The form hydrates
   * from this on open and resets it on clear/close so no stale edit survives. */
  readonly editTarget = signal<CalendarIncident | null>(null);

  /** Opens the sheet. Call with an incident to edit it, or with no argument to keep
   * the create flow (backward compatible with all existing `open()` call sites). */
  open(incident?: CalendarIncident): void {
    this.editTarget.set(incident ?? null);
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
  }

  setOpen(open: boolean) {
    this.isOpen.set(open);
  }
}
