import { Component, computed, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmBadge } from "../../../ui/badge/badge";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { LinkCardItem } from "../data/link-card-item";
import { faviconHostnameOf } from "../data/social-link.util";
import { linkUrlPartsOf } from "../data/link-url.util";
import { VoteButtonComponent } from "../vote-button/vote-button.component";
import type { VoteValue } from "../vote-button/vote-state.util";

/**
 * One community link row — the single URL-list card shared by every surface: the home feed, the
 * /insiden "Submitted Links" tab and the situasi tab of /spotting/:lineId/details. Merged from the
 * old `app-feed-link-card` (domain/path split, relative time + exact-timestamp/submitter tooltip,
 * vote control in a right rail) and the old insiden `app-link-card` (favicon + plain-link icon
 * fallback, Pending pill, edit pencil).
 *
 * Three deliberate constraints:
 * 1. The `<a>` wraps ONLY the link body (favicon + URL + title + tags + Pending pill — all
 *    non-interactive). The vote control and edit pencil live in the right rail OUTSIDE the anchor,
 *    because a click inside an anchor navigates — interactive controls as siblings, never children.
 * 2. `link` is the structural `LinkCardItem`, so both the home feed node and the insiden/situasi
 *    node bind directly (no host-side mapping, no import from `features/home`).
 * 3. The relative time keeps its hover/focus tooltip (exact timestamp + submitter) and the rail
 *    stretches to the row height, so the time bottom-aligns with the body's last row instead of
 *    claiming a footer row of its own.
 *
 * Favicon comes from Google's s2 service; a URL whose hostname can't be extracted (or isn't
 * http/https) falls back to a plain link icon instead of a broken image. Edit gating (author or
 * admin) belongs to the host via canEditLink — this card only honours `editable`. SSR-safe: no
 * browser APIs.
 */
@Component({
  selector: "app-link-card",
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
          <span class="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            @if (faviconDomain(); as domain) {
              <img
                [src]="'https://www.google.com/s2/favicons?domain=' + domain"
                class="size-4 shrink-0 rounded-sm"
                alt=""
              />
            } @else {
              <svg
                viewBox="0 0 24 24"
                class="text-muted-foreground size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14 5h5v5M19 5 10 14M8 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"
                />
              </svg>
            }
            <span class="min-w-0 truncate"
              ><span data-testid="link-url-domain">{{ urlParts().domain }}</span
              ><span class="text-muted-foreground" data-testid="link-url-path">{{
                urlParts().restPath
              }}</span></span
            >
          </span>
          @if (link().title) {
            <span class="line-clamp-2 text-sm font-semibold">{{ link().title }}</span>
          }
          <span class="flex flex-wrap items-center gap-1.5" data-testid="link-tags">
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
            @if (!link().completed) {
              <span
                hlmBadge
                variant="warning"
                class="self-start px-1.5 py-0.5 text-xs"
                data-testid="link-pending"
                title="Awaiting admin approval"
              >
                Pending
              </span>
            }
          </span>
        </a>

        <div
          class="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch"
          data-testid="link-meta-rail"
        >
          <app-vote-button
            targetType="link"
            [incidentId]="link().id"
            [netScore]="link().voteScore ?? 0"
            [upvotes]="link().voteBreakdown?.upvotes ?? 0"
            [downvotes]="link().voteBreakdown?.downvotes ?? 0"
            [userVote]="voteValue()"
            (voteChanged)="voteChanged.emit($event)"
          />

          <div class="flex items-center gap-1.5">
            <span
              class="group/time text-muted-foreground relative inline-flex text-xs"
              tabindex="0"
              data-testid="link-time"
            >
              <span data-testid="link-created">{{ createdLabel() }}</span>
              <span
                role="tooltip"
                class="bg-popover text-popover-foreground border-border pointer-events-none absolute right-0 bottom-full z-10 mb-1 flex items-center gap-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover/time:opacity-100 group-focus-within/time:opacity-100"
              >
                <span>{{ link().created | date: "MMM d, y HH:mm" }}</span>
                @if (submitter(); as submitterName) {
                  <span class="text-muted-foreground" data-testid="link-submitter">
                    {{ submitterName }}
                  </span>
                }
              </span>
            </span>
            @if (editable()) {
              <button
                type="button"
                data-testid="link-edit"
                aria-label="Edit link"
                (click)="edit.emit(link())"
                class="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            }
          </div>
        </div>
      </div>
    </article>
  `,
})
export class LinkCardComponent {
  readonly link = input.required<LinkCardItem>();

  /** The caller's own vote for this link — the host's overlay wins over the anonymous value. */
  readonly userVote = input(0);

  /** The host's overlay carries a plain number; the vote control only accepts {-1, 0, 1}. */
  protected readonly voteValue = computed<VoteValue>(() => {
    const value = this.userVote();
    return value === 1 ? 1 : value === -1 ? -1 : 0;
  });

  /** Show the edit affordance (host gates this with canEditLink — author or admin). */
  readonly editable = input(false);

  /** Emitted with the vote control's new value after a successful vote, so the host can record
   * it (e.g. `HomeStore.setUserVote`). */
  readonly voteChanged = output<{ value: number }>();

  /** Emitted with the link when the edit pencil is clicked; the host opens the edit flow. */
  readonly edit = output<LinkCardItem>();

  /** Hostname for the Google favicon lookup — null when the URL is invalid or non-http(s). */
  protected readonly faviconDomain = computed(() => faviconHostnameOf(this.link().url));

  /** Domain + path split for the URL line; the domain keeps the card's foreground colour and the
   * path is muted. Falls back to the raw URL as the domain when it can't be parsed. */
  protected readonly urlParts = computed(() => linkUrlPartsOf(this.link().url));

  protected readonly submitter = computed(() => {
    const user = this.link().user;
    return user?.nickname || user?.shortId || "";
  });

  protected readonly createdLabel = computed(() => humanizeSince(this.link().created));
}
