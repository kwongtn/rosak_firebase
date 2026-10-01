/**
 * Pure selection mechanics for the two thread-grouping surfaces: the admin console triage table
 * (`/console/links`) and "My Submitted Links" on the profile page. Both render a row
 * checkbox, a "Group into thread" action, a per-row "Ungroup" and a conversation-size chip whose
 * visible text is the `threadLabel` count itself ("2 links" — not a literal `Thread (N)`), and
 * both have to behave identically on the empty case and the one-selection case.
 *
 * The fifth export, `threadLabel`, is the one with a wider remit than these two surfaces: it is the
 * app-wide pluralisation for a link thread and is also read by the shared `app-link-card` (home
 * feed AND the flat hosts alike), so changing its contract reaches three features. Its own
 * docstring carries the exact consumer list; keep it in step with the code if a surface moves.
 *
 * WHY A SHARED MODULE, and why it is not a service: every function here is a total function of its
 * arguments — no Angular import, no `signal`, no RxJS (this repo has zero subjects in app code and
 * keeps it that way). The host owns the state (`private readonly selectedIds = signal<string[]>([])`)
 * and re-seeds it with whatever these return, so the two surfaces cannot drift on the questions
 * that actually matter: "may I group this?", "is Select-all checked?", "does this row show a
 * thread badge?".
 *
 * IMMUTABILITY IS THE WHOLE POINT, not hygiene. These results are fed straight back into a
 * signal: `this.selectedIds.set(toggleSelection(this.selectedIds(), id))`. A signal compares by
 * reference, so mutating the existing array in place produces the SAME reference, change detection
 * never fires, and the checkbox silently stops updating. Every function here therefore returns a
 * NEW array and never touches its input — the specs assert that, not just the values.
 *
 * Also note the empty-string case on the way to a mutation: `linkIds` is `[ID!]!` (non-null
 * elements) and the backend additionally rejects a repeated id, so selection is built only through
 * `toggleSelection` (idempotent, duplicate-free by construction) and filtered again at the call
 * site — never assembled by concatenation.
 */

/**
 * Add `id` to the selection when it is absent, remove it when it is present.
 *
 * Returns a NEW array in both directions — the in-place variant is the bug class this module exists
 * to prevent (see the file header). An empty string is a legal toggle target: filtering belongs at
 * the mutation boundary, where the `[ID!]!` element constraint actually applies, so the caller can
 * still count a row whose id has not resolved yet without the two behaviours disagreeing.
 *
 * Removing uses `filter`, not `slice`, so a selection that somehow contains the same id twice loses
 * EVERY copy — a `splice`-at-first-match implementation would leave a ghost selection and the row
 * would render half-checked forever.
 */
export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((existing) => existing !== id) : [...selected, id];
}

/**
 * Is a "Select all" checkbox over `ids` fully checked?
 *
 * FALSE for an empty `ids` — deliberately. `[].every(...)` is vacuously true, so the naive
 * expression renders a checked Select-all checkbox over zero rows (an empty queue, an exhausted
 * last page, a search that matched nothing). That is both a lie to the user and a trap: "select
 * all" over an empty page is an invitation to send an empty selection to a mutation.
 *
 * Order does not matter, only membership: the checkbox asks "are ALL of these selected", not
 * "is this the same set".
 */
export function areAllSelected(selected: readonly string[], ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.includes(id));
}

/**
 * May the "Group into thread" action be enabled for this selection?
 *
 * FALSE below TWO links, and returning false for exactly one is the entire point of the function.
 * A one-link conversation is a no-op that renders as NOTHING: the backend leaves that single link
 * as a root with `sublinkCount` 0, so a caller passing the conversation size (`sublinkCount + 1`)
 * hands `threadLabel` a `1` — which every one of these surfaces reads (see below) — and it answers
 * `""`, the console row's thread cell falls through to its em dash, the profile row's badge is
 * skipped, and the console's `confirmThreadCoupling` (which also keys off `threadLabel`) does not
 * ask before hiding it. The user is left with a mutation that reported success and a conversation
 * that is indistinguishable from a lone link. A caller that enables the button on a single row is
 * handing the user a silent no-op.
 *
 * Counts DISTINCT ids rather than `selected.length`: the backend rejects a repeated id outright
 * ("The selected social media links repeat an id."), so a selection that somehow acquired a
 * duplicate — two concatenated pages, say — must not read as groupable when it would only produce
 * an all-or-nothing rejection. `toggleSelection` cannot produce such a selection, so this only
 * ever makes the button stricter, never wrong.
 */
export function canGroup(selected: readonly string[]): boolean {
  return new Set(selected).size >= 2;
}

/**
 * The intersection of the selection and `ids`, in the SELECTION's order.
 *
 * This is how a host scopes a mutation to what is actually on screen: "group the current page's
 * selection only" is `selectedWithin(selectedIds, visibleLinkIds())`. Without it, a selection that
 * survives a page change (a reasonable design — the console's filter chips persist while paging)
 * would send ids the user can no longer see into a mutation whose result they cannot interpret, and
 * whose all-or-nothing rejection would then read as "grouping failed" for no visible reason.
 *
 * Never mutates either argument, and an id repeated in `ids` (a row rendered twice by a join, or
 * an optimistic row plus its refetched twin) appears once in the result — the result feeds
 * `[ID!]!` directly, where a repeat is a hard rejection.
 */
export function selectedWithin(selected: readonly string[], ids: readonly string[]): string[] {
  const visible = new Set(ids);
  return selected.filter((id) => visible.has(id));
}

/**
 * The "N links" indicator text for a conversation, or `""` for nothing at all.
 *
 * 🔴 THE PARAMETER IS A **CONVERSATION SIZE** — the node plus its publicly-visible descendants,
 * i.e. the backend's `sublinkCount + 1` — and NOT the raw `sublinkCount`. This is the single
 * most important thing to know about this function, because the two are off by one and the
 * `""`-for-`<= 1` rule below is calibrated to the first. `sublinkCount` is this node's OWN
 * descendant count (`0` for a leaf), so a caller that passes it raw gets:
 *   - `0` for a leaf → `""` → no chip ✓ (the common case, so the bug hides);
 *   - `1` for a root with exactly ONE sublink → `""` → NO CHIP, even though the conversation
 *     has something to expand — the one hole the previous count parameter could not have,
 *     because a count that included the node itself (`1 + members`) is never `1` when there
 *     is a child.
 * Callers that read a row's `sublinkCount` therefore pass `row.sublinkCount + 1`. That is not
 * busywork: it is what keeps the "1 links" pluralisation bug off every screen, which is the
 * entire reason the `<= 1` branch exists.
 *
 * `""` for an absent count and for `<= 1`, which covers the degenerate case: EVERY ungrouped
 * link is already a tree root (the backend defines a root as `parentId == null`) and has no
 * descendants, so its conversation size is `1`. Rendering "1 links" on every ordinary row
 * would put a pluralisation bug on screen and train riders to ignore the chip that actually
 * means something. An empty string also lets a host drop the chip with
 * `@if (threadLabel(row.sublinkCount + 1)) { … }` and get the right answer for free.
 *
 * 🔴 It says nothing about DEPTH. A conversation can be root -> child -> grandchild and still
 * be a "2 links" conversation, because the count is a size and not a nesting level. Nothing in
 * the app pluralises depth; do not let a second meaning creep in here.
 *
 * THE consumers, exactly (a stale list here is how a surface silently grows its own copy — re-derive
 * this list from the grep, do not add to it from memory):
 * - the console triage chip (`/console/links`, `links.component.ts` re-exposes it on the
 *   class because a template can only read members — the row's thread cell falls back to an em dash
 *   on `""`), also read by `confirmThreadCoupling` to decide whether Hide needs the coupling confirm;
 * - the "My Submitted Links" badge on the profile page (same re-exposed-on-the-class idiom);
 * - `app-link-card`'s in-card indicator: `conversationLabel = threadLabel(this.sublinkCount() + 1)`,
 *   with both the visible chip and the toggle's `aria-label` reading that one computed.
 *   ⚠️ NOT `app-link-thread`: the wrapper used to call this itself (`groupLabel = threadLabel(...)`)
 *   and no longer does — the indicator MOVED INTO THE CARD this wave, so the card is the site that
 *   owns the chip and the wrapper just renders cards. A consumer list that still names the wrapper
 *   is a list that sends the next reader to grep the wrong file, so re-derive it.
 *
 * The `+ 1` at every one of those three sites is the SAME off-by-one the parameter contract above
 * describes, and each of them had to rediscover it independently — passing the raw `sublinkCount`
 * silently deletes the chip on a root with exactly ONE sublink (the `1` → `""` case). It is not a
 * cosmetic offset: the three sites were all written against a `threadLabel` that had a different
 * count parameter a wave earlier, and every migration back to the shared helper had to carry it.
 *
 * This is the SINGLE place pluralisation is decided, app-wide, so no caller may grow its own
 * `${n} link${n === 1 ? "" : "s"}` — that is exactly how one surface ends up saying "1 links" while
 * another says "2 link", which no type and no test can catch on its own.
 *
 * The callers do NOT all need the same thing, and that is the point of the `""` branch: the two
 * table/badge sites sit on rows that may be plain ungrouped links, so they MUST be able to answer
 * `""` and drop the chip. `app-link-card` is the same story from the other side — it gates its
 * affordance on its OWN `sublinkCount` INPUT (default `0`), never on `link.sublinkCount`, and a
 * flat host that never passes the input (or passes `0`) therefore reaches `""` through it. One
 * helper serves all three because the "render nothing" decision lives in each site's gate, never in
 * the string. Do not "tighten" the `""` branch (`1` → `"1 link"`) or a chip will sprout on every
 * ordinary row in the app.
 *
 * A non-finite count (`NaN`, `Infinity`) also yields `""`: GraphQL `Int` cannot produce one, but
 * with `strict` OFF a hand-built fixture or a host that computed a count can, and "NaN links" in
 * the feed is the tell that something upstream did.
 */
export function threadLabel(sublinkCount: number | null | undefined): string {
  if (sublinkCount === undefined || sublinkCount === null || !Number.isFinite(sublinkCount)) {
    return "";
  }
  return sublinkCount > 1 ? `${sublinkCount} links` : "";
}
