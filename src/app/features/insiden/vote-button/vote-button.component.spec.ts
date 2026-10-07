import { type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION,
  REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION,
  UPVOTE_SOCIAL_MEDIA_LINK_MUTATION,
} from "../../home/data/home-feed-mutations.queries";
import { DOWNVOTE_MUTATION, REMOVE_VOTE_MUTATION, UPVOTE_MUTATION } from "../data/insiden.queries";
import {
  DOWNVOTE_CHRONOLOGY_MUTATION,
  REMOVE_CHRONOLOGY_VOTE_MUTATION,
  UPVOTE_CHRONOLOGY_MUTATION,
} from "../data/insiden.queries";
import { VoteButtonComponent } from "./vote-button.component";

interface ComponentUnderTest {
  state: () => { netScore: number; upvotes: number; downvotes: number; userVote: number };
  isVoting: WritableSignal<boolean>;
  onVoteClick(target: 1 | -1): Promise<void>;
}

function asTestable(fixture: ComponentFixture<VoteButtonComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

/** A `VoteMutationPayload` as the server would send it after the write. */
function ack(userVote: number, voteScore: number, upvotes: number, downvotes: number) {
  return { ok: true, userVote, voteScore, upvotes, downvotes };
}

describe("VoteButtonComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let toastMocks: { error: ReturnType<typeof vi.fn> };
  let isLoggedIn: WritableSignal<boolean>;
  let fixture: ComponentFixture<VoteButtonComponent>;

  beforeEach(async () => {
    // 🔴 REAL payloads, not `{ ok: true }`: the control repaints from the acknowledgement, so a
    // stub without the numbers would make every assertion below read the fallback instead. Every
    // root field is answered, because the acknowledgement arrives under the mutation's own name —
    // so each test exercises the true server path whichever of the three targets it clicks.
    // The counters echo the optimistic projection (12/7, then ±1) so the pre-existing tests keep
    // meaning "the click landed", and the server-wins cases below override this.
    requestMock = vi.fn().mockResolvedValue({
      upvote: ack(1, 6, 13, 7),
      downvote: ack(-1, 4, 12, 8),
      removeVote: ack(0, 5, 12, 7),
      upvoteChronology: ack(1, 6, 13, 7),
      downvoteChronology: ack(-1, 4, 12, 8),
      removeChronologyVote: ack(0, 5, 12, 7),
      upvoteSocialMediaLink: ack(1, 6, 13, 7),
      downvoteSocialMediaLink: ack(-1, 4, 12, 8),
      removeSocialMediaLinkVote: ack(0, 5, 12, 7),
    });
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

  it("sends the upvoteChronology mutation with the chronology id when targetType is chronology", async () => {
    fixture.componentRef.setInput("targetType", "chronology");
    await fixture.whenStable();
    requestMock.mockClear();

    const component = asTestable(fixture);
    await component.onVoteClick(1);

    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(UPVOTE_CHRONOLOGY_MUTATION);
    expect(vars).toEqual({ chronologyId: "inc-7" });
    expect(component.state().userVote).toBe(1);
  });

  it("sends removeChronologyVote when unvoting a previously-upvoted chronology", async () => {
    fixture.componentRef.setInput("targetType", "chronology");
    await fixture.whenStable();
    await asTestable(fixture).onVoteClick(1);
    requestMock.mockClear();

    await asTestable(fixture).onVoteClick(1);

    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(REMOVE_CHRONOLOGY_VOTE_MUTATION);
    expect(vars).toEqual({ chronologyId: "inc-7" });
  });

  it("sends downvoteChronology when switching a chronology vote down", async () => {
    fixture.componentRef.setInput("targetType", "chronology");
    await fixture.whenStable();
    await asTestable(fixture).onVoteClick(1);
    requestMock.mockClear();

    await asTestable(fixture).onVoteClick(-1);

    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(DOWNVOTE_CHRONOLOGY_MUTATION);
    expect(vars).toEqual({ chronologyId: "inc-7" });
  });

  it("sends upvoteSocialMediaLink with the link id when targetType is link", async () => {
    fixture.componentRef.setInput("targetType", "link");
    await fixture.whenStable();
    requestMock.mockClear();

    const component = asTestable(fixture);
    await component.onVoteClick(1);

    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(UPVOTE_SOCIAL_MEDIA_LINK_MUTATION);
    expect(vars).toEqual({ id: "inc-7" });
    expect(component.state().userVote).toBe(1);
  });

  it("sends removeSocialMediaLinkVote when unvoting a previously-upvoted link", async () => {
    fixture.componentRef.setInput("targetType", "link");
    await fixture.whenStable();
    await asTestable(fixture).onVoteClick(1);
    requestMock.mockClear();

    await asTestable(fixture).onVoteClick(1);

    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION);
    expect(vars).toEqual({ id: "inc-7" });
  });

  it("sends downvoteSocialMediaLink when switching a link vote down", async () => {
    fixture.componentRef.setInput("targetType", "link");
    await fixture.whenStable();
    await asTestable(fixture).onVoteClick(1);
    requestMock.mockClear();

    await asTestable(fixture).onVoteClick(-1);

    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION);
    expect(vars).toEqual({ id: "inc-7" });
  });

  it("emits voteChanged with the new value after a successful vote", async () => {
    const component = asTestable(fixture);
    let emitted: { value: number } | null = null;
    fixture.componentInstance.voteChanged.subscribe((event) => (emitted = event));

    await component.onVoteClick(1);

    expect(emitted).toEqual({ value: 1 });
  });

  /* ---- the server's snapshot, not the client's arithmetic -------------------- */

  it("repaints from the acknowledged snapshot even when it disagrees with the projection", async () => {
    // Someone else voted in the same window, so the server's numbers are not the ones this
    // client projected. The server is the truth: showing the projection here would leave the
    // row permanently one vote behind until the next refetch.
    requestMock.mockResolvedValue({ upvote: ack(1, 11, 15, 4) });
    const component = asTestable(fixture);

    await component.onVoteClick(1);

    expect(component.state()).toEqual({ netScore: 11, upvotes: 15, downvotes: 4, userVote: 1 });
  });

  it("does NOT snap back when the host echoes the acknowledged vote back down", async () => {
    // 🔴 THE RACE THIS FIX EXISTS FOR. The host mirrors the value it was just told into its own
    // `userVote` overlay and re-renders this control. A display re-seeded from its inputs on any
    // change resets to the PRE-CLICK counters here (5 / 12 / 7) while the arrow stays lit — the
    // "indicator updates weirdly" symptom.
    const component = asTestable(fixture);
    await component.onVoteClick(1);

    fixture.componentRef.setInput("userVote", 1);
    await fixture.whenStable();

    expect(component.state()).toEqual({ netScore: 6, upvotes: 13, downvotes: 7, userVote: 1 });
  });

  it("lets a genuine refetch supersede the acknowledged state", async () => {
    // The home feed polls, so the host's counters DO move. They are then newer than the
    // acknowledgement this control holds, and must win — otherwise a vote would pin its
    // numbers forever and never notice anyone else's.
    const component = asTestable(fixture);
    await component.onVoteClick(1);

    fixture.componentRef.setInput("netScore", 9);
    fixture.componentRef.setInput("upvotes", 16);
    fixture.componentRef.setInput("userVote", 1);
    await fixture.whenStable();

    expect(component.state()).toEqual({ netScore: 9, upvotes: 16, downvotes: 7, userVote: 1 });
  });

  it("keeps the projection when the acknowledgement carries no numbers", async () => {
    // A cached or partially-shaped response must not paint `undefined` over a good projection.
    requestMock.mockResolvedValue({ upvote: { ok: true } });
    const component = asTestable(fixture);

    await component.onVoteClick(1);

    expect(component.state()).toEqual({ netScore: 6, upvotes: 13, downvotes: 7, userVote: 1 });
  });

  it("emits the value the SERVER acknowledged, not the one that was requested", async () => {
    // The host's overlay must land on the number already on screen, so the emitted value is the
    // acknowledged one — the requested one is only ever the optimistic guess.
    requestMock.mockResolvedValue({ upvote: ack(0, 5, 12, 7) });
    let emitted: { value: number } | null = null;
    fixture.componentInstance.voteChanged.subscribe((event) => (emitted = event));

    await asTestable(fixture).onVoteClick(1);

    expect(emitted).toEqual({ value: 0 });
  });

  it("does not emit voteChanged when the mutation fails", async () => {
    const component = asTestable(fixture);
    let emitted: { value: number } | null = null;
    fixture.componentInstance.voteChanged.subscribe((event) => (emitted = event));
    requestMock.mockRejectedValueOnce(new Error("offline"));

    await component.onVoteClick(1);

    expect(emitted).toBeNull();
  });
});
