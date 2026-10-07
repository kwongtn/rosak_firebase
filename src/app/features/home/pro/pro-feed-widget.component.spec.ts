import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import type { LinePulse } from "../data/home-board.queries";
import type { FeedLink, FeedLinkSublink } from "../data/home-feed-items";
import { HomeStore } from "../data/home.store";
import { ProFeedWidgetComponent } from "./pro-feed-widget.component";

function makeLink(id: string, overrides: Partial<FeedLink> = {}): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00",
    occurredAt: "2026-08-01T08:00:00",
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    sublinks: [],
    status: "LIVE",
    completed: false,
    isAutomated: false,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: { shortId: "abc12345", nickname: "Ali" },
    vehicles: [],
    stations: [],
    categories: [],
    ...overrides,
  };
}

function makeSublink(id: string, overrides: Partial<FeedLinkSublink> = {}): FeedLinkSublink {
  return {
    ...makeLink(id),
    parentId: "root",
    isThreadRoot: false,
    sublinks: [],
    ...overrides,
  } as FeedLinkSublink;
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
    statusWindowMinutes: 15,
    pulseLinks: [],
  };
}

function makeStore(links: FeedLink[], lines: LinePulse[] = []) {
  const store = {
    lines: signal(lines),
    feedLinks: signal(links),
    feedPageInfo: signal<{ hasNextPage: boolean; endCursor: string | null } | null>({
      hasNextPage: false,
      endCursor: null,
    }),
    feedTotalCount: signal(links.length),
    isLoading: signal(false),
    isLoadingMore: signal(false),
    lineFilter: signal<string | null>(null),
    setLineFilter: vi.fn(),
    feedSearchQuery: signal(""),
    setFeedSearchQuery: vi.fn(),
    feedStatusFilter: signal<"all" | "official" | "community">("all"),
    setFeedStatusFilter: vi.fn(),
    userVoteFor: vi.fn(() => 0),
    userVotes: signal<Record<string, number>>({}),
    setUserVote: vi.fn(),
    reloadAll: vi.fn(),
    loadMore: vi.fn(async () => undefined),
  };
  store.setLineFilter = vi.fn((value: string | null) => store.lineFilter.set(value));
  store.setFeedSearchQuery = vi.fn((value: string | null) =>
    store.feedSearchQuery.set(value ?? ""),
  );
  store.setFeedStatusFilter = vi.fn((value: "all" | "official" | "community") =>
    store.feedStatusFilter.set(value),
  );
  return store;
}

type StoreMock = ReturnType<typeof makeStore>;

describe("pro-feed-widget.component: ProFeedWidgetComponent", () => {
  let storeMock: StoreMock;
  let fixture: ComponentFixture<ProFeedWidgetComponent>;
  let linkSheet: LinkSheetService;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function widget(links: FeedLink[], lines: LinePulse[] = []): Promise<HTMLElement> {
    storeMock = makeStore(links, lines);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProFeedWidgetComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: HomeStore, useValue: storeMock },
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: signal(false),
            isAdmin: signal(false),
            user: signal<{ uid: string } | null>({ uid: "u1" }),
          },
        },
      ],
    }).compileComponents();

    linkSheet = TestBed.inject(LinkSheetService);
    fixture = TestBed.createComponent(ProFeedWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rerender(): void {
    TestBed.tick();
    fixture.detectChanges();
  }

  it("renders rows through the SHARED thread wrapper, never a Pro-only card", async () => {
    const root = await widget([makeLink("a")]);

    // A second link row in the codebase is the thing this must not become: the vote and edit wiring
    // underneath is the same for every surface that uses it.
    expect(root.querySelectorAll("app-link-thread")).toHaveLength(1);
    expect(root.querySelector("app-link-card")).not.toBeNull();
  });

  it("says it shows TODAY only, so a missing Tuesday link is not read as never filed", async () => {
    const root = await widget([]);

    expect(root.querySelector('[data-testid="pro-feed-window"]')?.textContent?.trim()).toBe(
      "Today only",
    );
    // The Last Week surface is a Rider one and stays there — it now lives behind the feed's
    // Today/Last Week tab set on the rider page, which this widget does not render. A Pro reader
    // searching for something from last week is told the window rather than left to infer it.
    expect(root.querySelector('[data-testid="feed-tab-lastweek"]')).toBeNull();
    expect(root.querySelector('[data-testid="last-week-panel"]')).toBeNull();
  });

  it("drives the SERVER-side line filter, which is what keeps Load More correct", async () => {
    const root = await widget([makeLink("a")], [makeLine("L1")]);
    const select = root.querySelector('[data-testid="pro-feed-line"]') as HTMLSelectElement;

    expect(select.options).toHaveLength(2); // "All lines" + one line
    select.value = "L1";
    select.dispatchEvent(new Event("change"));
    rerender();

    // `$lineId` on the connection, never a client-side filter: a keyset cursor is only meaningful
    // inside the query that minted it.
    expect(storeMock.setLineFilter).toHaveBeenCalledWith("L1");

    select.value = "";
    select.dispatchEvent(new Event("change"));
    rerender();
    expect(storeMock.setLineFilter).toHaveBeenLastCalledWith(null);
  });

  it("filters provenance CLIENT-side over the resident roots", async () => {
    const root = await widget([makeLink("a"), makeLink("b", { isAutomated: true })]);

    storeMock.feedStatusFilter.set("official");
    rerender();

    expect(root.querySelectorAll("app-link-thread")).toHaveLength(1);
    expect(root.textContent).toContain("Link b");
    expect(root.textContent).not.toContain("Link a");

    storeMock.feedStatusFilter.set("community");
    rerender();
    expect(root.textContent).toContain("Link a");
    expect(root.textContent).not.toContain("Link b");
  });

  it("searches title, url, reporter and line tag CLIENT-side", async () => {
    const root = await widget([
      makeLink("a", { title: "Kelana Jaya delay" }),
      makeLink("b", { title: "Unrelated", url: "https://twitter.com/x/status/9" }),
    ]);

    storeMock.feedSearchQuery.set("kelana");
    rerender();
    expect(root.textContent).toContain("Kelana Jaya delay");
    expect(root.textContent).not.toContain("Unrelated");

    storeMock.feedSearchQuery.set("twitter.com");
    rerender();
    expect(root.textContent).toContain("Unrelated");
    expect(root.textContent).not.toContain("Kelana Jaya delay");
  });

  it("keeps a conversation whose ONLY match is on a member, whole", async () => {
    const reply = makeSublink("a-1", { title: "Kajang line suspended" });
    const root = await widget([
      makeLink("a", { title: "unrelated root", sublinks: [reply], sublinkCount: 1 }),
      makeLink("b", { title: "nothing here" }),
    ]);

    storeMock.feedSearchQuery.set("suspended");
    rerender();

    expect(root.querySelectorAll("app-link-thread")).toHaveLength(1);
    // The member survives too: dropping it would make the root's own "2 links" chip lie and expanding
    // the row would show nothing.
    const size = root.querySelector('[data-testid="link-thread-size"]')?.textContent?.trim();
    expect(size).toBe("2 links");
  });

  it("never filters a nested sublink out of a root it kept", async () => {
    const reply = makeSublink("a-1", { title: "unrelated chatter" });
    await widget([makeLink("a", { title: "Kajang", sublinks: [reply], sublinkCount: 1 })]);

    storeMock.feedSearchQuery.set("kajang");
    rerender();

    const threads = rootThreads();
    expect(threads).toHaveLength(1);
    // The root's chip still counts its subtree, which is the invariant a member-stripping filter breaks:
    // a "2 links" chip over a row showing one card is a chip that lies, and expanding it finds nothing.
    expect(threads[0].querySelector('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(
      "2 links",
    );
  });

  function rootThreads(): HTMLElement[] {
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>("app-link-thread"),
    ];
  }

  it("blames the FILTER, not the network, when nothing matches", async () => {
    const root = await widget([makeLink("a")]);

    storeMock.feedSearchQuery.set("zzzz-nothing");
    rerender();

    expect(root.querySelector('[data-testid="pro-feed-empty"]')?.textContent?.trim()).toBe(
      "No links match these filters.",
    );
  });

  it("shows Showing X of Y with the FILTERED server total as the denominator", async () => {
    const root = await widget([makeLink("a"), makeLink("b")]);
    storeMock.feedTotalCount.set(40);
    rerender();

    expect(
      root.querySelector('[data-testid="pro-feed-count"]')?.textContent?.replace(/\s+/g, " "),
    ).toContain("Showing 2 of 40");
  });

  it("offers Load More only while another page exists and nothing is in flight", async () => {
    const root = await widget([makeLink("a")]);
    expect(root.querySelector('[data-testid="pro-feed-load-more"]')).toBeNull();

    storeMock.feedPageInfo.set({ hasNextPage: true, endCursor: "c-1" });
    rerender();
    const more = root.querySelector<HTMLElement>('[data-testid="pro-feed-load-more"]');
    expect(more).not.toBeNull();

    more?.click();
    expect(storeMock.loadMore).toHaveBeenCalledTimes(1);

    storeMock.isLoadingMore.set(true);
    rerender();
    // A button that does nothing is worse than an absent one.
    expect(root.querySelector('[data-testid="pro-feed-load-more"]')).toBeNull();
  });

  it("pushes the search keystrokes into the store, which owns the ?q= mirror", async () => {
    const root = await widget([makeLink("a")]);
    const input = root.querySelector('[data-testid="pro-feed-search"]') as HTMLInputElement;

    input.value = "kelana";
    input.dispatchEvent(new Event("input"));
    rerender();

    expect(storeMock.setFeedSearchQuery).toHaveBeenCalledWith("kelana");
  });

  it("reloads the feed when the shared link sheet closes after an edit", async () => {
    await widget([makeLink("a")]);
    expect(storeMock.reloadAll).not.toHaveBeenCalled();

    // The sheet's open edge is the only signal the shared edit form exposes to a host, and a reload on
    // a cancel is harmless — the same three-line effect the rider page runs.
    linkSheet.openEdit(makeLink("a"));
    rerender();
    linkSheet.setOpen(false);
    rerender();

    expect(storeMock.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the search box on demand, for the dashboard's / shortcut", async () => {
    const root = await widget([makeLink("a")]);
    const search = root.querySelector<HTMLInputElement>('[data-testid="pro-feed-search"]');
    expect(document.activeElement).not.toBe(search);

    (fixture.componentInstance as ProFeedWidgetComponent).focusSearch();

    expect(document.activeElement).toBe(search);
  });
});
