import { Component, computed, input, output } from "@angular/core";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { VoteButtonComponent } from "../../insiden/vote-button/vote-button.component";
import type { VoteValue } from "../../insiden/vote-button/vote-state.util";
import { HlmBadge } from "../../../ui/badge/badge";
import type { FeedLink } from "../data/home.queries";
import { feedDomainOf } from "./feed-link.util";

/**
 * One row of the community feed: the source's domain, title and line tags as the link body, with
 * a footer carrying the vote control, the submitter and the relative submit time. Deliberately
 * self-contained rather than composing the insiden `app-link-card`: that card's `link` input is a
 * `PublicSocialMediaLink` (requires `completed`/`vehicles`/`stations`, none of which the feed node
 * has), renders an absolute timestamp instead of a relative one, and owns the whole row with an
 * `<a>` wrapper that must not contain the interactive vote control. Here the vote control is a
 * sibling of the link body, so clicks never fight the navigation.
 */
@Component({
  selector: "app-feed-link-card",
  imports: [HlmBadge, VoteButtonComponent],
  template: `
    <article
      class="bg-card text-card-foreground border-border flex flex-col gap-2 rounded-xl border p-3 shadow-sm"
    >
      <a
        [href]="link().url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex min-w-0 flex-col gap-1"
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

      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <app-vote-button
          targetType="link"
          [incidentId]="link().id"
          [netScore]="link().voteScore"
          [userVote]="voteValue()"
          (voteChanged)="voteChanged.emit($event)"
        />
        @if (submitter(); as submitterName) {
          <span class="text-muted-foreground min-w-0 truncate text-xs" data-testid="feed-submitter">
            {{ submitterName }}
          </span>
        }
        <span class="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap">
          {{ createdLabel() }}
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
