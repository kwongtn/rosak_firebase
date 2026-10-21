import { Component, inject } from "@angular/core";

import { OnlineService } from "../../core/network/online.service";

/**
 * The slim "You're offline" strip rendered under the nav (`<app-nav>` and `<app-compact-nav>`)
 * while `OnlineService` reports no connection. Non-blocking: it is a line of text, not an overlay,
 * and nothing on the page is disabled because of it.
 *
 * The host is the live region and is always rendered (empty while online): a status region that
 * is inserted together with its text is not reliably announced, one whose content changes is.
 */
@Component({
  selector: "app-offline-strip",
  host: { class: "block", role: "status", "aria-live": "polite" },
  template: `
    @if (!online.isOnline()) {
      <p data-testid="offline-strip" class="bg-muted text-foreground px-4 py-1 text-center text-xs">
        You're offline. What you see may be out of date until you reconnect.
      </p>
    }
  `,
})
export class OfflineStripComponent {
  protected readonly online = inject(OnlineService);
}
