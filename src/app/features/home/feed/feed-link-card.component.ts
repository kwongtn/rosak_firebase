import { Component, computed, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { VoteButtonComponent } from "../../insiden/vote-button/vote-button.component";
import type { VoteValue } from "../../insiden/vote-button/vote-state.util";
import { HlmBadge } from "../../../ui/badge/badge";
import type { FeedLink } from "../data/home.queries";
import { feedDomainOf } from "./feed-link.util";

/**
 * One row of the community feed: the source's domain, title and line tags as the link body, the
 * vote control top-right of it, and a footer carrying only the relative submit time — whose
 * hover/focus tooltip reveals the exact timestamp and the submitter. Deliberately
 * self-contained rather than composing the insiden `app-link-card`: that card's `link` input is a
 * `PublicSocialMediaLink` (requires `completed`/`vehicles`/`stations`, none of which the feed node
 * has), renders an absolute timestamp instead of a relative one, and owns the whole row with an
 * `<a>` wrapper that must not contain the interactive vote control. Here the vote control is a
 * sibling of the link body, so clicks never fight the navigation.
 */
@Component({
  selector: "app-feed-link-card",
  imports: [DatePipe, HlmBadge, VoteButtonComponent],
  template: `
    <article
      class="bg-card text-card-foreground border-border flex flex-col gap-2 rounded-xl border p-3 shadow-sm"
    >
      <div class="flex items-start gap-2">
        <a
          [href]="link().url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex min-w-0 flex-1 flex-col gap-1"
        >
          <span class="text-muted-foreground min-w-0 truncate text-xs font-medium">
            {{ domain() }}
          </span>
          @if (link().title) {
            <span class="line-clamp-2 text-sm font-semibold">{{ link().title }}</span>
          }
          @if (link().lines.length > 0) {
            <span class="flex flex-wrap items-center gap-1.5">
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

        <div class="shrink-0">
          <app-vote-button
            targetType="link"
            [incidentId]="link().id"
            [netScore]="link().voteScore"
            [upvotes]="link().voteBreakdown?.upvotes ?? 0"
            [downvotes]="link().voteBreakdown?.downvotes ?? 0"
            [userVote]="voteValue()"
            (voteChanged)="voteChanged.emit($event)"
          />
        </div>
      </div>

      <div class="flex items-center justify-end">
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

  protected readonly domain = computed(() => feedDomainOf(this.link().url));

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
