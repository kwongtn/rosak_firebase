import { Injectable, signal } from "@angular/core";

/**
 * Cross-page trigger for the "Add a Spotting Entry" sheet. The sheet itself is hosted once, by
 * SpottingShellPage (the common ancestor of every /spotting/** route), but the *trigger* buttons
 * live on the individual pages — line-overview and vehicle-detail. This service is the
 * decoupling point between the two. Since this sheet is now also hosted by the community front
 * page, `openFor(lineId)` additionally carries the line a card-level trigger is scoped to.
 */
@Injectable({ providedIn: "root" })
export class ReportSheetService {
  readonly isOpen = signal(false);

  /** Line the sheet should pre-select — `null` means "no seed" (start blank). */
  readonly lineId = signal<string | null>(null);

  open(): void {
    this.isOpen.set(true);
  }

  /** Opens the sheet pre-scoped to a line (mirrors LineStatusSheetService.openFor). */
  openFor(lineId: string): void {
    this.lineId.set(lineId);
    this.isOpen.set(true);
  }

  setOpen(value: boolean): void {
    this.isOpen.set(value);
  }
}
