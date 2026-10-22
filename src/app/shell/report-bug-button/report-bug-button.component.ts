import { Component, inject } from "@angular/core";
import { FeedbackService } from "../../core/sentry/feedback.service";
import { HlmIconButton } from "../../ui/icon-button/icon-button";

/**
 * The "Report a bug" icon button shared by `<app-nav>`'s icon tray and `<app-compact-nav>`. An
 * attribute selector on `<button>` so the consumer sets only the size (`class="size-8"`).
 *
 * It opens Sentry's own User Feedback widget through `FeedbackService.openForm()` (which also
 * lazy-loads it) rather than the widget's default auto-injected floating button — this way it's
 * just another icon in the row, styled and positioned like everything else there instead of a
 * foreign-looking widget bolted onto the corner of the viewport. A plain Angular (click) binding
 * here, not Sentry's own attachTo(el) helper: attachTo grabs a specific DOM node once (originally
 * via a viewChild ref, captured inside afterNextRender) and attaches its listener directly to it —
 * but that node can end up replaced shortly after by hydration reconciliation, leaving the
 * listener stranded on an already-detached element while a fresh, listener-less button silently
 * takes its place (confirmed directly: the two were provably different, disconnected DOM nodes).
 * Angular's own (click) binding has no such failure mode — it's tied to the *template's* own
 * instructions, so it's always correctly (re)attached to whichever node is actually live.
 */
@Component({
  selector: "button[app-report-bug-button]",
  // `class` is exposed so the consumer's size class (`class="size-7"`) reaches HlmIconButton's hlm() merge.
  hostDirectives: [{ directive: HlmIconButton, inputs: ["class"] }],
  host: {
    "aria-label": "Report a bug",
    title: "Report a bug",
    "(click)": "feedback.openForm()",
  },
  template: `
    <svg
      viewBox="0 0 24 24"
      class="size-4"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  `,
})
export class ReportBugButtonComponent {
  protected readonly feedback = inject(FeedbackService);
}
