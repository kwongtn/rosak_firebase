import { Injectable, inject, signal } from "@angular/core";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import type { PassengerStatus } from "./home.queries";

/** How a caller can pre-select a status when it already knows which one the rider meant. */
export interface OpenLineStatusOptions {
  /** Pre-selected PassengerStatus; the reader can still change it before submitting. */
  presetStatus?: PassengerStatus;
}

/** Route-scoped sheet controller for the line-status report form (provided by the route in a
 * later wave). Mirrors features/insiden/data/link-sheet.service.ts. */
@Injectable()
export class LineStatusSheetService {
  private readonly preferences = inject(PreferencesService);

  readonly isOpen = signal(false);

  /** Line being reported on — `null` means the sheet is closed/unset. */
  readonly lineId = signal<string | null>(null);

  /**
   * A status the sheet should open WITH selected, or `null` for "start blank".
   *
   * This exists for one caller — the report chooser's "Stopped" tile, which is the rider's word for
   * the existing `DISRUPTED` status and nothing else. It is a **one-shot**, consumed by the sheet on
   * its open edge exactly the way `ReportSheetService.lineId` is consumed by the spotting form: a
   * later seedless open (the board's own per-row "Report" button) must not resurrect a status
   * from a report that was already submitted or cancelled.
   */
  readonly presetStatus = signal<PassengerStatus | null>(null);

  /** Opens the sheet targeting a line, optionally with a status already selected. */
  openFor(lineId: string, options?: OpenLineStatusOptions): void {
    this.lineId.set(lineId);
    this.presetStatus.set(options?.presetStatus ?? null);
    this.isOpen.set(true);
    // Opening the form for a line is the reader's last report intent, and it is what the "Report on
    // {line}" shortcut repeats. Recorded here rather than only on submit, so a reader who opens the
    // form and closes it still gets the shortcut to the line they were working on.
    this.preferences.setLastReportedLine(lineId);
  }

  setOpen(open: boolean): void {
    this.isOpen.set(open);
  }
}
