import { Component, input, output } from "@angular/core";
import { MediaYearCount } from "../data/gallery.queries";

/**
 * Per-year navigation aid for the gallery grid. There's no server-side year filter (see the
 * rewrite notes in docs/frontend-map/gallery.md) — clicking a year jumps to it within whatever's
 * already loaded, auto-loading more pages first if it hasn't been reached yet.
 */
@Component({
    selector: "app-gallery-year-slider",
    template: `
        <nav
            class="flex flex-row gap-1 overflow-x-auto pb-2 sm:w-24 sm:flex-col sm:overflow-visible sm:pb-0"
            aria-label="Jump to year"
        >
            @for (yc of years(); track yc.year) {
                <button
                    type="button"
                    class="hover:bg-muted flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm"
                    [class.bg-muted]="activeYear() === yc.year"
                    [disabled]="isBusy()"
                    (click)="yearSelected.emit(yc.year)"
                >
                    <span>{{ yc.year }}</span>
                    <span class="text-muted-foreground text-xs">{{ yc.count }}</span>
                </button>
            }
        </nav>
    `,
})
export class GalleryYearSliderComponent {
    readonly years = input.required<MediaYearCount[]>();
    readonly activeYear = input<number | null>(null);
    readonly isBusy = input(false);
    readonly yearSelected = output<number>();
}
