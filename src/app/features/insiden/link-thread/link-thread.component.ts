import { Component, computed, input, output, signal } from "@angular/core";
import { LinkCardItem } from "../data/link-card-item";
import { LinkCardComponent } from "../link-card/link-card.component";

/**
 * Collapsible CONVERSATION wrapper around the shared link card. Renders one node as an
 * `app-link-card` and, when that node has children, reveals them indented beneath it — recursively,
 * because the tree is now arbitrary depth: a sublink can have sublinks of its own, siblings in a
 * defined order, and a leaf simply has none.
 *
 * RECURSION IS BY SELF-REFERENCE. This component lists itself in `imports`, which Angular supports
 * for standalone components (the class binding exists by the time the decorator runs, and AOT
 * resolves the self-reference statically). The alternative — extracting a sibling `app-link-branch`
 * — was not needed, and self-reference keeps one definition of "a node plus its children" instead of
 * two that could drift.
 *
 * WHY A WRAPPER STILL EXISTS AT ALL, given that the affordance moved INTO the card: the card owns
 * the count and the click; this component owns the STATE and the CHILDREN. That split is why the
 * root card keeps its own independent `expanded` signal — and so does every child instance, which is
 * what "each level expands on its own" means here. Collapsed by default, the same pattern (and the
 * same reasoning) as `app-link-list`'s "Pending (N)" section: a conversation stays out of the way
 * until a rider asks for it.
 *
 * THE APPEARANCE RULE is unchanged and still the point: the first link of a conversation renders
 * through the same `app-link-card` with the SAME inputs as a plain list row — no wrapper class, no
 * bold, no badge, no size change. If it looked different from every other link, the feed would grow
 * a second visual hierarchy for no gain. The only legitimate difference is the one extra chip in
 * the card's own right rail, which the card itself owns.
 *
 * 🔴 THE CHIP'S GATE IS `sublinkCount > 0`, NEVER `isThreadRoot`, and it lives in the card. The
 * backend defines a root as `parentId == null`, which is ALSO true of every ordinary ungrouped link
 * (a lone link is a conversation of one), so gating on it would sprout a "1 links" chip on every
 * row in the app. This component passes the count through and never reads `isThreadRoot`.
 *
 * 🔴 `userVote` (the scalar, host-supplied, ROOT-ONLY input) is deliberately NOT forwarded to nested
 * levels. It is an unkeyed number for "this row", and a nested instance would apply it to ITSELF
 * (its own `voteFor` matches on `link.id === this.link().id`), which would paint the root's
 * optimistic vote onto a child. The per-id `voteValues` overlay has no such hazard — it is keyed —
 * so that one is forwarded to every level at every depth.
 *
 * DEPTH IS NOT A CONCERN HERE. The write side caps at `MAX_THREAD_DEPTH = 3`, and the read side is
 * bounded by what the query fetched: a client asking for deeper nesting simply gets `[]`, so a leaf
 * is just a node with no `sublinks`. Nothing in this file knows or cares what the maximum is.
 *
 * Vote state and edit state are the HOST's: `voteValues` and `editable` are forwarded to every
 * descendant, and both outputs are re-emitted with the clicked/voted DESCENDANT's own id and its
 * own `LinkCardItem` — never the root's, because the emitted object is what the host's edit sheet
 * hydrates from and a wrong one would edit the wrong link. SSR-safe: no browser APIs.
 */
@Component({
  selector: "app-link-thread",
  // Self-reference: the recursion IS this component. See the header.
  imports: [LinkCardComponent, LinkThreadComponent],
  template: `
    <div class="flex flex-col gap-2" data-testid="link-thread">
      <app-link-card
        [link]="link()"
        [userVote]="voteFor(link())"
        [editable]="editable()"
        [sublinkCount]="sublinkCount()"
        [sublinksExpanded]="expanded()"
        (sublinkToggle)="expanded.set(!expanded())"
        (voteChanged)="voteChanged.emit({ id: link().id, value: $event.value })"
        (edit)="edit.emit($event)"
      />

      <!-- Indented + left rule: subordinate to the parent, unmistakably the same conversation.
           The container renders only when there is something in it, so a host that supplies a
           count without the nested selection (or a leaf whose count is 0) leaves no empty rule
           behind — and the chip it does draw stays the only trace of the affordance. -->
      @if (expanded() && children().length > 0) {
        <div
          class="border-border flex flex-col gap-2 border-l pl-3"
          data-testid="link-thread-members"
        >
          @for (child of children(); track child.id) {
            <!-- Each child is a full conversation node: its own card, its own count, its own
                 expand state, its own votes — which is the whole reason the wrapper recurses
                 instead of looping a flat list one level deep. The scalar userVote input is
                 intentionally NOT forwarded; see the header. -->
            <app-link-thread
              [link]="child"
              [voteValues]="voteValues()"
              [editable]="editable()"
              (voteChanged)="voteChanged.emit($event)"
              (edit)="edit.emit($event)"
            />
          }
        </div>
      }
    </div>
  `,
})
export class LinkThreadComponent {
  /**
   * The node this instance renders — a root when used as the host's thread wrapper, a SUBDIRECT
   * child when reached through the recursion. Typed as the shared structural `LinkCardItem`, so the
   * home feed's `FeedLink` and the insiden/situasi `PublicSocialMediaLink` bind straight in, at
   * every depth and with no host-side mapping.
   */
  readonly link = input.required<LinkCardItem>();

  /**
   * Scalar optimistic-overlay vote for the ROOT of a HOST-RENDERED thread only, for hosts that
   * track one number rather than a map. `null` (the default) means "not supplied" so the more
   * specific per-id `voteValues` entry — or the backend's own `link.userVote` — still gets a say;
   * a `0` default would be indistinguishable from "the host removed my vote" and would silently
   * win over the backend.
   *
   * 🔴 NOT forwarded to nested levels, and the reason is a correctness one, not an omission: it is
   * unkeyed, so a nested instance would match it against its OWN id and show the root's vote on a
   * child. `voteValues` is keyed by id and is safe to share; this is not.
   */
  readonly userVote = input<number | null>(null);

  /**
   * The host's per-link vote overlay, keyed by link id (see `app-link-list`: the same contract,
   * the same `?? link.userVote ?? 0` per-card fallback). Forwarded to EVERY card at EVERY depth,
   * because a sublink is votable too and the id the host keys on is that link's own.
   */
  readonly voteValues = input<Record<string, number>>({});

  /**
   * Show the edit pencil — on THIS node AND on every descendant, forwarded down the recursion.
   *
   * ⚠️ SUPERSEDED RATIONALE, restated so nobody re-derives it. This used to be root-only, hard-coded
   * `[editable]="false"` on members, with the reasoning "a collapsed group is a summary, and the
   * host's edit flow is root-driven". That reasoning sounded defensible and was wrong for the
   * product: a conversation is a set of ordinary, individually-approvable links, and a rider who
   * spot-timestamped the follow-up photo is exactly the person who should be able to fix its
   * wording or URL. The user decision is that sublinks are editable from the front page, so
   * `editable` is now forwarded to every level.
   *
   * What does NOT change is the wiring: the re-emitted `edit` still carries the clicked
   * descendant's OWN `LinkCardItem`, so the host's edit sheet hydrates from the right link.
   *
   * ⚠️ `editable` is ONE boolean for the whole conversation, so a host that computes it from the
   * ROOT (`canEdit(root)` — what the home page does) also grants a pencil on a sublink somebody
   * else submitted. That is a cosmetic over-permission only, exactly as `canEditLink`'s own
   * docstring says: the backend re-checks permission on the target link and rejects it. Per-link
   * authorship would need a predicate input here; no host asks for one, so it is deliberately
   * absent rather than speculatively added.
   */
  readonly editable = input(false);

  /** Re-emitted with the voted link's id so the host records it against the right row. */
  readonly voteChanged = output<{ id: string; value: number }>();

  /**
   * Re-emitted with the `LinkCardItem` of whichever DESCENDANT opened its pencil — never the root's.
   * The host hydrates its edit sheet from this object, so a wrapper that forwarded the root's item
   * would open the wrong link while still "working"; the spec asserts the emitted id per level.
   */
  readonly edit = output<LinkCardItem>();

  /**
   * This node's direct children, in the server's sibling `position` order. `?? []` because
   * `sublinks` is OPTIONAL on `LinkCardItem`: the flat surfaces do not select it, and a spec fixture
   * may omit it, and `strict`/`strictNullChecks` are OFF so nothing would catch the undefined.
   */
  protected readonly children = computed(() => this.link().sublinks ?? []);

  /**
   * The count handed to the card, which decides whether to draw the chip. `?? 0` for the same
   * optionality reason as `children()` — an absent count means "this host did not select it", which
   * is exactly "draw no chip".
   */
  protected readonly sublinkCount = computed(() => this.link().sublinkCount ?? 0);

  /**
   * Collapsed by default, per level and independently (one signal per component INSTANCE, so a
   * nested conversation's state is not the root's). The same pattern and the same reasoning as
   * `app-link-list`'s "Pending (N)" section.
   */
  protected readonly expanded = signal(false);

  /**
   * The vote to hand one card: the host's keyed overlay first, then the root's scalar input (this
   * node only, and only when the host supplied one — see the `userVote` note), then the anonymous
   * backend value, then 0 — identical to `app-link-list` so a link can move between a flat list
   * and a conversation without changing how its vote renders.
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
