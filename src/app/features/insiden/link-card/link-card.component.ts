import { Component, computed, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmBadge } from "../../../ui/badge/badge";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { LinkCardItem } from "../data/link-card-item";
import { threadLabel } from "../data/link-thread-selection.util";
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
 * 🔴 THE ANCHOR IS A STRETCHED OVERLAY, NOT A WRAPPER. The left column is a `relative` box; the
 * `<a>` is `absolute inset-0` across all of it, and the visible body sits on top as a
 * `pointer-events-none` layer, so a click anywhere on the body — the URL line, the title, ANY chip
 * — lands on the anchor and opens the link. The one thing that opts back into hit-testing is the
 * conversation toggle (`pointer-events-auto`, raised with `z-10`), because its click must EXPAND
 * rather than navigate.
 *
 * WHY IT IS BUILT THAT WAY: the chip row has to be a SIBLING of the anchor, not a descendant, or
 * the conversation affordance cannot live in it — a `<button>` inside an `<a>` is invalid HTML
 * whose click also navigates. The old card therefore parked the "N links" chip in the right rail,
 * visually detached from the Official / line-code chips it belongs beside. A stretched link buys
 * both: the chips stay clickable AND the toggle joins their row. The two costs are deliberate and
 * are why the chips' `title` explanations became `sr-only` text (a hit-tested element under an
 * overlay can have no hover tooltip, so the words moved into the accessibility tree, which is
 * where they were doing their real work anyway) and why the title is no longer selectable (the
 * overlay owns the pointer, the same trade Bootstrap's `.stretched-link` makes).
 *
 * FOUR deliberate constraints:
 * 1. Interactive controls are SIBLINGS of the anchor, never children: the vote control, the edit
 *    pencil and the conversation toggle. A click inside an anchor navigates.
 * 2. `link` is the structural `LinkCardItem`, so both the home feed node and the insiden/situasi
 *    node bind directly (no host-side mapping, no import from `features/home`).
 * 3. The relative time keeps its hover/focus tooltip (exact timestamp + submitter) and the rail
 *    stretches to the row height, so the time bottom-aligns with the body's last row instead of
 *    claiming a footer row of its own.
 * 4. The conversation affordance ("N links" + expand chevron) is part of this card, so the
 *    expansion is no longer a sibling element stacked BELOW the first link — it is now the first
 *    link's own metadata, inside the card AND inside the chip row.
 *
 * Provenance: the tag row carries two independent chips — the Pending pill (approval `status`,
 * `PENDING_APPROVAL`) and the Official chip (`isAutomated`, i.e. an automatically captured
 * operator post). Both are hidden when their axis says nothing, so a hand-submitted approved link
 * shows neither.
 *
 * 🔴 THE AFFORDANCE GATE IS `sublinkCount > 0`, NEVER `isThreadRoot`. The backend defines a root as
 * `parentId == null`, which is ALSO true of every ordinary ungrouped link (a lone link is a
 * conversation of one), so gating on `isThreadRoot` would put a "1 links" chip on every row in the
 * app. `sublinkCount` is this node's own publicly-visible descendant count at any depth, `0` for a
 * leaf, and it is derived from the SAME server loader call as `sublinks`, so the chip can never
 * advertise an expansion the host cannot reveal. The flat surfaces (the /insiden "Submitted Links"
 * tab, the situasi tab, the per-incident card) deliberately do not select `sublinkCount`; they get no
 * chip, which is correct — those lists show every link as its own row, so a "3 links" chip there
 * would point at nothing.
 *
 * Two time axes: the card DISPLAYS `occurredAt` — "when did this happen", the instant a rider
 * actually cares about, and the column every feed/queue orders on. `created` — "when did someone
 * report it" — is moderation provenance and stays the fallback (see `occurredAt` below), because
 * `occurredAt` is optional on `LinkCardItem`: every link document selects it today (the front
 * page's per-line pulse included — see FRONT_PAGE_LINES_QUERY), but the field is optional
 * per host, and `strict`/`strictNullChecks` are OFF, so a host that does not ask for it — or a
 * payload cached before the column existed — still renders a real time instead of a blank. The
 * tooltip is where the *other* axis stays reachable: when the two differ it also names the
 * submission time, so nothing is lost by promoting `occurredAt` to the visible label.
 *
 * WHAT THE CARD DOES NOT OWN: the EXPANSION state and the CHILDREN. `app-link-thread` keeps the
 * per-level `expanded` signal and renders the nested cards; this card only says "this link has N
 * links below it" and reports the click through `sublinkToggle`. That split is why the same card
 * works identically on a flat host (no `sublinkCount` selected → no chip, no wiring) and at every
 * depth of a tree, with no depth parameter anywhere in this file.
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
        <!-- The left column: a stretched-link box. The anchor is an absolutely positioned
             overlay behind everything (see the header), so the body below can be a plain
             non-interactive layer and the conversation toggle can sit in the chip row as a
             SIBLING of the anchor rather than an invalid button-inside-a-link. -->
        <div class="relative flex min-w-0 flex-1 flex-col gap-1">
          <a
            [href]="link().url"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-anchor"
            class="absolute inset-0 z-0 rounded-sm"
          >
            <!-- The overlay is empty on screen, so the link needs a name of its own now that it
                 no longer wraps the visible text. The chips stay in the reading order beside it. -->
            <span class="sr-only">{{ anchorLabel() }}</span>
          </a>

          <div class="pointer-events-none relative z-10 flex min-w-0 flex-col gap-1">
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
          </div>

          <div
            class="pointer-events-none relative z-10 flex flex-wrap items-center gap-1.5"
            data-testid="link-tags"
          >
            @for (line of link().lines; track line.id) {
              <span hlmBadge variant="outline" class="px-1.5 py-0.5 text-xs">
                {{ line.code }}
                <!-- Was a "title" tooltip; the stretched-link overlay owns the pointer, so the
                     expansion moved into the accessibility tree where it still reads. -->
                <span class="sr-only"> — {{ line.displayName }}</span>
              </span>
            }
            @if (link().status === "PENDING_APPROVAL") {
              <span
                hlmBadge
                variant="warning"
                class="self-start px-1.5 py-0.5 text-xs"
                data-testid="link-pending"
              >
                Pending
                <span class="sr-only"> — awaiting admin approval</span>
              </span>
            }
            @if (link().isAutomated === true) {
              <span
                hlmBadge
                variant="info"
                class="self-start px-1.5 py-0.5 text-xs"
                data-testid="link-official"
              >
                Official
                <span class="sr-only">
                  — captured automatically from an official operator account
                </span>
              </span>
            }

            <!-- The conversation affordance: in the CHIP ROW, and still outside the anchor
                 (see the header). Gated on sublinkCount > 0, never on isThreadRoot, which is true
                 of every ungrouped link. Reads the SHARED threadLabel, which is the app's one
                 pluralisation site; the + 1 is the off-by-one that helper's contract demands (see
                 conversationLabel). The pointer-events-auto below is load-bearing: the row inherits
                 pointer-events-none from the stretched-link layer, and without it the click would
                 fall through to the anchor and navigate instead of expanding. -->
            @if (hasSublinks()) {
              <button
                type="button"
                data-testid="link-thread-toggle"
                class="text-muted-foreground hover:bg-muted/40 hover:text-foreground pointer-events-auto flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-xs transition-colors"
                [attr.aria-expanded]="sublinksExpanded()"
                [attr.aria-label]="conversationToggleLabel()"
                (click)="sublinkToggle.emit()"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-3 shrink-0 transition-transform"
                  [class.rotate-180]="sublinksExpanded()"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                <!-- Readable text, not a bare icon: the conversation size must be learnable
                     without hovering. Pluralisation is NOT decided here — conversationLabel is
                     threadLabel. -->
                <span data-testid="link-thread-size">{{ conversationLabel() }}</span>
              </button>
            }
          </div>
        </div>

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
              <!-- Testid intentionally NOT renamed with the displayed field: "link-created" is
                   the stable DOM hook host specs assert on (home feed, /insiden, situasi). -->
              <span data-testid="link-created">{{ occurredLabel() }}</span>
              <span
                role="tooltip"
                class="bg-popover text-popover-foreground border-border pointer-events-none absolute right-0 bottom-full z-10 mb-1 flex items-center gap-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover/time:opacity-100 group-focus-within/time:opacity-100"
              >
                <span>{{ occurredAt() | date: "MMM d, y HH:mm" }}</span>
                @if (submittedAt(); as submitted) {
                  <span class="text-muted-foreground" data-testid="link-submitted">
                    Submitted {{ submitted | date: "MMM d, y HH:mm" }}
                  </span>
                }
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

  /* ---- Conversation tree (see the header's gate note) ---------------------------- *
   * `sublinkCount` is the HOST's number for this node — it is NOT read off `link`,
   * because `LinkCardItem.sublinkCount` is optional and the deliberately FLAT
   * surfaces do not select it. A wrapper that has the tree passes the count down;
   * a flat host passes nothing and gets no chip. Keeping it an explicit input also
   * means this shared card never grows an implicit dependency on the tree fields. */
  readonly sublinkCount = input(0);

  /**
   * Whether the sublinks of THIS link are currently revealed, so the chip can show the right
   * chevron direction and the right `aria-expanded`. The card does NOT own this: the wrapper
   * (`app-link-thread`) holds one signal per level, which is what makes nested levels independent.
   */
  readonly sublinksExpanded = input(false);

  /** The wrapper's toggle click. The card has no idea what will be revealed — it just reports it. */
  readonly sublinkToggle = output<void>();

  /**
   * THE gate for the affordance, and the only correct one. `sublinkCount > 0`.
   *
   * 🔴 NOT `isThreadRoot`: the backend sets that for every ungrouped link (`parentId == null`
   * IS the definition of a root), so gating on it would print a "1 links" chip on every ordinary
   * row in the app. `NaN > 0` is false, so a bad fixture degrades to "no chip" rather than to
   * "NaN links" — and `threadLabel` rejects a non-finite count for the same reason.
   */
  protected readonly hasSublinks = computed(() => this.sublinkCount() > 0);

  /**
   * "N links" for the chip, read from the app's SINGLE pluralisation site (`threadLabel`) — the
   * same helper the console chip, the My Links badge and the thread wrapper use, so no surface can
   * say "1 links" while another says "2 link".
   *
   * 🔴 THE `+ 1` IS LOAD-BEARING. `threadLabel`'s parameter is a CONVERSATION SIZE, not a
   * descendant count, and it answers `""` for anything `<= 1`. Passing the raw `sublinkCount`
   * would therefore delete the chip for a root with exactly ONE sublink (`1` → `""`), while
   * leaving every ordinary row correctly chip-less (`0` → `""` for free). That is the one hole the
   * old count parameter could not have, and it is why the helper's own docstring carries the
   * "callers pass `sublinkCount + 1`" rule. `hasSublinks()` has already established `>= 1` here,
   * so this label is never empty in practice.
   */
  protected readonly conversationLabel = computed(() => threadLabel(this.sublinkCount() + 1));

  /**
   * Accessible name for the toggle. States the ACTION and quotes the shared label, so a screen
   * reader hears both "collapse"/"expand" and the size — and the count it speaks is the very string
   * on screen, because both read `conversationLabel()`.
   */
  protected readonly conversationToggleLabel = computed(
    () =>
      `${this.sublinksExpanded() ? "Hide" : "Show"} the other links in this thread (${this.conversationLabel()})`,
  );

  /** Hostname for the Google favicon lookup — null when the URL is invalid or non-http(s). */
  protected readonly faviconDomain = computed(() => faviconHostnameOf(this.link().url));

  /**
   * The stretched link's accessible name. 🔴 IT IS EXPLICIT NOW because the anchor no longer
   * wraps the visible text: an empty overlay would otherwise be announced as a bare URL-less
   * "link". The title leads (it is what the row is about) and the raw URL follows, since a
   * reader cannot see the domain/path line as part of the link's name. The chips deliberately
   * stay OUT of it: they are separate elements in the reading order, and folding "KJL Official"
   * into every link's name is noise on a list of links.
   */
  protected readonly anchorLabel = computed(() => {
    const title = this.link().title?.trim();
    return title ? `${title} (${this.link().url})` : this.link().url;
  });

  /** Domain + path split for the URL line; the domain keeps the card's foreground colour and the
   * path is muted. Falls back to the raw URL as the domain when it can't be parsed. */
  protected readonly urlParts = computed(() => linkUrlPartsOf(this.link().url));

  protected readonly submitter = computed(() => {
    const user = this.link().user;
    return user?.nickname || user?.shortId || "";
  });

  /**
   * THE displayed instant: "when did this happen" (`occurredAt`), falling back to "when was it
   * reported" (`created`).
   *
   * The `?? created` is load-bearing, not defensive noise. `occurredAt` is optional on
   * `LinkCardItem` because it is selected per document, and `strict`/`strictNullChecks` are OFF in
   * this repo — the compiler will not tell a host that it forgot the field, and the backend column
   * is NOT NULL, so "absent" can only ever mean "this host didn't ask for it". Every surface
   * (home feed, /insiden, situasi, incident card) then shows the submission time instead of
   * nothing. Both strings are naive local wall time (backend `USE_TZ = False`,
   * `TIME_ZONE = Asia/Kuala_Lumpur`), so no offset juggling is needed — `DatePipe` and
   * `humanizeSince` both read them as local, which is what the writer meant.
   */
  protected readonly occurredAt = computed(() => this.link().occurredAt ?? this.link().created);

  /** Relative label ("3 hours ago") for the displayed instant. */
  protected readonly occurredLabel = computed(() => humanizeSince(this.occurredAt()));

  /**
   * The submission instant, surfaced in the tooltip ONLY when it differs from the displayed one —
   * `null` means "nothing extra to say". Two cases collapse to `null` on purpose:
   * - `occurredAt` absent: the displayed value IS `created`, so a second copy would be noise.
   * - both present and the same instant: `threadSize`-style redundancy on every row is noise.
   *
   * Compared by parsed instant, not by string: the backend serialises with microseconds
   * (`…:00.265464`) and `created` may arrive without a fractional part, so the same wall time can
   * be two different strings. V8 truncates the excess digits, so the parse is stable.
   */
  protected readonly submittedAt = computed(() => {
    const occurredAt = this.link().occurredAt;
    const created = this.link().created;
    if (!occurredAt) {
      return null;
    }
    return new Date(occurredAt).getTime() === new Date(created).getTime() ? null : created;
  });
}
