import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLink,
  PublicSocialMediaLinksQueryData,
  REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
  UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
} from "../../insiden/data/social-links.queries";
import { MyLinksComponent } from "./my-links.component";

interface TestableMyLinks {
  loadMore(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<MyLinksComponent>): TestableMyLinks {
  return fixture.componentInstance as unknown as TestableMyLinks;
}

/**
 * A row as PUBLIC_SOCIAL_MEDIA_LINKS_QUERY actually returns it. The tree scalars default to the
 * ordinary ungrouped case — `parentId: null` (which IS what "is a root" means, and is true of
 * every link nobody has nested), `isThreadRoot: true` (the same fact, spelled out) and
 * `sublinkCount: 0` (a leaf has no descendants) — so a fixture that forgets them reads as a lone
 * link instead of quietly testing something the server would never send.
 *
 * `position: 10` is a real stored sibling rank, not a placeholder: a run is ordered `position`
 * ASC with `id` as the tie-break, so fixtures silent about the sequence share one number and fall
 * through to that documented tie-break — which is what `a`, `b`, `c` means by "in order". A spec
 * about the sequence opts into distinct positions, as it opts into distinct parents. Pass
 * `position` through `tree` (which is spread last) to say otherwise.
 */
function makeLink(
  id: string,
  status: string | null,
  completed: boolean,
  tree: Partial<PublicSocialMediaLink> = {},
): PublicSocialMediaLink {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    status,
    completed,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    vehicles: [],
    stations: [],
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    position: 10,
    ...tree,
  };
}

/** A row whose payload came back WITHOUT `position` — the stale-cache / host-that-stopped-selecting
 *  case. Built by deleting the key rather than by loosening the factory, so the fixture cannot
 *  leak optionality into every other spec. */
function withoutStoredOrder(link: PublicSocialMediaLink): PublicSocialMediaLink {
  const copy = { ...link } as Record<string, unknown>;
  delete copy["position"];
  return copy as unknown as PublicSocialMediaLink;
}

function connectionOf(
  nodes: PublicSocialMediaLink[],
  hasNextPage: boolean,
  endCursor: string | null,
): PublicSocialMediaLinksQueryData {
  return {
    publicSocialMediaLinks: {
      edges: nodes.map((node, index) => ({ node, cursor: endCursor ?? `cursor-${index}` })),
      pageInfo: { hasNextPage, endCursor },
    },
  };
}

/** The `hlm-checkbox` host carries the testid; the clickable control is the inner
 *  `button[role=checkbox]` that `brn-checkbox` renders. */
function tickRow(fixture: ComponentFixture<MyLinksComponent>, id: string): void {
  const host = fixture.nativeElement.querySelector(`[data-testid='select-link-${id}']`);
  if (!host) {
    throw new Error(`No selection checkbox for row ${id}`);
  }
  host.querySelector("button[role='checkbox']").click();
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<MyLinksComponent>, testId: string): HTMLButtonElement {
  const found = fixture.nativeElement.querySelector(`[data-testid='${testId}']`);
  if (!found) {
    throw new Error(`No [data-testid='${testId}'] in the rendered list`);
  }
  return found as HTMLButtonElement;
}

function optional(fixture: ComponentFixture<MyLinksComponent>, testId: string): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid='${testId}']`);
}

function rowCard(fixture: ComponentFixture<MyLinksComponent>, id: string): HTMLElement {
  const found = fixture.nativeElement.querySelector(`[data-testid='row-${id}']`);
  if (!found) {
    throw new Error(`No row card for ${id}`);
  }
  return found as HTMLElement;
}

function textOf(fixture: ComponentFixture<MyLinksComponent>, testId: string): string {
  const found = fixture.nativeElement.querySelector(`[data-testid='${testId}']`);
  return found ? (found.textContent ?? "") : "";
}

/** Load the given rows, then settle. `hasNextPage` models a list that is still paging, which
 *  is the state every structural action has to reason about. */
async function renderList(
  fixture: ComponentFixture<MyLinksComponent>,
  requestMock: ReturnType<typeof vi.fn>,
  nodes: PublicSocialMediaLink[],
  hasNextPage = false,
): Promise<void> {
  requestMock.mockResolvedValueOnce(
    connectionOf(nodes, hasNextPage, hasNextPage ? "cursor-0" : null),
  );
  fixture.detectChanges();
  await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
  await fixture.whenStable();
}

describe("MyLinksComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<MyLinksComponent>;

  beforeEach(async () => {
    requestMock = vi.fn();
    toastError = vi.fn();

    await TestBed.configureTestingModule({
      imports: [MyLinksComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { idToken: async () => "token", user: () => null },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: { success: vi.fn(), error: toastError, info: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyLinksComponent);
    fixture.componentRef.setInput("isOwnProfile", true);
  });

  it("fetches the first page with mine=true and id-token headers", async () => {
    requestMock.mockResolvedValue(
      connectionOf(
        [makeLink("a", "PENDING_APPROVAL", false), makeLink("b", "LIVE", true)],
        false,
        null,
      ),
    );
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[0];
    expect(query).toBe(PUBLIC_SOCIAL_MEDIA_LINKS_QUERY);
    expect(vars).toEqual({ mine: true, first: 20, after: null });
    expect(headers).toEqual({ "firebase-auth-key": "token" });

    expect(fixture.nativeElement.textContent).toContain("Link a");
    expect(fixture.nativeElement.textContent).toContain("Pending approval");
    expect(fixture.nativeElement.textContent).toContain("Live");
  });

  it("does not fetch when someone else's profile is viewed", async () => {
    fixture.componentRef.setInput("isOwnProfile", false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(requestMock).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("No links submitted yet.");
  });

  it("appends the next page via the after cursor", async () => {
    requestMock
      .mockResolvedValueOnce(connectionOf([makeLink("a", "LIVE", true)], true, "cursor-a"))
      .mockResolvedValueOnce(connectionOf([makeLink("b", "LIVE", true)], false, "cursor-b"));

    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    await asTestable(fixture).loadMore();
    await fixture.whenStable();

    expect(requestMock.mock.calls[1]).toEqual([
      PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
      { mine: true, first: 20, after: "cursor-a" },
      { "firebase-auth-key": "token" },
    ]);
    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  it("shows an inline retry when the first page fails", async () => {
    requestMock.mockRejectedValueOnce(new Error("boom"));
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid='retry-first-page']")).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load your submitted links.");
  });

  it("falls back to the raw URL as the row heading when title is empty", async () => {
    requestMock.mockResolvedValue(
      connectionOf([{ ...makeLink("c", "LIVE", true), title: "" }], false, null),
    );
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("https://example.com/c");
  });

  /* ---- grouping a NEW conversation ---------------------------------------- */

  it("sends ONLY linkIds — no parentId key — so the backend starts a new conversation", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);
    requestMock
      .mockResolvedValueOnce({ groupSocialMediaLinks: { ok: true, id: 7 } })
      .mockResolvedValue(connectionOf([], false, null));

    tickRow(fixture, "a");
    tickRow(fixture, "b");
    await fixture.whenStable();

    button(fixture, "group-selected").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[1];
    expect(query).toBe(GROUP_SOCIAL_MEDIA_LINKS_MUTATION);
    expect(vars).toEqual({ linkIds: ["a", "b"] });
    // Explicitly NOT `parentId: undefined` and NOT `parentId: null`: the argument is
    // `ID = null` WITH a default, and the KEY'S PRESENCE is what distinguishes "start a
    // new conversation" (backend elects the earliest row as the root) from "nest under this
    // link". Omitting it is the spelling that cannot be misread as the nest mode.
    expect(Object.prototype.hasOwnProperty.call(vars, "parentId")).toBe(false);
    expect(headers).toEqual({ "firebase-auth-key": "token" });
  });

  it("keeps the group action disabled for zero and for ONE ticked row", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);

    expect(button(fixture, "group-selected").disabled).toBe(true);

    tickRow(fixture, "a");
    expect(button(fixture, "group-selected").disabled).toBe(true);
    expect(textOf(fixture, "thread-selection-count")).toContain("1 selected");

    tickRow(fixture, "b");
    expect(button(fixture, "group-selected").disabled).toBe(false);

    // Nothing was sent — a one-link "thread" is a no-op that only looks like a thread.
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("clears the ticks and reloads the list from the first page after a successful group", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);
    requestMock
      .mockResolvedValueOnce({ groupSocialMediaLinks: { ok: true, id: 7 } })
      // The reload comes back as the backend now sees it: the earliest `(occurredAt, id)`
      // row is promoted to the root and the rest become its direct children. `sublinkCount`
      // is each node's OWN descendant count, so the root says 1 and the child says 0 —
      // load-bearing fixture values, since the badge is derived from them.
      .mockResolvedValue(
        connectionOf(
          [
            makeLink("a", "LIVE", true, { isThreadRoot: true, sublinkCount: 1 }),
            makeLink("b", "LIVE", true, { parentId: "a", isThreadRoot: false, sublinkCount: 0 }),
          ],
          false,
          null,
        ),
      );

    tickRow(fixture, "a");
    tickRow(fixture, "b");
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");

    button(fixture, "group-selected").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    // Reload = the same query again from page one (`after: null`), because the tree shape
    // and the counts are server-computed and nothing on this page can patch them.
    expect(requestMock.mock.calls[2]).toEqual([
      PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
      { mine: true, first: 20, after: null },
      { "firebase-auth-key": "token" },
    ]);
    expect(textOf(fixture, "thread-selection-count")).toContain("0 selected");
    // The ROOT carries the descendant count and so is the only row that shows the badge…
    expect(textOf(fixture, "thread-badge-a")).toContain("2 links");
    // …and the child, a leaf, must not grow one.
    expect(optional(fixture, "thread-badge-b")).toBeNull();
  });

  it("toasts and leaves the list and the ticks untouched when the group is rejected", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);
    requestMock.mockRejectedValueOnce(
      new GraphQLRequestError([{ message: "You can only group links you submitted." }]),
    );

    tickRow(fixture, "a");
    tickRow(fixture, "b");
    button(fixture, "group-selected").click();
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(toastError).toHaveBeenCalledWith(
      "Couldn't group these links",
      "You can only group links you submitted.",
    );
    // All-or-nothing server-side: no reload (call 2 was the mutation), and nothing is re-rendered.
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");
    expect(fixture.nativeElement.textContent).toContain("Link a");
    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  /* ---- the conversation badge (the off-by-one) ----------------------------- */

  it("badges a row by sublinkCount + 1, and a root with no sublinks gets NO badge", async () => {
    await renderList(fixture, requestMock, [
      // A root with TWO descendants: the conversation is three links, so the badge says so.
      // `sublinkCount: 2` is the whole point of the trap — passing it raw would read "2 links"
      // instead of "3 links".
      makeLink("r", "LIVE", true, { sublinkCount: 2 }),
      // A root with EXACTLY ONE sublink. This is the one hole the old count parameter could
      // not have: raw `1` makes threadLabel answer "" and the badge disappears off a row that
      // has something below it. `1 + 1` is what keeps it.
      makeLink("one", "LIVE", true, { sublinkCount: 1 }),
      // A root with NO sublinks is a degenerate conversation of one. `isThreadRoot: true` is
      // ALSO true here — and of every ordinary ungrouped link in the app — so it can never be
      // the gate; the badge must be absent.
      makeLink("solo", "LIVE", true, { isThreadRoot: true, sublinkCount: 0 }),
    ]);

    expect(textOf(fixture, "thread-badge-r")).toContain("3 links");
    expect(textOf(fixture, "thread-badge-one")).toContain("2 links");
    expect(optional(fixture, "thread-badge-solo")).toBeNull();
    // No "1 links" anywhere, and no "2 links" for the two-descendant row either.
    expect(fixture.nativeElement.textContent).not.toContain("1 links");
  });

  it("badges a SUBLINK that has its own descendants, because the count is per node", async () => {
    await renderList(fixture, requestMock, [
      makeLink("r", "LIVE", true, { sublinkCount: 3 }),
      makeLink("m", "LIVE", true, { parentId: "r", isThreadRoot: false, sublinkCount: 2 }),
    ]);

    // The depth-1 model could not produce this: a member's count was always 1 because only
    // the root had members. Under the tree every node carries its own descendant count.
    expect(textOf(fixture, "thread-badge-r")).toContain("4 links");
    expect(textOf(fixture, "thread-badge-m")).toContain("3 links");
  });

  /* ---- hierarchy by indent (the list is deliberately flat) ------------------ */

  it("indents a 3-level chain and renders a row whose parent is not loaded at depth 0", async () => {
    await renderList(fixture, requestMock, [
      makeLink("root", "LIVE", true, { sublinkCount: 2 }),
      makeLink("child", "LIVE", true, { parentId: "root", isThreadRoot: false, sublinkCount: 1 }),
      makeLink("grandchild", "LIVE", true, {
        parentId: "child",
        isThreadRoot: false,
        sublinkCount: 0,
      }),
      // A sublink whose parent has not been paged in. Indenting it under a parent the payload
      // does not contain would be a claim this page cannot support, so it is a depth-0 row —
      // which is also exactly what a cursor boundary looks like in real data.
      makeLink("orphan", "LIVE", true, { parentId: "not-loaded", isThreadRoot: false }),
    ]);

    expect(rowCard(fixture, "root").getAttribute("data-depth")).toBe("0");
    expect(rowCard(fixture, "child").getAttribute("data-depth")).toBe("1");
    expect(rowCard(fixture, "grandchild").getAttribute("data-depth")).toBe("2");
    expect(rowCard(fixture, "orphan").getAttribute("data-depth")).toBe("0");

    // The indent is real padding, one literal Tailwind step per level.
    expect(rowCard(fixture, "root").className).not.toContain("pl-8");
    expect(rowCard(fixture, "child").className).toContain("pl-8");
    expect(rowCard(fixture, "grandchild").className).toContain("pl-16");
    // …merged onto the card, not replacing it: the indent must not cost the row its own chrome.
    expect(rowCard(fixture, "child").className).toContain("bg-card");
  });

  /* ---- reordering a sibling run -------------------------------------------- */

  it("sends the WHOLE reordered root run with an explicit null parentId", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
      makeLink("c", "LIVE", true),
    ]);
    requestMock
      .mockResolvedValueOnce({ reorderSocialMediaLinks: { ok: true } })
      .mockResolvedValue(connectionOf([], false, null));

    button(fixture, "move-up-b").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[1];
    expect(query).toBe(REORDER_SOCIAL_MEDIA_LINKS_MUTATION);
    // A PERMUTATION of the whole sibling set, not the two rows that swapped: the backend
    // rebuilds the stored positions from the list it is given and appends whatever it was not
    // told about, so a two-item payload would silently push the un-named sibling to the end.
    expect(vars.linkIds).toEqual(["b", "a", "c"]);
    // 🔴 The key must be PRESENT and null: `null` is the meaningful value meaning "reorder the
    // roots". An omitted key is an operation error, NOT a synonym for the roots — and not a
    // schema one either: `parentId` is `ID`, nullable with no SDL default, so omitting it is
    // legal GraphQL and the refusal is the RESOLVER'S OWN GUARD (`interactions.py:287`).
    expect(Object.prototype.hasOwnProperty.call(vars, "parentId")).toBe(true);
    expect(vars.parentId).toBeNull();
    expect(headers).toEqual({ "firebase-auth-key": "token" });
  });

  it("moves a sublink inside its parent's own run, naming that parent", async () => {
    await renderList(fixture, requestMock, [
      makeLink("r", "LIVE", true, { sublinkCount: 2 }),
      makeLink("m1", "LIVE", true, { parentId: "r", isThreadRoot: false }),
      makeLink("m2", "LIVE", true, { parentId: "r", isThreadRoot: false }),
    ]);
    requestMock
      .mockResolvedValueOnce({ reorderSocialMediaLinks: { ok: true } })
      .mockResolvedValue(connectionOf([], false, null));

    button(fixture, "move-down-m1").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [, vars] = requestMock.mock.calls[1];
    // Only the siblings move: the root is not in the payload, and `m1`'s OWN parent is named
    // so the server knows which set is being permuted.
    expect(vars.linkIds).toEqual(["m2", "m1"]);
    expect(vars.parentId).toBe("r");
  });

  it("sends the run in STORED position order, never the order the pages arrived in", async () => {
    await renderList(fixture, requestMock, [
      makeLink("newest", "LIVE", true, { position: 30 }),
      makeLink("oldest", "LIVE", true, { position: 10 }),
      makeLink("middle", "LIVE", true, { position: 20 }),
    ]);
    requestMock
      .mockResolvedValueOnce({ reorderSocialMediaLinks: { ok: true } })
      .mockResolvedValue(connectionOf([], false, null));

    // The list arrives `occurredAt DESC, id DESC` and the backend built this
    // conversation OLDEST-FIRST, so the stored run is the reverse of the arrival order.
    // A payload built from the arrival order would write the feed's timeline over the
    // story — and, being a permutation rather than a move, that becomes the stored
    // sequence with no error anywhere.
    button(fixture, "move-down-oldest").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [, vars] = requestMock.mock.calls[1];
    // Stored [oldest, middle, newest] with "oldest" moved one place down. Read on
    // arrival order this would have been [newest, middle, oldest].
    expect(vars.linkIds).toEqual(["middle", "oldest", "newest"]);
  });

  it("breaks a position tie by id, so the payload is still deterministic", async () => {
    await renderList(fixture, requestMock, [
      makeLink("b", "LIVE", true, { position: 10 }),
      makeLink("a", "LIVE", true, { position: 10 }),
      makeLink("c", "LIVE", true, { position: 10 }),
    ]);
    requestMock
      .mockResolvedValueOnce({ reorderSocialMediaLinks: { ok: true } })
      .mockResolvedValue(connectionOf([], false, null));

    // 🔴 A tie is reachable, not hypothetical: `ungroupSocialMediaLinks` promotes a
    // link to a root WITHOUT renumbering it (backend `_ungroup_sync` writes `parent`
    // only), so a promoted root keeps the number it held under its old parent. Every
    // root's `parentId` is null, so all roots are siblings of each other and the root
    // run is where the collision shows. Only the `id` tie-break can order this run.
    button(fixture, "move-down-b").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [, vars] = requestMock.mock.calls[1];
    // [a, b, c] by id, with "b" one place down. Sorting on `position` alone keeps the
    // arrival order and sends [a, b, c] — a different write that reads as success.
    expect(vars.linkIds).toEqual(["a", "c", "b"]);
  });

  it("refuses to reorder when a sibling's stored order came back unreadable", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true, { position: 10 }),
      withoutStoredOrder(makeLink("b", "LIVE", true, { position: 20 })),
    ]);
    // Both directions are off with a reason, and nothing was sent: an absent `position`
    // is "the stored order is unknown", not 0 — sorting the unknown row to the front
    // would silently rewrite a sequence nobody read.
    for (const id of ["a", "b"]) {
      expect(button(fixture, `move-up-${id}`).disabled).toBe(true);
      expect(button(fixture, `move-up-${id}`).getAttribute("title")).toContain("stored order");
      expect(button(fixture, `move-down-${id}`).disabled).toBe(true);
      expect(button(fixture, `move-down-${id}`).getAttribute("title")).toContain("stored order");
    }
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("judges the two ends against the STORED run, not the arrival order", async () => {
    await renderList(fixture, requestMock, [
      makeLink("newest", "LIVE", true, { position: 30 }),
      makeLink("oldest", "LIVE", true, { position: 10 }),
      makeLink("middle", "LIVE", true, { position: 20 }),
    ]);

    // Stored [oldest, middle, newest]: "oldest" leads and "newest" ends the story,
    // even though the cards are on screen in the opposite order. On arrival order the
    // "Already first" and "Already last" reasons would land on the wrong rows.
    expect(button(fixture, "move-up-oldest").disabled).toBe(true);
    expect(button(fixture, "move-up-oldest").getAttribute("title")).toContain("Already first");
    expect(button(fixture, "move-down-newest").disabled).toBe(true);
    expect(button(fixture, "move-down-newest").getAttribute("title")).toContain("Already last");
    // The middle row moves both ways, which is what the stored order says about it.
    expect(button(fixture, "move-up-middle").disabled).toBe(false);
    expect(button(fixture, "move-down-middle").disabled).toBe(false);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("disables a move at the ends of the run, and says why on the button", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
      makeLink("c", "LIVE", true),
    ]);

    expect(button(fixture, "move-up-a").disabled).toBe(true);
    expect(button(fixture, "move-up-a").getAttribute("title")).toContain("Already first");
    expect(button(fixture, "move-down-c").disabled).toBe(true);
    expect(button(fixture, "move-down-c").getAttribute("title")).toContain("Already last");
    expect(button(fixture, "move-up-b").disabled).toBe(false);
    expect(button(fixture, "move-down-b").disabled).toBe(false);
    // Nothing was sent by inspecting the buttons.
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("disables every move while the list is still paging, because a sibling may be unloaded", async () => {
    await renderList(
      fixture,
      requestMock,
      [makeLink("a", "LIVE", true), makeLink("b", "LIVE", true), makeLink("c", "LIVE", true)],
      true,
    );

    // `b` is in the middle of the loaded run, so only the paging can be blocking it. Reorder
    // renumbers the set it is given and APPENDS the siblings it was not told about, so a run
    // that is still being paged in would silently push an unseen row to the end — no error.
    expect(button(fixture, "move-up-b").disabled).toBe(true);
    expect(button(fixture, "move-down-b").disabled).toBe(true);
    expect(button(fixture, "move-up-b").getAttribute("title")).toContain("still loading");
    // The reason is stated once, in prose, because the cause is global rather than per row.
    expect(textOf(fixture, "thread-sequence-notice")).toContain("Still loading more of your links");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the ticks through a reorder, because moving a link changes no membership", async () => {
    const rows = [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
      makeLink("c", "LIVE", true),
    ];
    await renderList(fixture, requestMock, rows);
    requestMock
      .mockResolvedValueOnce({ reorderSocialMediaLinks: { ok: true } })
      .mockResolvedValue(connectionOf(rows, false, null));

    tickRow(fixture, "a");
    tickRow(fixture, "c");
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");

    button(fixture, "move-down-a").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    // A reorder is not a membership change, so the selection survives it — unlike group and
    // nest, which clear the ticks because they DO change which rows sit together.
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");
  });

  it("toasts and leaves the ticks and the list intact when a reorder is rejected", async () => {
    const rows = [makeLink("a", "LIVE", true), makeLink("b", "LIVE", true)];
    await renderList(fixture, requestMock, rows);
    requestMock.mockRejectedValueOnce(
      new GraphQLRequestError([
        {
          message:
            "reorderSocialMediaLinks permutes one set of siblings: SocialMediaLink 2 is not a sublink of the named parent.",
        },
      ]),
    );

    tickRow(fixture, "a");
    button(fixture, "move-up-b").click();
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe("Couldn't reorder these links");
    expect(toastError.mock.calls[0][1]).toContain("permutes one set of siblings");
    // No reload (call 2 was the mutation) and the ticks are still there to retry with.
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(textOf(fixture, "thread-selection-count")).toContain("1 selected");
    expect(fixture.nativeElement.textContent).toContain("Link a");
    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  /* ---- nesting under a chosen row ------------------------------------------ */

  it("nests the ticked rows under the chosen row, sending that row's id as parentId", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
      makeLink("target", "LIVE", true, { sublinkCount: 1 }),
    ]);
    requestMock
      .mockResolvedValueOnce({ groupSocialMediaLinks: { ok: true, id: 9 } })
      // The reload comes back as the backend now sees it: both ticked rows are direct
      // CHILDREN of `target` (which may itself be a sublink — nothing is hoisted to a root),
      // so they are indented under it and the target's own descendant count grew by two.
      .mockResolvedValue(
        connectionOf(
          [
            makeLink("a", "LIVE", true, { parentId: "target", isThreadRoot: false }),
            makeLink("b", "LIVE", true, { parentId: "target", isThreadRoot: false }),
            makeLink("target", "LIVE", true, { sublinkCount: 3 }),
          ],
          false,
          null,
        ),
      );

    tickRow(fixture, "a");
    tickRow(fixture, "b");
    button(fixture, "nest-target").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [query, vars] = requestMock.mock.calls[1];
    // The SAME mutation as "group into a new conversation" — the key's presence is the whole
    // difference — which is why "group" must omit it and "nest" must always send it.
    expect(query).toBe(GROUP_SOCIAL_MEDIA_LINKS_MUTATION);
    expect(vars).toEqual({ linkIds: ["a", "b"], parentId: "target" });
    // Nesting changes which rows sit together, so the ticks go, and the shape on screen is the
    // backend's: two children indented under a target that now reports three descendants.
    expect(textOf(fixture, "thread-selection-count")).toContain("0 selected");
    expect(rowCard(fixture, "a").getAttribute("data-depth")).toBe("1");
    expect(rowCard(fixture, "b").getAttribute("data-depth")).toBe("1");
    expect(textOf(fixture, "thread-badge-target")).toContain("4 links");
  });

  it("enables every nest with ONE tick, and refuses a self-nesting target", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
      makeLink("c", "LIVE", true),
    ]);

    // Nothing ticked: there is no payload to move, so the one-or-more rule is off.
    expect(button(fixture, "nest-c").disabled).toBe(true);
    expect(button(fixture, "nest-c").getAttribute("title")).toContain("Tick one");

    // ONE tick is enough to nest — with a target, the same mutation makes the ticked row a
    // real child, unlike the no-target grouping minimum of two.
    tickRow(fixture, "a");
    expect(button(fixture, "nest-c").disabled).toBe(false);
    tickRow(fixture, "b");
    expect(button(fixture, "nest-c").disabled).toBe(false);

    // A ticked row cannot be its own target, and neither can anything under it — the server
    // rejects the WHOLE call for a cycle, so the two cases are the same case to the caller.
    expect(button(fixture, "nest-a").disabled).toBe(true);
    expect(button(fixture, "nest-a").getAttribute("title")).toContain("ticked too");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("nests a SINGLE ticked row under the chosen row", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("target", "LIVE", true, { sublinkCount: 1 }),
    ]);
    requestMock
      .mockResolvedValueOnce({ groupSocialMediaLinks: { ok: true, id: 9 } })
      .mockResolvedValue(
        connectionOf(
          [
            makeLink("a", "LIVE", true, { parentId: "target", isThreadRoot: false }),
            makeLink("target", "LIVE", true, { sublinkCount: 2 }),
          ],
          false,
          null,
        ),
      );

    tickRow(fixture, "a");
    button(fixture, "nest-target").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [query, vars] = requestMock.mock.calls[1];
    // The basic tree-building write — one link becomes a direct child of another —
    // which a two-tick minimum made impossible: the backend accepts a one-id list.
    expect(query).toBe(GROUP_SOCIAL_MEDIA_LINKS_MUTATION);
    expect(vars).toEqual({ linkIds: ["a"], parentId: "target" });
    expect(textOf(fixture, "thread-selection-count")).toContain("0 selected");
    expect(rowCard(fixture, "a").getAttribute("data-depth")).toBe("1");
  });

  it("disables nesting under a row that already sits under a ticked link (a cycle)", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true, { sublinkCount: 1 }),
      makeLink("under-a", "LIVE", true, { parentId: "a", isThreadRoot: false }),
      makeLink("free", "LIVE", true),
      makeLink("other", "LIVE", true),
    ]);
    // Ticked OUTSIDE `a`'s subtree, so the only thing that can block `under-a` is the cycle:
    // moving `under-a` beneath `a` would make `a` a descendant of itself.
    tickRow(fixture, "a");
    tickRow(fixture, "other");

    expect(button(fixture, "nest-under-a").disabled).toBe(true);
    expect(button(fixture, "nest-under-a").getAttribute("title")).toContain("cyclic");
    // The row that is not inside any ticked subtree is still a valid target.
    expect(button(fixture, "nest-free").disabled).toBe(false);
  });

  it("disables nesting under a row already at the deepest level a conversation may reach", async () => {
    await renderList(fixture, requestMock, [
      makeLink("l0", "LIVE", true, { sublinkCount: 1 }),
      makeLink("l1", "LIVE", true, { parentId: "l0", isThreadRoot: false, sublinkCount: 1 }),
      makeLink("l2", "LIVE", true, { parentId: "l1", isThreadRoot: false, sublinkCount: 1 }),
      makeLink("l3", "LIVE", true, { parentId: "l2", isThreadRoot: false, sublinkCount: 0 }),
      makeLink("x", "LIVE", true),
      makeLink("y", "LIVE", true),
    ]);
    // Ticked clear of the chain, so the depth check is the only gate left standing.
    tickRow(fixture, "x");
    tickRow(fixture, "y");

    // MAX_THREAD_DEPTH = 3 with a root at 0: `l3` is already at the cap, so it cannot take
    // another level. The mirror is only a hint — the backend measures the resulting depth and
    // rejects the call as a unit either way.
    expect(button(fixture, "nest-l3").disabled).toBe(true);
    expect(button(fixture, "nest-l3").getAttribute("title")).toContain("deepest level");
    expect(button(fixture, "nest-l2").disabled).toBe(false);
  });

  /* ---- ungrouping a sublink (and NOT a root) -------------------------------- */

  it("ungroups a sublink row with linkIds only, and offers nothing on a root", async () => {
    const root = makeLink("r", "LIVE", true, { sublinkCount: 2 });
    const child = makeLink("m", "LIVE", true, {
      parentId: "r",
      isThreadRoot: false,
      sublinkCount: 0,
    });
    await renderList(fixture, requestMock, [root, child]);
    requestMock
      .mockResolvedValueOnce({ ungroupSocialMediaLinks: { ok: true } })
      .mockResolvedValue(connectionOf([root, child], false, null));

    button(fixture, "ungroup-m").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[1];
    expect(query).toBe(UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION);
    expect(vars).toEqual({ linkIds: ["m"] });
    expect(headers).toEqual({ "firebase-auth-key": "token" });

    // A ROOT is not "ungrouped" — under the tree it is the HEAD of its conversation, with
    // nothing to detach — so no button is offered there, and no cascade is implied anywhere.
    expect(optional(fixture, "ungroup-r")).toBeNull();
    // The badge belongs to the row that HAS descendants, root or not.
    expect(optional(fixture, "thread-badge-r")).not.toBeNull();
    expect(optional(fixture, "thread-badge-m")).toBeNull();
  });

  it("detaches only the named row: the root keeps its other sublinks and its count", async () => {
    const root = makeLink("r", "LIVE", true, { sublinkCount: 2 });
    const first = makeLink("m1", "LIVE", true, { parentId: "r", isThreadRoot: false });
    const second = makeLink("m2", "LIVE", true, { parentId: "r", isThreadRoot: false });
    await renderList(fixture, requestMock, [root, first, second]);
    requestMock
      .mockResolvedValueOnce({ ungroupSocialMediaLinks: { ok: true } })
      // `ungroup` is deliberately NOT a cascade: `m1` is promoted to a root of its own and the
      // branch under `r` is untouched apart from losing that one child.
      .mockResolvedValue(
        connectionOf(
          [
            makeLink("r", "LIVE", true, { sublinkCount: 1 }),
            makeLink("m1", "LIVE", true, { parentId: null, isThreadRoot: true }),
            makeLink("m2", "LIVE", true, { parentId: "r", isThreadRoot: false }),
          ],
          false,
          null,
        ),
      );

    button(fixture, "ungroup-m1").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    // `m1` is now a root: it has its own Ungroup action gone, and it sits at depth 0.
    expect(optional(fixture, "ungroup-m1")).toBeNull();
    expect(rowCard(fixture, "m1").getAttribute("data-depth")).toBe("0");
    // `m2` is still under `r`, and `r` still reports one descendant — no re-root election and
    // no flattening, which is what the server documents and the UI must not contradict.
    expect(rowCard(fixture, "m2").getAttribute("data-depth")).toBe("1");
    expect(optional(fixture, "ungroup-m2")).not.toBeNull();
    expect(textOf(fixture, "thread-badge-r")).toContain("2 links");
  });

  /* ---- selection + discoverability ------------------------------------------ */

  it("ticks and clears every rendered row via Select all", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);

    const selectAll = fixture.nativeElement.querySelector(
      "[data-testid='select-all'] button[role='checkbox']",
    );
    selectAll.click();
    fixture.detectChanges();
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");
    expect(button(fixture, "group-selected").disabled).toBe(false);

    selectAll.click();
    fixture.detectChanges();
    expect(textOf(fixture, "thread-selection-count")).toContain("0 selected");
    expect(button(fixture, "group-selected").disabled).toBe(true);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("explains the whole capability next to the action, and wires the row verbs to it", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);

    const hint = textOf(fixture, "thread-hint");
    expect(hint).toContain("two or more");
    // The hint has to keep up with the backend: it used to promise grouping alone, while the
    // rows also offer ordering and nesting.
    expect(hint).toContain("order");
    expect(hint).toContain("nest");
    expect(button(fixture, "group-selected").getAttribute("aria-describedby")).toBe(
      "my-links-thread-hint",
    );
    expect(button(fixture, "nest-a").getAttribute("aria-describedby")).toBe("my-links-thread-hint");
  });
});
