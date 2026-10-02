import { type WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import type { LinkCardItem } from "../data/link-card-item";
import { threadLabel } from "../data/link-thread-selection.util";
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
    // A real `VoteMutationPayload`: the control repaints from the acknowledgement rather than
    // from its own projection, so a `{ ok }`-only stub would leave it on the fallback.
    requestMock = vi.fn().mockResolvedValue({
      upvoteSocialMediaLink: { ok: true, userVote: 1, voteScore: 8, upvotes: 3, downvotes: 1 },
    });
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
    const badge = query('[data-testid="link-tags"]')?.firstElementChild as HTMLElement;

    expect(text).toContain("Delays on the KJL");
    expect(badge?.textContent).toContain("KJL");
    // The line's full name is `sr-only` text, not a `title` tooltip: the stretched-link
    // overlay owns the pointer, so a hover tooltip could never fire again.
    expect(badge?.textContent).toContain("Kajang Line");
    expect(badge?.querySelector(".sr-only")?.textContent?.trim()).toBe("— Kajang Line");
    expect(text).toContain("+7");
  });

  it("names the stretched link itself, since the overlay no longer wraps the visible text", () => {
    const anchor = query("a") as HTMLAnchorElement;

    expect(anchor.getAttribute("href")).toBe("https://www.example.com/story");
    // Title leads, raw URL follows — a reader cannot see the domain/path line as part of the
    // link's name any more, because the name is no longer its text content.
    expect(anchor.textContent?.trim()).toBe("Delays on the KJL (https://www.example.com/story)");

    // And it is genuinely an OVERLAY: absolutely positioned across the whole left column,
    // which is what keeps the chips clickable while the toggle can sit beside them.
    expect(anchor.classList.contains("absolute")).toBe(true);
    expect(anchor.classList.contains("inset-0")).toBe(true);
    // BOTH visible layers opt out of hit-testing — the text body AND the chip row — so a click
    // anywhere on the card's left column, chips included, reaches the anchor underneath.
    const column = anchor.parentElement as HTMLElement;
    const layers = [...column.children].filter(
      (child) => child !== anchor && !child.contains(anchor),
    );
    expect(layers.length).toBe(2);
    for (const layer of layers) {
      expect(layer.classList.contains("pointer-events-none")).toBe(true);
    }
  });

  it("falls back to the bare URL as the link's name when the link has no title", async () => {
    fixture.componentRef.setInput("link", makeLink({ title: "" }));
    await fixture.whenStable();

    expect(query("a")?.textContent?.trim()).toBe("https://www.example.com/story");
  });

  it("renders the google favicon for an http(s) url and a plain-link icon otherwise", async () => {
    const favicon = query('img[src*="favicons"]') as HTMLImageElement;

    expect(favicon?.getAttribute("src")).toBe(
      "https://www.google.com/s2/favicons?domain=www.example.com",
    );

    fixture.componentRef.setInput("link", makeLink({ url: "not a url" }));
    await fixture.whenStable();

    expect(query('img[src*="favicons"]')).toBeNull();
    expect(query("article svg")).not.toBeNull();
    expect(query('[data-testid="link-url-domain"]')?.textContent).toBe("not a url");
  });

  it("shows the Pending pill, explained 'awaiting admin approval', only while PENDING_APPROVAL", async () => {
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
    expect(pill.querySelector(".sr-only")?.textContent?.trim()).toBe("— awaiting admin approval");

    // The axes are independent: marking a still-unapproved link "handled" keeps the pill.
    fixture.componentRef.setInput(
      "link",
      makeLink({ status: "PENDING_APPROVAL", completed: true }),
    );
    await fixture.whenStable();
    expect(query('[data-testid="link-pending"]')).not.toBeNull();
  });

  it("shows the Official chip only for an automatically captured link (isAutomated)", async () => {
    // Hosts that don't select the field at all (insiden/situasi) must not show a chip.
    expect(query('[data-testid="link-official"]')).toBeNull();

    fixture.componentRef.setInput("link", makeLink({ isAutomated: false }));
    await fixture.whenStable();
    expect(query('[data-testid="link-official"]')).toBeNull();

    fixture.componentRef.setInput("link", makeLink({ isAutomated: true }));
    await fixture.whenStable();

    const chip = query('[data-testid="link-official"]') as HTMLElement;
    expect(chip.textContent).toContain("Official");
    expect(chip.querySelector(".sr-only")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "— captured automatically from an official operator account",
    );
    // Provenance is independent of the approval axis: an ingested post that is still
    // queued shows both chips.
    expect(chip.closest('[data-testid="link-tags"]')).not.toBeNull();
  });

  /* ---- the conversation affordance (moved inside the card in this wave) ---------- */

  it("shows the conversation chip only when sublinkCount > 0, never on isThreadRoot", async () => {
    // 🔴 THE TRAP, stated as an assertion: the backend's `isThreadRoot` is `parentId == null`, which
    // is ALSO true of every ordinary ungrouped link (a lone link is a conversation of one). A chip
    // gated on it would say "1 links" on every row of every surface this shared card serves.
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();
    fixture.componentRef.setInput("link", makeLink({ isThreadRoot: true, sublinkCount: 0 }));
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();
    expect(query('[data-testid="link-thread-size"]')).toBeNull();

    // Not a root, still nothing: the gate is the count, in both directions.
    fixture.componentRef.setInput("link", makeLink({ isThreadRoot: false, sublinkCount: 0 }));
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();

    // The smallest real conversation: ONE sublink, and the chip still appears. Note the count
    // arrives as the card's OWN input, not off `link` — the wrapper is what supplies it, which is
    // how a flat host that never selects `sublinkCount` keeps its rows chip-less.
    fixture.componentRef.setInput("link", makeLink());
    fixture.componentRef.setInput("sublinkCount", 1);
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-toggle"]')).not.toBeNull();
    expect(query('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe("2 links");

    // `link.sublinkCount` alone must NOT draw a chip — the input is the gate, so a caller that
    // forgets to pass it gets no affordance rather than one the wrapper cannot reveal.
    fixture.componentRef.setInput("sublinkCount", 0);
    fixture.componentRef.setInput("link", makeLink({ sublinkCount: 5 }));
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();

    // A NaN count (only reachable from a hand-built fixture, but `strict` is OFF) degrades to no
    // chip rather than to "NaN links".
    fixture.componentRef.setInput("sublinkCount", Number.NaN);
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();

    // Hosts that do not select the field at all (the flat /insiden, situasi and incident surfaces)
    // pass nothing and get no chip — which is correct there, since those lists show every link as
    // its own row and a chip would point at a non-existent expansion.
    fixture.componentRef.setInput("sublinkCount", 0);
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-toggle"]')).toBeNull();
  });

  it("places the affordance in the CHIP ROW, outside the anchor and off the rail", async () => {
    fixture.componentRef.setInput("sublinkCount", 3);
    await fixture.whenStable();

    const article = query("article") as HTMLElement;
    const anchor = query("a") as HTMLAnchorElement;
    const toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;

    expect(toggle.tagName.toLowerCase()).toBe("button");
    expect(toggle.getAttribute("type")).toBe("button");
    // Structurally inside the card's own chrome…
    expect(article.contains(toggle)).toBe(true);
    expect(toggle.closest("article")).toBe(article);
    // …and structurally outside the link anchor. A <button> inside an <a> is invalid HTML AND its
    // click would navigate — the card's constraint 1, which is why the anchor is a stretched
    // overlay rather than a wrapper and the chip row is its sibling.
    expect(anchor.contains(toggle)).toBe(false);
    expect(toggle.closest("a")).toBeNull();
    // The request: it belongs in the chip row, beside the Official / line-code chips, and NOT in
    // the right rail. Asserted both ways so a future "tidy up" cannot move it back out there.
    expect(toggle.closest('[data-testid="link-tags"]')).not.toBeNull();
    expect(toggle.closest('[data-testid="link-meta-rail"]')).toBeNull();
    // And it must survive the stretched-link layer's `pointer-events-none`, or the click falls
    // through to the anchor and navigates instead of expanding.
    expect(toggle.classList.contains("pointer-events-auto")).toBe(true);
    // The chip row it joins is itself inside the link's hit area, so the chips stay clickable.
    const tags = query('[data-testid="link-tags"]') as HTMLElement;
    expect(tags.closest("a")).toBeNull();
    expect(tags.parentElement?.classList.contains("relative")).toBe(true);
  });

  it("reports the toggle click without owning the expansion", async () => {
    const clicks: number[] = [];
    fixture.componentInstance.sublinkToggle.subscribe(() => clicks.push(1));
    fixture.componentRef.setInput("sublinkCount", 2);
    await fixture.whenStable();

    // The card does NOT own expansion: it reflects the wrapper's signal and merely reports clicks.
    const toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    await fixture.whenStable();

    expect(clicks).toEqual([1]);
    // Nothing expanded on its own — aria-expanded is still the wrapper's value (false).
    expect(query('[data-testid="link-thread-toggle"]')?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("mirrors the wrapper's expanded signal in aria-expanded and the chevron", async () => {
    fixture.componentRef.setInput("sublinkCount", 2);
    await fixture.whenStable();

    let toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    const chevron = toggle.querySelector("svg") as SVGElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(chevron.classList.contains("rotate-180")).toBe(false);

    fixture.componentRef.setInput("sublinksExpanded", true);
    await fixture.whenStable();

    toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect((toggle.querySelector("svg") as SVGElement).classList.contains("rotate-180")).toBe(true);
  });

  it("pluralises the chip through the SHARED threadLabel, passed the conversation size", async () => {
    // 🔴 THE OFF-BY-ONE. `threadLabel`'s parameter is a CONVERSATION SIZE (`sublinkCount + 1`), not a
    // descendant count, and it answers "" for `<= 1`. Passing the raw count would delete the chip
    // for a root with exactly ONE sublink while leaving ordinary rows correctly chip-less.
    expect(threadLabel(0)).toBe("");
    expect(threadLabel(1)).toBe("");

    fixture.componentRef.setInput("sublinkCount", 1);
    await fixture.whenStable();
    expect(query('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(threadLabel(2));

    fixture.componentRef.setInput("sublinkCount", 3);
    await fixture.whenStable();
    const chip = query('[data-testid="link-thread-size"]')?.textContent?.trim();
    expect(chip).toBe(threadLabel(4));
    expect(chip).toBe("4 links");
    // Readable text, not a bare icon: the size must be learnable without hovering.
    expect(query('[data-testid="link-thread-toggle"]')?.textContent?.trim()).toBe("4 links");
  });

  it("quotes the shared label in the toggle's accessible name, stating the action", async () => {
    fixture.componentRef.setInput("sublinkCount", 3);
    await fixture.whenStable();

    let toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-label")).toBe(
      `Show the other links in this thread (${threadLabel(4)})`,
    );
    // NOT the raw descendant count (3), which is a different number for the same conversation.
    expect(toggle.getAttribute("aria-label")).not.toContain("(3 links)");

    fixture.componentRef.setInput("sublinksExpanded", true);
    await fixture.whenStable();
    toggle = query('[data-testid="link-thread-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-label")).toBe(
      `Hide the other links in this thread (${threadLabel(4)})`,
    );
  });

  it("changes NOTHING else about the card when the chip is present", async () => {
    // The appearance rule, reaffirmed twice: same size, same weight, same layout. Pinned as an
    // exact markup comparison — the chip is the ONE permitted addition, so removing it must give
    // back the byte-for-byte markup of a chip-less card with the same link.
    fixture.componentRef.setInput("sublinkCount", 2);
    await fixture.whenStable();
    const withChip = (query("article") as HTMLElement).outerHTML;

    fixture.componentRef.setInput("sublinkCount", 0);
    await fixture.whenStable();
    const withoutChip = (query("article") as HTMLElement).outerHTML;

    // Same article class either way: no bold, no border, no background, no size change.
    expect(withChip).not.toBe(withoutChip);
    const stripped = new DOMParser()
      .parseFromString(withChip, "text/html")
      .querySelector("article") as HTMLElement;
    stripped.querySelector('[data-testid="link-thread-toggle"]')?.remove();
    expect(stripped.outerHTML).toBe(withoutChip);
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

  it("displays occurredAt (when it happened) instead of created (when it was reported)", async () => {
    // `created` stays "now" in the fixture, so a non-fresh label can only have come from
    // occurredAt. Both instants are built from local date parts so the assertion is tz-stable.
    const occurredAt = new Date(2026, 7, 1, 8, 0).toISOString();
    fixture.componentRef.setInput("link", makeLink({ occurredAt }));
    await fixture.whenStable();

    const label = query('[data-testid="link-created"]') as HTMLElement;
    expect(label.textContent).toContain("ago");
    expect(label.textContent).not.toContain("less than a minute");

    const tooltip = query('[data-testid="link-time"] [role="tooltip"]') as HTMLElement;
    expect(tooltip.textContent).toContain("Aug 1, 2026 08:00");
  });

  it("falls back to the submission time when the host did not select occurredAt", async () => {
    // The fallback is load-bearing: occurredAt is optional on LinkCardItem (per-document
    // selection) and strict mode is OFF, so a host that omits it must still see a real time.
    const created = new Date(2026, 7, 1, 8, 0).toISOString();
    fixture.componentRef.setInput("link", makeLink({ created, occurredAt: undefined }));
    await fixture.whenStable();

    const tooltip = query('[data-testid="link-time"] [role="tooltip"]') as HTMLElement;
    expect(tooltip.textContent).toContain("Aug 1, 2026 08:00");
    expect(query('[data-testid="link-created"]')?.textContent).toContain("ago");
    // Displayed instant IS created, so the tooltip must not repeat itself.
    expect(query('[data-testid="link-submitted"]')).toBeNull();
  });

  it("keeps the submission time in the tooltip only when the two axes differ", async () => {
    // Promoting occurredAt to the visible label must not lose moderation provenance, so the
    // tooltip names the reported instant too.
    fixture.componentRef.setInput(
      "link",
      makeLink({
        occurredAt: new Date(2026, 7, 1, 8, 0).toISOString(),
        created: new Date(2026, 7, 2, 9, 30).toISOString(),
      }),
    );
    await fixture.whenStable();

    const submitted = query('[data-testid="link-submitted"]') as HTMLElement;
    expect(submitted.textContent).toContain("Submitted Aug 2, 2026 09:30");
    expect(query('[data-testid="link-submitter"]')).not.toBeNull();

    // The same instant written with different precision is NOT a second fact: the backend
    // serialises microseconds, `created` often arrives without a fractional part.
    fixture.componentRef.setInput(
      "link",
      makeLink({ occurredAt: "2026-08-01T08:00:00.000000", created: "2026-08-01T08:00:00" }),
    );
    await fixture.whenStable();

    expect(query('[data-testid="link-submitted"]')).toBeNull();
  });
});
