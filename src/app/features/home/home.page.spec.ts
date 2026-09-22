import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { ImageUploadService } from "../../core/upload/image-upload.service";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { RetryBannerComponent } from "../../ui/retry-banner/retry-banner.component";
import { ToastService } from "../../ui/toast/toast.service";
import { LinkSheetService } from "../insiden/data/link-sheet.service";
import { LinkCardComponent } from "../insiden/link-card/link-card.component";
import { ReportSheetService } from "../spotting/data/report-sheet.service";
import { SpottingLinesStore } from "../spotting/data/spotting-lines.store";
import { ReportFormComponent } from "../spotting/report-form/report-form.component";
import type { FeedLink, FeedLinkPageInfo, LinePulse } from "./data/home.queries";
import { HomeStore } from "./data/home.store";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { HomePage, FEED_INITIAL_VISIBLE } from "./home.page";
import { LinePulseListComponent } from "./line-pulse/line-pulse-list.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";

// LineStatusSheetComponent reads window.matchMedia in its constructor; the test DOM doesn't provide it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeFeedLink(id: string): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Feed link ${id}`,
    created: "2026-08-01T08:00:00Z",
    status: "LIVE",
    completed: false,
    voteScore: 3,
    userVote: 0,
    voteBreakdown: { upvotes: 3, downvotes: 0 },
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: { shortId: "abc12345", nickname: "Ali" },
  };
}

function makeLine(id: string): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 1,
    totalVehicleCount: 2,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 60,
    pulseLinks: [],
  };
}

interface StoreMock {
  lines: WritableSignal<LinePulse[]>;
  feedLinks: WritableSignal<FeedLink[]>;
  feedPageInfo: WritableSignal<FeedLinkPageInfo | null>;
  feedTotalCount: WritableSignal<number>;
  isLoading: WritableSignal<boolean>;
  isLoadingMore: WritableSignal<boolean>;
  hasError: WritableSignal<boolean>;
  userVoteFor: ReturnType<typeof vi.fn>;
  setUserVote: ReturnType<typeof vi.fn>;
  reloadAll: ReturnType<typeof vi.fn>;
  loadMore: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

describe("HomePage", () => {
  let store: StoreMock;
  let auth: {
    isLoggedIn: WritableSignal<boolean>;
    isAdmin: WritableSignal<boolean>;
    user: WritableSignal<{ uid: string } | null>;
  };
  let sheet: {
    isOpen: WritableSignal<boolean>;
    lineId: WritableSignal<string | null>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<HomePage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    store = {
      lines: signal<LinePulse[]>([makeLine("a")]),
      feedLinks: signal<FeedLink[]>([makeFeedLink("a"), makeFeedLink("b")]),
      feedPageInfo: signal<FeedLinkPageInfo | null>({ hasNextPage: true, endCursor: "cursor-a" }),
      feedTotalCount: signal(2),
      isLoading: signal(false),
      isLoadingMore: signal(false),
      hasError: signal(false),
      userVoteFor: vi.fn((linkId: string) => (linkId === "a" ? 1 : 0)),
      setUserVote: vi.fn(),
      reloadAll: vi.fn(),
      loadMore: vi.fn(async () => undefined),
      start: vi.fn(),
      stop: vi.fn(),
    };
    auth = {
      isLoggedIn: signal(false),
      isAdmin: signal(false),
      user: signal<{ uid: string } | null>(null),
    };
    sheet = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
      openFor: vi.fn(),
      setOpen: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        { provide: HomeStore, useValue: store },
        { provide: LineStatusSheetService, useValue: sheet },
        // Hosted spotting form injects this route-scoped store; its lines+vehicles POST is
        // flushed below.
        { provide: SpottingLinesStore, useValue: { lines: signal([]) } },
        { provide: ImageUploadService, useValue: { addToQueue: vi.fn() } },
        {
          provide: AuthService,
          useValue: {
            ...auth,
            firstName: signal(null),
            login: vi.fn(),
            idToken: vi.fn(async () => null),
            whenReady: Promise.resolve(),
          },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    })
      // The shell (nav/footer) drags in ResizeObserver + Firestore-shaped deps that this
      // composition test doesn't care about — drop them and allow the tags as inert elements.
      .overrideComponent(HomePage, {
        remove: { imports: [AppNavComponent, AppFooterComponent] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    // The sheets' projected forms are created with the page (Angular builds projected content
    // eagerly; HlmSheet only gates the panel's own DOM), so their reads are already in flight
    // here even though both sheets are closed. A pending httpResource keeps the app unstable, so
    // tick + flush them before awaiting stability.
    TestBed.tick();
    httpMock
      .match((r) => r.method === "POST" && r.body.query.includes("LinesAndVehicles"))
      .forEach((request) => request.flush({ data: { lines: [] } }));
    httpMock
      .match((r) => r.method === "POST" && r.body.query.includes("InsidenReferenceData"))
      .forEach((request) =>
        request.flush({
          data: { lines: [], stations: [], calendarIncidentCategories: [] },
        }),
      );
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("renders the submit box, then the feed cards, then the line list", () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector("app-link-submit-box")).not.toBeNull();
    expect(root.querySelectorAll("app-link-card").length).toBe(2);
    expect(root.textContent).toContain("Feed link a");
    expect(root.querySelector("app-line-pulse-list")).not.toBeNull();
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(1);
    expect(root.textContent).toContain("Line a");

    // The composition order the page exists to enforce: submit box → global feed → line list.
    const html = root.innerHTML;
    expect(html.indexOf("app-link-submit-box")).toBeLessThan(html.indexOf("app-link-card"));
    expect(html.indexOf("app-link-card")).toBeLessThan(html.indexOf("app-line-pulse-list"));
  });

  it("passes the store's per-link vote into each feed card", () => {
    const cards = fixture.debugElement.queryAll(By.directive(LinkCardComponent));

    expect(cards.length).toBe(2);
    expect(cards[0].componentInstance.userVote()).toBe(1);
    expect(cards[1].componentInstance.userVote()).toBe(0);
  });

  it("shows no Pending pill on a LIVE feed card even though completed is false", () => {
    const card = fixture.debugElement.queryAll(By.directive(LinkCardComponent))[0];

    expect(card.componentInstance.link().status).toBe("LIVE");
    expect(card.componentInstance.link().completed).toBe(false);
    expect(card.nativeElement.querySelector('[data-testid="link-pending"]')).toBeNull();
  });

  it("reloads the store when the submit box emits submitted", () => {
    const box = fixture.debugElement.query(By.directive(LinkSubmitBoxComponent));
    expect(box).not.toBeNull();

    box.componentInstance.submitted.emit();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("records a feed card's vote through the store", () => {
    const cards = fixture.debugElement.queryAll(By.directive(LinkCardComponent));

    cards[1].componentInstance.voteChanged.emit({ value: -1 });

    expect(store.setUserVote).toHaveBeenCalledWith("b", -1);
  });

  it("opens the shared link sheet for a feed card the signed-in author may edit", () => {
    auth.isLoggedIn.set(true);
    auth.user.set({ uid: "abc12345zzz" });
    fixture.detectChanges();

    const card = fixture.debugElement.queryAll(By.directive(LinkCardComponent))[0];
    expect(card.componentInstance.editable()).toBe(true);

    const editButton = card.nativeElement.querySelector(
      '[data-testid="link-edit"]',
    ) as HTMLButtonElement;
    editButton.click();

    const linkSheet = TestBed.inject(LinkSheetService);
    expect(linkSheet.isOpen()).toBe(true);
    expect(linkSheet.editTarget()?.id).toBe("a");
  });

  it("leaves the edit pencil off the feed cards for anonymous visitors", () => {
    const card = fixture.debugElement.queryAll(By.directive(LinkCardComponent))[0];

    expect(card.componentInstance.editable()).toBe(false);
    expect(card.nativeElement.querySelector('[data-testid="link-edit"]')).toBeNull();
  });

  it("reloads the feed when the link sheet closes after an edit", () => {
    const linkSheet = TestBed.inject(LinkSheetService);
    linkSheet.openEdit({ id: "a", url: "https://example.com/a", title: "Feed link a", lines: [] });
    fixture.detectChanges();
    expect(store.reloadAll).not.toHaveBeenCalled();

    linkSheet.close();
    fixture.detectChanges();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("starts the polling beat on construction and stops it on destroy", () => {
    expect(store.start).toHaveBeenCalledTimes(1);

    fixture.destroy();

    expect(store.stop).toHaveBeenCalledTimes(1);
  });

  it("shows the retry banner on error and retries through the store", () => {
    store.hasError.set(true);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.directive(RetryBannerComponent));
    expect(banner).not.toBeNull();

    banner.componentInstance.resource().retryNow();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("feeds the status sheet the line targeted by the sheet service and reloads on submit", () => {
    const sheetComponent = fixture.debugElement.query(By.directive(LineStatusSheetComponent));
    expect(sheetComponent).not.toBeNull();

    sheet.lineId.set("a");
    fixture.detectChanges();
    expect(sheetComponent.componentInstance.line()?.id).toBe("a");

    sheet.lineId.set("missing");
    fixture.detectChanges();
    expect(sheetComponent.componentInstance.line()).toBeNull();

    sheetComponent.componentInstance.submitted.emit();
    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("renders at most the initial visible chunk of feed cards", () => {
    store.feedLinks.set(
      Array.from({ length: FEED_INITIAL_VISIBLE + 2 }, (_, index) => makeFeedLink(`x${index}`)),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll("app-link-card").length).toBe(
      FEED_INITIAL_VISIBLE,
    );
  });

  it("scrolls the feed in its own bounded container", () => {
    const container = fixture.nativeElement.querySelector(
      '[data-testid="feed-scroll"]',
    ) as HTMLElement;

    expect(container).not.toBeNull();
    expect(container.classList.contains("overflow-y-auto")).toBe(true);
    expect(container.className).toContain("max-h-[60vh]");
    expect(container.querySelector("app-link-card")).not.toBeNull();
    // Load More sits after the scroller, so it stays reachable without scrolling the feed.
    expect(container.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("loads the next feed page from Load More only while a next page exists", () => {
    const button = fixture.nativeElement.querySelector(
      '[data-testid="feed-load-more"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();

    button.click();
    expect(store.loadMore).toHaveBeenCalledTimes(1);

    store.feedPageInfo.set({ hasNextPage: false, endCursor: "cursor-a" });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("shows the visible count and the filtered total in the feed footer", () => {
    const footer = fixture.nativeElement.querySelector(
      '[data-testid="feed-footer"]',
    ) as HTMLElement;
    expect(footer).not.toBeNull();

    const count = footer.querySelector('[data-testid="feed-count"]') as HTMLElement;
    const button = footer.querySelector('[data-testid="feed-load-more"]') as HTMLElement;
    expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe("Showing 2 of 2");
    expect(button).not.toBeNull();
    // The button sits after the count in the bottom-right footer.
    expect(count.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the count visible once every link is loaded and hides Load More", () => {
    store.feedPageInfo.set({ hasNextPage: false, endCursor: "cursor-a" });
    fixture.detectChanges();

    const count = fixture.nativeElement.querySelector('[data-testid="feed-count"]') as HTMLElement;
    expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe("Showing 2 of 2");
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("hides Load More while a page is in flight", () => {
    store.isLoading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();

    store.isLoading.set(false);
    store.isLoadingMore.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("reveals the next chunk on Load More before the next page arrives", () => {
    store.feedLinks.set(
      Array.from({ length: FEED_INITIAL_VISIBLE + 2 }, (_, index) => makeFeedLink(`x${index}`)),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll("app-link-card").length).toBe(
      FEED_INITIAL_VISIBLE,
    );

    (
      fixture.nativeElement.querySelector('[data-testid="feed-load-more"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    // Everything already resident is revealed; the continuation page adds more when it lands.
    expect(fixture.nativeElement.querySelectorAll("app-link-card").length).toBe(
      FEED_INITIAL_VISIBLE + 2,
    );
  });

  it("hands the store's lines to the line list", () => {
    const list = fixture.debugElement.query(By.directive(LinePulseListComponent));

    expect(list.componentInstance.lines().map((line: LinePulse) => line.id)).toEqual(["a"]);
    expect(list.componentInstance.isLoading()).toBe(false);
  });

  it("hosts the spotting entry sheet and closes it + reloads the store on submit", async () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="spotting-entry-sheet"]')).not.toBeNull();

    const reportSheet = TestBed.inject(ReportSheetService);
    reportSheet.openFor("a");
    await fixture.whenStable();
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(ReportFormComponent));
    expect(form).not.toBeNull();
    expect(root.querySelector('[data-testid="submit-spotting-entry"]')).not.toBeNull();

    form.componentInstance.submitted.emit();
    fixture.detectChanges();

    expect(reportSheet.isOpen()).toBe(false);
    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });
});
