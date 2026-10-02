import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";

import { HlmBadge } from "../../../ui/badge/badge";
import { LinePulse } from "../data/home.queries";
import { HomeStore } from "../data/home.store";

/**
 * The Pro dashboard's LINE HQ widget: every line, and the two links that open its own page.
 *
 * The board already links to these from each row's kebab and its Pro block, but there they cost a
 * deliberate gesture on ONE row. This widget is the network-wide version: a Pro reader's question is
 * usually "where do I go for line X", and the answer is a grid of every line rather than sixteen rows
 * to hunt through.
 *
 * 🔴 **It reuses the board's own links and nothing else — no new read, no new component.** It is a
 * `computed` over `HomeStore.visibleLines()` plus two `routerLink`s, so it follows the Pro filters
 * automatically (a reader who narrowed the board sees the narrowed HQ list, which is what they meant)
 * and costs zero requests. It is the one widget on the page that needs no failure isolation for that
 * reason: there is nothing of its own that can fail.
 *
 * Each row carries BOTH destinations rather than one with a details affordance: `/spotting/:lineId` is
 * the line's page and `/spotting/:lineId/details` is its chart. A reader who cannot remember which of
 * the two they want should not have to hover a kebab to find out — and there is no kebab here, because
 * a grid of two links per line with a third control on each would be three times the tap targets for
 * the same information.
 */
@Component({
  selector: "app-pro-line-hq-widget",
  imports: [HlmBadge, RouterLink],
  template: `
    <section
      class="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
      data-testid="pro-line-hq-widget"
    >
      <h2 class="text-sm font-semibold tracking-wide uppercase">Line HQ</h2>
      @if (_lines().length === 0) {
        <p class="text-muted-foreground text-sm" data-testid="pro-line-hq-empty">No lines.</p>
      } @else {
        <ul class="flex flex-col gap-1.5" data-testid="pro-line-hq-list">
          @for (line of _lines(); track line.id) {
            <li
              class="border-border flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5"
              data-testid="pro-line-hq-row"
              [attr.data-line-id]="line.id"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                [style.background-color]="line.displayColor"
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1 truncate text-sm" data-testid="pro-line-hq-name">
                {{ line.code }} · {{ line.displayName }}
              </span>
              @if (_isBroken(line)) {
                <span hlmBadge variant="warning" data-testid="pro-line-hq-flag"
                  >Needs attention</span
                >
              }
              <a
                class="text-brand hover:underline focus-visible:ring-ring/50 rounded px-1 text-xs font-medium outline-none focus-visible:ring-2"
                [routerLink]="['/spotting', line.id]"
                data-testid="pro-line-hq-link"
                >Open</a
              >
              <a
                class="text-muted-foreground hover:underline focus-visible:ring-ring/50 rounded px-1 text-xs outline-none focus-visible:ring-2"
                [routerLink]="['/spotting', line.id, 'details']"
                data-testid="pro-line-hq-details"
                >Details</a
              >
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ProLineHqWidgetComponent {
  private readonly store = inject(HomeStore);

  /**
   * `visibleLines()`, so this grid is the SAME set of lines the board beside it is drawing.
   *
   * That is not merely tidy: a HQ list containing a line the board had filtered out would let a Pro
   * reader walk into a line's page from a grid that disagrees with every other widget on the screen,
   * with no way to tell which of them was the filter they had set.
   */
  protected readonly _lines = computed<LinePulse[]>(() => this.store.visibleLines());

  /** The same "not fully running" test the board's own severity order uses, for the row's flag. */
  protected _isBroken(line: LinePulse): boolean {
    return line.status !== "ACTIVE";
  }
}
