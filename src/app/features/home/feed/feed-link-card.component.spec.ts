import { type WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { VoteButtonComponent } from "../../insiden/vote-button/vote-button.component";
import type { FeedLink } from "../data/home.queries";
import { FeedLinkCardComponent } from "./feed-link-card.component";

function makeFeedLink(overrides: Partial<FeedLink> = {}): FeedLink {
  return {
    id: "42",
    url: "https://www.example.com/story",
    normalizedUrl: "https://example.com/story",
    title: "Delays on the KJL",
    created: new Date().toISOString(),
    voteScore: 7,
    userVote: 0,
    voteBreakdown: { upvotes: 2, downvotes: 1 },
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: { shortId: "abc12345", nickname: "" },
    ...overrides,
  };
}

describe("FeedLinkCardComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: WritableSignal<boolean>;
  let fixture: ComponentFixture<FeedLinkCardComponent>;

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ upvoteSocialMediaLink: { ok: true } });
    isLoggedIn = signal(true);

    await TestBed.configureTestingModule({
      imports: [FeedLinkCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { isLoggedIn, login: vi.fn(), idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedLinkCardComponent);
    fixture.componentRef.setInput("link", makeFeedLink());
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it("renders the www-stripped domain, title, line code, relative time and score", () => {
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain("example.com");
    expect(text).not.toContain("www.");
    expect(text).toContain("Delays on the KJL");
    expect(text).toContain("KJL");
    expect(text).toContain("today");
    expect(text).toContain("+7");
    expect(fixture.nativeElement.querySelector("a").getAttribute("href")).toBe(
      "https://www.example.com/story",
    );
  });

  it("keeps the time on the body row, bottom-aligned with its last row (the tags)", () => {
    const article = fixture.nativeElement.querySelector("article") as HTMLElement;
    const anchor = article.querySelector("a") as HTMLElement;
    const rail = article.querySelector('[data-testid="feed-meta-rail"]') as HTMLElement;
    const time = rail.querySelector('[data-testid="feed-time"]') as HTMLElement;

    // The card is a single row again: no second row holding only the time.
    expect(article.children.length).toBe(1);
    expect(rail.parentElement).toBe(article.children[0]);
    expect(rail.parentElement?.contains(anchor)).toBe(true);

    // The row bottom-aligns its children and the rail spans the row height with the time pinned
    // to its bottom edge — i.e. to the bottom of the body's last row.
    const row = rail.parentElement as HTMLElement;
    expect(row.classList.contains("items-end")).toBe(true);
    expect(rail.classList.contains("self-stretch")).toBe(true);
    expect(rail.classList.contains("items-end")).toBe(true);
    expect(rail.classList.contains("justify-between")).toBe(true);
    expect(rail.contains(time)).toBe(true);
    expect(time.parentElement).toBe(rail);
    // The vote control stays where it was: top of the same rail.
    expect(rail.firstElementChild?.tagName.toLowerCase()).toBe("app-vote-button");

    // With tags, the tag row is the body's last row.
    const tagRow = anchor.querySelector('[data-testid="feed-tags"]') as HTMLElement;
    expect(tagRow).not.toBeNull();
    expect(anchor.lastElementChild).toBe(tagRow);
  });

  it("bottom-aligns the time with the title when the card has no line tags", async () => {
    fixture.componentRef.setInput("link", makeFeedLink({ lines: [] }));
    await fixture.whenStable();

    const article = fixture.nativeElement.querySelector("article") as HTMLElement;
    const anchor = article.querySelector("a") as HTMLElement;
    const rail = article.querySelector('[data-testid="feed-meta-rail"]') as HTMLElement;

    expect(article.querySelector('[data-testid="feed-tags"]')).toBeNull();
    expect(anchor.lastElementChild?.textContent).toContain("Delays on the KJL");
    // Same bottom-aligned row + stretched rail: its bottom edge is the title block's bottom edge.
    expect((rail.parentElement as HTMLElement).classList.contains("items-end")).toBe(true);
    expect(rail.classList.contains("self-stretch")).toBe(true);
    expect(rail.classList.contains("justify-between")).toBe(true);
    expect(article.children.length).toBe(1);
  });

  it("renders the domain in the normal colour and the path in muted grey on one line", () => {
    const domain = fixture.nativeElement.querySelector(
      '[data-testid="feed-url-domain"]',
    ) as HTMLElement;
    const path = fixture.nativeElement.querySelector(
      '[data-testid="feed-url-path"]',
    ) as HTMLElement;
    const outer = domain.parentElement as HTMLElement;

    expect(domain.textContent).toBe("example.com");
    expect(path.textContent).toBe("/story");
    expect(domain.classList.contains("text-muted-foreground")).toBe(false);
    expect(path.classList.contains("text-muted-foreground")).toBe(true);
    // One line, no space between the parts: "example.com/story".
    expect(outer.textContent).toBe("example.com/story");
    expect(outer.classList.contains("truncate")).toBe(true);
  });

  it("drops the path when the url is a bare host", async () => {
    fixture.componentRef.setInput("link", makeFeedLink({ url: "https://www.example.com/" }));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="feed-url-path"]').textContent).toBe(
      "",
    );
    expect(fixture.nativeElement.querySelector('[data-testid="feed-url-domain"]').textContent).toBe(
      "example.com",
    );
  });

  it("prefers the submitter's nickname when present", async () => {
    fixture.componentRef.setInput(
      "link",
      makeFeedLink({ user: { shortId: "abc12345", nickname: "Ali" } }),
    );
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('[data-testid="feed-submitter"]').textContent,
    ).toContain("Ali");
  });

  it("falls back to the submitter's shortId when the nickname is empty", () => {
    const submitter = fixture.nativeElement.querySelector('[data-testid="feed-submitter"]');

    expect(submitter.textContent).toContain("abc12345");
  });

  it("shows the exact timestamp and the submitter in the relative-time tooltip", async () => {
    // Built from local date parts so the rendered timestamp is timezone-stable.
    const created = new Date(2026, 7, 1, 8, 0).toISOString();
    fixture.componentRef.setInput(
      "link",
      makeFeedLink({ created, user: { shortId: "abc12345", nickname: "Ali" } }),
    );
    await fixture.whenStable();

    const popover = fixture.nativeElement.querySelector(
      '[data-testid="feed-time"] [role="tooltip"]',
    );

    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain("Aug 1, 2026 08:00");
    expect(popover.querySelector('[data-testid="feed-submitter"]').textContent).toContain("Ali");
  });

  it("passes the link's real vote breakdown to the vote control", async () => {
    fixture.componentRef.setInput(
      "link",
      makeFeedLink({ voteBreakdown: { upvotes: 9, downvotes: 3 } }),
    );
    await fixture.whenStable();

    const voteButton = fixture.debugElement.query(By.directive(VoteButtonComponent));
    expect(voteButton.componentInstance.upvotes()).toBe(9);
    expect(voteButton.componentInstance.downvotes()).toBe(3);
    expect(
      fixture.nativeElement.querySelector('app-vote-button [role="tooltip"]').textContent,
    ).toContain("9 ↑ / 3 ↓");
    // The interactive control stays a sibling of the navigational <a>.
    expect(fixture.nativeElement.querySelector("a app-vote-button")).toBeNull();
  });

  it("forwards the host's userVote to the vote control", async () => {
    fixture.componentRef.setInput("userVote", 1);
    await fixture.whenStable();

    const voteButton = fixture.debugElement.query(By.directive(VoteButtonComponent));
    expect(voteButton).not.toBeNull();
    expect(voteButton.componentInstance.userVote()).toBe(1);
  });

  it("re-emits the vote control's change after a successful vote", async () => {
    let emitted: { value: number } | null = null;
    fixture.componentInstance.voteChanged.subscribe((event) => (emitted = event));

    const upvote = fixture.nativeElement.querySelector(
      'app-vote-button button[aria-label="Upvote"]',
    );
    upvote.click();

    await vi.waitFor(() => expect(emitted).toEqual({ value: 1 }));
    const [mutation] = requestMock.mock.calls[0];
    expect(mutation).toContain("upvoteSocialMediaLink");
  });
});
