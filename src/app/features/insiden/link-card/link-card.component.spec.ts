import { type WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import type { LinkCardItem } from "../data/link-card-item";
import { VoteButtonComponent } from "../vote-button/vote-button.component";
import { LinkCardComponent } from "./link-card.component";

function makeLink(overrides: Partial<LinkCardItem> = {}): LinkCardItem {
  return {
    id: "42",
    url: "https://www.example.com/story",
    title: "Delays on the KJL",
    created: new Date().toISOString(),
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: { shortId: "abc12345", nickname: "" },
    status: "LIVE",
    completed: false,
    voteScore: 7,
    userVote: 0,
    voteBreakdown: { upvotes: 2, downvotes: 1 },
    ...overrides,
  };
}

describe("LinkCardComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: WritableSignal<boolean>;
  let fixture: ComponentFixture<LinkCardComponent>;

  function query<T extends Element = HTMLElement>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector) as T | null;
  }

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ upvoteSocialMediaLink: { ok: true } });
    isLoggedIn = signal(true);

    await TestBed.configureTestingModule({
      imports: [LinkCardComponent],
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

    fixture = TestBed.createComponent(LinkCardComponent);
    fixture.componentRef.setInput("link", makeLink());
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it("renders the www-stripped domain and the muted path inside one truncating line", () => {
    const domain = query('[data-testid="link-url-domain"]') as HTMLElement;
    const path = query('[data-testid="link-url-path"]') as HTMLElement;
    const line = domain.parentElement as HTMLElement;

    expect(domain.textContent).toBe("example.com");
    expect(path.textContent).toBe("/story");
    expect(domain.classList.contains("text-muted-foreground")).toBe(false);
    expect(path.classList.contains("text-muted-foreground")).toBe(true);
    // No space between the parts: "example.com/story", truncated as one unit.
    expect(line.textContent).toBe("example.com/story");
    expect(line.classList.contains("truncate")).toBe(true);
    expect(fixture.nativeElement.querySelector("a")?.getAttribute("href")).toBe(
      "https://www.example.com/story",
    );
  });

  it("renders the title, the line badge with its display name and the vote score", () => {
    const text = fixture.nativeElement.textContent as string;
    const badge = fixture.nativeElement.querySelector(
      '[data-testid="link-tags"] [title="Kajang Line"]',
    );

    expect(text).toContain("Delays on the KJL");
    expect(badge?.textContent).toContain("KJL");
    expect(text).toContain("+7");
  });

  it("renders the google favicon for an http(s) url and a plain-link icon otherwise", async () => {
    const favicon = query("a img") as HTMLImageElement;

    expect(favicon?.getAttribute("src")).toBe(
      "https://www.google.com/s2/favicons?domain=www.example.com",
    );

    fixture.componentRef.setInput("link", makeLink({ url: "not a url" }));
    await fixture.whenStable();

    expect(query("a img")).toBeNull();
    expect(query("a svg")).not.toBeNull();
    expect(query('[data-testid="link-url-domain"]')?.textContent).toBe("not a url");
  });

  it("shows the Pending pill, tooltipped 'Awaiting admin approval', only while PENDING_APPROVAL", async () => {
    // The regression: an approved (LIVE) link must show no pill even though the separate admin
    // "handled" flag is false, and likewise when the flag is absent entirely (legacy rows).
    expect(query('[data-testid="link-pending"]')).toBeNull();

    fixture.componentRef.setInput("link", makeLink({ status: "LIVE", completed: true }));
    await fixture.whenStable();
    expect(query('[data-testid="link-pending"]')).toBeNull();

    fixture.componentRef.setInput("link", makeLink({ status: undefined, completed: false }));
    await fixture.whenStable();
    expect(query('[data-testid="link-pending"]')).toBeNull();

    fixture.componentRef.setInput("link", makeLink({ status: "PENDING_APPROVAL" }));
    await fixture.whenStable();

    const pill = query('[data-testid="link-pending"]') as HTMLElement;
    expect(pill.textContent).toContain("Pending");
    expect(pill.getAttribute("title")).toBe("Awaiting admin approval");

    // The axes are independent: marking a still-unapproved link "handled" keeps the pill.
    fixture.componentRef.setInput(
      "link",
      makeLink({ status: "PENDING_APPROVAL", completed: true }),
    );
    await fixture.whenStable();
    expect(query('[data-testid="link-pending"]')).not.toBeNull();
  });

  it("keeps the vote control and edit pencil out of the anchor so their clicks never navigate", async () => {
    fixture.componentRef.setInput("editable", true);
    await fixture.whenStable();

    const anchor = query("a") as HTMLAnchorElement;
    const voteButton = query("app-vote-button") as HTMLElement;
    const editButton = query('[data-testid="link-edit"]') as HTMLElement;

    expect(voteButton.closest("a")).toBeNull();
    expect(editButton.closest("a")).toBeNull();
    expect(anchor.querySelector("app-vote-button")).toBeNull();
    expect(anchor.querySelector('[data-testid="link-edit"]')).toBeNull();
    // The interactive pair shares the right rail, with the vote control at its top.
    const rail = query('[data-testid="link-meta-rail"]') as HTMLElement;
    expect(rail.closest("a")).toBeNull();
    expect(rail.firstElementChild?.tagName.toLowerCase()).toBe("app-vote-button");
    expect(rail.contains(editButton)).toBe(true);
    expect(anchor.contains(voteButton)).toBe(false);
  });

  it("forwards the host's userVote and real vote breakdown to the vote control", async () => {
    fixture.componentRef.setInput("userVote", 1);
    await fixture.whenStable();

    const voteButton = fixture.debugElement.query(By.directive(VoteButtonComponent));

    expect(voteButton.componentInstance.userVote()).toBe(1);
    expect(voteButton.componentInstance.upvotes()).toBe(2);
    expect(voteButton.componentInstance.downvotes()).toBe(1);
    expect(query('app-vote-button [role="tooltip"]')?.textContent).toContain("2 ↑ / 1 ↓");
  });

  it("re-emits the vote control's change after a successful vote", async () => {
    const emitted: { value: number }[] = [];
    fixture.componentInstance.voteChanged.subscribe((event) => emitted.push(event));

    (
      fixture.nativeElement.querySelector(
        'app-vote-button button[aria-label="Upvote"]',
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() => expect(emitted).toEqual([{ value: 1 }]));
    const [mutation] = requestMock.mock.calls[0];
    expect(mutation).toContain("upvoteSocialMediaLink");
  });

  it("renders the edit pencil only when editable and emits the link", async () => {
    const emitted: LinkCardItem[] = [];
    fixture.componentInstance.edit.subscribe((link) => emitted.push(link));

    expect(query('[data-testid="link-edit"]')).toBeNull();

    fixture.componentRef.setInput("editable", true);
    await fixture.whenStable();

    const editButton = query('[data-testid="link-edit"]') as HTMLButtonElement;
    expect(editButton.getAttribute("aria-label")).toBe("Edit link");
    editButton.click();

    expect(emitted.map((link) => link.id)).toEqual(["42"]);
  });

  it("renders the relative time, with the exact timestamp and submitter in its tooltip", async () => {
    expect(query('[data-testid="link-created"]')?.textContent).toContain("less than a minute ago");

    // Built from local date parts so the rendered timestamp is timezone-stable.
    const created = new Date(2026, 7, 1, 8, 0).toISOString();
    fixture.componentRef.setInput(
      "link",
      makeLink({ created, user: { shortId: "abc12345", nickname: "Ali" } }),
    );
    await fixture.whenStable();

    expect(query('[data-testid="link-created"]')?.textContent).toContain("ago");

    const tooltip = query('[data-testid="link-time"] [role="tooltip"]') as HTMLElement;
    expect(tooltip.textContent).toContain("Aug 1, 2026 08:00");
    expect(tooltip.querySelector('[data-testid="link-submitter"]')?.textContent).toContain("Ali");
  });

  it("falls back to the submitter's shortId when the nickname is empty", () => {
    const submitter = query('[data-testid="link-submitter"]');

    expect(submitter?.textContent).toContain("abc12345");
  });
});
