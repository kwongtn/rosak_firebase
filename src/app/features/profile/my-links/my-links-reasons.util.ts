import { MAX_NEST_DEPTH, MoveDirection } from "./my-links-tree.util";

/**
 * Everything `moveBlockedReason` needs to judge one row's move, gathered by the host from its
 * own state and the row's STORED sibling run (`runOf`/`buildLinkShape`).
 */
export interface MoveGate {
  isBrowser: boolean;
  isThreading: boolean;
  hasMore: boolean;
  /** False as soon as one sibling arrived without a stored `position` (`runOrderIsKnown`). */
  runOrderKnown: boolean;
  /** The row's index inside its stored run; `-1` when it is no longer present. */
  index: number;
  runLength: number;
  direction: MoveDirection;
}

/**
 * May this row move one step inside its run? `null` means yes.
 *
 * The order of these checks is the order of how much they would mislead:
 *   1. an in-flight write, because the run on screen is about to be replaced;
 *   2. an INCOMPLETE run (another page is still coming) — checked BEFORE the ends, because
 *      "already first" is a claim about a set that may be missing rows, and a partial
 *      permutation is not rejected by the server, it silently reorders unseen siblings;
 *   3. an UNREADABLE stored order — likewise before the ends, for the same reason: which
 *      end a row sits at is a claim about the run's sequence, and there is no sequence
 *      to read. Sending a permutation of a guess is the failure this avoids;
 *   4. the ends, which are the ordinary, self-evident reason.
 *
 * The ends are judged on the STORED run (`position` ASC, `id` tie-break), never on the
 * order the pages arrived in: a conversation the backend assembled oldest-first arrives
 * here newest-first, so the two would name opposite rows and a user would be told the
 * first link of their story is the last.
 */
export function moveBlockedReason(gate: MoveGate): string | null {
  if (!gate.isBrowser) {
    return "Ordering your links needs a browser session.";
  }
  if (gate.isThreading) {
    return "Saving another change…";
  }
  if (gate.hasMore) {
    return "More of your links are still loading, so this row's siblings are not all here yet.";
  }
  if (!gate.runOrderKnown) {
    // Direction-agnostic on purpose: the whole run is unorderable, so neither of its
    // ends can honestly be named.
    return "One of the links sharing this parent arrived without its stored order (position), so the sequence they are in is unknown and reordering it would write a guess.";
  }
  if (gate.index < 0) {
    return "This row is no longer on the page.";
  }
  if (gate.direction === "up" && gate.index === 0) {
    return "Already first among the links that share its parent.";
  }
  if (gate.direction === "down" && gate.index === gate.runLength - 1) {
    return "Already last among the links that share its parent.";
  }
  return null;
}

/**
 * Everything `nestBlockedReason` needs to judge one row as a nest target, gathered by the host
 * from its own selection and the target's loaded ancestor chain (`buildLinkShape`).
 */
export interface NestGate {
  targetId: string;
  isBrowser: boolean;
  isThreading: boolean;
  /** True when the scoped selection has at least one id (`canNest`). */
  canNestSelection: boolean;
  targetSelected: boolean;
  hasSelectedAncestor: boolean;
  /** The target's loaded depth (`_depthOf`). */
  depth: number;
}

/**
 * May the ticked rows be nested UNDER this row? `null` means yes.
 *
 * The cycle checks are the reason this is not simply "is the target ticked": nesting
 * `X` under `P` makes `X` a child of `P`, so a cycle exists whenever `P` is itself inside
 * the subtree of something being moved — which includes `P` being ticked AND `P` having a
 * ticked ancestor. The server rejects either as a unit, so the walk up `P`'s loaded chain
 * catches both before a call is made. A cycle through an ancestor that is NOT loaded is not
 * detectable here; that one is the server's to reject, and it arrives as a toast.
 *
 * The depth check is the client mirror of `MAX_THREAD_DEPTH` (see the constant): a target
 * already at the cap cannot take another level. It is deliberately the ONLY structural
 * precondition not answered from the selection.
 */
export function nestBlockedReason(gate: NestGate): string | null {
  if (!gate.targetId) {
    return null;
  }
  if (!gate.isBrowser) {
    return "Nesting needs a browser session.";
  }
  if (gate.isThreading) {
    return "Saving another change…";
  }
  if (!gate.canNestSelection) {
    return "Tick one of your own links first — it becomes a direct child of this one.";
  }
  if (gate.targetSelected) {
    return "This link is ticked too — it cannot be nested under itself.";
  }
  if (gate.hasSelectedAncestor) {
    return "This link already sits under a ticked link — nesting here would make the conversation cyclic.";
  }
  if (gate.depth >= MAX_NEST_DEPTH) {
    return "This link is already the deepest level a conversation may reach.";
  }
  return null;
}
