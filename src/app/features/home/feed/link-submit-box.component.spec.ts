import { type WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  SUBMIT_FEED_LINK_MUTATION,
  SubmitFeedLinkData,
  type FeedLink,
  type LinePulse,
  type PassengerStatus,
} from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { LinkSubmitBoxComponent } from "./link-submit-box.component";

interface LinkSubmitModel {
  url: string;
}

interface ComponentUnderTest {
  model: WritableSignal<LinkSubmitModel>;
  selectedLineIds: WritableSignal<string[]>;
  selectedStatus: WritableSignal<PassengerStatus | null>;
  isSubmitting: WritableSignal<boolean>;
  submit(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<LinkSubmitBoxComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

function makeLink(): FeedLink {
  return {
    id: "42",
    url: "https://example.com/story",
    normalizedUrl: "https://example.com/story",
    title: "Story",
    created: "2026-08-01T08:00:00Z",
    voteScore: 1,
    userVote: 1,
    lines: [],
    user: { shortId: "abc12345", nickname: "" },
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

function makeLine(): LinePulse {
  return {
    id: "L1",
    code: "KJL",
    displayName: "Kajang Line",
    displayColor: "#008000",
    status: "ACTIVE",
    inServiceVehicleCount: 3,
    totalVehicleCount: 5,
    passengerStatus: null,
    passengerStatusMessage: null,
    statusReportCount: 0,
    pulseLinks: [],
  };
}

describe("LinkSubmitBoxComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let idTokenMock: ReturnType<typeof vi.fn>;
  let toastMocks: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let storeMock: {
    lines: WritableSignal<LinePulse[]>;
    setUserVote: ReturnType<typeof vi.fn>;
    reloadAll: ReturnType<typeof vi.fn>;
  };
  let isLoggedIn: WritableSignal<boolean>;
  let loginMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<LinkSubmitBoxComponent>;

  beforeEach(async () => {
    requestMock = vi.fn();
    idTokenMock = vi.fn(async () => "token" as string | null);
    toastMocks = { success: vi.fn(), error: vi.fn() };
    storeMock = {
      lines: signal<LinePulse[]>([makeLine()]),
      setUserVote: vi.fn(),
      reloadAll: vi.fn(),
    };
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LinkSubmitBoxComponent);
  });

  it("shows a clickable 'Log in to submit links' prompt for logged-out users", async () => {
    isLoggedIn.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Log in to submit links");
    expect(fixture.nativeElement.querySelector('input[type="url"]')).toBeNull();

    const cta = fixture.nativeElement.querySelector('[data-testid="login-to-submit"]');
    expect(cta).not.toBeNull();
    cta.click();

    expect(loginMock).toHaveBeenCalledTimes(1);
  });

  it("renders the url field, the status dropdown and the line multi-select when logged in", async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('input[type="url"]')).not.toBeNull();

    const select = fixture.nativeElement.querySelector("select");
    const labels: string[] = Array.from(select.options as HTMLOptionElement[]).map((option) =>
      option.textContent.trim(),
    );
    expect(labels[0]).toBe("Line status (optional)");
    expect(labels).toHaveLength(8);
    expect(labels).toContain("Extremely Crowded");
    expect(fixture.nativeElement.textContent).toContain("KJL — Kajang Line");
  });

  it("submits url, lines and status with the auth header, then resets and emits", async () => {
    requestMock.mockResolvedValue(submitResponse());
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });
    component.selectedLineIds.set(["L1"]);
    component.selectedStatus.set("DELAYED");
    let submittedCount = 0;
    fixture.componentInstance.submitted.subscribe(() => submittedCount++);

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars, headers] = requestMock.mock.calls[0];
    expect(mutation).toBe(SUBMIT_FEED_LINK_MUTATION);
    expect(vars.input).toEqual({
      url: "https://example.com/story",
      lineIds: ["L1"],
      status: "DELAYED",
    });
    expect(headers).toEqual({ "firebase-auth-key": "token" });
    expect(toastMocks.success).toHaveBeenCalledTimes(1);
    expect(submittedCount).toBe(1);
    expect(component.model()).toEqual({ url: "" });
    expect(component.selectedLineIds()).toEqual([]);
    expect(component.selectedStatus()).toBeNull();
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

    const input = fixture.nativeElement.querySelector('input[type="url"]');
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

  it("blocks submission with an inline message when a status has no line", async () => {
    const component = asTestable(fixture);
    component.model.set({ url: "https://example.com/story" });
    component.selectedStatus.set("CROWDED");

    await component.submit();
    fixture.detectChanges();

    expect(requestMock).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="status-line-error"]')).not.toBeNull();
  });
});
