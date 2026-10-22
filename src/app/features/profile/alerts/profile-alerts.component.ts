import { DOCUMENT } from "@angular/common";
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  viewChild,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideX } from "@ng-icons/lucide";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { injectPushService } from "../../../core/push/push-loader";
import type { PushAvailability } from "../../../core/push/push.service";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { HlmCardImports } from "../../../ui/card/card";
import { InfoPopover } from "../../../ui/info-popover/info-popover";

/** Why this browser cannot take new alerts, where it cannot. Lines it already has stay listed. */
const AVAILABILITY_NOTE: Partial<Record<PushAvailability, string>> = {
  install: "Install MLPTF to your Home Screen to get alerts.",
  unsupported: "Alerts don't work in this browser.",
  blocked: "Notifications are blocked in your browser settings.",
};

/**
 * The own profile's "Alerts" card (audit F294): the lines this browser gets web push alerts for, as
 * chips that each turn one line off, and "Turn off all alerts". New alerts are turned on from the bell
 * of a pinned line on the front page, so an empty card points there.
 *
 * It reads `PushService`, loaded after the first render (`injectPushService()`), and is absent until
 * then and for good in a build without a VAPID key. The lines are this BROWSER's, from its stored
 * token, restored from the backend on sign-in; another device has its own.
 *
 * A removed chip takes its focused button with it, so focus moves to the card's heading, which
 * would otherwise fall to `body`. Busy controls use `aria-disabled` for the same reason.
 */
@Component({
  selector: "app-profile-alerts",
  imports: [...HlmCardImports, HlmBadge, HlmButton, InfoPopover, NgIcon, RouterLink],
  providers: [provideIcons({ lucideX })],
  // Absent until the service lands: a box-less host leaves no gap in the page's column meanwhile.
  host: { class: "contents" },
  template: `
    @if (_push(); as push) {
      <div hlmCard data-testid="profile-alerts">
        <div hlmCardHeader>
          <h2 #heading hlmCardTitle tabindex="-1" class="outline-none">
            <app-info-popover
              label="Alerts"
              iconPosition="end"
              testId="profile-alerts-popover"
              triggerClasses="cursor-help"
              [content]="_definition"
              [link]="_methodologyLink"
            >
              <span class="hover:underline">Alerts</span>
            </app-info-popover>
          </h2>
          <p hlmCardDescription>
            A notification on this browser when a line you follow has a major incident.
          </p>
        </div>
        <div hlmCardContent class="items-start">
          @if (push.lines().length > 0) {
            <ul class="flex flex-wrap gap-2" aria-label="Lines with alerts">
              @for (line of push.lines(); track line.id) {
                <li
                  hlmBadge
                  variant="secondary"
                  class="gap-0.5 pr-0.5"
                  data-testid="profile-alert-line"
                >
                  {{ line.code }}
                  <button
                    type="button"
                    class="hover:bg-background focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2 aria-disabled:opacity-50"
                    data-testid="profile-alert-remove"
                    [attr.aria-label]="'Turn off alerts for ' + line.code"
                    [attr.aria-disabled]="push.busy() ? 'true' : null"
                    (click)="remove(line.id)"
                  >
                    <ng-icon name="lucideX" class="size-3" aria-hidden="true" />
                  </button>
                </li>
              }
            </ul>
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              class="aria-disabled:opacity-50"
              data-testid="profile-alerts-off"
              [attr.aria-disabled]="push.busy() ? 'true' : null"
              (click)="turnOff()"
            >
              Turn off all alerts
            </button>
          } @else {
            <p class="text-muted-foreground text-sm" data-testid="profile-alerts-empty">
              No alerts on this browser yet. Pin a line on the
              <a routerLink="/" class="text-primary underline-offset-4 hover:underline"
                >front page</a
              >, then tap its bell.
            </p>
          }
          @if (_note(); as note) {
            <p class="text-muted-foreground text-sm" data-testid="profile-alerts-note">
              {{ note }}
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class ProfileAlertsComponent {
  protected readonly _push = injectPushService();
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly heading = viewChild<ElementRef<HTMLElement>>("heading");

  protected readonly _definition = metricTooltip("incidents.push-alerts");
  protected readonly _methodologyLink = {
    text: "When an alert is sent",
    routerLink: "/methodology",
    fragment: "episodes",
  };
  protected readonly _note = computed(() => {
    const push = this._push();
    return push ? (AVAILABILITY_NOTE[push.availability()] ?? null) : null;
  });

  protected async remove(lineId: string): Promise<void> {
    const push = this._push();
    if (!push || push.busy()) {
      return;
    }
    await push.unsubscribe(lineId);
    this.keepFocus();
  }

  protected async turnOff(): Promise<void> {
    const push = this._push();
    if (!push || push.busy()) {
      return;
    }
    await push.turnOff();
    this.keepFocus();
  }

  /** After the render that drops the chips: focus that fell to `body` goes to the heading. */
  private keepFocus(): void {
    afterNextRender(
      () => {
        if (this.document.activeElement === this.document.body) {
          this.heading()?.nativeElement.focus();
        }
      },
      { injector: this.injector },
    );
  }
}
