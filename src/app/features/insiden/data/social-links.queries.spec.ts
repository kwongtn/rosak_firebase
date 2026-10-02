import { describe, expect, it } from "vitest";

import { PUBLIC_SOCIAL_MEDIA_LINKS_QUERY } from "./social-links.queries";

/* ---------------------------------------------------------------------- *
 * Why this file parses the document instead of trusting `PublicSocialMediaLink`
 * ---------------------------------------------------------------------- *
 *
 * A GraphQL document is a STRING. Nothing checks it against the type it populates, and the type
 * describes a RESPONSE, not a REQUEST — so every field below can be deleted and `npm run build`
 * still passes. `strict` and `strictNullChecks` are OFF here, so the compiler cannot even report
 * that a consumer is about to read `undefined` off a payload that stopped carrying the key. That
 * is why these assertions exist and why they parse rather than trust the type.
 *
 * THE DEFECT THIS DOCUMENT ALREADY SHIPPED: `position` was missing from the selection. My Links is
 * one of the two callers of `reorderSocialMediaLinks`, which is a PERMUTATION of one existing
 * sibling set — the server renumbers the ids it is given `10, 20, 30, …` from the ORDER THEY
 * ARRIVE IN. The run therefore has to be read off the STORED order (`position` ASC, `id` as the
 * tie-break), and these rows arrive `occurredAt DESC, id DESC`, a different ordering. Without the
 * field the first reorder wrote the arrival order over the conversation's sequence, so a
 * conversation the backend assembled oldest-first came back reversed and nothing round-tripped.
 * The type gained an OPTIONAL `position` in the same change, which is precisely the shape of hole
 * `strictNullChecks: off` cannot report.
 *
 * THE TECHNIQUE, unchanged from `links-section.component.spec.ts` / `home.queries.spec.ts`: strip
 * whole-line `#` comments FIRST (this document explains its flat decision in prose that NAMES
 * `sublinks`, `sublinkCount` and `position`, so a substring assertion would pass on a comment
 * alone — and the prose's own braces would unbalance a walk that counted them), then scan the
 * selection set for bare field names, recursively, so an inline `lines { id code displayName }`
 * cannot end the walk at its own closing brace.
 *
 * A NOTE ON WHAT IS *NOT* REPEATED HERE, so this file does not become the third copy of one
 * assertion: `sublinks`' ABSENCE is already pinned from the /insiden side
 * (`links-section.component.spec.ts`, read off the request that host sends), again from the
 * situasi side, and again from the incident card's two-document check. It is the same constant
 * and the same reason, so a fourth copy adds no coverage.
 */

/** One parsed selection set: the bare field names at this level, plus each sub-selection parsed the
 *  same way so a caller can descend into `lines { id code displayName }`. */
interface SelectionSet {
  fields: string[];
  nested: Record<string, SelectionSet>;
}

/** Drops every `#` comment line. See the header: stripping must precede brace counting. */
function withoutComments(document: string): string {
  return document
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/** Index of the `}` that closes the `{` whose body starts at `bodyStart`. Counts braces so a nested
 *  sub-selection cannot end the walk early. */
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

/** Parses one selection-set body into its field names and recursively-parsed sub-selections.
 *  Deliberately a scanner: a selection set holds only `name`, `name { … }` and (above it)
 *  parenthesised argument lists, and this document's only nesting is the six relations under
 *  `node`. Anything unrecognised is stepped over rather than guessed at — safe, because a field
 *  this misses shows up as a MISSING assertion below, never as a silent pass. */
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

/** `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY`'s per-row selection — `node { … }`, which is what every host on
 *  this document turns into a `LinkCardItem` or a My Links row. */
function publicLinkRow(): SelectionSet {
  const document = withoutComments(PUBLIC_SOCIAL_MEDIA_LINKS_QUERY);
  const marker = "node {";
  const open = document.indexOf(marker);
  if (open < 0) {
    throw new Error("PUBLIC_SOCIAL_MEDIA_LINKS_QUERY has no node selection");
  }
  const bodyStart = open + marker.length;
  return parseSelectionSet(document.slice(bodyStart, closingBraceIndex(document, bodyStart)));
}

/** Every field a consumer of this document READS, with the CONSUMER that makes each one required.
 *
 *  The `because` half is the point: a bare field list gives no clue what breaks the day someone
 *  deletes a line, so the annotation is interpolated into the test NAME — it is what fails, not
 *  just what is written down.
 *
 *  ⚠️ The consumers are NOT all My Links. This is a SHARED document (the /insiden tab, the situasi
 *  tab, the per-incident card's continuation pages and My Links all send it), and a field is
 *  required if ANY of them reads it. My Links itself has NO edit path — it renders its own row and
 *  never opens `LinkSheetService` — so the four M2M relations below are pinned for the OTHER hosts
 *  (`app-link-list`'s edit pencil → `LinkSheetService.openEdit` → `LinkFormComponent.submit`), which
 *  is the surface where an omitted relation is not an absence but an instruction to erase the
 *  link's tags. */
const REQUIRED_ROW_FIELDS: Array<{ field: string; because: string }> = [
  {
    field: "position",
    because:
      "My Links' compareStoredSequence/_runOrderIsKnown build the reorderSocialMediaLinks payload from the STORED order — drop it and the first reorder writes the arrived occurredAt order as the new sequence",
  },
  {
    field: "parentId",
    because:
      "My Links keys every sibling run on it, walks it for the depth indent, gates Ungroup on it, and sends it as reorderSocialMediaLinks' parentId",
  },
  {
    field: "sublinkCount",
    because:
      "My Links' conversation badge is threadLabel(sublinkCount + 1) — the raw descendant count would delete the badge off a root with exactly one sublink",
  },
  {
    field: "occurredAt",
    because:
      "app-link-card displays it as the event instant and groupLinksByDay buckets the day headers on it; dropping it makes the card fall back to created and the incident card's one list label its top ten rows by a different instant than the rows below",
  },
  {
    field: "created",
    because:
      "the card's `occurredAt ?? created` fallback, groupLinksByDay's other key, My Links' own row timestamp, and the reset target of an explicit occurredAt: null",
  },
  {
    field: "id",
    because:
      "every structural mutation names rows by it (track, group, nest, ungroup, reorder) and the keyset cursor is built on it",
  },
  {
    field: "url",
    because: "the card's href, its favicon lookup and its urlParts line",
  },
  {
    field: "title",
    because: "the card's headline and My Links' row label",
  },
  {
    field: "status",
    because:
      "app-link-list splits Approved from Pending on it, app-link-card prints the Pending pill from it, and My Links' badge label reads it",
  },
  {
    field: "completed",
    because:
      "my-links-status.util falls back to it for a pre-Task-10 row that carries no status at all, so a row with neither reads as unapproved",
  },
  {
    field: "voteScore",
    because: "app-link-card's netScore — the vote control renders a zero it did not ask for",
  },
  {
    field: "userVote",
    because:
      "app-link-list binds `[userVote]` as the card's optimistic starting value; without it every card opens its overlay at 0",
  },
  {
    field: "lines",
    because:
      "app-link-card prints a line-code badge per entry AND the shared edit sheet re-sends every id as lineIds — replace-not-patch, so an empty list erases the line tags",
  },
];

/** The three M2M relations the shared edit sheet round-trips and the card/panel do not display.
 *  Each is read as `.map(x => x.id)`, so BOTH the relation and its `id` are load-bearing. */
const EDIT_ROUND_TRIP_RELATIONS = ["vehicles", "stations", "categories"];

describe("PUBLIC_SOCIAL_MEDIA_LINKS_QUERY row selection", () => {
  it.each(REQUIRED_ROW_FIELDS)("selects $field because $because", ({ field }) => {
    expect(publicLinkRow().fields).toContain(field);
  });

  it("selects voteBreakdown with both halves, because app-link-card renders the vote control's two tallies", () => {
    expect(publicLinkRow().nested["voteBreakdown"]?.fields).toEqual(["upvotes", "downvotes"]);
  });

  it("selects user with shortId because canEditLink matches the caller's uid prefix against it — without it NO edit pencil is ever shown to a submitter", () => {
    expect(publicLinkRow().nested["user"]?.fields).toContain("shortId");
  });

  it.each(EDIT_ROUND_TRIP_RELATIONS)(
    "selects $relation, because app-link-list's edit pencil opens the shared sheet and SocialMediaLinkInput is replace-not-patch — an omitted relation WIPES the link's tags",
    (relation) => {
      expect(publicLinkRow().fields).toContain(relation);
    },
  );

  it.each(EDIT_ROUND_TRIP_RELATIONS)(
    "selects $relation with its `id`, because LinkFormComponent hydrates the multi-select from it and sends those ids back",
    (relation) => {
      expect(publicLinkRow().nested[relation]?.fields).toContain("id");
    },
  );
});
