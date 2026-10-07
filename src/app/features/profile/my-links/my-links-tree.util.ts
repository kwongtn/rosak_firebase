import { threadLabel } from "../../insiden/data/link-thread-selection.util";
import { PublicSocialMediaLink } from "../../insiden/data/social-links.queries";

/**
 * Sibling-run key for the rows that are ROOTS. Ids are decimal strings from a
 * sequence column, so a value no id can take is a safe sentinel — and it makes the
 * "roots are one run" rule visible at the point the run is keyed rather than
 * hidden behind a `?? null` that reads like a missing parent.
 */
export const ROOT_RUN_KEY = "#roots";

/**
 * Which way a row moves inside its sibling run. A two-value union, not a number:
 * the sign of an offset is the kind of thing that ends up multiplied by a scale
 * factor somewhere downstream, and "up" / "down" is what the button says.
 */
export type MoveDirection = "up" | "down";

/**
 * Client-side mirror of the backend's write-side cap on tree depth
 * (`rosak_backend/incident/services/social_link_threads.py: MAX_THREAD_DEPTH = 3`,
 * a root being 0). 🔴 This is a mirror, NOT the authority: it exists so the nest
 * action can be disabled with a reason instead of offering a call the server will
 * reject, and a mirror that drifts is only ever optimistic — the backend still
 * measures the resulting depth itself and rejects the whole call as a unit. The
 * one thing it must never become is permissive past the real cap, so the
 * comparison below is "target is already at or past the cap" rather than any
 * attempt to also predict the depth of the links being moved (which is server
 * state this page does not have).
 */
export const MAX_NEST_DEPTH = 3;

/** A decimal id, the shape every link id in this feature has (GraphQL `ID`
 *  serialised from an integer primary key), used by the tie-break below to tell a
 *  numeric key from a non-numeric one rather than trusting `Number()`. */
const DECIMAL_ID = /^\d+$/;

/**
 * The order ONE SIBLING RUN is in: `position` ASC, then `id` ASC. Total, and never
 * the list's own order. Applied ONCE, where the runs are built, so the payload, the
 * move index and the "already first / already last" reasons all read the same array
 * and cannot disagree.
 *
 * WHY THIS IS THE WHOLE RULE: `reorderSocialMediaLinks` is a PERMUTATION of one
 * existing sibling set — backend `social_link_threads.py::_reorder_sync` renumbers
 * the ids it is given to `10, 20, 30, …` from the ORDER THEY ARRIVE IN and then
 * leaves every sibling it was not told about after them — so the list this
 * comparator orders IS the list the server writes. This document's rows arrive
 * `occurredAt DESC, id DESC`, a different ordering, and the backend builds a
 * conversation OLDEST-FIRST, so a conversation the user arranged arrives here
 * reversed. Permuting the arrival order would write the timeline over the story,
 * permanently, and report success.
 *
 * 🔴 WHY `id` IS A REQUIRED SECOND KEY, not a nicety: every structural write
 * renumbers a run to the exact `10, 20, 30, …` series, EXCEPT ungrouping — backend
 * `_ungroup_sync` writes `parent` ONLY ("inventing a root order nobody asked for is
 * a presentation change disguised as a repair"), so a promoted link keeps the number
 * it held under its old parent and can TIE with a root that already holds it. A
 * root's `parentId` is `null`, so every root is a sibling of every other root and
 * the ROOT run is where the collision is observable. Sorting on `position` alone
 * leaves that to the engine's sort stability, i.e. to arrival order all over again.
 *
 * The id comparison mirrors the backend's own `(position, pk)` (see
 * `schema/loaders.py::batch_load_sublink_subtrees`, which is what renders
 * `sublinks`), so a tie resolves the way the nested conversation list is DRAWN rather
 * than lexicographically — `"10"` would otherwise sort before `"9"`. Anything that is
 * not a decimal id falls back to a code-unit compare, which is still total.
 *
 * ⚠️ `position` is OPTIONAL on this row type, so the comparator has to stay total
 * over data that can be missing the key: an absent rank sorts as `0` HERE ONLY to
 * keep the comparison antisymmetric, and no decision is ever taken on that result —
 * `runOrderIsKnown` refuses the whole run while any sibling lacks a rank (see the
 * note there for why a synthesised order is not an acceptable fallback). The `0` is
 * a tie-break of last resort inside a sort, not a claim about where the row sits.
 */
export function compareStoredSequence(a: PublicSocialMediaLink, b: PublicSocialMediaLink): number {
  const leftPosition = typeof a.position === "number" ? a.position : 0;
  const rightPosition = typeof b.position === "number" ? b.position : 0;
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  if (DECIMAL_ID.test(a.id) && DECIMAL_ID.test(b.id)) {
    const left = Number(a.id);
    const right = Number(b.id);
    if (left !== right) {
      return left - right;
    }
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The three structural facts a surface derives from the loaded rows. */
export interface LinkShape {
  /** How many loaded ancestors a row has (0 when its parent is not loaded). */
  depthById: Map<string, number>;
  /** The same chains, root-first, which is what makes a nest cycle detectable. */
  ancestorsById: Map<string, string[]>;
  /** Sibling runs keyed by `parentId` (roots under `ROOT_RUN_KEY`), in stored order. */
  runs: Map<string, PublicSocialMediaLink[]>;
}

/**
 * The three structural facts about the loaded set, derived in ONE pass:
 *   - `depthById`: how many loaded ancestors a row has. A row whose parent is not loaded has
 *     an EMPTY ancestor chain and therefore depth 0 — the row is a root as far as this page can
 *     prove, and indenting it under a parent it cannot see would be a claim the payload does
 *     not support (this is what a cursor boundary between a child and its parent looks like,
 *     and it happens on every page over `MAX_THREAD_DEPTH`).
 *   - `ancestorsById`: the same chains, root-first, which is what makes a NEST cycle
 *     detectable client-side: the target is fine unless some ticked link is on its chain.
 *   - `runs`: sibling runs keyed by `parentId` (roots under `ROOT_RUN_KEY`), each in the
 *     STORED order — `position` ASC, then `id` (see `compareStoredSequence`). Reorder
 *     permutes one run, so the run is the unit the action operates on, and the run's ORDER
 *     IS the payload: these rows arrive `occurredAt DESC, id DESC`, a different ordering
 *     from the one the server stores.
 *
 * The chain walk is bounded and cycle-safe. `seen` starts holding the row's own id and the
 * loop stops on a repeat, so hand-edited cyclic data (which the backend refuses to create,
 * but which a restore could contain) cannot hang the render; such a row simply renders at
 * the depth the walk reached. Depth is a function of the `parentId` chain and nothing
 * else, so no sequence of moves can change it and the indentation cannot come to disagree
 * with the run a reorder permutes.
 */
export function buildLinkShape(links: readonly PublicSocialMediaLink[]): LinkShape {
  const parentOf = new Map<string, string | null>();
  for (const link of links) {
    parentOf.set(link.id, link.parentId ?? null);
  }
  const depthById = new Map<string, number>();
  const ancestorsById = new Map<string, string[]>();
  const runs = new Map<string, PublicSocialMediaLink[]>();
  for (const link of links) {
    const chain: string[] = [];
    const seen = new Set<string>([link.id]);
    let cursor = parentOf.get(link.id) ?? null;
    while (cursor && parentOf.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      chain.unshift(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
    ancestorsById.set(link.id, chain);
    depthById.set(link.id, chain.length);
    const runKey = link.parentId ?? ROOT_RUN_KEY;
    const run = runs.get(runKey);
    if (run) {
      run.push(link);
    } else {
      runs.set(runKey, [link]);
    }
  }
  // THE ONE PLACE THE SEQUENCE ORDER IS ESTABLISHED. Sorting here rather than at each
  // read is what makes `runOf`, `moveBlockedReason` and `moveLink` share a single answer:
  // they all take this array, so the payload a button sends and the "already first /
  // already last" reason printed on that button can never be derived from two
  // different orderings. The runs are freshly built here, so sorting in place touches
  // nothing the `_links` signal owns and re-renders are not at risk.
  for (const run of runs.values()) {
    run.sort(compareStoredSequence);
  }
  return { depthById, ancestorsById, runs };
}

/**
 * The depth ladder, as LITERAL Tailwind classes — the classes Tailwind emits are the ones
 * written out, so an interpolated one ("pl-" + n * 4) would silently produce no rule at
 * all. Clamped at the last step, which is also the deepest level the backend stores
 * (`MAX_THREAD_DEPTH = 3` admits four levels), so the clamp is unreachable for real data and
 * exists only so a hand-edited tree cannot walk off the end of the ladder.
 */
const INDENT_LADDER = ["", "pl-8", "pl-16", "pl-24", "pl-32"];

export function indentClassForDepth(depth: number): string {
  return depth >= INDENT_LADDER.length
    ? INDENT_LADDER[INDENT_LADDER.length - 1]
    : INDENT_LADDER[depth];
}

/**
 * The run of siblings this row belongs to: every LOADED row with the same `parentId`, in
 * the STORED order (`position` ASC, then `id` — sorted in `buildLinkShape`). It is NOT the
 * order the list arrived in, and it is not the order the cards are rendered in. The roots
 * are one run keyed by `ROOT_RUN_KEY`, which is what makes "reorder the roots"
 * (`parentId: null`) fall out of the same code path as a sublink run instead of needing a
 * second implementation.
 */
export function runOf(shape: LinkShape, link: PublicSocialMediaLink): PublicSocialMediaLink[] {
  return shape.runs.get(link?.parentId ?? ROOT_RUN_KEY) ?? [];
}

/**
 * Can this run's STORED order be read at all? False as soon as one sibling came back
 * without a `position`.
 *
 * 🔴 A MISSING `position` IS NOT ZERO, and the obvious `?? 0` is the bug this check
 * exists to prevent. The column is gap-spaced (`10, 20, 30, …`), so `0` does not mean
 * "before 10" — it is only the model's default for a row written outside `save()`. A
 * fallback would float the unknown row to the head of the conversation and then, because
 * a reorder is a PERMUTATION the server writes verbatim, make that guess the stored
 * sequence. A synthesised order is therefore refused rather than trusted: the button is
 * off, it says why, and nothing is sent. This is the same rule as the paging gate in
 * `moveBlockedReason` — a precondition this page cannot prove means no call.
 *
 * It is a RUNTIME check on an OPTIONAL field, which is the whole point of the guard:
 * `position` is optional on `PublicSocialMediaLink` because that type is also the node
 * of the narrow `links(first: 10)` sub-select in the incident card, and `strict` /
 * `strictNullChecks` are off, so no compiler anywhere will tell a consumer the value can
 * be missing. The console's triage table applies the identical rule to the same
 * situation, so the two surfaces cannot disagree about it.
 */
export function runOrderIsKnown(run: readonly PublicSocialMediaLink[]): boolean {
  return run.every((row) => typeof row.position === "number");
}

/**
 * The WHOLE sibling run's ids with the row at `from` spliced in at `to` — a permutation of
 * one element, never a two-item payload. `run` must already be in the stored order
 * (`compareStoredSequence`), because `reorderSocialMediaLinks` renumbers the ids it is given
 * from the order they arrive in and appends every sibling it was not told about.
 */
export function reorderedRunIds(
  run: readonly PublicSocialMediaLink[],
  from: number,
  to: number,
): string[] {
  const ordered = run.map((row) => row.id);
  ordered.splice(to, 0, ...ordered.splice(from, 1));
  return ordered;
}

/**
 * 🔴 WHY THIS `+ 1`, in one place: `threadLabel`'s parameter is a CONVERSATION SIZE — this
 * node plus its publicly-visible descendants — and it answers `""` for anything `<= 1`.
 * `sublinkCount` is the node's OWN descendant count, so a root with exactly ONE sublink
 * reports `1`, `threadLabel(1)` answers `""`, and the badge VANISHES off a row that has
 * something below it. Passing `sublinkCount + 1` also makes the empty-string case do the
 * gating for free: `0 + 1` is `1`, which is `""`, which is exactly the `sublinkCount > 0`
 * test — so the badge can never appear on a leaf and can never be `isThreadRoot`-gated.
 */
export function conversationLabelFor(link: PublicSocialMediaLink): string {
  return threadLabel((link?.sublinkCount ?? 0) + 1);
}
