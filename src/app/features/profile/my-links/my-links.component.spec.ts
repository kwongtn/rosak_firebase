import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLink,
  PublicSocialMediaLinksQueryData,
  UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
} from "../../insiden/data/social-links.queries";
import { MyLinksComponent } from "./my-links.component";

interface TestableMyLinks {
  loadMore(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<MyLinksComponent>): TestableMyLinks {
  return fixture.componentInstance as unknown as TestableMyLinks;
}

function makeLink(
  id: string,
  status: string | null,
  completed: boolean,
  thread: Partial<PublicSocialMediaLink> = {},
): PublicSocialMediaLink {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    status,
    completed,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    vehicles: [],
    stations: [],
    ...thread,
  };
}

function connectionOf(
  nodes: PublicSocialMediaLink[],
  hasNextPage: boolean,
  endCursor: string | null,
): PublicSocialMediaLinksQueryData {
  return {
    publicSocialMediaLinks: {
      edges: nodes.map((node, index) => ({ node, cursor: endCursor ?? `cursor-${index}` })),
      pageInfo: { hasNextPage, endCursor },
    },
  };
}

/** The `hlm-checkbox` host carries the testid; the clickable control is the inner
 *  `button[role=checkbox]` that `brn-checkbox` renders. */
function tickRow(fixture: ComponentFixture<MyLinksComponent>, id: string): void {
  const host = fixture.nativeElement.querySelector(`[data-testid='select-link-${id}']`);
  if (!host) {
    throw new Error(`No selection checkbox for row ${id}`);
  }
  host.querySelector("button[role='checkbox']").click();
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<MyLinksComponent>, testId: string): HTMLButtonElement {
  const found = fixture.nativeElement.querySelector(`[data-testid='${testId}']`);
  if (!found) {
    throw new Error(`No [data-testid='${testId}'] in the rendered list`);
  }
  return found as HTMLButtonElement;
}

function textOf(fixture: ComponentFixture<MyLinksComponent>, testId: string): string {
  const found = fixture.nativeElement.querySelector(`[data-testid='${testId}']`);
  return found ? (found.textContent ?? "") : "";
}

/** Load the given rows, then settle. */
async function renderList(
  fixture: ComponentFixture<MyLinksComponent>,
  requestMock: ReturnType<typeof vi.fn>,
  nodes: PublicSocialMediaLink[],
): Promise<void> {
  requestMock.mockResolvedValueOnce(connectionOf(nodes, false, null));
  fixture.detectChanges();
  await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
  await fixture.whenStable();
}

describe("MyLinksComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<MyLinksComponent>;

  beforeEach(async () => {
    requestMock = vi.fn();
    toastError = vi.fn();

    await TestBed.configureTestingModule({
      imports: [MyLinksComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { idToken: async () => "token", user: () => null },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: { success: vi.fn(), error: toastError, info: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyLinksComponent);
    fixture.componentRef.setInput("isOwnProfile", true);
  });

  it("fetches the first page with mine=true and id-token headers", async () => {
    requestMock.mockResolvedValue(
      connectionOf(
        [makeLink("a", "PENDING_APPROVAL", false), makeLink("b", "LIVE", true)],
        false,
        null,
      ),
    );
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[0];
    expect(query).toBe(PUBLIC_SOCIAL_MEDIA_LINKS_QUERY);
    expect(vars).toEqual({ mine: true, first: 20, after: null });
    expect(headers).toEqual({ "firebase-auth-key": "token" });

    expect(fixture.nativeElement.textContent).toContain("Link a");
    expect(fixture.nativeElement.textContent).toContain("Pending approval");
    expect(fixture.nativeElement.textContent).toContain("Live");
  });

  it("does not fetch when viewing someone else's profile", async () => {
    fixture.componentRef.setInput("isOwnProfile", false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(requestMock).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("No links submitted yet.");
  });

  it("appends the next page via the after cursor", async () => {
    requestMock
      .mockResolvedValueOnce(connectionOf([makeLink("a", "LIVE", true)], true, "cursor-a"))
      .mockResolvedValueOnce(connectionOf([makeLink("b", "LIVE", true)], false, "cursor-b"));

    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    await asTestable(fixture).loadMore();
    await fixture.whenStable();

    expect(requestMock.mock.calls[1]).toEqual([
      PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
      { mine: true, first: 20, after: "cursor-a" },
      { "firebase-auth-key": "token" },
    ]);
    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  it("shows an inline retry when the first page fails", async () => {
    requestMock.mockRejectedValueOnce(new Error("boom"));
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid='retry-first-page']")).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load your submitted links.");
  });

  it("falls back to the raw URL as the row heading when title is empty", async () => {
    requestMock.mockResolvedValue(
      connectionOf([{ ...makeLink("c", "LIVE", true), title: "" }], false, null),
    );
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("https://example.com/c");
  });

  /* ---- thread grouping (spec F7) --------------------------------------- */

  it("sends ONLY linkIds — no threadId — so the backend starts a new thread", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);
    requestMock
      .mockResolvedValueOnce({ groupSocialMediaLinks: { ok: true, id: 7 } })
      .mockResolvedValue(connectionOf([], false, null));

    tickRow(fixture, "a");
    tickRow(fixture, "b");
    await fixture.whenStable();

    button(fixture, "group-selected").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[1];
    expect(query).toBe(GROUP_SOCIAL_MEDIA_LINKS_MUTATION);
    expect(vars).toEqual({ linkIds: ["a", "b"] });
    // Explicitly NOT `threadId: undefined` — omitting the key is the documented way to say
    // "start a new thread" (`ID = null`), and there is no existing-thread picker for a
    // submitter who cannot see other people's threads.
    expect(Object.prototype.hasOwnProperty.call(vars, "threadId")).toBe(false);
    expect(headers).toEqual({ "firebase-auth-key": "token" });
  });

  it("keeps the group action disabled for zero and for ONE ticked row", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);

    expect(button(fixture, "group-selected").disabled).toBe(true);

    tickRow(fixture, "a");
    expect(button(fixture, "group-selected").disabled).toBe(true);
    expect(textOf(fixture, "thread-selection-count")).toContain("1 selected");

    tickRow(fixture, "b");
    expect(button(fixture, "group-selected").disabled).toBe(false);

    // Nothing was sent — a one-link "thread" is a no-op that only looks like a thread.
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("clears the ticks and reloads the list from the first page after a successful group", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);
    requestMock
      .mockResolvedValueOnce({ groupSocialMediaLinks: { ok: true, id: 7 } })
      // The reload comes back as the backend now sees it: `a` elected root, `b` its member.
      // `threadSize` is `1 + publicly-visible members` measured from the ROOT's own id, and nothing
      // ever has `thread_id == member.id`, so a MEMBER ALWAYS REPORTS 1. `b` carries 1 here, and
      // that is a load-bearing fixture value: with 2 it would sprout a "Thread · 2 links" badge on a
      // row that the backend could never describe that way.
      .mockResolvedValue(
        connectionOf(
          [
            makeLink("a", "LIVE", true, { isThreadRoot: true, threadSize: 2 }),
            makeLink("b", "LIVE", true, { threadId: "a", isThreadRoot: false, threadSize: 1 }),
          ],
          false,
          null,
        ),
      );

    tickRow(fixture, "a");
    tickRow(fixture, "b");
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");

    button(fixture, "group-selected").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    // Reload = the same query again from page one (`after: null`), because threadId/threadSize
    // are server-computed and nothing on this page can patch them.
    expect(requestMock.mock.calls[2]).toEqual([
      PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
      { mine: true, first: 20, after: null },
      { "firebase-auth-key": "token" },
    ]);
    expect(textOf(fixture, "thread-selection-count")).toContain("0 selected");
    // The ROOT carries the group size and so is the only row that shows the badge…
    expect(textOf(fixture, "thread-badge-a")).toContain("2 links");
    // …and the member, which the backend always reports as `threadSize: 1`, must not grow one.
    expect(fixture.nativeElement.querySelector("[data-testid='thread-badge-b']")).toBeNull();
  });

  it("toasts and leaves the list and the ticks untouched when the group is rejected", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);
    requestMock.mockRejectedValueOnce(
      new GraphQLRequestError([{ message: "You can only group links you submitted." }]),
    );

    tickRow(fixture, "a");
    tickRow(fixture, "b");
    button(fixture, "group-selected").click();
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(toastError).toHaveBeenCalledWith(
      "Couldn't group these links",
      "You can only group links you submitted.",
    );
    // All-or-nothing server-side: no reload (call 2 was the mutation), and nothing is re-rendered.
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");
    expect(fixture.nativeElement.textContent).toContain("Link a");
    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  it("ungroups a single member row with linkIds only", async () => {
    const root = makeLink("r", "LIVE", true, { isThreadRoot: true, threadSize: 3 });
    // A member always reports `threadSize: 1` — the count is `1 + members of ITS OWN id`, and a
    // member has none. Only the root can advertise a group size.
    const member = makeLink("m", "LIVE", true, {
      threadId: "r",
      isThreadRoot: false,
      threadSize: 1,
    });
    await renderList(fixture, requestMock, [root, member]);
    requestMock
      .mockResolvedValueOnce({ ungroupSocialMediaLinks: { ok: true } })
      .mockResolvedValue(connectionOf([root, member], false, null));

    button(fixture, "ungroup-m").click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[1];
    expect(query).toBe(UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION);
    expect(vars).toEqual({ linkIds: ["m"] });
    expect(Object.prototype.hasOwnProperty.call(vars, "threadId")).toBe(false);
    expect(headers).toEqual({ "firebase-auth-key": "token" });

    // A ROOT gets no Ungroup: ungrouping a root is inert by design (its members stay
    // attached), so the button must not promise a cascade that never happens.
    expect(fixture.nativeElement.querySelector("[data-testid='ungroup-r']")).toBeNull();
    // …and the member's row is the mirror image: Ungroup yes, size badge no.
    expect(fixture.nativeElement.querySelector("[data-testid='thread-badge-r']")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("[data-testid='thread-badge-m']")).toBeNull();
  });

  it("marks a threaded root with the shared N-links indicator and leaves a member unmarked", async () => {
    await renderList(fixture, requestMock, [
      makeLink("t", "LIVE", true, { isThreadRoot: true, threadSize: 3 }),
      // The backend's real answer for a member of a 3-link thread: 1. With 3 here the spec would
      // be asserting a state the server cannot produce, and the badge assertion below would be
      // testing the fixture instead of the component.
      makeLink("m", "LIVE", true, { threadId: "t", isThreadRoot: false, threadSize: 1 }),
      // `threadSize: 1` with no `threadId` is an ordinary unthreaded link (a degenerate
      // one-member thread): threadLabel() returns "" so no chip — and no "1 links" bug.
      makeLink("s", "LIVE", true, { threadSize: 1 }),
    ]);

    expect(textOf(fixture, "thread-badge-t")).toContain("3 links");
    // A MEMBER is also `threadSize: 1`, so it gets the Ungroup action and nothing else — the badge
    // belongs to the root alone, which is why the console does the same.
    expect(fixture.nativeElement.querySelector("[data-testid='thread-badge-m']")).toBeNull();
    expect(fixture.nativeElement.querySelector("[data-testid='ungroup-m']")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("[data-testid='thread-badge-s']")).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain("1 links");
  });

  it("ticks and clears every rendered row via Select all", async () => {
    await renderList(fixture, requestMock, [
      makeLink("a", "LIVE", true),
      makeLink("b", "LIVE", true),
    ]);

    const selectAll = fixture.nativeElement.querySelector(
      "[data-testid='select-all'] button[role='checkbox']",
    );
    selectAll.click();
    fixture.detectChanges();
    expect(textOf(fixture, "thread-selection-count")).toContain("2 selected");
    expect(button(fixture, "group-selected").disabled).toBe(false);

    selectAll.click();
    fixture.detectChanges();
    expect(textOf(fixture, "thread-selection-count")).toContain("0 selected");
    expect(button(fixture, "group-selected").disabled).toBe(true);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("explains the capability next to the action", async () => {
    await renderList(fixture, requestMock, [makeLink("a", "LIVE", true)]);

    expect(textOf(fixture, "thread-hint")).toContain("two or more");
    expect(button(fixture, "group-selected").getAttribute("aria-describedby")).toBe(
      "my-links-thread-hint",
    );
  });
});
