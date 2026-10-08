import { describe, expect, it } from "vitest";

import { SOCIAL_MEDIA_LINKS_QUERY } from "./insiden-console.queries";

/* ---------------------------------------------------------------------- *
 * Why this file parses the document instead of trusting `SocialMediaLinkRow`
 * ---------------------------------------------------------------------- *
 *
 * A GraphQL document is a STRING. Nothing checks it against the type it populates, and the type
 * describes a RESPONSE, not a REQUEST — so every field below can be deleted from the document and
 * `npm run build` still passes. `strict` and `strictNullChecks` are OFF in this repo, so the
 * compiler cannot even report that a consumer is about to read `undefined`. That is the entire
 * reason these tests exist.
 *
 * This defect class has ALREADY bitten this document twice, both times invisibly:
 *
 *   1. `position` was missing. `reorderSocialMediaLinks` is a PERMUTATION of one existing sibling
 *      set — it renumbers the ids it is given `10, 20, 30, …` from the ORDER THEY ARRIVE IN — so
 *      the payload must be the run in the STORED order (`position` ASC, `id` tie-break). Without
 *      the field, `siblingsOf`/`compareStoredSequence` sorted nothing meaningful and the console
 *      wrote the table's `occurredAt DESC, id DESC` triage order as the conversation's sequence: a
 *      conversation the backend assembled oldest-first came back reversed, and the reorder
 *      round-tripped nothing.
 *   2. `vehicles`/`stations`/`categories`/`lines` were missing from a document whose consumers
 *      write. `SocialMediaLinkInput` is REPLACE-NOT-PATCH (the backend assigns `title` and calls
 *      `.set()` on all four M2M relations unconditionally), so an omitted relation is not an
 *      absence — it is an instruction to erase the link's tags. `linkStatusInput` re-sends the
 *      whole row on every Approve and every Hide.
 *
 * THE TECHNIQUE, and why it is a parse rather than a substring match: this document explains
 * itself in `#` prose that NAMES the fields it is discussing — `sublinks`, `position`, `parentId`,
 * `sublinkCount` — so `expect(doc).toContain("position")` would pass on a comment alone. Whole-line
 * `#` comments are stripped FIRST (before any brace counting, because the prose carries its own
 * `{`/`}` and would unbalance the walk), then the selection set is scanned for bare field names,
 * recursively, so a nested `user { … }` / `lines { … }` cannot end the walk early. Same reasoning
 * as `links-section.component.spec.ts`'s `nodeSelectionOf` and `home.queries.spec.ts`'s
 * `parseSelectionSet`; this file needs the recursive form because this document's root selection
 * nests five relations under it.
 *
 * The document is taken as an ARGUMENT to the parser (so the assertions read off the one constant
 * that goes on the wire) and passed in from each test, which is the convention both existing
 * parsers settled on.
 */

/** One parsed selection set: the bare field names at this level, plus each sub-selection parsed
 *  the same way so a caller can descend into `lines { id code displayName }`. */
interface SelectionSet {
  fields: string[];
  nested: Record<string, SelectionSet>;
}

/** Drops every `#` comment line.
 *
 *  GraphQL's `#` comment runs to end of line, and both documents put one `#` at the start of each
 *  line of a block — which is what makes whole-line stripping correct here. A TRAILING `#` on a
 *  line of selection would defeat it, and stripping must happen BEFORE brace counting or the
 *  prose's own braces unbalance the walk. */
function withoutComments(document: string): string {
  return document
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/** Index of the `}` that closes the `{` whose body starts at `bodyStart`. Counts braces so a
 *  nested sub-selection cannot end the walk early. */
function closingBraceIndex(document: string, bodyStart: number): number {
  let depth = 1;
  let cursor = bodyStart;
  while (cursor < document.length && depth > 0) {
    const ch = document[cursor];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    cursor++;
  }
  return cursor - 1;
}

/** Parses one selection-set body — the text BETWEEN a pair of braces — into its field names and
 *  recursively-parsed sub-selections.
 *
 *  Deliberately a scanner, not a parser: a selection set holds only `name`, `name { … }` and (on
 *  the argument list above it) parenthesised lists, and this document's only nesting is the five
 *  relations under the root selection. Anything unrecognised is stepped over rather than guessed
 *  at, which is safe: a field this misses surfaces as a MISSING assertion below, never as a
 *  silent pass. */
function parseSelectionSet(body: string): SelectionSet {
  const fields: string[] = [];
  const nested: Record<string, SelectionSet> = {};
  const NAME = /^([A-Za-z_][A-Za-z0-9_]*)[ \t\r\n]*/;
  let cursor = 0;
  while (cursor < body.length) {
    const match = NAME.exec(body.slice(cursor));
    if (!match) {
      cursor++;
      continue;
    }
    const name = match[1];
    cursor += match[0].length;
    fields.push(name);

    // A `{` with only whitespace (or a separating comma) between it and the name makes this a
    // sub-selection rather than a scalar.
    const gap = /^[ \t\r\n]*/.exec(body.slice(cursor));
    const gapLength = gap ? gap[0].length : 0;
    const next = body[cursor + gapLength];
    if (next === "{") {
      const innerStart = cursor + gapLength + 1;
      const innerEnd = closingBraceIndex(body, innerStart);
      nested[name] = parseSelectionSet(body.slice(innerStart, innerEnd));
      cursor = innerEnd + 1;
    } else if (next === ",") {
      cursor += gapLength + 1;
    }
  }
  return { fields, nested };
}

/** The selection set hanging off `<field>(…) { … }` or `<field> { … }`.
 *
 *  Both spellings occur in this repo: the console document's root field carries NINE arguments
 *  (`search`, `categoryId`, `completed`, `hidden`, `lineId`, `vehicleId`, `stationId`, `occurredAfter`,
 *  `occurredBefore`) and the public document's root field carries six, so the argument list has to
 *  be walked out before the `{` is found — a plain `indexOf("socialMediaLinks {")` matches
 *  nothing. `node {` (the public document's per-row selection) is the no-arguments case. */
function selectionUnder(rawDocument: string, field: string): SelectionSet {
  const document = withoutComments(rawDocument);
  const at = document.indexOf(field);
  if (at < 0) {
    throw new Error(`no "${field}" selection in the document`);
  }
  let cursor = at + field.length;
  const parenGap = /^[ \t\r\n]*/.exec(document.slice(cursor));
  cursor += parenGap ? parenGap[0].length : 0;
  if (document[cursor] === "(") {
    let depth = 1;
    cursor++;
    while (cursor < document.length && depth > 0) {
      if (document[cursor] === "(") {
        depth++;
      } else if (document[cursor] === ")") {
        depth--;
      }
      cursor++;
    }
    const braceGap = /^[ \t\r\n]*/.exec(document.slice(cursor));
    cursor += braceGap ? braceGap[0].length : 0;
  }
  if (document[cursor] !== "{") {
    throw new Error(`"${field}" is not followed by a selection set`);
  }
  const bodyStart = cursor + 1;
  return parseSelectionSet(document.slice(bodyStart, closingBraceIndex(document, bodyStart)));
}

/** `SOCIAL_MEDIA_LINKS_QUERY`'s root selection — the fields on one queue row. */
function queueRow(): SelectionSet {
  return selectionUnder(SOCIAL_MEDIA_LINKS_QUERY, "socialMediaLinks");
}

/** Every field the console's queue table and its two writers READ, with the CONSUMER that makes
 *  each one required.
 *
 *  The `because` half is the point of the test: a bare field list gives no clue what breaks the day
 *  someone deletes a line, and it is interpolated into the test name so the annotation is what
 *  fails, not just what is documented. */
const REQUIRED_ROW_FIELDS: Array<{ field: string; because: string }> = [
  {
    field: "position",
    because:
      "siblingsOf/compareStoredSequence build the reorderSocialMediaLinks payload from the STORED order and runOrderIsKnown refuses without it — drop it and the console writes the table's occurredAt order as the new sequence",
  },
  {
    field: "parentId",
    because:
      "_depths walks it for the depth indent, siblingsOf keys the sibling run on it, the Ungroup button gates on it, and it IS the parentId argument sent to reorderSocialMediaLinks",
  },
  {
    field: "sublinkCount",
    because:
      "the conversation chip's number (threadLabel(sublinkCount + 1)) and the gate on confirmThreadCoupling — never isThreadRoot",
  },
  {
    field: "occurredAt",
    because:
      "the queue's sort column, the displayed event instant, and re-sent verbatim by linkStatusInput — the field is tri-state, so a replace-not-patch omission resets every approved row's event time",
  },
  {
    field: "id",
    because:
      "every mutation argument and every id in the reorder payload is built from it (deleteLink, markCompleted, reorderSiblings)",
  },
  {
    field: "url",
    because:
      "the table links to it, and SocialMediaLinkInput.url is NON-NULL — linkStatusInput re-sends it on every Approve and every Hide",
  },
  {
    field: "title",
    because:
      "the backend ASSIGNS title unconditionally, so linkStatusInput re-sending an unselected title blanks it",
  },
  {
    field: "created",
    because:
      "the Submitted column an admin moderates against, and buildUpdatedLink's `?? link.created` fallback for a deliberately cleared event time",
  },
  {
    field: "completed",
    because:
      "the queue's own mark-handled flag: its column, its Mark-complete button's gate, and the default Pending filter",
  },
  {
    field: "completedAt",
    because: "the detail panel's completion timestamp",
  },
  {
    field: "completedBy",
    because: "the detail panel names the completing admin (`by {{ completedBy }}`)",
  },
  {
    field: "status",
    because:
      "the queue's status verbs all gate on it: Approve only while PENDING_APPROVAL, Unhide only while HIDDEN, Hide on every row that isn't already HIDDEN",
  },
  {
    field: "isAutomated",
    because: "the Official chip on an auto-ingested operator post",
  },
];

/** The four M2M relations the two writers re-send. Each is read as `.map(x => x.id)`, so BOTH the
 *  relation and its `id` are load-bearing. */
const WRITTEN_RELATIONS = ["lines", "vehicles", "stations", "categories"];

describe("SOCIAL_MEDIA_LINKS_QUERY row selection", () => {
  it.each(REQUIRED_ROW_FIELDS)("selects $field because $because", ({ field }) => {
    expect(queueRow().fields).toContain(field);
  });

  it.each(WRITTEN_RELATIONS)(
    "selects $relation, because saveLinkEdit sends the complete editable set and an omitted relation WIPES the link's tags (the input is replace-not-patch)",
    (relation) => {
      expect(queueRow().fields).toContain(relation);
    },
  );

  it.each(WRITTEN_RELATIONS)(
    "selects $relation with its `id`, because linkStatusInput and saveLinkEdit both map it to the payload's id list",
    (relation) => {
      expect(queueRow().nested[relation]?.fields).toContain("id");
    },
  );

  it("selects user with both nickname and shortId, because the submitter column falls back `nickname || shortId`", () => {
    expect(queueRow().nested["user"]?.fields).toEqual(["nickname", "shortId"]);
  });

  it("selects categories with `name`, because the queue's tag column prints a badge per category and the detail panel tracks it by id", () => {
    // The one relation where the console READS a field beyond `id`: the other three are mapped to
    // id lists and their display labels are resolved from INSIDEN_REFERENCE_QUERY, so `id` alone
    // is what they owe. `categories` additionally owes `name` — the tag cell renders
    // `{{ category.name }}`, and a row selected without it renders a column of empty badges.
    expect(queueRow().nested["categories"]?.fields).toEqual(["id", "name"]);
  });

  it("selects isThreadRoot because confirmThreadCoupling picks its confirm copy from it — this is the ONE place the console reads a root marker", () => {
    // Worth stating explicitly because it is easy to misread as a defensive selection: the chip
    // and the Hide gate are both on `sublinkCount > 0`, but the CONFIRM wording branches on
    // `link.isThreadRoot` ("Root of a conversation" vs "Links below this row"), so the field has a
    // real reader on this surface.
    expect(queueRow().fields).toContain("isThreadRoot");
  });

  it("does NOT select sublinks: the queue is one flat row per link, hierarchy by depth indent", () => {
    // Absence is as load-bearing as presence here. This document already returns every link in the
    // conversation, so nesting would duplicate them in the payload and let a HIDDEN row's URL and
    // title travel inside a nested field — and the flat table has no expansion to render it in.
    // Asserted on the PARSED selection, not on the raw string: the document's `#` block names
    // `sublinks` three times while explaining why it is absent.
    expect(queueRow().fields).not.toContain("sublinks");
  });

  it("does NOT select vote fields: the queue renders no vote control, so they are payload and resolver fan-out for nothing", () => {
    // The mirror rule to `sublinks`: this surface never votes, never shows a score, and widening
    // or re-adding the vote triple on every row of an admin queue costs a resolver hit per row.
    expect(queueRow().fields).not.toContain("voteScore");
    expect(queueRow().fields).not.toContain("userVote");
    expect(queueRow().fields).not.toContain("voteBreakdown");
  });
});
