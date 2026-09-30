import { type WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import type { LinkCardItem } from "../data/link-card-item";
import { threadLabel } from "../data/link-thread-selection.util";
import { LinkCardComponent } from "../link-card/link-card.component";
import { LinkThreadComponent } from "./link-thread.component";

/**
 * `threadLabel` is the app's ONE pluralisation decision for link threads, and `LinkThreadComponent`
 * is a caller of it — the module's own docstring names this component's badge. The tests below pin
 * that contract two ways, because a rendered-string assertion alone would pass just as happily
 * against a component that grew its own `${n} links` template:
 *
 *   - the component's `groupLabel` is EXACTLY `threadLabel(n)`, and
 *   - both text sites read that one value, so a toggle that counted the members itself would
 *     disagree with the badge and fail.
 *
 * A call-level spy is NOT available here: the Angular unit-test builder rejects `vi.mock` for
 * relative imports outright ("not supported for relative imports with the Angular unit-test
 * system"), so the value is the strongest observable contract. Do not spend time on the mock.
 */
interface TestableThread {
  groupLabel(): string;
}

function threadUnderTest(fixture: ComponentFixture<LinkThreadComponent>): TestableThread {
  return fixture.componentInstance as unknown as TestableThread;
}

function makeLink(overrides: Partial<LinkCardItem> = {}): LinkCardItem {
  return {
    id: "1",
    url: "https://www.example.com/root",
    title: "Suspected door fault",
    created: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: { shortId: "abc12345", nickname: "Ali" },
    status: "LIVE",
    completed: false,
    voteScore: 7,
    userVote: 0,
    voteBreakdown: { upvotes: 2, downvotes: 1 },
    // A root that has never been grouped: isThreadRoot is TRUE here, and must still not sprout
    // an affordance — that is the whole point of the gate.
    threadId: null,
    isThreadRoot: true,
    threadSize: 1,
    threadLinks: [],
    ...overrides,
  };
}

function makeMember(id: string, overrides: Partial<LinkCardItem> = {}): LinkCardItem {
  return makeLink({
    id,
    url: `https://www.example.com/member-${id}`,
    title: `Follow-up ${id}`,
    // Members are never roots themselves (thread points at a root), so the thread fields are the
    // degenerate values — and are ignored anyway, since depth is 1.
    threadId: "1",
    isThreadRoot: false,
    threadSize: 1,
    threadLinks: [],
    ...overrides,
  });
}

function makeThread(members: LinkCardItem[], overrides: Partial<LinkCardItem> = {}): LinkCardItem {
  return makeLink({ threadSize: members.length + 1, threadLinks: members, ...overrides });
}

describe("LinkThreadComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: WritableSignal<boolean>;
  let fixture: ComponentFixture<LinkThreadComponent>;

  function query<T extends Element = HTMLElement>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector) as T | null;
  }

  function cards(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll("app-link-card"));
  }

  async function setLink(link: LinkCardItem): Promise<void> {
    fixture.componentRef.setInput("link", link);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ upvoteSocialMediaLink: { ok: true } });
    isLoggedIn = signal(true);

    await TestBed.configureTestingModule({
      imports: [LinkThreadComponent, LinkCardComponent],
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

    fixture = TestBed.createComponent(LinkThreadComponent);
    fixture.componentRef.setInput("link", makeLink());
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it("renders a plain unthreaded link as ONE card and no affordance", () => {
    // `isThreadRoot` is true for an unthreaded link (thread == null IS the definition of a root),
    // so gating on it would put a "1 links" badge on every row in the app.
    expect(cards()).toHaveLength(1);
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();
    expect(query('[data-testid="link-thread-size"]')).toBeNull();
  });

  it("shows the group size on the root of a 4-link thread and keeps the members collapsed", async () => {
    await setLink(makeThread([makeMember("2"), makeMember("3"), makeMember("4")]));

    // Collapsed by default: the root alone, exactly as a single link would render.
    expect(cards()).toHaveLength(1);
    expect(query('[data-testid="link-thread-size"]')?.textContent).toContain("4 links");
    expect(query('[data-testid="link-thread-members"]')).toBeNull();

    const toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    expect(toggle.tagName.toLowerCase()).toBe("button");
    expect(toggle.getAttribute("type")).toBe("button");
    // Readable text, not a bare icon: the group size must be learnable without hovering.
    expect(toggle.textContent?.trim()).toBe("4 links");
    // The shared helper's exact answer, so the badge cannot drift from the console chip.
    expect(toggle.textContent?.trim()).toBe(threadLabel(4));
  });

  it("reveals every member on expand and hides them again on collapse", async () => {
    await setLink(makeThread([makeMember("2"), makeMember("3"), makeMember("4")]));

    const toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    toggle.click();
    await fixture.whenStable();

    expect(cards()).toHaveLength(4);
    const ids = Array.from(
      fixture.nativeElement.querySelectorAll("app-link-card a") as NodeListOf<HTMLAnchorElement>,
    ).map((anchor) => anchor.getAttribute("href"));
    expect(ids).toEqual([
      "https://www.example.com/root",
      "https://www.example.com/member-2",
      "https://www.example.com/member-3",
      "https://www.example.com/member-4",
    ]);
    // The expanded column sits inside a left rule: subordinate, but unmistakably the same group.
    const members = query('[data-testid="link-thread-members"]') as HTMLElement;
    expect(members.classList.contains("border-l")).toBe(true);

    toggle.click();
    await fixture.whenStable();

    expect(cards()).toHaveLength(1);
    expect(query('[data-testid="link-thread-members"]')).toBeNull();
  });

  it("toggles aria-expanded on the real button", async () => {
    await setLink(makeThread([makeMember("2")]));

    const toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Accessible name states the action, and carries the count — quoted from the SHARED label, not
    // a locally pluralised member count.
    expect(toggle.getAttribute("aria-label")).toBe("Show the other links in this thread (2 links)");

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("Hide the other links in this thread (2 links)");

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("pluralises through the SHARED threadLabel, for both the badge and the accessible name", async () => {
    // The invariant is "one pluralisation decision for the whole app". Two roots of truth are what
    // this used to have: the visible badge and the toggle's own `members().length === 1 ? "" : "s"`.
    // A 3-link thread makes the difference observable — a member-counting toggle says "the other 2
    // links" while the badge says "3 links", and the two disagree about the same group.
    await setLink(makeThread([makeMember("2"), makeMember("3")]));

    expect(threadUnderTest(fixture).groupLabel()).toBe(threadLabel(3));
    const badge = query('[data-testid="link-thread-size"]')?.textContent?.trim();
    expect(badge).toBe("3 links");
    expect(badge).toBe(threadLabel(3));

    const ariaLabel = query('[data-testid="link-thread-toggle"]')?.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toContain(badge as string);
    expect(ariaLabel).not.toContain("the other 2 link");
    expect(ariaLabel).not.toContain("the other 1 link");

    // A one-member thread is the case a private ternary got wrong most easily; the shared helper
    // still answers for the whole group, and the screen shows its answer.
    await setLink(makeThread([makeMember("2")]));
    expect(threadUnderTest(fixture).groupLabel()).toBe(threadLabel(2));
    expect(query('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(threadLabel(2));
  });

  it("re-emits a vote with the ROOT's id, and a member's id for a member vote", async () => {
    const emitted: { id: string; value: number }[] = [];
    fixture.componentInstance.voteChanged.subscribe((event) => emitted.push(event));

    await setLink(makeThread([makeMember("2")]));

    (
      cards()[0].querySelector('app-vote-button button[aria-label="Upvote"]') as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(emitted).toEqual([{ id: "1", value: 1 }]));

    (query('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    (
      cards()[1].querySelector('app-vote-button button[aria-label="Upvote"]') as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(emitted).toEqual([
        { id: "1", value: 1 },
        { id: "2", value: 1 },
      ]),
    );
  });

  it("forwards the host's voteValues override to the root AND to every member", async () => {
    const members = [makeMember("2", { userVote: -1 })];
    fixture.componentRef.setInput("voteValues", { "1": 1, "2": -1 });
    await setLink(makeThread(members));

    const rootVote = cards()[0].querySelector('button[aria-label="Upvote"]') as HTMLButtonElement;
    expect(rootVote.getAttribute("aria-pressed")).toBe("true");

    (query('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    const memberVote = cards()[1].querySelector(
      'button[aria-label="Downvote"]',
    ) as HTMLButtonElement;
    // The overlay beats the link's own userVote (0 here) and the host's map wins per id.
    expect(memberVote.getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to link.userVote when the host supplies no overlay for that id", async () => {
    await setLink(makeThread([makeMember("2", { userVote: 1 })], { userVote: -1 }));

    const rootDown = cards()[0].querySelector('button[aria-label="Downvote"]') as HTMLButtonElement;
    expect(rootDown.getAttribute("aria-pressed")).toBe("true");

    (query('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    const memberUp = cards()[1].querySelector('button[aria-label="Upvote"]') as HTMLButtonElement;
    expect(memberUp.getAttribute("aria-pressed")).toBe("true");
  });

  it("honours the scalar userVote input for the root when no keyed overlay exists", async () => {
    fixture.componentRef.setInput("userVote", 1);
    await fixture.whenStable();

    const rootUp = cards()[0].querySelector('button[aria-label="Upvote"]') as HTMLButtonElement;
    expect(rootUp.getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves the root's presentation identical to a plain unthreaded link", async () => {
    // The product rule: the first link of a group looks exactly like any single link. Pinned
    // differentially against a bare app-link-card render of the SAME link, so any future wrapper
    // restyling (bold, size, badge) fails here.
    const root = makeThread([makeMember("2")]);
    await setLink(root);

    const bare = TestBed.createComponent(LinkCardComponent);
    bare.componentRef.setInput("link", root);
    bare.detectChanges();
    await bare.whenStable();

    const threadedArticle = query("app-link-card article") as HTMLElement;
    const bareArticle = bare.nativeElement.querySelector("article") as HTMLElement;

    expect(threadedArticle.className).toBe(bareArticle.className);
    // And the wrapper contributes no presentation of its own to the card's own box: same tag,
    // same classes, no extra wrapper around the article.
    expect(threadedArticle.outerHTML).toBe(bareArticle.outerHTML);
  });

  it("forwards editable to the root only and re-emits edit from the card that fired it", async () => {
    fixture.componentRef.setInput("editable", true);
    await setLink(makeThread([makeMember("2")]));

    const emitted: LinkCardItem[] = [];
    fixture.componentInstance.edit.subscribe((link) => emitted.push(link));

    (cards()[0].querySelector('[data-testid="link-edit"]') as HTMLButtonElement).click();
    (query('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(emitted.map((link) => link.id)).toEqual(["1"]);

    // Members stay read-only: `editable` is the root's affordance.
    expect(cards()[1].querySelector('[data-testid="link-edit"]')).toBeNull();
  });
});
