import { type WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { SUBMIT_FEED_LINK_MUTATION, SubmitFeedLinkData, type FeedLink } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { LinkSubmitBoxComponent } from "./link-submit-box.component";

interface LinkSubmitModel {
  url: string;
}

interface ComponentUnderTest {
  model: WritableSignal<LinkSubmitModel>;
  isSubmitting: WritableSignal<boolean>;
  submit(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<LinkSubmitBoxComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

/** The submit payload's `link` — the shape a brand-new submission answers with. It is by
 *  definition a ROOT of its own conversation: `parentId` null, `isThreadRoot` true, and
 *  `sublinkCount` **0** (a descendant count, so a childless link has none — the old flat fixture's
 *  `threadSize: 1` meant "a conversation of one" and became `sublinkCount: 0` here). Nothing on
 *  this surface renders the payload, so the tree fields are here to keep the fixture a state the
 *  backend can actually produce. */
function makeLink(): FeedLink {
  return {
    id: "42",
    url: "https://example.com/story",
    normalizedUrl: "https://example.com/story",
    title: "Story",
    created: "2026-08-01T08:00:00",
    occurredAt: "2026-08-01T08:00:00",
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    sublinks: [],
    status: "LIVE",
    completed: false,
    isAutomated: false,
    voteScore: 1,
    userVote: 1,
    voteBreakdown: { upvotes: 1, downvotes: 0 },
    lines: [],
    user: { shortId: "abc12345", nickname: "" },
    // The three EDIT ROUND-TRIP relations. The payload's declared type is FeedLink and the
    // mutation mirrors the feed's selection, so a row without them is one the server never
    // returned — and it is the shape that would hand the edit sheet an empty tag selection.
    vehicles: [],
    stations: [],
    categories: [],
  };
}

function submitResponse(
  overrides: Partial<SubmitFeedLinkData["submitFeedLink"]> = {},
): SubmitFeedLinkData {
  return {
    submitFeedLink: {
      ok: true,
      isDuplicate: false,
      duplicateOfId: null,
      userVote: 0,
      link: makeLink(),
      ...overrides,
    },
  };
}

describe("LinkSubmitBoxComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let idTokenMock: ReturnType<typeof vi.fn>;
  let toastMocks: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let storeMock: {
    setUserVote: ReturnType<typeof vi.fn>;
    reloadAll: ReturnType<typeof vi.fn>;
  };
  let openSheetMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: WritableSignal<boolean>;
  let loginMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<LinkSubmitBoxComponent>;

  beforeEach(async () => {
    requestMock = vi.fn();
    idTokenMock = vi.fn(async () => "token" as string | null);
    toastMocks = { success: vi.fn(), error: vi.fn() };
    storeMock = { setUserVote: vi.fn(), reloadAll: vi.fn() };
    openSheetMock = vi.fn();
    isLoggedIn = signal(true);
    loginMock = vi.fn();

    await TestBed.configureTestingModule({
      imports: [LinkSubmitBoxComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { isLoggedIn, login: loginMock, idToken: idTokenMock },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toastMocks },
        { provide: HomeStore, useValue: storeMock },
        { provide: LinkSheetService, useValue: { open: openSheetMock } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LinkSubmitBoxComponent);
  });

  it("shows a clickable 'Log in to submit links' prompt for logged-out users", async () => {
    isLoggedIn.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Log in to submit links");
    expect(fixture.nativeElement.querySelector("input")).toBeNull();

    const cta = fixture.nativeElement.querySelector('[data-testid="login-to-submit"]');
    expect(cta).not.toBeNull();
    cta.click();

    expect(loginMock).toHaveBeenCalledTimes(1);
  });

  it("renders only the url field plus the submit and advanced buttons when logged in", async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const urlInput = fixture.nativeElement.querySelector('input[type="text"]');
    expect(urlInput).not.toBeNull();
    expect(urlInput.getAttribute("inputmode")).toBe("url");

    expect(fixture.nativeElement.querySelector("select")).toBeNull();
    expect(fixture.nativeElement.querySelector("app-asset-multi-select")).toBeNull();

    expect(fixture.nativeElement.querySelector('button[type="submit"]').textContent).toContain(
      "Submit Link",
    );
    expect(fixture.nativeElement.querySelector('[data-testid="advanced-input"]')).not.toBeNull();
  });

  it("submits only the url with the auth header, then resets and emits", async () => {
    requestMock.mockResolvedValue(submitResponse());
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });
    let submittedCount = 0;
    fixture.componentInstance.submitted.subscribe(() => submittedCount++);

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars, headers] = requestMock.mock.calls[0];
    expect(mutation).toBe(SUBMIT_FEED_LINK_MUTATION);
    expect(vars.input).toEqual({ url: "https://example.com/story" });
    expect(headers).toEqual({ "firebase-auth-key": "token" });
    expect(toastMocks.success).toHaveBeenCalledTimes(1);
    expect(submittedCount).toBe(1);
    expect(component.model()).toEqual({ url: "" });
  });

  it("omits the auth header when there is no token", async () => {
    idTokenMock.mockResolvedValue(null);
    requestMock.mockResolvedValue(submitResponse());
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });

    await component.submit();

    const [, , headers] = requestMock.mock.calls[0];
    expect(headers).toEqual({});
  });

  it("submits when Enter is pressed in the url field", async () => {
    requestMock.mockResolvedValue(submitResponse());
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[type="text"]');
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
  });

  it("renders the duplicate indicator and records the upvote for a duplicate", async () => {
    requestMock.mockResolvedValue(
      submitResponse({ isDuplicate: true, duplicateOfId: 42, userVote: 1 }),
    );
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });

    await component.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "Already submitted — your upvote was added",
    );
    expect(storeMock.setUserVote).toHaveBeenCalledWith("42", 1);
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("normalizes a schemeless url to https before sending", async () => {
    requestMock.mockResolvedValue(submitResponse());
    const component = asTestable(fixture);
    component.model.set({ url: "example.com/story" });

    await component.submit();

    const [, vars] = requestMock.mock.calls[0];
    expect(vars.input.url).toBe("https://example.com/story");
  });

  it("shows an inline error and does not emit when the mutation is rejected", async () => {
    const message = "That URL is not allowed";
    requestMock.mockRejectedValueOnce(new GraphQLRequestError([{ message }]));
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });
    let submittedCount = 0;
    fixture.componentInstance.submitted.subscribe(() => submittedCount++);
    fixture.detectChanges();

    await component.submit();
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-testid="feed-submit-error"]');
    expect(error).not.toBeNull();
    expect(error.textContent).toContain(message);
    expect(error.getAttribute("role")).toBe("alert");
    expect(submittedCount).toBe(0);
    expect(component.model()).toEqual({ url: "https://example.com/story" });
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("shows a generic inline error for a transport failure and still rethrows it", async () => {
    requestMock.mockRejectedValueOnce(new Error("Network down"));
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });
    let submittedCount = 0;
    fixture.componentInstance.submitted.subscribe(() => submittedCount++);

    await expect(component.submit()).rejects.toThrow("Network down");
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-testid="feed-submit-error"]');
    expect(error).not.toBeNull();
    expect(error.textContent).toContain("Couldn't submit the link. Please try again.");
    expect(submittedCount).toBe(0);
    expect(component.isSubmitting()).toBe(false);
  });

  it("clears the inline error on a subsequent successful submit", async () => {
    requestMock
      .mockRejectedValueOnce(new GraphQLRequestError([{ message: "Nope" }]))
      .mockResolvedValueOnce(submitResponse());
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });

    await component.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-submit-error"]')).not.toBeNull();

    await component.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="feed-submit-error"]')).toBeNull();
    expect(toastMocks.success).toHaveBeenCalledTimes(1);
  });

  it("opens the advanced sheet with the trimmed url typed so far", async () => {
    const component = asTestable(fixture);
    component.model.set({ url: "  example.com/story  " });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="advanced-input"]').click();

    expect(openSheetMock).toHaveBeenCalledTimes(1);
    expect(openSheetMock).toHaveBeenCalledWith(undefined, { url: "example.com/story" });
  });

  it("opens the advanced sheet with an undefined url when the field is empty", async () => {
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="advanced-input"]').click();

    expect(openSheetMock).toHaveBeenCalledTimes(1);
    expect(openSheetMock).toHaveBeenCalledWith(undefined, { url: undefined });
  });

  // Both entry points into submit() — the button and Enter — are covered by the reveal test below.
  // Blur alone must stay silent: FormField marks a field touched on blur, so an error keyed off
  // `touched()` would nag the user for merely tabbing through an empty box.
  it("does not show the required error when the field is blurred", async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('input[type="text"]');
    input.focus();
    input.blur();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain("Enter a URL");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("reveals the required error only after clicking Submit Link", async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('input[type="text"]');
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Enter a URL");
    // The action must not have run: an empty field never reaches the network.
    expect(requestMock).not.toHaveBeenCalled();

    input.value = "https://example.com/story";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain("Enter a URL");
  });
});
