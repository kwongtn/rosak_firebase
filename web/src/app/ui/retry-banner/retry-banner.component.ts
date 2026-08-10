import { Component, input } from "@angular/core";
import { HlmButton } from "../button/button";

/** The subset of `graphqlResource()`'s return shape this banner actually needs — kept as its
 * own minimal interface rather than importing graphqlResource's real return type, so this stays
 * usable for any other retryable-resource shape that happens to expose the same two members. */
export interface RetryableResource {
    retryCountdownSec: () => number | null;
    retryNow: () => void;
}

/**
 * Shared "couldn't load this" state for any `graphqlResource()`-backed section of a page —
 * message, a live countdown to the next automatic retry, and a "Try Now" button to skip the
 * wait. One component so every page's data-loading failure looks and behaves the same way,
 * rather than each hand-rolling its own error paragraph.
 */
@Component({
    selector: "app-retry-banner",
    imports: [HlmButton],
    template: `
        <div class="border-destructive/30 bg-destructive/5 flex flex-col items-start gap-2 rounded-lg border p-4">
            <p class="text-destructive text-sm">{{ message() }}</p>
            @if (resource().retryCountdownSec(); as countdown) {
                <p class="text-muted-foreground text-xs">Retrying in {{ countdown }}s…</p>
            }
            <button hlmBtn variant="outline" size="sm" (click)="resource().retryNow()">Try Now</button>
        </div>
    `,
})
export class RetryBannerComponent {
    readonly resource = input.required<RetryableResource>();
    readonly message = input("Couldn't load this. Please try again shortly.");
}
