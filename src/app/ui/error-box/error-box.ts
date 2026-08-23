import { Component, input, output } from "@angular/core";
import { HlmButton } from "../button/button";

/**
 * Compact bounded error box (the "AWS style" affordance) for surfacing a
 * failed load inline where it happened, with an optional Retry action. Used by
 * the incident/link forms' reference-data sections when their graphqlResource
 * lands in an error state.
 */
@Component({
  selector: "app-error-box",
  imports: [HlmButton],
  template: `
    <div
      class="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2.5 rounded-lg border p-3"
      role="alert"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      >
        <path
          d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4m0 4h.01"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="text-sm leading-tight font-semibold">{{ title() }}</p>
        @if (message()) {
          <p class="text-muted-foreground text-xs">{{ message() }}</p>
        }
      </div>
      @if (showRetry()) {
        <button hlmBtn variant="outline" size="sm" type="button" (click)="retry.emit()">
          Retry
        </button>
      }
    </div>
  `,
})
export class ErrorBoxComponent {
  readonly title = input("Something went wrong");
  readonly message = input("");
  readonly showRetry = input(false);
  readonly retry = output<void>();
}
