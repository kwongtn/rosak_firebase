import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import type { PublicSocialMediaLink } from "../data/social-links.queries";
import { LinkSheetService } from "../data/link-sheet.service";
import { LinkListComponent } from "./link-list.component";

/** `occurredAt` is a naive Kuala Lumpur wall time, exactly as the backend sends it. */
function makeLink(id: string, occurredAt: string): PublicSocialMediaLink {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: occurredAt,
    occurredAt,
    status: "LIVE",
    completed: false,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    vehicles: [],
    stations: [],
  };
}

// The headers must read the same in the SSR server's zone (UTC) and in a Malaysian browser, which is
// what hydration needs. Both zones run, since a bug can show in only one of them.
describe.each(["UTC", "Asia/Kuala_Lumpur"])("LinkListComponent day headers in %s", (tz) => {
  let fixture: ComponentFixture<LinkListComponent>;

  beforeEach(async () => {
    vi.stubEnv("TZ", tz);
    // 03:30 MYT on 21 Oct, while UTC is still on the 20th.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T19:30:00Z"));
    await TestBed.configureTestingModule({
      imports: [LinkListComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => false, isAdmin: () => false, user: () => null },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LinkListComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function headers(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("h2")).map(
      (heading) => heading.textContent?.trim() ?? "",
    );
  }

  it("names each day by the date its cards fall on, and Today/Yesterday by the MYT clock", () => {
    fixture.componentRef.setInput("links", [
      makeLink("a", "2026-10-21T01:15:00"),
      makeLink("b", "2026-10-20T23:40:00"),
      makeLink("c", "2026-09-28T15:46:46"),
      makeLink("d", "2026-09-24T07:56:00"),
    ]);
    fixture.detectChanges();

    // Before the fix a Malaysian browser printed "September 27, 2026" over the 28th's card and
    // "September 22, 2026" over the 24th's (a day early from the DatePipe zone shift, and one more
    // from the UTC bucketing of the 07:56 card).
    expect(headers()).toEqual(["Today", "Yesterday", "September 28, 2026", "September 24, 2026"]);
  });

  it("groups an offset-bearing instant under its Kuala Lumpur day", () => {
    fixture.componentRef.setInput("links", [
      makeLink("a", "2026-09-28T15:46:46"),
      // 00:30 MYT on the 28th, expressed in UTC.
      makeLink("b", "2026-09-27T16:30:00Z"),
    ]);
    fixture.detectChanges();

    expect(headers()).toEqual(["September 28, 2026"]);
  });
});

describe("LinkListComponent pending and approved links", () => {
  let fixture: ComponentFixture<LinkListComponent>;
  let sheet: LinkSheetService;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T18:30:00Z"));
    await TestBed.configureTestingModule({
      imports: [LinkListComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => false, isAdmin: () => false, user: () => null },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();
    sheet = TestBed.inject(LinkSheetService);
    fixture = TestBed.createComponent(LinkListComponent);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function pendingToggle(): HTMLButtonElement | undefined {
    return Array.from(root().querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").includes("Pending ("),
    );
  }

  function renderedCards(): number {
    return root().querySelectorAll("app-link-card").length;
  }

  it("keeps pending links out of the day groups, behind a collapsed counted toggle", () => {
    fixture.componentRef.setInput("links", [
      makeLink("a", "2026-10-19T10:00:00"),
      { ...makeLink("p1", "2026-10-19T09:00:00"), status: "PENDING_APPROVAL" },
      // `completed` is the admin's "handled" flag, not the approval split: this stays approved.
      { ...makeLink("b", "2026-10-18T10:00:00"), completed: true },
      { ...makeLink("p2", "2026-10-18T09:00:00"), status: "PENDING_APPROVAL" },
    ]);
    fixture.detectChanges();

    expect(Array.from(root().querySelectorAll("h2")).map((h) => h.textContent?.trim())).toEqual([
      "October 19, 2026",
      "October 18, 2026",
    ]);
    expect(renderedCards()).toBe(2);
    expect(pendingToggle()?.textContent?.trim()).toBe("Pending (2)");
    expect(pendingToggle()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the pending cards only once the toggle is pressed", () => {
    fixture.componentRef.setInput("links", [
      makeLink("a", "2026-10-19T10:00:00"),
      { ...makeLink("p1", "2026-10-19T09:00:00"), status: "PENDING_APPROVAL" },
    ]);
    fixture.detectChanges();
    expect(renderedCards()).toBe(1);

    pendingToggle()?.click();
    fixture.detectChanges();

    expect(pendingToggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(renderedCards()).toBe(2);
  });

  it("renders no pending toggle when nothing is awaiting approval", () => {
    fixture.componentRef.setInput("links", [makeLink("a", "2026-10-19T10:00:00")]);
    fixture.detectChanges();

    expect(pendingToggle()).toBeUndefined();
  });

  it("emits sheetClosed once on the open-to-closed edge only", () => {
    fixture.componentRef.setInput("links", [makeLink("a", "2026-10-19T10:00:00")]);
    fixture.detectChanges();
    let closed = 0;
    fixture.componentInstance.sheetClosed.subscribe(() => closed++);

    sheet.open();
    TestBed.tick();
    expect(closed).toBe(0);

    sheet.close();
    TestBed.tick();
    expect(closed).toBe(1);

    // Already closed: no open-to-closed edge, so no reload.
    sheet.setOpen(false);
    TestBed.tick();
    expect(closed).toBe(1);
  });
});
