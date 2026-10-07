import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedLink } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { ProOfficialWidgetComponent } from "./pro-official-widget";

function makeNotice(id: string, overrides: Partial<FeedLink> = {}): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Official notice ${id}`,
    created: "2026-10-01T08:00:00",
    // Deliberately a fixed instant in the past so `humanizeSince` cannot be a moving target.
    occurredAt: "2020-01-01T08:00:00",
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    sublinks: [],
    status: "LIVE",
    completed: false,
    isAutomated: true,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: null,
    vehicles: [],
    stations: [],
    categories: [],
    ...overrides,
  };
}

function makeStore(notices: FeedLink[] = []) {
  return {
    officialNotices: signal(notices),
    officialNoticesFailed: signal(false),
    officialNoticesLoading: signal(false),
    requestOfficialNotices: vi.fn(),
  };
}

type StoreMock = ReturnType<typeof makeStore>;

describe("pro-official-widget: ProOfficialWidgetComponent", () => {
  let storeMock: StoreMock;
  let fixture: ComponentFixture<ProOfficialWidgetComponent>;

  beforeEach(() => {
    localStorage.clear();
  });

  async function widget(notices: FeedLink[] = []): Promise<HTMLElement> {
    storeMock = makeStore(notices);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProOfficialWidgetComponent],
      providers: [provideZonelessChangeDetection(), { provide: HomeStore, useValue: storeMock }],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProOfficialWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Re-renders after a store signal changed. `tick` FIRST, as the other Pro specs do. */
  function rerender(): void {
    TestBed.tick();
    fixture.detectChanges();
  }

  it("opts into the archive read in its constructor — nothing else does", async () => {
    await widget([makeNotice("a")]);

    // The opt-in IS the laziness: `graphqlResource` installs an effect that reads its `httpResource`
    // at call time, so a store-constructed archive read would cost every Rider visit a request
    // nothing renders.
    expect(storeMock.requestOfficialNotices).toHaveBeenCalledTimes(1);
  });

  it("hides itself entirely while the read is in flight, so loading is never drawn as empty", async () => {
    storeMock = makeStore([]);
    storeMock.officialNoticesLoading.set(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProOfficialWidgetComponent],
      providers: [provideZonelessChangeDetection(), { provide: HomeStore, useValue: storeMock }],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProOfficialWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    // Three states, not two: the empty state is a real ANSWER about a read that succeeded, so it must
    // not be on screen for the beat before the first answer arrives.
    expect(root.querySelector('[data-testid="pro-official-widget"]')).toBeNull();
    expect(root.querySelector('[data-testid="official-notice-empty"]')).toBeNull();
  });

  it("hides itself on a FAILED read and says nothing about official posts", async () => {
    const root = await widget([makeNotice("a")]);
    expect(root.querySelector('[data-testid="pro-official-widget"]')).not.toBeNull();

    storeMock.officialNoticesFailed.set(true);
    rerender();

    // Its OWN failure flag, never the page's `hasError()` — a panel that will not load must not put
    // the retry banner over a working board, and must not claim the operator has said nothing.
    expect(root.querySelector('[data-testid="pro-official-widget"]')).toBeNull();
    expect(root.textContent).not.toContain("Official notice a");
  });

  it("says so plainly when the read succeeded and held no official post", async () => {
    const root = await widget([]);

    const empty = root.querySelector('[data-testid="official-notice-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("No official post");
    // A successful read, not a failure — the empty state and the hidden-on-error state must be
    // distinguishable, or a reader cannot tell "no notices" from "could not load".
    expect(storeMock.officialNoticesFailed()).toBe(false);
    expect(root.querySelectorAll('[data-testid="official-notice"]')).toHaveLength(0);
  });

  it("claims no window it does not have — 'newest first · showing N'", async () => {
    const root = await widget([makeNotice("a"), makeNotice("b")]);

    const count = root.querySelector('[data-testid="pro-official-count"]')?.textContent ?? "";
    // The read sends NO window flags, so the panel must not say "today" or "this week": the newest
    // public links of all time, filtered to the official ones.
    expect(count).toContain("Newest first");
    expect(count).toContain("showing 2");
    expect(count).not.toContain("today");
  });

  it("draws one row per notice with its title, relative time and lines", async () => {
    const root = await widget([makeNotice("a"), makeNotice("b", { lines: [] })]);

    const rows = root.querySelectorAll('[data-testid="official-notice"]');
    expect(rows).toHaveLength(2);
    expect(
      rows[0].querySelector('[data-testid="official-notice-title"]')?.textContent?.trim(),
    ).toBe("Official notice a");
    // The first row's line chip; the second notice is untagged and shows none.
    expect(rows[0].textContent).toContain("KJL");
    expect(rows[1].querySelectorAll('[data-testid="official-notice-line"]')).toHaveLength(0);
    // `humanizeSince`, not a second spelling of it — the feed cards and spotting rows use the same one.
    expect(rows[0].querySelector('[data-testid="official-notice-since"]')?.textContent).toContain(
      "ago",
    );
  });

  it("links to the OPERATOR's own page, in a new tab, with rel hardening", async () => {
    const root = await widget([makeNotice("a")]);

    const link = root.querySelector<HTMLAnchorElement>('[data-testid="official-notice-link"]');
    expect(link?.getAttribute("href")).toBe("https://example.com/a");
    expect(link?.target).toBe("_blank");
    // A community page must never look like the operator said it HERE — the row opens the original.
    expect(link?.textContent?.trim()).toBe("Open original");
    expect(link?.rel).toBe("noopener noreferrer");
  });

  it("renders NO vote or edit affordance — read-only is what keeps it off the overlay invariant", async () => {
    const root = await widget([makeNotice("a")]);

    // The six page-critical feed reads share variables because the feed renders VOTABLE cards and the
    // id-keyed overlay must cover exactly the ids drawn. This panel draws none, which is the ONLY
    // reason a fourth `FEED_QUERY` read can exist without joining that invariant.
    expect(root.querySelector("[data-testid$='vote'], [data-testid*='edit']")).toBeNull();
    expect(root.querySelector("button")).toBeNull();
  });

  it("follows the store: notices that land later appear without the widget remounting", async () => {
    const root = await widget([]);
    expect(root.querySelector('[data-testid="pro-official-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="official-notice-empty"]')).not.toBeNull();

    storeMock.officialNotices.set([makeNotice("a")]);
    rerender();

    expect(root.querySelector('[data-testid="official-notice-empty"]')).toBeNull();
    expect(root.querySelectorAll('[data-testid="official-notice"]')).toHaveLength(1);
  });
});
