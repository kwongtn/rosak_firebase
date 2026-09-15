import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { PublicSocialMediaLinksQueryData } from "../data/social-links.queries";
import { LinksSectionComponent } from "./links-section.component";

interface TestableLinksSection {
  loadMore(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<LinksSectionComponent>): TestableLinksSection {
  return fixture.componentInstance as unknown as TestableLinksSection;
}

function makeLink(
  id: string,
  completed: boolean,
): PublicSocialMediaLinksQueryData["publicSocialMediaLinks"]["edges"][number]["node"] {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    completed,
    lines: [],
    vehicles: [],
    stations: [],
  };
}

function connectionOf(
  nodes: ReturnType<typeof makeLink>[],
  hasNextPage: boolean,
  endCursor: string | null,
) {
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
      data: connectionOf([makeLink("a", true), makeLink("b", false)], true, "cursor-a"),
    });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Link a");
    // The pending collapsible lists the pending count.
    expect(fixture.nativeElement.textContent).toContain("Pending (1)");
  });

  it("appends the next page via the after cursor without refetching the first", async () => {
    httpMock
      .expectOne((r) => r.method === "POST")
      .flush({
        data: connectionOf([makeLink("a", true)], true, "cursor-a"),
      });
    await fixture.whenStable();

    const loadMore = asTestable(fixture).loadMore();
    const next = httpMock.expectOne((r) => r.method === "POST");
    expect(next.request.body.variables).toEqual({ first: 20, after: "cursor-a" });
    next.flush({
      data: connectionOf([makeLink("b", true)], false, "cursor-b"),
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
        data: connectionOf([makeLink("a", true)], true, "cursor-a"),
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
        data: connectionOf([makeLink("a", true)], true, "cursor-a"),
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
    retried.flush({ data: connectionOf([makeLink("b", true)], false, "cursor-b") });
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
});
