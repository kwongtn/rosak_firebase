import { Component, computed, input, signal } from "@angular/core";
import { toastState } from "@spartan-ng/brain/sonner";

export type ToastVisualType = "success" | "error" | "info";

const TYPE_ICON_CLASS: Record<ToastVisualType, string> = {
  success: "text-green-600",
  error: "text-red-600",
  info: "text-sky-600",
};

/**
 * Custom sonner toast body rendered for every app notification. Sonner's default
 * toasts render this component instead of their own title/description block
 * (ToastService attaches it via `component` + `componentProps`), so it owns the
 * whole visual: a type-tinted icon, the message text, and — revealed on hover —
 * a pin button (freezes/resumes the auto-dismiss timer) and an x button (dismiss
 * immediately).
 */
@Component({
  selector: "app-toast-content",
  template: `
    <div
      class="bg-popover text-popover-foreground border-border group/toast relative flex w-full items-start gap-2.5 rounded-xl border p-3 pr-2 shadow-md"
    >
      <span class="mt-0.5 shrink-0" [class]="iconClass()">
        @if (type() === "error") {
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        } @else if (type() === "success") {
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        } @else {
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        }
      </span>

      <div class="flex min-w-0 flex-1 flex-col gap-0.5 pr-8">
        <div data-title class="text-sm font-medium">{{ title() }}</div>
        @if (description()) {
          <div data-description class="text-muted-foreground text-xs">{{ description() }}</div>
        }
      </div>

      <div
        class="absolute -top-3 -right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/toast:opacity-100"
      >
        <button
          type="button"
          class="hover:bg-muted text-muted-foreground hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
          [attr.aria-label]="pinned() ? 'Unpin notification' : 'Pin notification'"
          [attr.aria-pressed]="pinned()"
          (click)="togglePinned()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-3.5"
            aria-hidden="true"
          >
            <path
              d="M9 4h6l-1 5 3 3v2h-4v6l-1 1-1-1v-6H7v-2l3-3-1-5z"
              [attr.fill]="pinned() ? 'currentColor' : 'none'"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="hover:bg-muted text-muted-foreground hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
          aria-label="Dismiss notification"
          (click)="dismiss()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-3.5"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  `,
})
export class ToastContentComponent {
  readonly toastId = input.required<string | number>();
  readonly title = input<string>("");
  readonly description = input<string>("");
  readonly type = input<ToastVisualType>("info");

  protected readonly pinned = signal(false);

  protected readonly iconClass = computed(() => TYPE_ICON_CLASS[this.type()]);

  protected togglePinned(): void {
    const next = !this.pinned();
    this.pinned.set(next);
    toastState.create({
      id: this.toastId(),
      message: this.title(),
      description: this.description() || undefined,
      type: this.type(),
      // Infinity freezes the auto-dismiss timer; omitting it restarts the countdown
      // with the toaster's default duration.
      duration: next ? Number.POSITIVE_INFINITY : undefined,
    });
  }

  protected dismiss(): void {
    toastState.dismiss(this.toastId());
  }
}
