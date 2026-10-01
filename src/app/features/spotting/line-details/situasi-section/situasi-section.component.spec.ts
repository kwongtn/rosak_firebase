import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../../core/auth/auth.service";
import { ToastService } from "../../../../ui/toast/toast.service";
import { PublicSocialMediaLinksQueryData } from "../../../insiden/data/social-links.queries";
import { LinkCardComponent } from "../../../insiden/link-card/link-card.component";
import { SituasiSectionComponent } from "./situasi-section.component";

/** The field names selected on the `node { … }` block of the links document this panel sends, read
 *  out of that document rather than hand-copied or imported: its `#` comment block discusses
 *  `sublinks` in prose, so a substring assertion could not tell a comment from a selection.
 *  Brace-matching the node block and keeping only bare identifiers drops the comments and the
 *  sibling `cursor`/`pageInfo` selections. Duplicated from the /insiden tab's spec on purpose —
 *  each flat host pins the same shared document from its own suite. */
function nodeSelectionOf(doc: string): string[] {
  const nodeOpen = doc.indexOf("node {");
  if (nodeOpen < 0) {
    throw new Error("the links query has no node selection");
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

interface TestableSituasiSection {
  voteValues(): Record<string, number>;
  sorted(): PublicSocialMediaLinksQueryData["publicSocialMediaLinks"]["edges"][number]["node"][];
}

type LinkNode = PublicSocialMediaLinksQueryData["publicSocialMediaLinks"]["edges"][number]["node"];

function makeLink(id: string, overrides: Partial<LinkNode> = {}): LinkNode {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    status: "LIVE",
    completed: true,
    voteScore: 2,
    userVote: 0,
    voteBreakdown: { upvotes: 2, downvotes: 0 },
    lines: [],
    vehicles: [],
    stations: [],
    ...overrides,
  };
}

function linksData(nodes: LinkNode[]): PublicSocialMediaLinksQueryData {
  return {
    publicSocialMediaLinks: {
      edges: nodes.map((node, index) => ({ node, cursor: `cursor-${index}` })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

describe("SituasiSectionComponent vote overlay", () => {
  let fixture: ComponentFixture<SituasiSectionComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SituasiSectionComponent],
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
    fixture = TestBed.createComponent(SituasiSectionComponent);
    fixture.componentRef.setInput("lineId", "L1");
    fixture.detectChanges();
    TestBed.tick();
    // The hosted link sheet's form loads the reference (line/station/category) options even while
    // the sheet is closed — flush it alongside the section's own links read.
    httpMock
      .match((r) => r.method === "POST" && r.body.query.includes("InsidenReferenceData"))
      .forEach((request) =>
        request.flush({ data: { lines: [], stations: [], calendarIncidentCategories: [] } }),
      );
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("feeds a card vote back into that card's userVote", async () => {
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("PublicSocialMediaLinks"))
      .flush({ data: linksData([makeLink("a")]) });
    await fixture.whenStable();

    const card = fixture.debugElement.query(By.directive(LinkCardComponent));
    expect(card).not.toBeNull();

    card.componentInstance.voteChanged.emit({ value: -1 });
    fixture.detectChanges();

    expect((fixture.componentInstance as unknown as TestableSituasiSection).voteValues()).toEqual({
      a: -1,
    });
    expect(card.componentInstance.userVote()).toBe(-1);
  });

  it("orders the list by the event time, not the submission time", async () => {
    // "back-dated" was submitted LAST but happened first; the panel sorts the same instant the
    // backend orders the connection on (-occurred_at, -id), so it must lead the list.
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("PublicSocialMediaLinks"))
      .flush({
        data: linksData([
          makeLink("back-dated", {
            created: "2026-08-02T09:00:00Z",
            occurredAt: "2026-07-30T08:00:00Z",
          }),
          makeLink("fresh", {
            created: "2026-08-01T09:00:00Z",
            occurredAt: "2026-08-02T09:00:00Z",
          }),
        ]),
      });
    await fixture.whenStable();

    const sorted = (fixture.componentInstance as unknown as TestableSituasiSection).sorted();
    expect(sorted.map((link) => link.id)).toEqual(["fresh", "back-dated"]);
    // The fixture's `created` values run the OTHER way, so the assertion above can only pass if
    // the sort keyed on the event time.
    expect(sorted.map((link) => link.created)).toEqual([
      "2026-08-01T09:00:00Z",
      "2026-08-02T09:00:00Z",
    ]);
  });

  it("never asks the backend to collapse conversations (a per-line list stays flat and complete)", async () => {
    const req = httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("PublicSocialMediaLinks"),
    );
    // Omitting the key is the only legal spelling on a `Boolean!` argument; sending it at all
    // would hide every sublink from this line's filter.
    expect(req.request.body.variables).not.toHaveProperty("collapseThreads");
    req.flush({ data: linksData([makeLink("a")]) });
    await fixture.whenStable();
  });

  /* ---- flat-host regression (plan F5): the in-card conversation affordance must not leak here - */

  it("shows no conversation chip and no chevron on a row that IS a conversation root", async () => {
    // Same pin as the /insiden tab, for the same reason and with the same teeth: the node carries
    // a REAL descendant count (3, which a naive read would print as "4 links") and the panel still
    // renders neither the chip nor its toggle — correctly, because every sublink is already a row
    // of its own here and an expansion would point at nothing.
    //
    // The card gates on its own `[sublinkCount]` input, which `app-link-list` never binds on a flat
    // host, so the count on the node is never consulted. A fixture that supplies one proves the
    // chip does not silently fall back to `link.sublinkCount`.
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("PublicSocialMediaLinks"))
      .flush({
        data: linksData([
          makeLink("root", { parentId: null, isThreadRoot: true, sublinkCount: 3 }),
        ]),
      });
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain("Link root");
    expect(root.querySelector('[data-testid="link-thread-size"]')).toBeNull();
    expect(root.querySelector('[data-testid="link-thread-toggle"]')).toBeNull();
    expect(root.querySelector('[aria-label*="thread"]')).toBeNull();
    // Cards, not conversation wrappers — there is no nested list to reveal in the first place.
    expect(root.querySelectorAll("app-link-thread")).toHaveLength(0);
    expect(root.querySelectorAll("app-link-card")).toHaveLength(1);
  });

  it("does not select sublinks: a flat per-line list must not offer an expansion", async () => {
    // Read off the document this panel actually SENDS, so adding the nested selection to the
    // shared query turns this red before a chip could ever render. The scalar tree fields stay
    // selected as plain facts on a row; the LIST, and with it every expansion affordance, must not
    // follow them in.
    const req = httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("PublicSocialMediaLinks"),
    );
    const selected = nodeSelectionOf(req.request.body.query);

    expect(selected).not.toContain("sublinks");
    expect(selected).toContain("parentId");
    expect(selected).toContain("isThreadRoot");
    expect(selected).toContain("sublinkCount");

    req.flush({ data: linksData([]) });
    await fixture.whenStable();
  });
});
