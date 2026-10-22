import {
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideBell, lucideBellOff } from "@ng-icons/lucide";

import { AuthService } from "../../../core/auth/auth.service";
import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { injectPushConfigured, injectPushService } from "../../../core/push/push-loader";
import type { PushAvailability } from "../../../core/push/push.service";
import { HlmButton } from "../../../ui/button/button";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../ui/sheet/sheet";
import type { LinePulse } from "../data/home-board.queries";

/** What the bell shows: the push service's answer, or whether this line has alerts once it is ready. */
type BellState = "loading" | Exclude<PushAvailability, "ready"> | "off" | "on";

/** The tooltip heading per state. The disabled ones say why, in the words the rider can act on. */
const BELL_TITLE: Record<BellState, string> = {
  loading: "Line alerts",
  unconfigured: "Alerts are not set up yet",
  install: "Install MLPTF to your Home Screen to get alerts",
  unsupported: "Alerts don't work in this browser",
  blocked: "Notifications are blocked in your browser settings",
  "signed-out": "Sign in to get alerts",
  off: "Get alerts for this line",
  on: "Alerts are on for this line",
};

/** The states in which a tap does nothing but explain (the tooltip opens on tap or hover). */
const INERT: ReadonlySet<BellState> = new Set([
  "loading",
  "unconfigured",
  "install",
  "unsupported",
  "blocked",
]);

/**
 * The alert bell of a pinned line row (audit F294): web push for a MAJOR incident on this line, once
 * a moderator approves it. `PushService` owns the state; this control only maps it to one button.
 *
 * The service is loaded after the first render (`injectPushService()`, a dynamic import), so the bell
 * starts as an inert placeholder of the same size, and in a build without a VAPID key it stays the
 * disabled "Alerts are not set up yet" bell without loading anything. The disabled states use
 * `aria-disabled`, never `disabled`: the button stays focusable and its tap still opens the tooltip
 * that says why, which a `disabled` button would swallow.
 *
 * Signed out, the bell starts the Google sign-in. Signed in, the FIRST tap (notification permission
 * not yet answered) opens a soft pre-prompt in the house sheet; its Allow asks the browser in the same
 * click, which the prompt needs, and Not now closes it. Once permission is granted a tap toggles the
 * line. Focus goes back to the bell whenever the sheet closes, because the sheet stays mounted
 * (hidden) and would otherwise keep it.
 */
@Component({
  selector: "app-line-alert-bell",
  imports: [HlmButton, HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader, InfoPopover, NgIcon],
  providers: [provideIcons({ lucideBell, lucideBellOff })],
  // One flex item in the row's action group: the sheet's panel is fixed, so it takes no room.
  host: { class: "inline-flex" },
  template: `
    <app-info-popover
      [label]="_title()"
      [content]="_summary"
      [showIcon]="false"
      [showMethodologyLink]="false"
      [triggerTpl]="bellTpl"
      testId="line-alert-bell-popover"
    ></app-info-popover>
    <ng-template #bellTpl>
      <button
        #bell
        hlmBtn
        size="icon-sm"
        variant="ghost"
        type="button"
        class="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        data-testid="line-alert-bell"
        [attr.data-state]="_state()"
        [attr.aria-label]="_ariaLabel()"
        [attr.aria-pressed]="_pressed()"
        [attr.aria-disabled]="_inert() ? 'true' : null"
        (click)="onBell()"
      >
        <!-- Filled while alerts are on, like the pin beside it: aria-pressed alone leaves the glyph
             saying "available" about alerts that are already on. -->
        <ng-icon
          class="size-4"
          aria-hidden="true"
          [name]="_unavailable() ? 'lucideBellOff' : 'lucideBell'"
          [class]="_state() === 'on' ? '[&>svg]:fill-current' : ''"
        />
      </button>
    </ng-template>

    <hlm-sheet side="bottom" [open]="_promptOpen()" (openChange)="onPromptOpenChange($event)">
      <!-- A dialog only while open: the closed sheet stays mounted, and a hidden aria-modal dialog
           after every pinned row could hide the rest of the page from a screen reader. -->
      <div
        class="mx-auto flex w-full max-w-lg flex-col"
        data-testid="line-alert-prompt"
        [attr.role]="_promptOpen() ? 'dialog' : null"
        [attr.aria-modal]="_promptOpen() ? 'true' : null"
        [attr.aria-labelledby]="_promptTitleId()"
      >
        <div hlmSheetHeader>
          <h2 class="text-base font-semibold" [id]="_promptTitleId()">
            Get an alert when {{ line().displayName }} has a major incident?
          </h2>
        </div>
        <div hlmSheetBody class="flex flex-col gap-2 text-sm">
          <p class="text-muted-foreground">{{ _summary }}</p>
          <p class="text-muted-foreground">
            Your browser asks next whether MLPTF may show notifications. Turn alerts off any time
            with this bell or on your profile.
          </p>
        </div>
        <div hlmSheetFooter>
          <button
            hlmBtn
            variant="outline"
            type="button"
            data-testid="line-alert-dismiss"
            (click)="closePrompt()"
          >
            Not now
          </button>
          <button hlmBtn type="button" data-testid="line-alert-allow" (click)="allow()">
            Allow
          </button>
        </div>
      </div>
    </hlm-sheet>
  `,
})
export class LineAlertBellComponent {
  readonly line = input.required<Pick<LinePulse, "id" | "code" | "displayName">>();

  private readonly injector = inject(Injector);
  private readonly configured = injectPushConfigured();
  private readonly push = injectPushService();
  private readonly bell = viewChild<ElementRef<HTMLButtonElement>>("bell");

  /** The tooltip body and the pre-prompt's explanation: the published rule, not a literal here. */
  protected readonly _summary = metricTooltip("incidents.push-alerts");
  protected readonly _promptOpen = signal(false);
  protected readonly _promptTitleId = computed(() => `line-alert-prompt-title-${this.line().id}`);

  protected readonly _state = computed<BellState>(() => {
    if (!this.configured) {
      return "unconfigured";
    }
    const push = this.push();
    if (!push) {
      return "loading";
    }
    const availability = push.availability();
    if (availability !== "ready") {
      return availability;
    }
    return push.isSubscribed(this.line().id) ? "on" : "off";
  });

  protected readonly _title = computed(() => BELL_TITLE[this._state()]);
  /** The states where alerts cannot work here at all, drawn with the crossed-out bell. */
  protected readonly _unavailable = computed(
    () => INERT.has(this._state()) && this._state() !== "loading",
  );
  /** No action: alerts cannot work here, or a change is already on its way. */
  protected readonly _inert = computed(
    () => INERT.has(this._state()) || (this.push()?.busy() ?? false),
  );
  protected readonly _pressed = computed(() => {
    const state = this._state();
    return state === "on" ? "true" : state === "off" ? "false" : null;
  });
  protected readonly _ariaLabel = computed(() => {
    const name = this.line().displayName;
    const state = this._state();
    if (state === "signed-out") {
      return `Sign in to get alerts for ${name}`;
    }
    return this._unavailable() ? `Alerts for ${name}: ${BELL_TITLE[state]}` : `Alerts for ${name}`;
  });

  protected onBell(): void {
    const push = this.push();
    // The rider may have changed the site's notification setting since this page loaded: a blocked
    // bell that is now allowed acts on this tap, and a reset one asks again.
    push?.syncPermission();
    if (!push || this._inert()) {
      return;
    }
    const state = this._state();
    if (state === "signed-out") {
      // `login()` toasts its own failure and never rejects.
      void this.injector.get(AuthService).login();
    } else if (state === "on") {
      void push.unsubscribe(this.line().id);
    } else if (state === "off") {
      if (push.needsPermission()) {
        this._promptOpen.set(true);
      } else {
        void push.subscribe({ id: this.line().id, code: this.line().code });
      }
    }
  }

  /** The pre-prompt's Allow: the browser's own prompt is asked inside this click. */
  protected allow(): void {
    const push = this.push();
    this.closePrompt();
    if (push) {
      void push.subscribe({ id: this.line().id, code: this.line().code });
    }
  }

  protected onPromptOpenChange(open: boolean): void {
    if (!open) {
      this.closePrompt();
    }
  }

  protected closePrompt(): void {
    this._promptOpen.set(false);
    this.bell()?.nativeElement.focus();
  }
}
