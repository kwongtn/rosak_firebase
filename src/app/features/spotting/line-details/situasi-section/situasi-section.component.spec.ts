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
}

function makeLink(
  id: string,
): PublicSocialMediaLinksQueryData["publicSocialMediaLinks"]["edges"][number]["node"] {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    completed: true,
    voteScore: 2,
    userVote: 0,
    voteBreakdown: { upvotes: 2, downvotes: 0 },
    lines: [],
    vehicles: [],
    stations: [],
  };
}

function linksData(ids: string[]): PublicSocialMediaLinksQueryData {
  return {
    publicSocialMediaLinks: {
      edges: ids.map((id, index) => ({ node: makeLink(id), cursor: `cursor-${index}` })),
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
      .flush({ data: linksData(["a"]) });
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
});
