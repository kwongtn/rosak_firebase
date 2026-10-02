import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { LinkCardComponent } from "../link-card/link-card.component";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLinksQueryData,
} from "../data/social-links.queries";
import { LinksSectionComponent } from "./links-section.component";

/** The field names selected on the `node { … }` block of a links document, read straight out of the
 *  document the host SENT rather than hand-copied or imported.
 *
 *  Why parse instead of `expect(query).not.toContain("sublinks")`: the document's `#` comment block
 *  explains the flat decision IN PROSE, so the word "sublinks" appears in it several times and a
 *  substring assertion could not tell a comment from a selection. Brace-matching the node block and
 *  keeping only bare identifiers drops the comments and the sibling `cursor`/`pageInfo` selections
 *  in one pass. Taking the document as an argument (rather than importing the constant) is what
 *  ties the assertion to the request on the wire.
 *
 *  Duplicated per spec file rather than shared: each flat host pins the same shared document from
 *  its own suite, and a shared test helper would be one more module to chase to find out what a
 *  spec is really asserting. */
function nodeSelectionOf(doc: string): string[] {
  const nodeOpen = doc.indexOf("node {");
  if (nodeOpen < 0) {
    throw new Error("PUBLIC_SOCIAL_MEDIA_LINKS_QUERY has no node selection");
  }
  const bodyStart = nodeOpen + "node {".length;
  let depth = 1;
  let cursor = bodyStart;
  while (cursor < doc.length && depth > 0) {
    const ch = doc[cursor];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    cursor++;
  }
  return doc
    .slice(bodyStart, cursor - 1)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(line));
}

interface TestableLinksSection {
  loadMore(): Promise<void>;
  voteValues(): Record<string, number>;
}

function asTestable(fixture: ComponentFixture<LinksSectionComponent>): TestableLinksSection {
  return fixture.componentInstance as unknown as TestableLinksSection;
}

type LinkNode = PublicSocialMediaLinksQueryData["publicSocialMediaLinks"]["edges"][number]["node"];

function makeLink(id: string, status: string | null, overrides: Partial<LinkNode> = {}): LinkNode {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    status,
    completed: false,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    vehicles: [],
    stations: [],
    ...overrides,
  };
}

function connectionOf(nodes: LinkNode[], hasNextPage: boolean, endCursor: string | null) {
  return {
    publicSocialMediaLinks: {
      edges: nodes.map((node, index) => ({ node, cursor: endCursor ?? `cursor-${index}` })),
      pageInfo: { hasNextPage, endCursor },
    },
  };
}

describe("LinksSectionComponent pagination", () => {
  let fixture: ComponentFixture<LinksSectionComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinksSectionComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => false, isAdmin: () => false, user: () => null },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LinksSectionComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("loads the first page with first=20 and renders the nodes", async () => {
    const req = httpMock.expectOne((r) => r.method === "POST");
    expect(req.request.body.variables).toEqual({ first: 20 });
    req.flush({
      data: connectionOf(
        [makeLink("a", "LIVE"), makeLink("b", "PENDING_APPROVAL")],
        true,
        "cursor-a",
      ),
    });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Link a");
    // The pending collapsible lists the pending count.
    expect(fixture.nativeElement.textContent).toContain("Pending (1)");
  });

  it("groups by the approval status: LIVE approved, PENDING_APPROVAL collapsed away", async () => {
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf([makeLink("a", "LIVE"), makeLink("b", "PENDING_APPROVAL")], false, null),
      });
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector("button[aria-expanded]") as HTMLButtonElement;

    expect(toggle.textContent).toContain("Pending (1)");
    // The LIVE row is approved, so it renders; the PENDING_APPROVAL row stays collapsed.
    expect(root.textContent).toContain("Link a");
    expect(root.textContent).not.toContain("Link b");

    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const pendingSection = toggle.parentElement as HTMLElement;
    const pendingCards = pendingSection.querySelectorAll("app-link-card");
    expect(pendingCards.length).toBe(1);
    expect(pendingCards[0].textContent).toContain("Link b");
    // The LIVE row lives in the day-grouped approved list, outside the pending collapsible.
    expect(pendingSection.textContent).not.toContain("Link a");
  });

  it("appends the next page via the after cursor without refetching the first", async () => {
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf([makeLink("a", "LIVE")], true, "cursor-a"),
      });
    await fixture.whenStable();

    const loadMore = asTestable(fixture).loadMore();
    const next = httpMock.expectOne((r) => r.method === "POST");
    expect(next.request.body.variables).toEqual({ first: 20, after: "cursor-a" });
    next.flush({
      data: connectionOf([makeLink("b", "LIVE")], false, "cursor-b"),
    });
    await loadMore;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Link a");
    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  it("shows an inline retry when a continuation page fails", async () => {
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf([makeLink("a", "LIVE")], true, "cursor-a"),
      });
    await fixture.whenStable();

    const loadMore = asTestable(fixture).loadMore();
    const next = httpMock.expectOne((r) => r.method === "POST");
    next.flush({ errors: [{ message: "boom" }] });
    await loadMore;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Couldn't load more — retry");
  });

  it("retries the failed page through the retry button", async () => {
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf([makeLink("a", "LIVE")], true, "cursor-a"),
      });
    await fixture.whenStable();

    const failed = asTestable(fixture).loadMore();
    httpMock.expectOne((r) => r.method === "POST").flush({ errors: [{ message: "boom" }] });
    await failed;
    fixture.detectChanges();

    const retry: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="retry-load-more"]',
    );
    retry.click();
    const retried = httpMock.expectOne((r) => r.method === "POST");
    expect(retried.request.body.variables).toEqual({ first: 20, after: "cursor-a" });
    retried.flush({ data: connectionOf([makeLink("b", "LIVE")], false, "cursor-b") });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  it("keeps the empty state once, before any page loads", async () => {
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf([], false, null),
      });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain("No submitted links yet.");
  });

  it("records a card vote in the overlay and feeds it back as that card's userVote", async () => {
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf([makeLink("a", "LIVE")], false, null),
      });
    await fixture.whenStable();

    const card = fixture.debugElement.query(By.directive(LinkCardComponent));
    expect(card).not.toBeNull();

    card.componentInstance.voteChanged.emit({ value: 1 });
    fixture.detectChanges();

    expect(asTestable(fixture).voteValues()).toEqual({ a: 1 });
    expect(card.componentInstance.userVote()).toBe(1);
  });

  it("keeps the tab flat: never asks the backend to collapse conversations", async () => {
    // Omitting the key is the only legal spelling on a `Boolean!` argument, and it is also what
    // keeps every sublink a row of its own on this "see everything submitted" tab.
    const first = httpMock.expectOne((r) => r.method === "POST");
    expect(first.request.body.variables).not.toHaveProperty("collapseThreads");
    first.flush({ data: connectionOf([makeLink("a", "LIVE")], true, "cursor-a") });
    await fixture.whenStable();

    const loadMore = asTestable(fixture).loadMore();
    const next = httpMock.expectOne((r) => r.method === "POST");
    expect(next.request.body.variables).not.toHaveProperty("collapseThreads");
    next.flush({ data: connectionOf([makeLink("b", "LIVE")], false, "cursor-b") });
    await loadMore;
  });

  it("heads the day group with the event time, not the submission time", async () => {
    // Today (UTC) as the event instant against a 2020 submission: grouping on `created` would
    // render a 2020 header instead of "Today".
    const todayUtc = new Date().toISOString().slice(0, 10);
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf(
          [
            makeLink("a", "LIVE", {
              created: "2020-01-01T00:00:00Z",
              occurredAt: `${todayUtc}T08:00:00Z`,
            }),
          ],
          false,
          null,
        ),
      });
    await fixture.whenStable();

    // Exactly one day header, and it names the EVENT day. (The card's own tooltip still shows
    // "Submitted Jan 1, 2020" — that provenance line is intentional and out of scope here.)
    const headers = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("h2")).map(
      (h) => h.textContent?.trim(),
    );
    expect(headers).toEqual(["Today"]);
  });

  /* ---- flat-host regression (plan F5): the in-card conversation affordance must not leak here - */

  it("shows no conversation chip and no chevron on a row that IS a conversation root", async () => {
    // The strongest form of this pin: the node carries everything a root carries, INCLUDING a
    // non-zero descendant count (3 descendants, so a naive reading would print "4 links"), and the
    // tab still shows neither the chip nor its toggle. That is correct, because this tab lists
    // every link as its own row — an expansion affordance here would point at nothing.
    //
    // It works because the card gates on its own `[sublinkCount]` INPUT, which `app-link-list`
    // never binds: a flat host passes nothing, the input stays 0, `hasSublinks()` is false. The
    // count living on the node is not what the card reads, and a fixture that supplies one proves
    // the chip does not fall back to it.
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf(
          [makeLink("root", "LIVE", { parentId: null, isThreadRoot: true, sublinkCount: 3 })],
          false,
          null,
        ),
      });
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain("Link root");
    expect(root.querySelector('[data-testid="link-thread-size"]')).toBeNull();
    expect(root.querySelector('[data-testid="link-thread-toggle"]')).toBeNull();
    // No conversation wrapper either: this tab renders cards directly, so there is nowhere for a
    // nested list to appear even if a count were passed down.
    expect(root.querySelectorAll("app-link-thread")).toHaveLength(0);
    expect(root.querySelectorAll("app-link-card")).toHaveLength(1);
  });

  it("keeps a sublink row chip-less too — a flat list has no expansion at any level", async () => {
    // The mirror case: a node that is NOT a root, so `isThreadRoot` is false and it still gets no
    // chip. Nothing here may ever gate on the tree fields, at any depth.
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf(
          [makeLink("child", "LIVE", { parentId: "root", isThreadRoot: false, sublinkCount: 0 })],
          false,
          null,
        ),
      });
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="link-thread-size"]')).toBeNull();
    expect(root.querySelector('[data-testid="link-thread-toggle"]')).toBeNull();
    // The card's toggle carries an aria-label naming the conversation, so the absence of ANY such
    // label is a chip-independent second witness that the affordance did not render.
    expect(root.querySelector('[aria-label*="thread"]')).toBeNull();
  });

  it("does not select sublinks: a flat, complete list must not offer an expansion", async () => {
    // Read off the document this tab actually SENDS, so adding the nested selection to the shared
    // query turns this red before a chip could ever render. The three SCALAR tree fields stay
    // selected on purpose (a row may report "part of a 3-link report" as a plain fact); it is the
    // LIST, and with it every expansion affordance, that must not follow.
    const req = httpMock.expectOne((r) => r.method === "POST");
    const selected = nodeSelectionOf(req.request.body.query);

    expect(selected).not.toContain("sublinks");
    expect(selected).toContain("parentId");
    expect(selected).toContain("isThreadRoot");
    expect(selected).toContain("sublinkCount");

    req.flush({ data: connectionOf([], false, null) });
    await fixture.whenStable();
  });
});
