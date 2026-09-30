import { Component, computed, input, output, signal } from "@angular/core";
import { HlmButton } from "../../../ui/button/button";
import { LinkCardItem } from "../data/link-card-item";
import { threadLabel } from "../data/link-thread-selection.util";
import { LinkCardComponent } from "../link-card/link-card.component";

/**
 * Collapsible thread wrapper around the shared link card: the thread ROOT renders through
 * `app-link-card` and, when the group actually has members, a "N links" indicator + chevron reveals
 * every other link of the thread underneath it.
 *
 * The root is rendered through the same `app-link-card` with the SAME inputs as a plain list row —
 * no wrapper class, no bold, no badge, no size change. That is a product decision, not an
 * oversight: the first link of a group is just the first thing a rider sees, and if it looked
 * different from every other link the feed would grow a second visual hierarchy for no gain. So
 * this component's whole UI budget is the affordance, which sits BESIDE the card in its own row
 * (`flex flex-col` stack), never inside it.
 *
 * The affordance gate is `threadLinks.length > 0`, deliberately NOT `isThreadRoot`: the backend
 * defines a root as `thread == null`, which is also true of every ordinary unthreaded link, so
 * gating on it would sprout a "1 links" badge on every single row in the app. `threadLinks` is the
 * list actually revealed, so its length is the only honest test for "there is something to expand"
 * (and `threadSize` alone is not enough either — a host may select the count without the members).
 *
 * Every string this component shows is composed from the SHARED `threadLabel` helper
 * (`data/link-thread-selection.util.ts`), not from a local template literal. That module is the
 * single place pluralisation is decided for link threads across the app, and this badge is one of
 * the surfaces it was written for; a third `${n} link${n === 1 ? "" : "s"}` here would be free to
 * drift and nothing in the type system or the build would notice.
 *
 * Depth is 1 by model invariant (`thread` always points at a root), so members are rendered with
 * no thread UI of their own and there is no recursion: a member's own `threadSize`, should a
 * document ever select it, cannot open a nested group.
 *
 * Vote state is the HOST's, not this component's: `voteValues` is forwarded to every card in the
 * group (root and members included) so an optimistic overlay keys off the right link id. SSR-safe:
 * no browser APIs.
 */
@Component({
  selector: "app-link-thread",
  imports: [HlmButton, LinkCardComponent],
  template: `
    <div class="flex flex-col gap-2" data-testid="link-thread">
      <app-link-card
        [link]="link()"
        [userVote]="voteFor(link())"
        [editable]="editable()"
        (voteChanged)="voteChanged.emit({ id: link().id, value: $event.value })"
        (edit)="edit.emit($event)"
      />

      @if (members().length > 0) {
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          data-testid="link-thread-toggle"
          class="text-muted-foreground hover:text-foreground self-start text-xs"
          [attr.aria-expanded]="expanded()"
          [attr.aria-label]="toggleLabel()"
          (click)="expanded.set(!expanded())"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-3.5 shrink-0 transition-transform"
            [class.rotate-180]="expanded()"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          <!-- Readable text, not a bare icon: the group size must be learnable without hovering.
               Pluralisation is NOT decided here: groupLabel is the shared threadLabel. -->
          <span data-testid="link-thread-size">{{ groupLabel() }}</span>
        </button>

        @if (expanded()) {
          <!-- Indented + left rule: subordinate to the root, unmistakably inside the same group. -->
          <div
            class="border-border flex flex-col gap-2 border-l pl-3"
            data-testid="link-thread-members"
          >
            @for (member of members(); track member.id) {
              <app-link-card
                [link]="member"
                [userVote]="voteFor(member)"
                [editable]="false"
                (voteChanged)="voteChanged.emit({ id: member.id, value: $event.value })"
                (edit)="edit.emit($event)"
              />
            }
          </div>
        }
      }
    </div>
  `,
})
export class LinkThreadComponent {
  /**
   * The thread ROOT. Typed as the shared structural `LinkCardItem`, not a link-list type, so both
   * the home feed's `FeedLink` and the insiden/situasi `PublicSocialMediaLink` bind straight in.
   * Its own `threadLinks`/`threadSize` are what this component reads — the card ignores them.
   */
  readonly link = input.required<LinkCardItem>();

  /**
   * Scalar optimistic-overlay vote for the ROOT only, for hosts that track one number rather than
   * a map. `null` (the default) means "not supplied" so the more specific per-id `voteValues`
   * entry — or the backend's own `link.userVote` — still gets a say; a `0` default would be
   * indistinguishable from "the host removed my vote" and would silently win over the backend.
   */
  readonly userVote = input<number | null>(null);

  /**
   * The host's per-link vote overlay, keyed by link id (see `app-link-list`: the same contract,
   * the same `?? link.userVote ?? 0` per-card fallback). Forwarded to EVERY card here, because a
   * member is votable too and the id the host keys on is the member's own.
   */
  readonly voteValues = input<Record<string, number>>({});

  /** Show the edit pencil on the root (host gates with canEditLink). Members are read-only: a
   *  collapsed group is a summary, and the host's edit flow is root-driven. */
  readonly editable = input(false);

  /** Re-emitted with the voted link's id so the host records it against the right row. */
  readonly voteChanged = output<{ id: string; value: number }>();

  /** Re-emitted from whichever card opened its pencil. */
  readonly edit = output<LinkCardItem>();

  /** The thread's members (backend: publicly-visible, `occurredAt ASC`). Empty for an unthreaded
   *  link, which is what keeps the affordance off a single row. */
  protected readonly members = computed(() => this.link().threadLinks ?? []);

  /**
   * "N links" for the indicator. The backend's `threadSize` is `1 + publicly-visible members`, so
   * it already counts the root; a host that selects only the members gets the local count, which
   * is the same number by construction.
   */
  protected readonly totalCount = computed(() => {
    const size = this.link().threadSize;
    return size && size > 1 ? size : this.members().length + 1;
  });

  /**
   * THE pluralisation decision for this component, and nothing else is allowed to make one.
   *
   * `threadLabel` is the shared helper the console chip and My Links already use, and its own
   * docstring names this component's badge as a caller it exists to serve: if the card badge grew
   * its own `${n} links` template, one surface would say "1 links" while the other said "2 link",
   * and nothing would catch it. So both text sites below read THIS ONE computed — the visible
   * indicator and the toggle's accessible name — and neither re-derives a noun.
   *
   * It is `""` for a size of `<= 1`, which the `members().length > 0` gate already rules out; the
   * belt-and-braces emptiness is what keeps a degenerate fixture from putting "1 links" on screen.
   */
  protected readonly groupLabel = computed(() => threadLabel(this.totalCount()));

  /**
   * Collapsed by default — the same pattern (and the same reasoning) as `app-link-list`'s
   * "Pending (N)" section: a group stays out of the way until a rider asks for it.
   */
  protected readonly expanded = signal(false);

  /** Accessible name for the toggle; the visible "N links" text is the same fact, so the label
   *  states the ACTION (a screen reader hears "collapse" vs "expand" from `aria-expanded` alone,
   *  but naming it keeps the two in sync and the count spoken too).
   *
   *  It quotes `groupLabel()` rather than counting the members again: the number a rider cares
   *  about is the size of the WHOLE group, and a private `members().length === 1 ? "" : "s"` here
   *  would be the third pluralisation site in the app — the exact duplication `threadLabel` exists
   *  to prevent, and the reason a member count cannot be phrased through the helper at all
   *  (`threadLabel(1)` is `""` by design, for a different caller). */
  protected readonly toggleLabel = computed(
    () =>
      `${this.expanded() ? "Hide" : "Show"} the other links in this thread (${this.groupLabel()})`,
  );

  /**
   * The vote to hand one card: the host's keyed overlay first, then the root's scalar input (root
   * only), then the anonymous backend value, then 0 — identical to `app-link-list` so a link can
   * move between the flat list and a thread without changing how its vote renders.
   */
  protected voteFor(link: LinkCardItem): number {
    const overlay = this.voteValues()[link.id];
    if (overlay !== undefined) {
      return overlay;
    }
    if (link.id === this.link().id) {
      const rootVote = this.userVote();
      if (rootVote !== null && rootVote !== undefined) {
        return rootVote;
      }
    }
    return link.userVote ?? 0;
  }
}
