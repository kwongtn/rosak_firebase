import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { InfiniteScrollDirective } from "../../ui/infinite-scroll/infinite-scroll.directive";
import { RetryBannerComponent } from "../../ui/retry-banner/retry-banner.component";
import { ToastService } from "../../ui/toast/toast.service";
import type { FeedLink, FeedLinkPageInfo, LinePulse } from "./data/home.queries";
import { HomeStore } from "./data/home.store";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { FeedLinkCardComponent } from "./feed/feed-link-card.component";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { HomePage } from "./home.page";
import { LinePulseListComponent } from "./line-pulse/line-pulse-list.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";

function makeFeedLink(id: string): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Feed link ${id}`,
    created: "2026-08-01T08:00:00Z",
    voteScore: 3,
    userVote: 0,
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
    pulseLinks: [],
  };
}

interface StoreMock {
  lines: WritableSignal<LinePulse[]>;
  feedLinks: WritableSignal<FeedLink[]>;
  feedPageInfo: WritableSignal<FeedLinkPageInfo | null>;
  isLoading: WritableSignal<boolean>;
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
  let sheet: {
    isOpen: WritableSignal<boolean>;
    lineId: WritableSignal<string | null>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    store = {
      lines: signal<LinePulse[]>([makeLine("a")]),
      feedLinks: signal<FeedLink[]>([makeFeedLink("a"), makeFeedLink("b")]),
      feedPageInfo: signal<FeedLinkPageInfo | null>({ hasNextPage: true, endCursor: "cursor-a" }),
      isLoading: signal(false),
      hasError: signal(false),
      userVoteFor: vi.fn((linkId: string) => (linkId === "a" ? 1 : 0)),
      setUserVote: vi.fn(),
      reloadAll: vi.fn(),
      loadMore: vi.fn(async () => undefined),
      start: vi.fn(),
      stop: vi.fn(),
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
        { provide: HomeStore, useValue: store },
        { provide: LineStatusSheetService, useValue: sheet },
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: signal(false),
            isAdmin: signal(false),
            user: signal(null),
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

    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  });

  it("renders the submit box, then the feed cards, then the line list", () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector("app-link-submit-box")).not.toBeNull();
    expect(root.querySelectorAll("app-feed-link-card").length).toBe(2);
    expect(root.textContent).toContain("Feed link a");
    expect(root.querySelector("app-line-pulse-list")).not.toBeNull();
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(1);
    expect(root.textContent).toContain("Line a");

    // The composition order the page exists to enforce: submit box → global feed → line list.
    const html = root.innerHTML;
    expect(html.indexOf("app-link-submit-box")).toBeLessThan(html.indexOf("app-feed-link-card"));
    expect(html.indexOf("app-feed-link-card")).toBeLessThan(html.indexOf("app-line-pulse-list"));
  });

  it("passes the store's per-link vote into each feed card", () => {
    const cards = fixture.debugElement.queryAll(By.directive(FeedLinkCardComponent));

    expect(cards.length).toBe(2);
    expect(cards[0].componentInstance.userVote()).toBe(1);
    expect(cards[1].componentInstance.userVote()).toBe(0);
  });

  it("reloads the store when the submit box emits submitted", () => {
    const box = fixture.debugElement.query(By.directive(LinkSubmitBoxComponent));
    expect(box).not.toBeNull();

    box.componentInstance.submitted.emit();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("records a feed card's vote through the store", () => {
    const cards = fixture.debugElement.queryAll(By.directive(FeedLinkCardComponent));

    cards[1].componentInstance.voteChanged.emit({ value: -1 });

    expect(store.setUserVote).toHaveBeenCalledWith("b", -1);
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

  it("loads the next feed page from the infinite-scroll sentinel only while a next page exists", () => {
    const sentinel = fixture.debugElement.query(By.directive(InfiniteScrollDirective));
    expect(sentinel).not.toBeNull();

    sentinel.injector.get(InfiniteScrollDirective).loadMore.emit();
    expect(store.loadMore).toHaveBeenCalledTimes(1);

    store.feedPageInfo.set({ hasNextPage: false, endCursor: "cursor-a" });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(InfiniteScrollDirective))).toBeNull();
  });

  it("hands the store's lines to the line list", () => {
    const list = fixture.debugElement.query(By.directive(LinePulseListComponent));

    expect(list.componentInstance.lines().map((line: LinePulse) => line.id)).toEqual(["a"]);
    expect(list.componentInstance.isLoading()).toBe(false);
  });
});
