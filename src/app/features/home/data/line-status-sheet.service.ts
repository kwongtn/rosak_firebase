import { Injectable, signal } from "@angular/core";

/** Route-scoped sheet controller for the line-status report form (provided by the route in a
 * later wave). Mirrors features/insiden/data/link-sheet.service.ts. */
@Injectable()
export class LineStatusSheetService {
  readonly isOpen = signal(false);

  /** Line being reported on — `null` means the sheet is closed/unset. */
  readonly lineId = signal<string | null>(null);

  /** Opens the sheet targeting a line. */
  openFor(lineId: string): void {
    this.lineId.set(lineId);
    this.isOpen.set(true);
  }

  setOpen(open: boolean): void {
    this.isOpen.set(open);
  }
}
