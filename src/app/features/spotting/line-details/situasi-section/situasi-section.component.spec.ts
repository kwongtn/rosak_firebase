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

  it("never asks the backend to collapse threads (a per-line list stays flat and complete)", async () => {
    const req = httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("PublicSocialMediaLinks"),
    );
    // Omitting the key is the only legal spelling on a `Boolean!` argument; sending it at all
    // would hide every thread member from this line's filter.
    expect(req.request.body.variables).not.toHaveProperty("collapseThreads");
    req.flush({ data: linksData([makeLink("a")]) });
    await fixture.whenStable();
  });
});
