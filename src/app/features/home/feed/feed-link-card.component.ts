import { Component, computed, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { VoteButtonComponent } from "../../insiden/vote-button/vote-button.component";
import type { VoteValue } from "../../insiden/vote-button/vote-state.util";
import { HlmBadge } from "../../../ui/badge/badge";
import type { FeedLink } from "../data/home.queries";
import { feedUrlPartsOf } from "./feed-link.util";

/**
 * One row of the community feed: the source's domain + path, title and line tags as the link
 * body, with a right rail carrying the vote control at the top and the relative submit time at
 * the bottom — whose hover/focus tooltip reveals the exact timestamp and the submitter. The row
 * bottom-aligns its children and the rail stretches to the row height, so the time's bottom edge
 * coincides with the body's last row (the tags when present, otherwise the title) instead of
 * sitting in a footer row of its own. Deliberately self-contained rather than composing the
 * insiden `app-link-card`: that card's `link` input is a `PublicSocialMediaLink` (requires
 * `completed`/`vehicles`/`stations`, none of which the feed node has), renders an absolute
 * timestamp instead of a relative one, and owns the whole row with an `<a>` wrapper that must not
 * contain the interactive vote control. Here the vote control is a sibling of the link body, so
 * clicks never fight the navigation.
 */
@Component({
  selector: "app-feed-link-card",
  imports: [DatePipe, HlmBadge, VoteButtonComponent],
  template: `
    <article
      class="bg-card text-card-foreground border-border flex flex-col gap-2 rounded-xl border p-3 shadow-sm"
    >
      <div class="flex items-end gap-2">
        <a
          [href]="link().url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex min-w-0 flex-1 flex-col gap-1"
        >
          <span class="min-w-0 truncate text-xs font-medium">
            <span data-testid="feed-url-domain">{{ urlParts().domain }}</span
            ><span class="text-muted-foreground" data-testid="feed-url-path">{{
              urlParts().restPath
            }}</span>
          </span>
          @if (link().title) {
            <span class="line-clamp-2 text-sm font-semibold">{{ link().title }}</span>
          }
          @if (link().lines.length > 0) {
            <span class="flex flex-wrap items-center gap-1.5" data-testid="feed-tags">
              @for (line of link().lines; track line.id) {
                <span
                  hlmBadge
                  variant="outline"
                  class="px-1.5 py-0.5 text-xs"
                  [title]="line.displayName"
                >
                  {{ line.code }}
                </span>
              }
            </span>
          }
        </a>

        <div
          class="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch"
          data-testid="feed-meta-rail"
        >
          <app-vote-button
            targetType="link"
            [incidentId]="link().id"
            [netScore]="link().voteScore"
            [upvotes]="link().voteBreakdown?.upvotes ?? 0"
            [downvotes]="link().voteBreakdown?.downvotes ?? 0"
            [userVote]="voteValue()"
            (voteChanged)="voteChanged.emit($event)"
          />

          <span
            class="group/time text-muted-foreground relative inline-flex text-xs"
            tabindex="0"
            data-testid="feed-time"
          >
            <span data-testid="feed-created">{{ createdLabel() }}</span>
            <span
              role="tooltip"
              class="bg-popover text-popover-foreground border-border pointer-events-none absolute right-0 bottom-full z-10 mb-1 flex items-center gap-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover/time:opacity-100 group-focus-within/time:opacity-100"
            >
              <span>{{ link().created | date: "MMM d, y HH:mm" }}</span>
              @if (submitter(); as submitterName) {
                <span class="text-muted-foreground" data-testid="feed-submitter">
                  {{ submitterName }}
                </span>
              }
            </span>
          </span>
        </div>
      </div>
    </article>
  `,
})
export class FeedLinkCardComponent {
  readonly link = input.required<FeedLink>();

  /** The caller's own vote for this link — the route-scoped store's overlay wins over the
   * anonymous feed value, so the host passes `store.userVoteFor(link.id)` here. */
  readonly userVote = input(0);

  /** Emitted with the vote control's new value after a successful vote, so the host can record
   * it in the store (`HomeStore.setUserVote`). */
  readonly voteChanged = output<{ value: number }>();

  /** Domain + path split for the URL line; the domain keeps the card's foreground colour and the
   * path is muted. */
  protected readonly urlParts = computed(() => feedUrlPartsOf(this.link().url));

  /** The store's overlay carries a plain number; the vote control only accepts {-1, 0, 1}. */
  protected readonly voteValue = computed<VoteValue>(() => {
    const value = this.userVote();
    return value === 1 ? 1 : value === -1 ? -1 : 0;
  });

  protected readonly submitter = computed(() => {
    const user = this.link().user;
    return user?.nickname || user?.shortId || "";
  });

  protected readonly createdLabel = computed(() => humanizeSince(this.link().created));
}
