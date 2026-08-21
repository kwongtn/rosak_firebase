import { type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { DOWNVOTE_MUTATION, REMOVE_VOTE_MUTATION, UPVOTE_MUTATION } from "../data/insiden.queries";
import { VoteButtonComponent } from "./vote-button.component";

interface ComponentUnderTest {
  state: WritableSignal<{ netScore: number; upvotes: number; downvotes: number; userVote: number }>;
  isVoting: WritableSignal<boolean>;
  onVoteClick(target: 1 | -1): Promise<void>;
}

function asTestable(fixture: ComponentFixture<VoteButtonComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

describe("VoteButtonComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let toastMocks: { error: ReturnType<typeof vi.fn> };
  let isLoggedIn: WritableSignal<boolean>;
  let fixture: ComponentFixture<VoteButtonComponent>;

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ upvote: { ok: true } });
    toastMocks = { error: vi.fn() };
    isLoggedIn = signal(true);

    await TestBed.configureTestingModule({
      imports: [VoteButtonComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { isLoggedIn, isAdmin: () => false, idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toastMocks },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VoteButtonComponent);
    fixture.componentRef.setInput("incidentId", "inc-7");
    fixture.componentRef.setInput("netScore", 5);
    fixture.componentRef.setInput("upvotes", 12);
    fixture.componentRef.setInput("downvotes", 7);
    fixture.componentRef.setInput("userVote", 0);
    await fixture.whenStable();
  });

  it("applies an optimistic upvote and sends the upvote mutation", async () => {
    const component = asTestable(fixture);

    await component.onVoteClick(1);

    expect(component.state().userVote).toBe(1);
    expect(component.state().upvotes).toBe(13);
    expect(component.state().netScore).toBe(6);
    const [mutation] = requestMock.mock.calls[0];
    expect(mutation).toBe(UPVOTE_MUTATION);
  });

  it("clicking the active upvote again removes the vote", async () => {
    const component = asTestable(fixture);
    await component.onVoteClick(1);
    requestMock.mockClear();

    await component.onVoteClick(1);

    expect(component.state().userVote).toBe(0);
    expect(component.state().upvotes).toBe(12);
    const [mutation] = requestMock.mock.calls[0];
    expect(mutation).toBe(REMOVE_VOTE_MUTATION);
  });

  it("switching up to down sends the downvote mutation with a net swing of -2", async () => {
    const component = asTestable(fixture);
    await component.onVoteClick(1);
    requestMock.mockClear();

    await component.onVoteClick(-1);

    expect(component.state().userVote).toBe(-1);
    expect(component.state().downvotes).toBe(8);
    expect(component.state().upvotes).toBe(12);
    expect(component.state().netScore).toBe(4);
    const [mutation] = requestMock.mock.calls[0];
    expect(mutation).toBe(DOWNVOTE_MUTATION);
  });

  it("rolls the display back and toasts when the mutation fails", async () => {
    const component = asTestable(fixture);
    requestMock.mockRejectedValueOnce(new Error("offline"));

    await component.onVoteClick(1);

    expect(component.state()).toEqual({
      netScore: 5,
      upvotes: 12,
      downvotes: 7,
      userVote: 0,
    });
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
    expect(component.isVoting()).toBe(false);
  });

  it("renders both vote buttons disabled for logged-out users", async () => {
    isLoggedIn.set(false);
    await fixture.whenStable();

    const buttons = fixture.nativeElement.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    for (const button of buttons) {
      // BrnButton applies disabled via [attr.disabled], not the DOM property.
      expect(button.getAttribute("disabled")).not.toBeNull();
    }
  });
});
