import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { LinkFormComponent } from "../../insiden/link-form/link-form.component";
import {
  DOWNVOTE_CHRONOLOGY_MUTATION,
  DOWNVOTE_MUTATION,
  REMOVE_CHRONOLOGY_VOTE_MUTATION,
  REMOVE_VOTE_MUTATION,
  UPVOTE_CHRONOLOGY_MUTATION,
  UPVOTE_MUTATION,
} from "../../insiden/data/insiden.queries";
import {
  DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION,
  FEED_QUERY,
  FRONT_PAGE_LINES_QUERY,
  HOME_RECENT_INCIDENT_VARS,
  HOME_RECENT_INCIDENTS_QUERY,
  LINES_STATUS_HISTORY_QUERY,
  NETWORK_STATUS_HISTORY_QUERY,
  REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION,
  SUBMIT_FEED_LINK_MUTATION,
  UPVOTE_SOCIAL_MEDIA_LINK_MUTATION,
} from "./home.queries";

/* ---------------------------------------------------------------------- *
 * Why this file parses the document instead of trusting the types
 * ---------------------------------------------------------------------- *
 *
 * Every other document in the app is pinned by its HOST: the flat hosts parse the
 * selection off the request they actually sent (`links-section.component.spec.ts`,
 * `situasi-section.component.spec.ts`). This file is the one place that pins
 * FEED_QUERY's OWN selection, and it has to parse for three reasons that compound:
 *
 *   1. The derived level types make the KEYS mandatory but say nothing about what the
 *      document requests. Deleting `sublinkCount` from level 3 would still compile — the
 *      type only knows that `FeedLinkSublinkLevel2.sublinks` is a list of things shaped
 *      like a `FeedLinkSublinkLevel3`, and TypeScript cannot see the string that
 *      populates it. Every fixture in the repo would keep passing, and a 3-level
 *      conversation would silently render 2.
 *   2. Substring matching is useless here. `FEED_QUERY` explains its own decisions in
 *      `#` prose that NAMES the fields — "sublinkCount", "parentId", "vehicles" — so
 *      `expect(doc).toContain("sublinks")` passes on a comment alone. Parsing the
 *      selection set and keeping only bare identifiers drops the comments, the arguments,
 *      and the sibling `cursor`/`pageInfo` selections in one pass.
 *   3. A fixture cannot catch this. A hand-written fixture can invent any field it likes;
 *      the server will simply never send it. The only thing that knows what the server
 *      sends is the document.
 */

/** One parsed selection set: the bare field names at this level, plus each named
 *  sub-selection parsed the same way so a caller can descend into `sublinks`. */
interface SelectionSet {
  /** Every field named at this level, including the ones that carry a sub-selection
   *  (`lines`, `sublinks`, ...) — the shape the flat hosts' parsers produce. */
  fields: string[];
  /** Field name -> its own parsed selection set. Absent for a scalar field. */
  nested: Record<string, SelectionSet>;
}

/** Drops every `#` comment line.
 *
 *  GraphQL's `#` comment runs to end of line, so these documents put one `#` at the
 *  start of each line of a block — which is what makes whole-line stripping correct here.
 *  A TRAILING `#` on a line of selection would defeat it, and stripping must happen
 *  BEFORE brace counting or the prose's own `{` characters unbalance the walk. */
function withoutComments(document: string): string {
  return document
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/** Index of the `}` that closes the `{` whose body starts at `bodyStart`. Counts braces so
 *  a nested sub-selection (`voteBreakdown { ... }`) cannot end the walk early. */
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

/** Parses one GraphQL selection set body — the text BETWEEN a pair of braces — into its field
 *  names and recursively-parsed sub-selections.
 *
 *  Deliberately a scanner, not a parser: a selection set contains only `name`,
 *  `name { ... }` and (on the arguments above it) parenthesised lists, and the only nesting
 *  that matters here is the `sublinks` chain. Anything unrecognised is stepped over rather
 *  than guessed at, which is safe because a field this misses surfaces as a missing
 *  assertion below, never as a silent pass. */
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

    // A `{` with only whitespace (or a separating comma) between it and the name makes this
    // a sub-selection rather than a scalar.
    const ahead = /^[ \t\r\n]*/.exec(body.slice(cursor));
    const gap = ahead ? ahead[0].length : 0;
    const next = body[cursor + gap];
    if (next === "{") {
      const innerStart = cursor + gap + 1;
      const innerEnd = closingBraceIndex(body, innerStart);
      nested[name] = parseSelectionSet(body.slice(innerStart, innerEnd));
      cursor = innerEnd + 1;
    } else if (next === ",") {
      cursor += gap + 1;
    }
  }
  return { fields, nested };
}

/** The selection set hanging off `<parent> { ... }` in a comment-stripped document. */
function selectionUnder(rawDocument: string, parent: string): SelectionSet {
  const document = withoutComments(rawDocument);
  const marker = `${parent} {`;
  const open = document.indexOf(marker);
  if (open < 0) {
    throw new Error(`no "${marker}" selection in the document`);
  }
  const bodyStart = open + marker.length;
  return parseSelectionSet(document.slice(bodyStart, closingBraceIndex(document, bodyStart)));
}

/** `selectionUnder` for a root field that takes ARGUMENTS.
 *
 *  `selectionUnder`'s marker is the literal `"<field> {"`, which a mutation root field with a
 *  variable argument (`upvoteSocialMediaLink(socialMediaLinkId: $id) {`) never produces. */
function selectionUnderArgs(rawDocument: string, field: string): SelectionSet {
  const document = withoutComments(rawDocument);
  const match = new RegExp(`\\b${field}\\s*(\\([^)]*\\))?\\s*\\{`).exec(document);
  if (!match) {
    throw new Error(`no "${field}" selection in the document`);
  }
  const bodyStart = match.index + match[0].length;
  return parseSelectionSet(document.slice(bodyStart, closingBraceIndex(document, bodyStart)));
}

/** A link's own selection plus every nested `sublinks` level beneath it, outermost first.
 *
 *  Returns the CHAIN rather than one level, because the whole defect class is "the root
 *  selects it and the third level does not": asserting on the root alone is exactly what
 *  let this through in the first place. */
function linkChain(rawDocument: string, rootField: string): SelectionSet[] {
  const chain: SelectionSet[] = [];
  let level: SelectionSet | undefined = selectionUnder(rawDocument, rootField);
  while (level) {
    chain.push(level);
    level = level.nested["sublinks"];
  }
  return chain;
}

/** `FEED_QUERY`'s `node { ... }` and its nested levels. */
function feedLevel(index: number): SelectionSet {
  const level = linkChain(FEED_QUERY, "node")[index];
  if (!level) {
    throw new Error(
      `FEED_QUERY has no sublinks level ${index} — expected root plus ` +
        `${EXPECTED_LINK_LEVELS - 1} nested sublinks blocks`,
    );
  }
  return level;
}

/** `SUBMIT_FEED_LINK_MUTATION`'s `link { ... }` and its nested levels. The mutation's payload
 *  declares `link: FeedLink`, so this selection has to mirror FEED_QUERY's exactly. */
function submittedLinkLevel(index: number): SelectionSet {
  const level = linkChain(SUBMIT_FEED_LINK_MUTATION, "link")[index];
  if (!level) {
    throw new Error(`SUBMIT_FEED_LINK_MUTATION has no sublinks level ${index}`);
  }
  return level;
}

/** Root + FOUR `sublinks` blocks.
 *
 *  Written as a number rather than counted off the document so that DELETING a level fails
 *  the tests instead of quietly shortening the chain they walk: four blocks is
 *  root -> L1 -> L2 -> L3 -> L4, and the server caps the write side at
 *  `MAX_THREAD_DEPTH = 3` (root = depth 0), so L4 is the guaranteed-empty level the document
 *  keeps so a future cap bump needs no document change. */
const EXPECTED_LINK_LEVELS = 5;

/** Every level index, root first. Spelled out rather than derived from the parsed chain so
 *  the table does not shrink with the document it is supposed to police. */
const LEVEL_INDEXES = [0, 1, 2, 3, 4];

/** Every level that is supposed to nest a further level. */
const NESTING_INDEXES = [0, 1, 2, 3];

/** The three relations the shared edit sheet round-trips, and the minimal field pair each one
 *  must be selected with.
 *
 *  🔴 The pairs are EXACT, not "contains", on purpose. `Vehicle` also carries `vehicleType`,
 *  `incidents`, `spottings` and `spottingTrends(...)`; widening a sub-selection to the whole
 *  scalar multiplies payload AND resolver fan-out on every row of every feed page for fields
 *  no consumer reads. An `arrayContaining` assertion would let that happen silently — this is
 *  the assertion that keeps the selection minimal. */
const EDIT_ROUND_TRIP_SELECTIONS: Array<{ relation: string; fields: string[] }> = [
  { relation: "vehicles", fields: ["id", "identificationNo"] },
  { relation: "stations", fields: ["id", "displayName"] },
  { relation: "categories", fields: ["id", "name"] },
];

/** The conversation-tree scalars every level must select. `created` is on the list because
 *  `LinkCardItem` REQUIRES it — the card's displayed instant falls back to it — so a level
 *  that grew the tree without it renders a blank time rather than failing to compile. */
const TREE_FIELDS = ["parentId", "isThreadRoot", "sublinkCount", "created"];

/** `FRONT_PAGE_LINES_QUERY`'s per-line selection. */
function lineLevel(): SelectionSet {
  return selectionUnder(FRONT_PAGE_LINES_QUERY, "lines");
}

describe("FRONT_PAGE_LINES_QUERY selection", () => {
  it("asks for isAutomated on every pulse link, which is what makes 'official' possible", () => {
    // The board's confidence chip and the hero's official-update callout are both built on ONE
    // fact: is any of this line's pulse links an operator-sourced post? `LinePulseLink` declares
    // `isAutomated` as a required boolean, and a fixture can invent any field it likes — so the
    // only thing that knows whether the SERVER was asked is the document itself. Without this
    // selection the field is `undefined` at runtime and every line silently degrades to "confirmed
    // by riders" with no error anywhere.
    expect(lineLevel().nested["pulseLinks"]?.fields).toContain("isAutomated");
  });

  it("keeps the pulse link a single flat level — no conversation tree follows it in", () => {
    // The card renders one fixed-height row per related link, so the nested `sublinks` chain the
    // feed carries is deliberately NOT selected here. Asserted so a future copy-paste of the feed's
    // node selection into this one is a red test rather than a payload-size surprise.
    expect(lineLevel().nested["pulseLinks"]?.nested["sublinks"]).toBeUndefined();
  });
});

describe("FEED_QUERY selection", () => {
  it("nests sublinks exactly as deep as the document documents (root plus four levels)", () => {
    expect(linkChain(FEED_QUERY, "node")).toHaveLength(EXPECTED_LINK_LEVELS);
  });

  it.each(LEVEL_INDEXES)("selects the conversation-tree fields at level %i", (level) => {
    for (const field of TREE_FIELDS) {
      expect(feedLevel(level).fields).toContain(field);
    }
  });

  it.each(NESTING_INDEXES)(
    "selects sublinks at level %i, so the level below it is reachable at all",
    (level) => {
      expect(feedLevel(level).fields).toContain("sublinks");
    },
  );

  it("selects occurredAt at every level: the card shows it and every feed ordering keys on it", () => {
    for (const level of LEVEL_INDEXES) {
      expect(feedLevel(level).fields).toContain("occurredAt");
    }
  });

  it.each(EDIT_ROUND_TRIP_SELECTIONS.map(({ relation }) => relation))(
    "selects %s at EVERY level — the edit sheet round-trips them and the input is replace-not-patch",
    (relation) => {
      for (const level of LEVEL_INDEXES) {
        expect(feedLevel(level).fields).toContain(relation);
      }
    },
  );

  it.each(EDIT_ROUND_TRIP_SELECTIONS)(
    "selects $relation with only its identifying pair, at every level",
    ({ relation, fields }) => {
      for (const level of LEVEL_INDEXES) {
        expect(feedLevel(level).nested[relation]?.fields).toEqual(fields);
      }
    },
  );

  it("never selects normalizedUrl below the root — matching the Omit<> on the level types", () => {
    // The mirror of a selection rule rather than a contract rule: nothing renders
    // `normalizedUrl` for a child, so the nested levels omit it AND
    // `FeedLinkSublinkScalars` omits it from the type. If either half moves alone, the other
    // becomes a lie.
    expect(feedLevel(0).fields).toContain("normalizedUrl");
    for (const level of LEVEL_INDEXES.slice(1)) {
      expect(feedLevel(level).fields).not.toContain("normalizedUrl");
    }
  });
});

/* ---------------------------------------------------------------------- *
 * The FEED's line filter argument
 *
 * `$lineId` is the ONE key the authenticated vote-overlay reads omit (a wider overlay read is
 * complete; a narrower one loses votes), which `home.store.spec.ts` pins structurally. These
 * assertions pin the other half: the document really declares the variable and really passes it, so
 * the store's `lineId` in the variables is not silently a no-op. A document that declared `$lineId`
 * without passing it would still compile, still type-check and still return the whole network — the
 * filter would simply never do anything, with no error anywhere.
 * ---------------------------------------------------------------------- */

describe("FEED_QUERY line filter", () => {
  /** The comment-stripped document, so a prose line cannot satisfy a field assertion. */
  function bare(document: string): string {
    return withoutComments(document);
  }

  it("declares $lineId and passes it to the connection", () => {
    const document = bare(FEED_QUERY);
    expect(document).toMatch(/\$lineId:\s*ID\b/);
    // Passing it, not just declaring it: a declared-but-unused GraphQL variable is a validation
    // error, so a document that declared it WITHOUT using it would be rejected outright — which is
    // why the two assertions belong together.
    expect(document).toMatch(/publicSocialMediaLinks\([\s\S]*?lineId:\s*\$lineId/);
  });

  it("keeps collapseThreads in the same argument list — the six-read invariant is untouched", () => {
    const document = bare(FEED_QUERY);
    expect(document).toMatch(
      /publicSocialMediaLinks\([\s\S]*?collapseThreads:\s*\$collapseThreads/,
    );
  });

  it("leaves the connection's SELECTION alone, because the filter is a window, not a shape", () => {
    // `collapseThreads` decides the SHAPE the page renders (roots with whole subtrees under them) and
    // the overlay walk depends on it. A line filter is a narrower WINDOW over the same connection, so
    // it must not be allowed to change what a row is.
    expect(selectionUnderArgs(FEED_QUERY, "publicSocialMediaLinks").fields).toEqual([
      "edges",
      "pageInfo",
      "totalCount",
    ]);
  });
});

/* ---------------------------------------------------------------------- *
 * The service-day history documents
 *
 * Three widgets draw the same 24 hourly buckets, so the two new documents must select the bucket
 * shape EXACTLY as `LINE_STATUS_HISTORY_QUERY` already does. A missing field would still compile —
 * `LineStatusHourBucket` is a hand-written type, and a hand-written type will happily claim a key a
 * document never asked for — and the widget would then render an undefined count as if it were a real
 * one.
 * ---------------------------------------------------------------------- */

describe("the service-day history documents", () => {
  /** Every field an hour bucket must carry, and nothing else. */
  const BUCKET_FIELDS = ["hourStart", "hourEnd", "count", "dominantStatus", "statusCounts"];
  const STATUS_COUNT_FIELDS = ["status", "count"];

  it("networkStatusHistory selects the same bucket shape as the per-line chart", () => {
    const buckets = selectionUnderArgs(NETWORK_STATUS_HISTORY_QUERY, "networkStatusHistory");
    expect(buckets.fields).toEqual(BUCKET_FIELDS);
    expect(buckets.nested["statusCounts"]?.fields).toEqual(STATUS_COUNT_FIELDS);
  });

  it("linesStatusHistory keys each entry by line and nests the same buckets", () => {
    const entries = selectionUnderArgs(LINES_STATUS_HISTORY_QUERY, "linesStatusHistory");
    expect(entries.fields).toEqual(["lineId", "buckets"]);
    // `lineId` is what the store keys the per-line map by — a strip that could not tell which line a
    // bucket belonged to would draw the same history on every row.
    expect(entries.nested["buckets"]?.fields).toEqual(BUCKET_FIELDS);
    expect(entries.nested["buckets"]?.nested["statusCounts"]?.fields).toEqual(STATUS_COUNT_FIELDS);
  });

  it("declares and passes dayStartHour on the network read, so the defaulting call is legal", () => {
    // The variable is DECLARED AND PASSED but deliberately omitted from every variables object this
    // side builds, so the backend's default of 3 (the 03:00→02:00 service day) applies. A declared
    // variable nothing references is a validation error, so "we never send it" can never quietly
    // become "we removed it" without the server rejecting the query.
    const bare = withoutComments(NETWORK_STATUS_HISTORY_QUERY);
    expect(bare).toMatch(/\$dayStartHour:\s*Int\b/);
    expect(bare).toMatch(/dayStartHour:\s*\$dayStartHour/);
  });

  it("leaves dayStartHour off the multi-line read entirely, as the plan's document specifies", () => {
    // Only the network document declares it. The per-line document has no use for the argument, and
    // declaring a variable it never references would be a validation error — so the honest spelling is
    // absence, and the backend's default covers both windows identically anyway.
    expect(withoutComments(LINES_STATUS_HISTORY_QUERY)).not.toContain("dayStartHour");
  });

  it("declares lineIds as the only REQUIRED variable on the multi-line read", () => {
    // `[ID!]!` is non-null on the backend, so it has to be non-null here: a nullable declaration would
    // let a caller omit it and send the empty query the backend treats as "no lines at all".
    expect(withoutComments(LINES_STATUS_HISTORY_QUERY)).toMatch(/\$lineIds:\s*\[ID!\]!/);
  });

  it("never asks for the history twice in one document — two roots would be a mistake", () => {
    // Cheap guard against a copy-paste that left a second root field behind: the parser's root walk is
    // per-field, so an extra root would simply be ignored by every consumer above.
    expect(
      selectionUnderArgs(NETWORK_STATUS_HISTORY_QUERY, "networkStatusHistory").fields.length,
    ).toBe(BUCKET_FIELDS.length);
    expect(NETWORK_STATUS_HISTORY_QUERY).not.toContain("linesStatusHistory");
    expect(LINES_STATUS_HISTORY_QUERY).not.toContain("networkStatusHistory");
  });
});

/* ---------------------------------------------------------------------- *
 * The Pro dashboard's incidents read
 *
 * Two properties are load-bearing and neither is visible in the TYPE: the document must really pass
 * the variables it declares (a declared-but-unused GraphQL variable is a validation error, so a
 * document that declared one WITHOUT using it would be rejected outright), and the variables object
 * must be a LITERAL — a `new Date()` anywhere in it would make the server render and the client
 * hydration compute different values, discard the TransferState payload and refetch every read twice.
 * ---------------------------------------------------------------------- */

describe("HOME_RECENT_INCIDENTS_QUERY", () => {
  it("declares AND passes both variables, so the read is the one the store issues", () => {
    const bare = withoutComments(HOME_RECENT_INCIDENTS_QUERY);
    expect(bare).toMatch(/\$filters:\s*CalendarIncidentFilter\b/);
    expect(bare).toMatch(/\$order:\s*CalendarIncidentOrder\b/);
    expect(bare).toMatch(/calendarIncidents\([\s\S]*?filters:\s*\$filters/);
    expect(bare).toMatch(/calendarIncidents\([\s\S]*?order:\s*\$order/);
  });

  it("sends the CONTINUING window, never a date this client computed", () => {
    // The whole reason this document exists. `ongoing: true` is the backend's `end_datetime IS NULL` and
    // `startDatetime: DESC` puts the newest first, so a "recent" list needs no clock at all — and the
    // variables are therefore byte-identical in every process, which is the property the whole home
    // contract rests on (the same rule that makes the feed's `lastWeekOnly` a backend boolean).
    expect(HOME_RECENT_INCIDENT_VARS).toEqual({
      filters: { OR: { ongoing: true } },
      order: { startDatetime: "DESC" },
    });
    expect(JSON.stringify(HOME_RECENT_INCIDENT_VARS)).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it("freezes the variables so no caller can mutate the constant the server render sent", () => {
    expect(Object.isFrozen(HOME_RECENT_INCIDENT_VARS)).toBe(true);
  });

  it("asks for a MINIMAL row — no details, medias, chronologies or nested links", () => {
    // The insiden page's own document selects all of those because its cards render them. This widget
    // draws one row per incident, so asking for them would multiply payload and resolver fan-out across
    // the WHOLE dataset for fields nothing here reads. `toEqual`, not `toContain`: an added field is the
    // failure this assertion exists to catch.
    expect(selectionUnderArgs(HOME_RECENT_INCIDENTS_QUERY, "calendarIncidents").fields).toEqual([
      "id",
      "startDatetime",
      "endDatetime",
      "severity",
      "title",
      "brief",
      "lines",
    ]);
  });

  it("takes only the identifying pair off each line", () => {
    const rows = selectionUnderArgs(HOME_RECENT_INCIDENTS_QUERY, "calendarIncidents");
    expect(rows.nested["lines"]?.fields).toEqual(["id", "code"]);
  });
});

describe("SUBMIT_FEED_LINK_MUTATION selection", () => {
  it("mirrors FEED_QUERY's level depth", () => {
    expect(linkChain(SUBMIT_FEED_LINK_MUTATION, "link")).toHaveLength(EXPECTED_LINK_LEVELS);
  });

  it.each(EDIT_ROUND_TRIP_SELECTIONS)(
    "selects $relation with the same identifying pair at every level, because the payload's declared type IS FeedLink",
    ({ relation, fields }) => {
      for (const level of LEVEL_INDEXES) {
        expect(submittedLinkLevel(level).nested[relation]?.fields).toEqual(fields);
      }
    },
  );
});

/* ---------------------------------------------------------------------- *
 * The vote mutations' acknowledgement
 * ---------------------------------------------------------------------- *
 *
 * Same defect class as the sections above, and this is where it would bite hardest: a
 * document narrowed back to `{ ok }` STILL COMPILES, because the `ok`-shaped payload type
 * would still be structurally satisfied by `{ ok: true }`, and every fixture in the repo
 * mocks the response rather than reading it. The control would then fall back to its own
 * optimistic projection — silently reinstating the "the server only said ok, so work out
 * the score yourself" path that made the vote indicator snap back.
 *
 * `ok` is asserted PRESENT, not just tolerated: the payload widened, it did not replace, so
 * a `{ ok }` client keeps working and this is a widening rather than a rewrite.
 */
describe("link vote mutation selection", () => {
  const VOTE_MUTATIONS: Array<{ name: string; document: string; rootField: string }> = [
    {
      name: "UPVOTE_SOCIAL_MEDIA_LINK_MUTATION",
      document: UPVOTE_SOCIAL_MEDIA_LINK_MUTATION,
      rootField: "upvoteSocialMediaLink",
    },
    {
      name: "DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION",
      document: DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION,
      rootField: "downvoteSocialMediaLink",
    },
    {
      name: "REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION",
      document: REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION,
      rootField: "removeSocialMediaLinkVote",
    },
  ];

  it.each(VOTE_MUTATIONS)(
    "$name asks for the whole vote state, not a bare ok",
    ({ document, rootField }) => {
      expect(selectionUnderArgs(document, rootField).fields).toEqual([
        "ok",
        "userVote",
        "voteScore",
        "upvotes",
        "downvotes",
      ]);
    },
  );

  it("keeps all three documents in step — one shape, so the control has one code path", () => {
    const shapes = new Set(
      VOTE_MUTATIONS.map(({ document, rootField }) =>
        selectionUnderArgs(document, rootField).fields.join(","),
      ),
    );
    expect(shapes.size).toBe(1);
  });
});

describe("incident/chronology vote mutation selection", () => {
  const VOTE_MUTATIONS: Array<{ name: string; document: string; rootField: string }> = [
    { name: "UPVOTE_MUTATION", document: UPVOTE_MUTATION, rootField: "upvote" },
    { name: "DOWNVOTE_MUTATION", document: DOWNVOTE_MUTATION, rootField: "downvote" },
    { name: "REMOVE_VOTE_MUTATION", document: REMOVE_VOTE_MUTATION, rootField: "removeVote" },
    {
      name: "UPVOTE_CHRONOLOGY_MUTATION",
      document: UPVOTE_CHRONOLOGY_MUTATION,
      rootField: "upvoteChronology",
    },
    {
      name: "DOWNVOTE_CHRONOLOGY_MUTATION",
      document: DOWNVOTE_CHRONOLOGY_MUTATION,
      rootField: "downvoteChronology",
    },
    {
      name: "REMOVE_CHRONOLOGY_VOTE_MUTATION",
      document: REMOVE_CHRONOLOGY_VOTE_MUTATION,
      rootField: "removeChronologyVote",
    },
  ];

  it.each(VOTE_MUTATIONS)(
    "$name asks for the whole vote state, not a bare ok",
    ({ document, rootField }) => {
      expect(selectionUnderArgs(document, rootField).fields).toEqual([
        "ok",
        "userVote",
        "voteScore",
        "upvotes",
        "downvotes",
      ]);
    },
  );

  it("matches the link mutations' shape field-for-field", () => {
    // All nine acknowledge identically on the server (`VoteMutationPayload`), so a divergence
    // here would mean one target's control silently fell back to its own arithmetic.
    const linkShape = selectionUnderArgs(
      UPVOTE_SOCIAL_MEDIA_LINK_MUTATION,
      "upvoteSocialMediaLink",
    ).fields;
    for (const { document, rootField } of VOTE_MUTATIONS) {
      expect(selectionUnderArgs(document, rootField).fields).toEqual(linkShape);
    }
  });
});

/* ---------------------------------------------------------------------- *
 * The consequence: a feed row must survive a trip through the edit sheet
 * ---------------------------------------------------------------------- *
 *
 * The parse assertions above prove the document ASKS for the tags. These prove the only
 * reason that matters — that a row shaped like what `FEED_QUERY` returns, opened in the
 * shared edit sheet and saved without touching a tag control, sends its tags back instead
 * of blanking them. `SocialMediaLinkInput` is replace-not-patch: the backend assigns the
 * title and calls `.set()` on lines/vehicles/stations/categories unconditionally, so an
 * empty list in the payload is an instruction, not an absence.
 *
 * 🔴 The row's tags are GATED ON THE PARSED SELECTION rather than hand-written. That is the
 * point: a hand-written fixture would carry tags whether or not the document asked for them,
 * which is exactly how the original defect survived — every test passed while the server was
 * sending no tags at all, because no test's fixture came from the document. Here a relation
 * the document stops selecting is missing from the row, the form hydrates an empty selection
 * from it, and the payload below carries the empty list: the silent wipe, made visible.
 */
describe("a feed row round-trips its tags through the shared edit sheet", () => {
  /** The row's tag lists, present only where `FEED_QUERY`'s root node actually selects the
   *  relation. Only PRESENCE is derived: the field pairs inside each element are literals
   *  here and are pinned independently (and exactly) by the selection assertions above. */
  interface FeedRowTags {
    vehicles?: Array<{ id: string; identificationNo: string }>;
    stations?: Array<{ id: string; displayName: string }>;
    categories?: Array<{ id: string; name: string }>;
  }

  function feedRowTags(): FeedRowTags {
    const root = feedLevel(0);
    const tags: FeedRowTags = {};
    if (root.fields.includes("vehicles")) {
      tags.vehicles = [{ id: "vehicles-1", identificationNo: "TR-1" }];
    }
    if (root.fields.includes("stations")) {
      tags.stations = [{ id: "stations-1", displayName: "KL Sentral" }];
    }
    if (root.fields.includes("categories")) {
      tags.categories = [{ id: "categories-1", name: "Signal" }];
    }
    return tags;
  }

  let requestMock: ReturnType<typeof vi.fn>;
  let sheet: InstanceType<typeof LinkSheetService>;
  let fixture: ComponentFixture<LinkFormComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ updateSocialMediaLink: { ok: true } });

    await TestBed.configureTestingModule({
      imports: [LinkFormComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => true, isAdmin: () => false, idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();

    sheet = TestBed.inject(LinkSheetService);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LinkFormComponent);
    fixture.detectChanges();
    httpMock
      .expectOne((request) => request.method === "POST")
      .flush({
        data: {
          lines: [],
          stations: [],
          calendarIncidentCategories: [{ id: "categories-1", name: "Just Reporting" }],
        },
      });
    await fixture.whenStable();
  });

  it("sends the feed row's own vehicles/stations/categories back instead of blanking them", async () => {
    sheet.openEdit({
      id: "feed-1",
      url: "https://example.com/feed-1",
      title: "Feed link feed-1",
      occurredAt: "2026-08-01T08:30:00",
      lines: [{ id: "line-1" }],
      ...feedRowTags(),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await (fixture.componentInstance as unknown as { submit(): Promise<void> }).submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [, vars] = requestMock.mock.calls[0];
    // One assertion per relation rather than a single `toEqual` on the input: each names the
    // one field that gets blanked, and `[]` here is not "no tags", it is "erase the tags".
    expect(vars.input.vehicleIds).toEqual(["vehicles-1"]);
    expect(vars.input.stationIds).toEqual(["stations-1"]);
    expect(vars.input.categoryIds).toEqual(["categories-1"]);
    expect(vars.input.lineIds).toEqual(["line-1"]);
  });
});
