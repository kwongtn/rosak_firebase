import { inject } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import type { SocialMediaLinkStatus } from "../../../home/data/home.queries";
import { canGroup, canNest, threadLabel } from "../../../insiden/data/link-thread-selection.util";
import {
  GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  GroupSocialMediaLinksData,
  GroupSocialMediaLinksVars,
  REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
  ReorderSocialMediaLinksData,
  ReorderSocialMediaLinksVars,
  UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  UngroupSocialMediaLinksData,
  UngroupSocialMediaLinksVars,
} from "../../../insiden/data/social-links.queries";
import {
  MARK_LINK_COMPLETED_MUTATION,
  MarkLinkCompletedData,
  MarkLinkCompletedVars,
  SocialMediaLinkRow,
  UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
  UpdateSocialMediaLinkData,
  UpdateSocialMediaLinkVars,
} from "../data/insiden-console.queries";
import { linkStatusInput } from "../data/link-status-input.util";
import { runOrderIsKnown, siblingsOf } from "./link-tree.util";
import type { LinksQueue } from "./links-queue";
import type { LinksTree } from "./links-tree";

/**
 * The links queue's row verbs: group, nest, ungroup, move up/down, approve, hide, unhide and mark
 * completed. Each holds the queue's loading flag, sends its mutation, refetches and hands the flag
 * back through `queue.finishLoading()`. Call in an injection context.
 */
export function injectLinksActions(queue: LinksQueue, tree: LinksTree) {
  const graphql = inject(GraphQLClient);
  const auth = inject(AuthService);
  const toast = inject(ToastService);

  /** Start a NEW conversation from the ticked rows.
   *
   *  The `parentId` key is OMITTED here, which is what the backend reads as "no
   *  target": it elects the root — the earliest `(occurredAt, id)` of the
   *  selection — and hangs the rest off it. Sending an explicit `null` would
   *  mean the same thing (the argument is `ID = null`, nullable WITH a default),
   *  but omitting it is the spelling that stays correct if that default ever
   *  becomes meaningful. Contrast `reorderSiblings`, where the key is ALWAYS
   *  present because an omission is refused by the resolver's own guard
   *  (`reorder_social_media_links`'s own `if not parent_id` in
   *  `incident/schema/mutations/interactions.py`) — the argument is `ID`, nullable
   *  with no default, so the SDL itself cannot require it.
   *
   *  Grouping is ALL-OR-NOTHING server-side: one link outside the admin's
   *  permission, a cycle or a depth-cap breach rejects the entire selection, so
   *  there is no partial state to render and nothing to roll back locally. A
   *  failure therefore toasts and leaves both the list and the selection exactly
   *  as they were — keeping the selection on failure is deliberate: the admin can
   *  adjust it and retry instead of re-ticking from scratch. Success reloads (the
   *  payload is a flat array — the accordion derives the hierarchy from `parentId`
   *  client-side — so the server's `parentId`/`sublinkCount` truth is what drives
   *  the indentation, the chips and the chevrons) and clears the selection, which is
   *  otherwise a selection of rows that are now one conversation — i.e. a request
   *  that has already been made.
   *
   *  The returned root id is deliberately unused: it is an `Int` (every other id
   *  in this feature is a string `ID`) and exists so a surface that re-fetched ONE
   *  conversation on demand could spend it. This queue fetches the whole flat
   *  array with no pagination and reloads wholesale, so there is nothing to spend
   *  it on — the accordion collapses what is already in memory instead. */
  async function groupSelected(): Promise<boolean> {
    const linkIds = tree.scopedSelection();
    if (!canGroup(linkIds)) {
      return false;
    }
    return sendGrouping(
      linkIds,
      undefined,
      "Links grouped",
      `${linkIds.length} links are now one conversation.`,
      "Couldn't group links",
    );
  }

  /** Nest the ticked rows as CHILDREN of the row this was clicked on — the same
   *  verb as "Group into thread", with a target instead of an elected root.
   *
   *  WHY A ROW ACTION AND NOT A TARGET PICKER: the selection is the payload and
   *  the row is the target, so the click that names both is the row whose
   *  conversation the admin is looking at. A picker would ask them to choose,
   *  from a list of rows that is ALREADY on screen in front of them, the exact
   *  same target — one extra click and a second source of truth for "where does
   *  this go", with the same cycle rules to enforce. The row's own Nest-under
   *  button is disabled (with a stated reason) whenever the action cannot be
   *  sent, so the affordance is never a live control that quietly does nothing.
   *
   *  The guards are the two the server would reject the whole call for:
   *   - an EMPTY selection, which is `canNest` — with a target, ONE ticked row is
   *     already a real write (it becomes this row's child), unlike the no-target
   *     grouping minimum of two that `canGroup` encodes. A nest is how a
   *     conversation's first child is created, so one has to be enough;
   *   - the target itself being in the selection, which is a CYCLE: a link cannot
   *     be its own ancestor. The server rejects such a call as a unit, with
   *     nothing written, so the client never sends one.
   *  Both are re-checked here and not only in the template, so a programmatic
   *  call cannot post a request the server will refuse wholesale. The depth cap
   *  is the third server-side rejection and is NOT mirrored here: it depends on
   *  where the target sits in a tree this table cannot fully see (a filtered page
   *  hides ancestors), so the server stays the authority and its message is what
   *  the admin reads.
   *
   *  Success clears the selection, exactly as grouping does: the ticked rows are
   *  now one subtree, so re-ticking them would offer to nest them again. */
  async function nestSelectedUnder(link: SocialMediaLinkRow): Promise<boolean> {
    if (!tree.canNestUnder(link)) {
      return false;
    }
    const linkIds = tree.scopedSelection();
    if (!canNest(linkIds)) {
      return false;
    }
    return sendGrouping(
      linkIds,
      link.id,
      "Links nested",
      `${linkIds.length} links are now under ${link.url}.`,
      "Couldn't nest links",
    );
  }

  /** The one call both group verbs make, so the tri-state `parentId` spelling, the
   *  auth header, the reload and the all-or-nothing failure handling cannot drift
   *  between them.
   *
   *  `parentId === undefined` OMITS the key (start a new conversation); a string
   *  sends it (nest under that link). The two are not the same request, which is
   *  why the parameter is optional rather than nullable. */
  async function sendGrouping(
    linkIds: string[],
    parentId: string | undefined,
    successTitle: string,
    successBody: string,
    errorTitle: string,
  ): Promise<boolean> {
    const vars: GroupSocialMediaLinksVars = { linkIds };
    if (parentId) {
      vars.parentId = parentId;
    }
    queue.isLoading.set(true);
    try {
      const idToken = await auth.idToken();
      await graphql.request<GroupSocialMediaLinksData, GroupSocialMediaLinksVars>(
        GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        vars,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      toast.success(successTitle, successBody);
      await queue.fetchLinks();
      tree.clearSelection();
      return true;
    } catch (err) {
      toast.error(errorTitle, err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      queue.finishLoading();
    }
  }

  /** Detach ONE link from whatever it hangs under. Offered only where
   *  `parentId` is non-null, i.e. on a sublink — which is the only spelling of
   *  this action that does anything: ungrouping a ROOT leaves its whole subtree
   *  attached (there is nothing to detach), so a root's job here is to carry the
   *  chip and its descendants' Ungroup buttons, not an Ungroup of its own.
   *
   *  The asymmetry is deliberate server-side (no cascade, no re-root election), so
   *  the button detaches exactly the row it is on and the copy says so. Under the
   *  tree it also has a consequence the depth-1 design did not have: a PROMOTED
   *  link keeps its own children, so ungrouping a middle node lifts a whole
   *  subtree to the root level. The server deliberately does not flatten it and
   *  neither does this row, which is why the copy stays about the one row. */
  async function ungroupLink(link: SocialMediaLinkRow): Promise<boolean> {
    if (!link.parentId) {
      return false;
    }
    queue.isLoading.set(true);
    try {
      const idToken = await auth.idToken();
      await graphql.request<UngroupSocialMediaLinksData, UngroupSocialMediaLinksVars>(
        UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds: [link.id].filter(Boolean) },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      toast.success("Link removed from its parent", link.url);
      await queue.fetchLinks();
      return true;
    } catch (err) {
      toast.error("Couldn't ungroup link", err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      queue.finishLoading();
    }
  }

  /* ---- Sequence (reorder) ---------------------------------------------- */

  /** "Move up" in the row's sibling run. A named wrapper so the template reads as
   *  an action rather than as an arithmetic shift into a shared verb. */
  function moveLinkUp(link: SocialMediaLinkRow): Promise<boolean> {
    return reorderSiblings(link, -1);
  }

  /** "Move down" — the mirror. Same payload shape, opposite direction. */
  function moveLinkDown(link: SocialMediaLinkRow): Promise<boolean> {
    return reorderSiblings(link, 1);
  }

  /** 🔴 THE SEQUENCE WRITE. Everything about this call is shaped by the fact that
   *  `reorderSocialMediaLinks` is a PERMUTATION OF ONE SIBLING SET, not a move:
   *
   *  - `linkIds` is the WHOLE run with the row swapped one place, never the two
   *    rows involved. The server renumbers the ids it is given `10, 20, 30, …` and
   *    leaves every id it was NOT given after them, so sending a pair would be a
   *    request to move those two to the front of the run and push everything else
   *    back — the opposite of a swap, and a silent one.
   *  - ⚠️ AND THE RUN MUST BE THE STORED ONE. `siblingsOf` returns it in
   *    `position` ASC with `id` as the tie-break, and THIS payload is the stored
   *    sibling order with one row moved — never the feed's `occurredAt` order,
   *    never the order the table happens to render. The server writes the list it
   *    is given verbatim as the new sequence, so a payload built from the arrival
   *    order overwrites the stored story with the queue's triage timeline (and
   *    reverses a conversation the backend assembled oldest-first, which is
   *    therefore the order it ARRIVES in).
   *  - `parentId` is the row's OWN `parentId`, and the key is ALWAYS present.
   *    The argument is `ID` — NULLABLE, with no SDL default, so in GraphQL
   *    "required" IS "non-null" and omitting the key is LEGAL GraphQL that
   *    `ProvidedRequiredArgumentsRule` never refuses. What rejects an omitted key
   *    is the RESOLVER'S OWN GUARD (`reorder_social_media_links`'s own
   *    `if not parent_id: raise GraphQLError` in
   *    `incident/schema/mutations/interactions.py`), deliberately, at execution
   *    time. It cannot be tightened to `ID!`, because the meaningful `null`
   *    ("reorder the roots") would then become a hard error. `?? null` is what
   *    guarantees the key exists even if a payload omitted the field entirely.
   *  - the run comes from the loaded rows, so `queueIsComplete` is the gate: a
   *    filtered page would send a PARTIAL permutation that succeeds and pushes
   *    the unseen rows to the end. See that signal for why that is worse than a
   *    rejection. `runOrderIsKnown` is the second gate and the same argument: a
   *    run with an unreadable stored order would send a permutation of a GUESS.
   *
   *  Optimistic patching is NOT an option here and the reload is not optional
   *  politeness: the order this table shows is not the order this table writes (it
   *  shows `occurredAt DESC, id DESC`), so nothing on screen can confirm the new
   *  sequence even in principle. A reload is what makes the next move a real swap
   *  against the stored one — the rows come back with their new `position`, which
   *  this document does select. The table therefore looks unchanged after a
   *  successful move; that is the honest result, and the toast is what tells the
   *  admin the write landed.
   *
   *  The SELECTION SURVIVES, unlike after grouping: a reorder changes no
   *  membership, so the rows the admin ticked to find the sequence are still the
   *  rows they ticked. A failure keeps everything — no reload, no local write, no
   *  selection change — and toasts, because a swallowed rejection here would look
   *  exactly like a successful no-op. */
  async function reorderSiblings(link: SocialMediaLinkRow, delta: -1 | 1): Promise<boolean> {
    // Both gates again, not just the buttons': this is reachable from a programmatic
    // call, and a partial or a guess is worse than no call at all.
    if (!queue.queueIsComplete() || !runOrderIsKnown(tree.runsByParentId(), link)) {
      return false;
    }
    const siblings = siblingsOf(tree.runsByParentId(), link);
    const from = siblings.findIndex((row) => row.id === link.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= siblings.length) {
      return false;
    }
    // THE PAYLOAD IS THE STORED SIBLING ORDER (`position` ASC, `id` tie-break) WITH
    // ONE ROW MOVED — never the feed's `occurredAt` order, and never `queue.links()`'s
    // arrival order. `siblings` is already in that order; this only swaps one element
    // within it, so the whole run is preserved and permuted exactly once.
    const reordered = [...siblings];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const linkIds = reordered.map((row) => row.id);
    queue.isLoading.set(true);
    try {
      const idToken = await auth.idToken();
      await graphql.request<ReorderSocialMediaLinksData, ReorderSocialMediaLinksVars>(
        REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
        // ALWAYS both keys — see the note above.
        { linkIds, parentId: link.parentId ?? null },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      toast.success("Sequence updated", `${linkIds.length} links reordered.`);
      await queue.fetchLinks();
      return true;
    } catch (err) {
      toast.error("Couldn't reorder links", err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      queue.finishLoading();
    }
  }

  /** Publish a community submission AND retire it: approving is the queue's
   *  "handled it" gesture, so it runs TWO mutations in a fixed order —
   *  `updateSocialMediaLink(status: "LIVE")` then
   *  `markSocialMediaLinkCompleted(linkId:)` — and exactly ONE reload at the
   *  end.
   *
   *  WHY TWO WRITES AND NOT ONE. The two fields are orthogonal axes and the
   *  backend keeps both (no migration): `status` is FEED VISIBILITY
   *  (`LIVE`/`PENDING_APPROVAL`/`HIDDEN`) and `completed`/`completedAt`/
   *  `completedBy` is the GLOBAL triage flag. Before this, approving published a
   *  row and left it sitting in the Pending queue forever, so the admin had to
   *  find the same row again and press a second button for the thing they had
   *  just done. Approve now means both, and the standalone "Mark completed"
   *  action stays for a row that is already visible (e.g. an auto-ingested post
   *  someone wants retired without a status change).
   *
   *  ⚠️ ORDER IS THE CONTRACT. The status write goes first because it is the one
   *  that can fail on its own (the input is replace-not-patch and the backend
   *  refuses a non-admin change); completing a row that is still `PENDING_APPROVAL`
   *  would retire a link nobody can see, which is not what a failed publish meant.
   *
   *  🔴 A PARTIAL FAILURE IS NEVER SILENT, and it never rolls back. If the status
   *  write fails: the existing error toast, NO completion request, and NO reload —
   *  the list is exactly as it was. If the publish succeeds but the completion
   *  fails, the row IS live and still pending, so the error toast says exactly
   *  that in its title, and the reload still happens so the admin sees the true
   *  state instead of an optimistic chip. The return value is the PUBLISH
   *  outcome, which is what the detail panel's close-on-success reads.
   *
   *  ONE reload, not two: `markCompleted`'s own reload is deliberately not
   *  reused here (see `sendMarkCompleted`) — a mid-sequence reload would render
   *  the row as `LIVE` and still pending, and the second reload would race the
   *  admin's next click. */
  async function approveLink(link: SocialMediaLinkRow): Promise<boolean> {
    queue.isLoading.set(true);
    try {
      try {
        await sendLinkStatus(link, "LIVE");
        toast.success("Link approved", link.url);
      } catch (err) {
        toast.error("Couldn't approve link", err instanceof Error ? err.message : "Unknown error");
        return false;
      }
      try {
        await sendMarkCompleted(link);
      } catch (err) {
        toast.error(
          "Link approved, but not marked completed",
          `The link is now published, but it is still waiting in the triage queue: ${
            err instanceof Error ? err.message : "Unknown error"
          }. Use “Mark completed” to finish it.`,
        );
      }
      await queue.fetchLinks();
      return true;
    } finally {
      queue.finishLoading();
    }
  }

  /** Moderation counterpart of approveLink: pull a row out of the public feed
   *  (`status: "HIDDEN"`) without deleting it — e.g. a celebratory update that
   *  must not sit in the feed. The row keeps its title, tags and votes because
   *  the same full payload is re-sent. A hidden row offers Unhide instead (see
   *  `unhideLink`), which is how an admin puts it back (`LIVE`, no completion).
   *
   *  On any row that has links BELOW it the action is not confined to the row:
   *  the feed renders a conversation as its root, a conversation is public IFF
   *  its root is, and hiding a node takes its whole subtree with it at EVERY
   *  depth — recursively, not just its direct children. That is a side effect on
   *  N other rows that no badge states on its own, hence the guard. */
  async function hideLink(link: SocialMediaLinkRow): Promise<boolean> {
    if (!confirmThreadCoupling(link)) {
      return false;
    }
    return setLinkStatus(link, "HIDDEN", "Link hidden", "Couldn't hide link");
  }

  /** The inverse of `hideLink`: put a HIDDEN row back in the public feed
   *  (`status: "LIVE"`). Deliberately a SINGLE write with NO completion step —
   *  unlike Approve, un-hiding is a visibility change and not a "handled it"
   *  gesture, so it must not retire the row from the queue. It reuses
   *  `setLinkStatus`, the same one-request path Hide takes, so the
   *  replace-not-patch payload and the reload cannot drift between the two. */
  async function unhideLink(link: SocialMediaLinkRow): Promise<boolean> {
    return setLinkStatus(link, "LIVE", "Link unhidden", "Couldn't unhide link");
  }

  /** WHY A CONFIRM, AND WHY ONLY HERE.
   *
   *  The coupling ("a conversation is public iff its root is") is real, it is
   *  invisible in the row, and it is decided at the moment of the click — so the
   *  least intrusive thing that actually communicates it is a one-time native
   *  confirm naming the count, right where the destructive decision is made. A
   *  static tooltip on the chip is not enough on its own: it is invisible until
   *  hovered, absent on touch, and gone by the time the admin reaches the Hide
   *  button at the other end of the row. (The chip sits under the URL in the
   *  row's FIRST cell and Hide is in the action cell at the far end, so it is not
   *  even adjacent any more — which is a second, cheaper reason the confirm earns
   *  its place beside the click.)
   *
   *  🔴 UNDER THE TREE THE BLAST RADIUS IS NOT ONE LEVEL, and this is the copy
   *  that has to say so. `sublinkCount` counts a node's descendants AT ANY DEPTH,
   *  so a root whose only sublink is itself a parent of two more reports a
   *  conversation of four, and hiding it removes all four — not the two rows
   *  directly under it. Saying "hides every member" would understate it, and the
   *  admin would learn the rest of the subtree's fate by looking for it in the
   *  feed afterwards. A MID-TREE node is asked about too, for the same reason one
   *  level down: hiding the middle of a conversation takes the rest of it with it.
   *
   *  It is NOT applied to every row. `threadLabel` answers "" for a
   *  conversation size of 1, which is every childless link (an ungrouped link and
   *  a leaf are both a subtree of nothing), so ordinary Hide stays a single
   *  click and only a row that really has links below it is asked about. The gate
   *  is therefore `sublinkCount > 0` and NEVER `isThreadRoot` — the backend
   *  defines a root as `parentId == null`, which is true of every ungrouped link
   *  in the queue, so gating on it would interrupt every Hide on the page.
   *
   *  🔴 The `+ 1` below is the off-by-one `threadLabel`'s contract demands: its
   *  parameter is a CONVERSATION SIZE (this node plus its descendants), not the
   *  descendant count, and it answers "" for anything `<= 1` — so a raw
   *  `sublinkCount` of 1 (a root with exactly one sublink) would SKIP the
   *  confirm entirely. Same rule as the chip; the two must never diverge.
   *
   *  The native `confirm()` matches the delete guard the detail sheet already
   *  uses, so the console has one confirmation idiom rather than two. */
  function confirmThreadCoupling(link: SocialMediaLinkRow): boolean {
    const subtree = threadLabel(link.sublinkCount + 1);
    if (!subtree) {
      return true;
    }
    return link.isThreadRoot
      ? confirm(
          `This link is the root of a conversation with ${subtree}. A conversation is public only while its root is, so hiding this row hides the whole thing below it — every link in that subtree, at any depth. Hide the whole conversation?`,
        )
      : confirm(
          `This link has ${subtree} below it. Hiding this row hides that whole subtree with it, and a conversation is public only while its root is. Hide it and everything under it?`,
        );
  }

  /** The ONE status-changing request the queue makes, for every verb that changes
   *  one (Hide here, and Approve's publish step). Split out from the
   *  toast-and-reload wrapper below so the two-step Approve can issue it as the
   *  first half of its own sequence without dragging that reload along — one
   *  request builder, one payload, and the replace-not-patch rule cannot drift
   *  between the verbs.
   *
   *  `SocialMediaLinkInput` is not a patch: `url` is non-nullable and the service
   *  assigns `title` and calls `.set()` on the four M2M tag relations
   *  unconditionally, so a status-only payload would blank the title and strip
   *  every tag. The row's current scalars and ids are therefore re-sent
   *  alongside the new status (see `linkStatusInput`).
   *
   *  It REJECTS on failure and never catches: every caller decides what the
   *  failure means (Hide's "leave it alone" vs Approve's "don't complete either"),
   *  and a helper that swallowed the error would be exactly where that decision
   *  got lost. */
  async function sendLinkStatus(
    link: SocialMediaLinkRow,
    status: SocialMediaLinkStatus,
  ): Promise<void> {
    const idToken = await auth.idToken();
    await graphql.request<UpdateSocialMediaLinkData, UpdateSocialMediaLinkVars>(
      UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
      { socialMediaLinkId: link.id, input: linkStatusInput(link, status) },
      idToken ? { "firebase-auth-key": idToken } : {},
    );
  }

  /** The one completion request, for the same reason as `sendLinkStatus` above:
   *  `approveLink` needs the mutation WITHOUT the standalone action's reload, or
   *  approving would refetch twice. Rejects on failure. */
  async function sendMarkCompleted(link: SocialMediaLinkRow): Promise<void> {
    const idToken = await auth.idToken();
    await graphql.request<MarkLinkCompletedData, MarkLinkCompletedVars>(
      MARK_LINK_COMPLETED_MUTATION,
      { linkId: link.id },
      idToken ? { "firebase-auth-key": idToken } : {},
    );
  }

  /** The single-request status-change path, currently Hide's. Shared so the
   *  replace-not-patch payload can never drift between the verbs, and so Hide
   *  cannot grow a completion side effect: `completed` is a triage flag and
   *  hiding a row is a FEED decision, not a decision that it was handled. */
  async function setLinkStatus(
    link: SocialMediaLinkRow,
    status: SocialMediaLinkStatus,
    successMessage: string,
    errorTitle: string,
  ): Promise<boolean> {
    queue.isLoading.set(true);
    try {
      await sendLinkStatus(link, status);
      toast.success(successMessage, link.url);
      await queue.fetchLinks();
      return true;
    } catch (err) {
      toast.error(errorTitle, err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      queue.finishLoading();
    }
  }

  /** The standalone "Mark completed" action — retire a row WITHOUT touching its
   *  visibility. Still needed after Approve grew its own completion step: a row
   *  that is already `LIVE` (or was published by a previous session) can need
   *  retiring on its own, and a partially-completed approve offers this as the
   *  documented way to finish the job. */
  async function markCompleted(link: SocialMediaLinkRow): Promise<boolean> {
    queue.isLoading.set(true);
    try {
      await sendMarkCompleted(link);
      toast.success("Link marked completed", link.url);
      await queue.fetchLinks();
      return true;
    } catch (err) {
      toast.error("Couldn't mark completed", err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      queue.finishLoading();
    }
  }

  return {
    groupSelected,
    nestSelectedUnder,
    ungroupLink,
    moveLinkUp,
    moveLinkDown,
    approveLink,
    hideLink,
    unhideLink,
    markCompleted,
  };
}

export type LinksActions = ReturnType<typeof injectLinksActions>;
