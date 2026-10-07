import { Component, computed, inject } from "@angular/core";

import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { HlmBadge } from "../../../ui/badge/badge";
import type { FeedLink } from "../data/home.queries";
import { HomeStore } from "../data/home.store";

/**
 * The Pro dashboard's OFFICIAL NOTICES archive: what the operator has actually said, newest first.
 *
 * 🔴 **It is the surfacing half of the "official lane", not a data project.** The backend has ingested
 * official operator posts into `SocialMediaLink(is_automated = True)` for some time and `FEED_QUERY`
 * already selects `isAutomated`, so this panel is a filter and a list over a read that already exists
 * — the store's archive read (`OFFICIAL_NOTICES_VARS`) is the feed's own document with a bigger page
 * and no service-day window, and the `isAutomated === true` filter is client-side. That was the plan's
 * own condition for adding a backend `isAutomated` argument ("only if client-side filtering proves
 * insufficient"), and it is not needed: the page is small and the flag is already on the wire.
 *
 * **Read-only, and that is deliberate — it is what keeps this widget outside the vote-overlay
 * invariant.** The six page-critical feed reads share variables and page shape because the feed renders
 * VOTABLE cards and an id-keyed overlay must cover exactly the ids that are drawn. This panel draws
 * no votes and no edit affordance: a row is a statement of record, and the useful action on one is to
 * read the operator's own words. The moment someone wants to upvote an official post here, this
 * widget stops being a reader and becomes a feed surface — at which point `loadVoteOverlay()` has to
 * cover its ids too, and that is a deliberate, documented change rather than a quiet one. The rows
 * link OUT to the operator's own page (`target="_blank" rel="noopener noreferrer"`, as the hero's
 * official callout already does) precisely so nothing on this page can be mistaken for the operator
 * speaking here.
 *
 * 🔴 **Its own lazy, isolated read.** It opts in explicitly (`store.requestOfficialNotices()`), hides
 * itself on `officialNoticesFailed`, and renders nothing while `officialNoticesLoading` — the store
 * keeps it out of `hasError` / `isLoading` / `isRefreshing` / `reloadAll()`, so an archive that will
 * not load cannot put the page's retry banner over a working board. Same asymmetry as the incidents
 * widget and the history widgets; see the store's block for why the gate has to come from here.
 *
 * **NO WINDOW CLAIM.** The read sends no window flags, so this is the newest public links of all time
 * filtered to the official ones, and the sub-label says "newest first · showing N" rather than
 * "today" or "this week". An operator statement from last month is still one, and inventing a
 * client-side window would need a `new Date()` in query variables — which breaks SSR's variable
 * equality. The honest alternative to a computed window was a backend argument, which would be a
 * contract change for a panel that reads newest-first anyway.
 *
 * The empty state is a sentence rather than a blank panel: "no official post in the newest public
 * links" is a real, answerable claim about what was read, and a Pro reader can tell that apart from a
 * failure — which renders nothing at all.
 */
@Component({
  selector: "app-pro-official-widget",
  imports: [HlmBadge],
  template: `
    @if (!_failed() && !_loading()) {
      <section
        class="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
        data-testid="pro-official-widget"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold tracking-wide uppercase">Official notices</h2>
          <span class="text-muted-foreground text-xs tabular-nums" data-testid="pro-official-count">
            Newest first · showing {{ _notices().length }}
          </span>
        </div>

        @if (_notices().length === 0) {
          <!-- A real answer, not a placeholder: the read SUCCEEDED and the newest public page holds
               no official post. Saying which is what keeps it distinguishable from a failed read,
               which renders nothing at all. -->
          <p class="text-muted-foreground text-sm" data-testid="official-notice-empty">
            No official post in the newest public links.
          </p>
        } @else {
          <ul class="flex flex-col gap-1.5" data-testid="official-notice-list">
            @for (notice of _notices(); track notice.id) {
              <li
                class="border-border flex flex-col gap-1 rounded-lg border px-2.5 py-1.5"
                data-testid="official-notice"
              >
                <div class="flex items-baseline gap-2">
                  <!-- The operator's own headline, never a paraphrase. A Pro reader deciding whether
                       a fault is announced needs the words the operator used. -->
                  <span class="min-w-0 flex-1 text-sm" data-testid="official-notice-title">
                    {{ notice.title }}
                  </span>
                  <!-- occurredAt, never created: "when the event happened" against "when the
                       ingestion wrote the row". Naive local wall time on the wire, and
                       humanizeSince is what the feed's own cards and the spotting rows already
                       use for this, so one instant reads the same way everywhere on the site. -->
                  <span
                    class="text-muted-foreground shrink-0 text-xs"
                    data-testid="official-notice-since"
                    [attr.title]="'Occurred ' + notice.occurredAt"
                  >
                    {{ _since(notice) }}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  @for (line of notice.lines; track line.id) {
                    <span hlmBadge variant="neutral" data-testid="official-notice-line">
                      {{ line.code }}
                    </span>
                  }
                  <!-- The operator's own page, opened in a new tab. noopener because a link to
                       somewhere we do not control must not get a handle on this page. -->
                  <a
                    class="text-brand hover:underline focus-visible:ring-ring/50 rounded px-1 text-xs underline underline-offset-2 outline-none focus-visible:ring-2"
                    [href]="notice.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="official-notice-link"
                  >
                    Open original
                  </a>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class ProOfficialWidgetComponent {
  private readonly store = inject(HomeStore);

  /** The store's already-filtered official rows — the `isAutomated === true` filter lives in the
   *  store, so this widget has no second copy of the definition to drift from. */
  protected readonly _notices = computed<FeedLink[]>(() => this.store.officialNotices());

  /** The resource's OWN flags. Never `HomeStore.hasError()` / `isLoading()`. */
  protected readonly _failed = this.store.officialNoticesFailed;
  protected readonly _loading = this.store.officialNoticesLoading;

  /** "3 hours ago" — the shared relative stamp, not a second spelling of it. */
  protected _since(notice: FeedLink): string {
    return humanizeSince(notice.occurredAt);
  }

  constructor() {
    // 🔴 The opt-in IS the laziness. `graphqlResource` installs an effect that reads its
    // `httpResource` at call time, so an unrequested store-constructed resource fires the moment the
    // store exists — every Rider visit and every feed-focused spec would pay for an archive nothing
    // renders. Same arrangement as the incidents and history reads.
    this.store.requestOfficialNotices();
  }
}
