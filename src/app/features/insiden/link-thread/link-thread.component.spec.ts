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
 * The wrapper is now RECURSIVE, so most fixtures are built bottom-up: a leaf, a parent of leaves, a
 * root of parents. `sublinkCount` is always written explicitly even where it is derivable from the
 * children — a fixture that forgot it would silently test the "no chip" path while rendering a
 * conversation, which is the exact bug shape these specs exist to catch.
 */
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
    // A root that has never been grouped: `isThreadRoot` is TRUE here, and must still not sprout an
    // affordance — that is the whole point of the gate (the backend's root == `parentId == null`,
    // which every ordinary ungrouped link also satisfies).
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    sublinks: [],
    ...overrides,
  };
}

/** A child node. `parentId` is set (so `isThreadRoot` is false) and its own count/list start empty. */
function makeChild(id: string, overrides: Partial<LinkCardItem> = {}): LinkCardItem {
  return makeLink({
    id,
    url: `https://www.example.com/child-${id}`,
    title: `Follow-up ${id}`,
    parentId: "1",
    isThreadRoot: false,
    sublinkCount: 0,
    sublinks: [],
    ...overrides,
  });
}

/** A node WITH children: the count is the total of its own subtree, per the backend's contract. */
function makeNodeWith(
  id: string,
  children: LinkCardItem[],
  overrides: Partial<LinkCardItem> = {},
): LinkCardItem {
  const own = children.reduce((sum, child) => sum + 1 + (child.sublinkCount ?? 0), 0);
  return makeLink({
    id,
    url: `https://www.example.com/node-${id}`,
    title: `Node ${id}`,
    parentId: id === "1" ? null : "1",
    isThreadRoot: id === "1",
    sublinkCount: own,
    sublinks: children,
    ...overrides,
  });
}

describe("LinkThreadComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: WritableSignal<boolean>;
  let fixture: ComponentFixture<LinkThreadComponent>;

  function query<T extends Element = HTMLElement>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector) as T | null;
  }

  function queryAll<T extends Element = HTMLElement>(selector: string): T[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as T[];
  }

  /** Every card currently rendered, in document order — so nesting is visible as indentation order. */
  function cards(): HTMLElement[] {
    return queryAll("app-link-card");
  }

  /**
   * The root's own card — the first `app-link-card` in document order.
   *
   * ⚠️ Not `query("app-link-thread app-link-card")`: the fixture's HOST element IS this component's
   * `app-link-thread` tag, so a descendant selector rooted at `app-link-thread` misses the root's own
   * card (and, symmetrically, `queryAll("app-link-thread")` counts only the NESTED wrappers). Every
   * count in these specs is written against that.
   */
  function rootCard(): HTMLElement {
    return query<HTMLElement>("app-link-card") as HTMLElement;
  }

  /** The root's own conversation chip — the first toggle in document order. Non-null asserted
   *  deliberately: every call site is a test that would fail loudly on a missing chip, and the
   *  surrounding `?.` noise would hide the assertion that matters. */
  function rootToggle(): HTMLButtonElement {
    return query<HTMLButtonElement>('[data-testid="link-thread-toggle"]')!;
  }

  async function setLink(link: LinkCardItem): Promise<void> {
    fixture.componentRef.setInput("link", link);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    // A real `VoteMutationPayload`, because the control repaints from the acknowledgement
    // rather than from its own projection — a `{ ok }`-only stub would make it fall back.
    requestMock = vi.fn().mockResolvedValue({
      upvoteSocialMediaLink: { ok: true, userVote: 1, voteScore: 8, upvotes: 3, downvotes: 1 },
    });
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

  /* ---- the gate ---------------------------------------------------------- */

  it("renders a plain ungrouped link as ONE card and no affordance", async () => {
    // 🔴 THE TRAP. `isThreadRoot` is TRUE for an ungrouped link (`parentId == null` IS the
    // definition of a root), so a gate on it would put a "1 links" chip on every row in the app.
    await setLink(makeLink({ parentId: null, isThreadRoot: true, sublinkCount: 0, sublinks: [] }));

    expect(cards()).toHaveLength(1);
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();
    expect(query('[data-testid="link-thread-size"]')).toBeNull();
  });

  it("gates the affordance on sublinkCount > 0, never on isThreadRoot", async () => {
    // A subtree the host counted but did not select (`sublinks` absent): the count is the truth the
    // card draws from, and an absent list is a leaf-for-rendering purposes.
    await setLink(makeLink({ isThreadRoot: true, sublinkCount: 0, sublinks: undefined }));
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();

    // One sublink: the smallest real conversation. This is the case a raw-count pluralisation
    // dropped, because `threadLabel(1)` is `""` — the helper wants a SIZE, so it must be `count + 1`.
    await setLink(makeNodeWith("1", [makeChild("2")]));
    expect(query('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(threadLabel(2));

    // A root that is NOT a root marker-wise but has no children: still no chip.
    await setLink(makeLink({ parentId: "0", isThreadRoot: false, sublinkCount: 0 }));
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();
  });

  /* ---- the affordance moved INTO the card --------------------------------- */

  it("puts the affordance in the CHIP ROW and outside the anchor", async () => {
    await setLink(makeNodeWith("1", [makeChild("2")]));

    const toggle = rootToggle();
    expect(toggle).not.toBeNull();
    // Inside the card's own <article>…
    expect(toggle.closest("article")).toBe(rootCard().querySelector("article"));
    // …in the chip row, beside the Official / line-code chips, which is where the request put it…
    expect(toggle.closest('[data-testid="link-tags"]')).not.toBeNull();
    // …and NOT inside the link anchor, which would both be invalid HTML and navigate on click.
    expect(toggle.closest("a")).toBeNull();
    expect(rootCard().querySelector("a")?.querySelector('[data-testid="link-thread-toggle"]')).toBe(
      null,
    );
    // The chip row is hit-test-transparent, so the toggle has to opt back in or its click would
    // fall through the stretched anchor and navigate instead of expanding.
    expect(toggle.classList.contains("pointer-events-auto")).toBe(true);
  });

  it("leaves the root card's presentation identical to a plain unthreaded card", async () => {
    // The product rule, reaffirmed twice: the first link of a conversation looks exactly like any
    // single link — same size, same weight, same layout. Pinned DIFFERENTIALLY against bare
    // app-link-card renders of the SAME link, so any future wrapper restyling (bold, size, badge,
    // border, background) fails here.
    //
    // WHAT IS ALLOWED TO DIFFER: exactly one element — the conversation chip, which belongs to the
    // CARD and not to the wrapper. Both bare renders below use the identical `link` object, so the
    // comparison isolates presentation rather than content.
    const root = makeNodeWith("1", [makeChild("2")]);
    await setLink(root);

    // (a) The wrapper adds NOTHING: a threaded root is byte-identical to a bare card given the same
    //     inputs (including the chip, which the wrapper supplies).
    const bare = TestBed.createComponent(LinkCardComponent);
    bare.componentRef.setInput("link", root);
    bare.componentRef.setInput("sublinkCount", root.sublinkCount ?? 0);
    bare.detectChanges();
    await bare.whenStable();

    const threadedArticle = query<HTMLElement>("app-link-card article") as HTMLElement;
    const bareArticle = bare.nativeElement.querySelector("article") as HTMLElement;
    expect(threadedArticle.className).toBe(bareArticle.className);
    expect(threadedArticle.outerHTML).toBe(bareArticle.outerHTML);

    // (b) And against the same link rendered WITHOUT the count, the chip is the only difference.
    const plain = TestBed.createComponent(LinkCardComponent);
    plain.componentRef.setInput("link", root);
    plain.detectChanges();
    await plain.whenStable();
    const plainArticle = plain.nativeElement.querySelector("article") as HTMLElement;
    expect(plainArticle.outerHTML).not.toBe(threadedArticle.outerHTML);

    const withoutChip = threadedArticle.cloneNode(true) as HTMLElement;
    expect(withoutChip.querySelectorAll('[data-testid="link-thread-toggle"]')).toHaveLength(1);
    withoutChip.querySelector('[data-testid="link-thread-toggle"]')?.remove();
    expect(withoutChip.outerHTML).toBe(plainArticle.outerHTML);
  });

  it("renders a real button that mirrors aria-expanded, and the wrapper owns the state", async () => {
    // The chip lives inside the card and is a real <button>; the WRAPPER holds the signal, which is
    // why `aria-expanded` follows the click even though the card owns the button's markup. (The card
    // spec covers the card's own half: that it reports `sublinkToggle` and never flips its own
    // state. Asserting the emission here would need the nested card's componentInstance.)
    await setLink(makeNodeWith("1", [makeChild("2")]));

    expect(rootToggle().tagName.toLowerCase()).toBe("button");
    expect(rootToggle().getAttribute("type")).toBe("button");
    expect(rootToggle().getAttribute("aria-expanded")).toBe("false");

    rootToggle().click();
    await fixture.whenStable();
    expect(rootToggle().getAttribute("aria-expanded")).toBe("true");
    expect(cards()).toHaveLength(2);

    rootToggle().click();
    await fixture.whenStable();
    expect(rootToggle().getAttribute("aria-expanded")).toBe("false");
    expect(cards()).toHaveLength(1);
  });

  it("pluralises through the SHARED threadLabel, for both the chip and the accessible name", async () => {
    // The invariant is "one pluralisation decision for the whole app". Two roots of truth is what
    // the wrapper used to have (the visible badge plus a private ternary on the toggle). The label
    // now lives in the CARD, which reads the same helper — so the chip can never say "1 links"
    // while the console chip says "2 link".
    const root = makeNodeWith("1", [makeChild("2"), makeChild("3")]);
    await setLink(root);

    // 🔴 THE OFF-BY-ONE, asserted from both sides. The helper is handed the CONVERSATION SIZE
    // (`sublinkCount + 1`): the raw descendant count is a DIFFERENT, smaller number, and for a
    // single-sublink root it is the one value the helper answers `""` for — which would silently
    // delete the chip.
    const descendants = root.sublinkCount ?? 0;
    expect(descendants).toBe(2);
    expect(threadLabel(descendants)).toBe("2 links"); // the wrong number…
    expect(query('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe("3 links"); // …right one
    expect(query('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(
      threadLabel(descendants + 1),
    );

    // And the value the helper really refuses: a single-sublink root has `sublinkCount === 1`.
    expect(threadLabel(1)).toBe("");
    await setLink(makeNodeWith("1", [makeChild("2")]));
    const chip = query('[data-testid="link-thread-size"]')?.textContent?.trim();
    expect(chip).toBe(threadLabel(2));
    expect(chip).toBe("2 links");

    // The accessible name quotes the SAME value as the visible text.
    const ariaLabel = rootToggle().getAttribute("aria-label");
    expect(ariaLabel).toBe(`Show the other links in this thread (${chip})`);
    expect(ariaLabel).not.toContain("(1 links)");
  });

  /* ---- recursion ---------------------------------------------------------- */

  it("renders a THREE-level tree with each level collapsed and independently expandable", async () => {
    // root -> a -> a1, plus a sibling leaf `b` under the root. Collapsed: one card, full stop.
    const leaf = makeChild("a1");
    const a = makeNodeWith("a", [leaf]);
    const b = makeChild("b");
    const root = makeNodeWith("1", [a, b]);
    await setLink(root);

    expect(cards()).toHaveLength(1);

    // Expand the root: its DIRECT children only — the grandchild is still collapsed, which is the
    // whole meaning of "each level has its own state".
    rootToggle().click();
    await fixture.whenStable();
    expect(cards()).toHaveLength(3);
    expect(hrefs()).toEqual([
      "https://www.example.com/node-1",
      "https://www.example.com/node-a",
      "https://www.example.com/child-b",
    ]);

    // Expand the FIRST CHILD. The grandchild appears; the sibling `b` is untouched.
    expect(toggles()).toHaveLength(2);
    expect(toggles()[1].getAttribute("aria-expanded")).toBe("false");
    await expandChild(0);

    expect(cards()).toHaveLength(4);
    expect(hrefs()).toEqual([
      "https://www.example.com/node-1",
      "https://www.example.com/node-a",
      "https://www.example.com/child-a1",
      "https://www.example.com/child-b",
    ]);
    // Three NESTED wrappers (a, a1, b) — the recursion really is the DOM shape, not a flattened
    // loop. ⚠️ The ROOT wrapper is the fixture's own host element, so it is not in this count: a
    // host rendering `app-link-thread` sees the same three descendants.
    expect(queryAll("app-link-thread").length).toBe(3);
    // Exactly ONE of them is itself a descendant of another wrapper — the grandchild `a1` inside
    // `a`. A flat one-level loop would give 0 here.
    expect(queryAll("app-link-thread app-link-thread").length).toBe(1);
  });

  it("keeps a sibling's collapse from collapsing its neighbour", async () => {
    // Two siblings, both expandable. Collapsing the first must not touch the second — the state is
    // per component INSTANCE, so this fails the moment the state is hoisted to the parent.
    const a1 = makeChild("a1");
    const b1 = makeChild("b1");
    const root = makeNodeWith("1", [makeNodeWith("a", [a1]), makeNodeWith("b", [b1])]);
    await setLink(root);

    rootToggle().click();
    await fixture.whenStable();

    // Expand BOTH children (`a` then `b`); the root's own chip is slot 0 and stays untouched.
    await expandChild(0);
    await expandChild(1);
    expect(cards()).toHaveLength(5);
    // Three chips only: the root, `a` and `b` — the grandchildren `a1`/`b1` are LEAVES, so they
    // carry no chip at all. A count that did not hold would mean the gate had leaked somewhere.
    expect(toggles()).toHaveLength(3);
    expect(toggles().map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual([
      "true",
      "true",
      "true",
    ]);

    // Collapse the first sibling again.
    await expandChild(0);

    // `a` closed, `b` still open — the state is per instance.
    expect(toggles().map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
      "true",
    ]);
    expect(hrefs()).toEqual([
      "https://www.example.com/node-1",
      "https://www.example.com/node-a",
      "https://www.example.com/node-b",
      "https://www.example.com/child-b1",
    ]);
  });

  it("leaves no empty indent rule when the count has no fetched children", async () => {
    // `sublinkCount > 0` with an unfetched `sublinks` still shows the chip (the count is the truth
    // the card draws from) but must not reveal an empty column — depth is bounded by what the query
    // fetched, and this component has no depth cap of its own to enforce.
    await setLink(makeLink({ sublinkCount: 2, sublinks: [] }));

    expect(query('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe("3 links");
    rootToggle().click();
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-members"]')).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it("indents each level so nesting is legible", async () => {
    const a1 = makeChild("a1");
    await setLink(makeNodeWith("1", [makeNodeWith("a", [a1])]));
    rootToggle().click();
    await fixture.whenStable();
    await expandChild(0);

    // Each level's own container carries the left rule + indent, so nesting reads as depth.
    const containers = queryAll<HTMLElement>('[data-testid="link-thread-members"]');
    expect(containers).toHaveLength(2);
    for (const container of containers) {
      expect(container.classList.contains("border-l")).toBe(true);
      expect(container.classList.contains("pl-3")).toBe(true);
    }
    // And they are genuinely nested: the grandchild's container lives INSIDE the child's container,
    // which is what makes the indent cumulative rather than a per-level offset that resets.
    expect(containers[0].contains(containers[1])).toBe(true);
    expect(containers[1].parentElement?.getAttribute("data-testid")).toBe("link-thread");
  });

  /* ---- editable descendants ---------------------------------------------- */

  it("forwards editable to EVERY descendant and re-emits that descendant's own item", async () => {
    fixture.componentRef.setInput("editable", true);
    const leaf = makeChild("a1", { url: "https://www.example.com/a1", title: "Grandchild" });
    const a = makeNodeWith("a", [leaf]);
    const root = makeNodeWith("1", [a]);
    await setLink(root);

    const emitted: LinkCardItem[] = [];
    fixture.componentInstance.edit.subscribe((link) => emitted.push(link));

    rootToggle().click();
    await fixture.whenStable();
    await expandChild(0);
    expect(cards()).toHaveLength(3);

    // Every level offers a pencil — the whole point of the user's third ask.
    for (const card of cards()) {
      expect(card.querySelector('[data-testid="link-edit"]')).not.toBeNull();
    }

    // Click the GRANDCHILD's pencil: the emitted object is that link's, not the root's and not the
    // intermediate's. A wrong item here would hydrate the edit sheet with the wrong URL/title.
    const grandchildPencil = cards()[2].querySelector<HTMLButtonElement>(
      '[data-testid="link-edit"]',
    )!;
    grandchildPencil.click();
    await fixture.whenStable();
    expect(emitted.map((link) => link.id)).toEqual(["a1"]);
    expect(emitted[0].url).toBe("https://www.example.com/a1");
    expect(emitted[0].title).toBe("Grandchild");
    // Everything the host's edit sheet hydrates from is present on the descendant too.
    expect(emitted[0].occurredAt).toBeTruthy();
    expect(emitted[0].lines?.length).toBe(1);

    // And the intermediate level likewise emits itself, not the root.
    cards()[1].querySelector<HTMLButtonElement>('[data-testid="link-edit"]')!.click();
    await fixture.whenStable();
    expect(emitted.map((link) => link.id)).toEqual(["a1", "a"]);
  });

  it("shows no pencil anywhere when editable is false", async () => {
    await setLink(makeNodeWith("1", [makeNodeWith("a", [makeChild("a1")])]));
    rootToggle().click();
    await fixture.whenStable();
    await expandChild(0);

    expect(cards().length).toBe(3);
    for (const card of cards()) {
      expect(card.querySelector('[data-testid="link-edit"]')).toBeNull();
    }
  });

  /* ---- votes -------------------------------------------------------------- */

  it("re-emits a vote with the VOTED node's id, including a deep descendant's", async () => {
    const emitted: { id: string; value: number }[] = [];
    fixture.componentInstance.voteChanged.subscribe((event) => emitted.push(event));

    const root = makeNodeWith("1", [makeNodeWith("a", [makeChild("a1")])]);
    await setLink(root);

    // Root's own vote.
    upvote(cards()[0]).click();
    await vi.waitFor(() => expect(emitted).toEqual([{ id: "1", value: 1 }]));

    rootToggle().click();
    await fixture.whenStable();
    await expandChild(0);

    // The DEEPEST node's vote, three levels down. The id must travel intact through two nested
    // wrappers, or the host files the optimistic overlay against the wrong link.
    upvote(cards()[2]).click();
    await vi.waitFor(() =>
      expect(emitted).toEqual([
        { id: "1", value: 1 },
        { id: "a1", value: 1 },
      ]),
    );
  });

  it("forwards the host's voteValues override to every card at every level", async () => {
    const leaf = makeChild("a1", { userVote: -1 });
    const a = makeNodeWith("a", [leaf], { userVote: -1 });
    const root = makeNodeWith("1", [a], { userVote: -1 });
    fixture.componentRef.setInput("voteValues", { "1": 1, a: -1, a1: -1 });
    await setLink(root);

    // The root's scalar `userVote` must NOT leak onto a child: it is unkeyed, so forwarding it
    // would paint the root's `+1` on every descendant that had no overlay entry.
    expect(
      cards()[0].querySelector('button[aria-label="Upvote"]')?.getAttribute("aria-pressed"),
    ).toBe("true");

    rootToggle().click();
    await fixture.whenStable();
    await expandChild(0);

    // Root `1` is an UP in the overlay; `a` and `a1` are DOWNs. Each card must show its OWN entry,
    // which is the whole point of forwarding the keyed map to every level.
    expect(cards()).toHaveLength(3);
    expect(
      cards()[0].querySelector('button[aria-label="Upvote"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    for (const card of cards().slice(1)) {
      expect(
        card.querySelector('button[aria-label="Downvote"]')?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(card.querySelector('button[aria-label="Upvote"]')?.getAttribute("aria-pressed")).toBe(
        "false",
      );
    }
  });

  it("honours the scalar userVote for THIS node only, and falls back to link.userVote", async () => {
    fixture.componentRef.setInput("userVote", 1);
    await setLink(makeLink({ userVote: -1 }));
    expect(
      cards()[0].querySelector('button[aria-label="Upvote"]')?.getAttribute("aria-pressed"),
    ).toBe("true");

    // No overlay, no scalar match for a child: the link's own backend value decides.
    await setLink(makeNodeWith("1", [makeChild("2", { userVote: 1 })], { userVote: -1 }));
    rootToggle().click();
    await fixture.whenStable();
    expect(
      cards()[0].querySelector('button[aria-label="Upvote"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      cards()[1].querySelector('button[aria-label="Upvote"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  /* ---- helpers ------------------------------------------------------------ */

  /** Every rendered chip, in document order. Slot 0 is the ROOT's own chip; slot n+1 is the n-th
   *  child node's chip (which may itself be a wrapper with children). */
  function toggles(): HTMLButtonElement[] {
    return queryAll<HTMLButtonElement>('[data-testid="link-thread-toggle"]');
  }

  /**
   * Toggle the n-th CHILD's chip (0-based among the root's children), then settle.
   *
   * ⚠️ Off by one on purpose: index 0 is the root's own chip, so a test that means "expand the
   * first child" must skip it — clicking slot 0 would collapse the root again and quietly leave one
   * card on screen, which is exactly the sort of false pass a tree spec invites.
   */
  async function expandChild(n: number): Promise<void> {
    toggles()[n + 1].click();
    await fixture.whenStable();
  }

  function hrefs(): (string | null)[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll("app-link-card a") as NodeListOf<HTMLAnchorElement>,
    ).map((anchor) => anchor.getAttribute("href"));
  }

  function upvote(card: HTMLElement): HTMLButtonElement {
    return card.querySelector<HTMLButtonElement>('app-vote-button button[aria-label="Upvote"]')!;
  }
});
