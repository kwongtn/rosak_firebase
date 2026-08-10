import { Injectable, signal } from "@angular/core";

/**
 * Cross-page trigger for the "Add a Spotting Entry" sheet. The sheet itself is hosted once, by
 * SpottingShellPage (the common ancestor of every /spotting/** route), but the *trigger* buttons
 * live on the individual pages — line-overview and vehicle-detail. This service is the
 * decoupling point between the two.
 */
@Injectable({ providedIn: "root" })
export class ReportSheetService {
    readonly isOpen = signal(false);

    open(): void {
        this.isOpen.set(true);
    }

    setOpen(value: boolean): void {
        this.isOpen.set(value);
    }
}
