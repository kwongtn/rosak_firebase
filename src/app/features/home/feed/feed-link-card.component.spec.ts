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
