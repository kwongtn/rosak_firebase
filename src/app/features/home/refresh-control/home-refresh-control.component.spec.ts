import { provideZonelessChangeDetection, signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { HomeStore } from "../data/home.store";
import { HomeRefreshControlComponent } from "./home-refresh-control.component";

/**
 * The hover probe runs in `afterNextRender` and reads `window.matchMedia`, which jsdom either omits
 * or answers with `matches: false` — so each test states the capability it wants, BEFORE the first
 * render (same approach as `status-info-chip.component.spec.ts` / `info-popover.spec.ts`).
 */
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/**
 * The deferred tooltip close. Duplicated from the component on purpose (same as
 * `info-popover.spec.ts`): a spec that imported the constant could not catch the component drifting
 * off the app-wide 300ms hover default.
 */
const TOOLTIP_CLOSE_DELAY_MS = 300;

/** How long the "Updated" flash stays up. Duplicated for the same reason, and asserted to the
 * millisecond either side of the boundary: a window that had quietly grown to 2000ms would still
 * pass any "it goes away eventually" assertion. */
const REFRESHED_VISIBLE_MS = 500;

interface StoreMock {
  polling: {
    intervalMs: WritableSignal<number | null>;
    secondsRemaining: WritableSignal<number>;
    refreshNow: ReturnType<typeof vi.fn>;
  };
  isRefreshing: WritableSignal<boolean>;
  hasError: WritableSignal<boolean>;
  /** Pristine-first-fetch-only across lines + the Today feed; the initial-load exclusion ORs it
   * with `isLoadingLastWeek` (the third resource), which is why both are in the mock. */
  isLoading: WritableSignal<boolean>;
  isLoadingLastWeek: WritableSignal<boolean>;
}

/** The private/protected bits the destroy assertions read back. */
interface ComponentUnderTest {
  _showRefreshed: () => boolean;
  _isUpdating: () => boolean;
  _refreshTooltipOpen: () => boolean;
}

describe("HomeRefreshControlComponent", () => {
  let store: StoreMock;
  let fixture: ComponentFixture<HomeRefreshControlComponent>;

  beforeEach(async () => {
    store = {
      polling: {
        intervalMs: signal<number | null>(30000),
        secondsRemaining: signal(30),
        refreshNow: vi.fn(),
      },
      isRefreshing: signal(false),
      hasError: signal(false),
      isLoading: signal(false),
      isLoadingLastWeek: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [HomeRefreshControlComponent],
      providers: [provideZonelessChangeDetection(), { provide: HomeStore, useValue: store }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** `afterNextRender` fills the hover capability only after one full cycle: detect, settle,
   * detect — exactly like the info-popover spec. */
  async function render(): Promise<ComponentFixture<HomeRefreshControlComponent>> {
    fixture = TestBed.createComponent(HomeRefreshControlComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(): HTMLButtonElement {
    const el = host().querySelector<HTMLButtonElement>('[data-testid="line-refresh-countdown"]');
    if (!el) {
      throw new Error("refresh button not rendered");
    }
    return el;
  }

  function confirmation(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[data-testid="line-refresh-confirmation"]');
  }

  function updatingLabel(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[data-testid="line-refresh-updating"]');
  }

  function tooltip(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[data-testid="line-refresh-tooltip"]');
  }

  /** The ONE fixed glyph slot every state renders its svg into (the tracker rows' pattern —
   * CountdownRingComponent / LayerChecklistComponent): always present, contents vary, and it sits
   * AFTER the label so the circle stays pinned to the row's right edge. */
  function slot(): HTMLElement {
    const el = button().querySelector<HTMLElement>("span.inline-flex.size-7");
    if (!el) {
      throw new Error("glyph slot not rendered");
    }
    return el;
  }

  /** Whatever label the current state prints, or null when none is shown (a paused beat). */
  function visibleLabel(): HTMLElement | null {
    return slot().previousElementSibling as HTMLElement | null;
  }

  /** A full manual refresh, as the store would drive it: the click, a request in flight, then a
   * settle. `withError` settles it against `hasError`. */
  async function clickAndSettle(withError = false): Promise<void> {
    button().click();
    fixture.detectChanges();
    store.isRefreshing.set(true);
    fixture.detectChanges();
    store.hasError.set(withError);
    store.isRefreshing.set(false);
    fixture.detectChanges();
  }

  it("renders the countdown text from the store's polling beat", async () => {
    await render();

    const countdown = button();
    expect(countdown.textContent?.replace(/\s+/g, " ").trim()).toBe("Refreshing in 30s");
    expect(countdown.getAttribute("aria-label")).toBe("Refresh page data now");
    expect(confirmation()).toBeNull();

    store.polling.secondsRemaining.set(7);
    fixture.detectChanges();
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 7s");
  });

  // ── The countdown ring ────────────────────────────────────────────────────
  // A full turn of an r=9 circle, which is what stroke-dasharray is set to so the offset can be read
  // as "how much of the turn is left". Duplicated from the component on purpose: a spec that imported
  // the constant could not catch the constant being wrong.
  const CIRC = 56.55;

  // A quarter of that turn — the length of the spinner's own arc path (M20 11a9 9 0 0 0-9-9), the
  // same 2dp rounding. Duplicated for the same reason: the draw keyframes live in the global theme
  // (see styles.css), so a spec importing them could not catch them drifting off the geometry.
  const ARC_LEN = 14.14;

  function ring(): SVGElement | null {
    return host().querySelector('[data-testid="line-refresh-ring"]');
  }

  function ringArc(): SVGElement | null {
    return host().querySelector('[data-testid="line-refresh-ring-arc"]');
  }

  it("drains the countdown ring as the beat runs down, and refills it on a refresh", async () => {
    await render();

    const arc = ringArc();
    expect(ring()).not.toBeNull();
    expect(arc?.getAttribute("stroke-dasharray")).toBe(String(CIRC));

    // Freshly scheduled: the whole turn is drawn.
    expect(arc?.getAttribute("stroke-dashoffset")).toBe("0");

    store.polling.secondsRemaining.set(15);
    fixture.detectChanges();
    expect(ringArc()?.getAttribute("stroke-dashoffset")).toBe("28.28");

    // The edge a reader watches most: the beat resets, so the ring refills in the same render that
    // puts the text back to 30s. This is the case percentRemaining gets wrong — scheduleNext resets
    // secondsRemaining but leaves the published percentage describing the beat that just ended.
    store.polling.secondsRemaining.set(30);
    fixture.detectChanges();
    expect(ringArc()?.getAttribute("stroke-dashoffset")).toBe("0");

    store.polling.secondsRemaining.set(0);
    fixture.detectChanges();
    expect(ringArc()?.getAttribute("stroke-dashoffset")).toBe(String(CIRC));
  });

  it("clamps the ring when the countdown overshoots its own interval", async () => {
    await render();

    // A beat that fires late leaves secondsRemaining at 0 while the next schedule lands; the arc must
    // never invert (a negative offset would draw MORE than a full turn).
    store.polling.secondsRemaining.set(-2);
    fixture.detectChanges();
    expect(ringArc()?.getAttribute("stroke-dashoffset")).toBe(String(CIRC));
  });

  it("reads the ring and the countdown text off the same two store signals", async () => {
    // The hero's top status bar draws its fill from the same pair, so all three readings — bar, ring
    // and text — are one computation over secondsRemaining()/intervalMs() and cannot drift apart.
    await render();

    store.polling.secondsRemaining.set(15);
    fixture.detectChanges();
    expect(ringArc()?.getAttribute("stroke-dashoffset")).toBe("28.28");
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 15s");

    // The interval is the other half of the pair: the ring recomputes against it while the text
    // still names the seconds.
    store.polling.intervalMs.set(60000);
    fixture.detectChanges();
    expect(ringArc()?.getAttribute("stroke-dashoffset")).toBe("42.41");
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 15s");

    // Paused beat: neither reading survives, because neither signal does.
    store.polling.intervalMs.set(null);
    fixture.detectChanges();
    expect(ring()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).not.toContain("Refreshing in");
  });

  // The ring's transition is the ONLY motion on the countdown branch, and it is what
  // motion-reduce:transition-none removes. The arc must still move to its new length — a reader who
  // asked for less motion still needs to know how long is left.
  it("keeps the arc but drops its transition under reduced motion", async () => {
    await render();

    expect(ringArc()?.getAttribute("class")).toContain("motion-reduce:transition-none");
    // …and the "Updating" spinner, the one remaining animation on this control, opts out too. It
    // now lives inside the shared glyph slot, so the label's previousElementSibling would be the
    // SLOT — the svg itself is one level deeper.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    const spinner = slot().querySelector<SVGElement>("svg");
    expect(spinner?.getAttribute("class")).toContain("motion-reduce:[animation:none]");
    // An inline `animation` outranks any class, including that one — so it has to be gone, not just
    // accompanied by a reduced-motion override.
    expect(spinner?.style.animation).toBe("");
  });

  it("draws ONLY the bright line IN while the spin is ALREADY rotating, over a static faded backdrop", async () => {
    // A finished circle appearing in one frame reads as a hard cut into motion. The bright arc now
    // draws itself from nothing to its full length over 500ms — it carries its own stroke-dasharray
    // (ARC_LEN, the length of the arc path itself) and its own draw animation — and the spin runs
    // CONCURRENTLY with it: the shorthand carries NO delay, so the glyph is already rotating from the
    // first frame and the two animations share the whole 500ms window. A delay here made the entrance
    // read as two phases (a still circle that then starts moving) instead of one.
    //
    // The faded circle behind it is deliberately STATIC: no dasharray, no draw class, nothing to
    // switch off. It is the backdrop the line draws onto, so it is present from the first frame —
    // animating it too meant the glyph's own backdrop was still arriving 500ms after the state did.
    //
    // ⚠️ The draw animation is a GENERATED `animate-*` theme utility, not a component-scoped
    // arbitrary property: Angular's emulated encapsulation renames @keyframes declared in a
    // component's `styles`, so an arbitrary property naming the un-prefixed keyframes matched
    // NOTHING and the entrance silently never fired (found by browser verification; jsdom cannot
    // see it, which is why the class names themselves are the assertion).
    await render();

    store.isRefreshing.set(true);
    fixture.detectChanges();

    const spinner = slot().querySelector<SVGElement>("svg");
    // No delay slot in the shorthand at all: the spin duration is 2s per revolution (HALVED from 1s,
    // because at 1s the glyph read as a spinner rushing) and the direction still rides INSIDE it
    // (`reverse` must stay there — the shorthand resets every sub-property, so a separate
    // animation-direction would be dead markup). Asserting the whole shorthand is what catches a
    // delay creeping back in as a fourth token.
    const spinClass = spinner?.getAttribute("class") ?? "";
    expect(spinClass).toContain("[animation:spin_2s_linear_infinite_reverse]");
    expect(spinClass).not.toMatch(/\[animation:[^\]]*\b\d+m?s[^\]]*infinite/);

    // 🔴 The draw's start is 12 o'clock, which is GEOMETRY: both strokes live inside one group
    // rotated a quarter turn anticlockwise about the ring's centre. It cannot be a `-rotate-90`
    // class on the svg — the spin animation writes `transform` on the svg every frame and would
    // overwrite it — so the group transform is the only place this can live, and it composes with
    // the spin instead of fighting it.
    const group = spinner?.querySelector<SVGGElement>('g[transform="rotate(-90 11 11)"]');
    expect(group).not.toBeNull();
    expect(spinner?.getAttribute("class") ?? "").not.toMatch(/-rotate-90/);
    // Both strokes are inside it — the backdrop included, so the whole glyph's start point moves,
    // not just the line that draws in.
    expect(group?.children.length).toBe(2);

    const track = group?.querySelector<SVGElement>("circle");
    const arc = group?.querySelector<SVGElement>("path");
    // The backdrop is drawn in full from the start: no dasharray to animate and no animation class.
    expect(track?.getAttribute("stroke-opacity")).toBe("0.25");
    expect(track?.getAttribute("stroke-dasharray")).toBeNull();
    expect(track?.getAttribute("class")).toBeNull();
    // The line is the only stroke that animates in.
    expect(arc?.getAttribute("stroke-dasharray")).toBe(String(ARC_LEN));
    expect(arc?.getAttribute("class")).toContain("animate-spinner-draw-arc");

    // Reduced motion has to switch the line's draw AND the rotation off — and neither may smuggle
    // an inline animation that would outrank the opt-out. With both off the arc sits at the default
    // stroke-dashoffset: 0: the glyph is still fully drawn, and simply static.
    expect(arc?.getAttribute("class")).toContain("motion-reduce:animate-none");
    for (const el of [spinner, arc]) {
      const animated = el as SVGElement;
      expect(animated.getAttribute("class")).toContain("motion-reduce:");
      expect(animated.style.animation).toBe("");
      expect(animated.getAttribute("style")).toBeNull();
    }
  });

  it("sizes the ring to 22px inside ONE fixed size-7 glyph slot shared by every state", async () => {
    // The regression this pins: the restored ring carried no width/height at all, so its viewBox
    // rendered at the CSS initial size and the "ring" came out a 112px blob in the hero row. The
    // tracker side panel's ring is explicitly sized inside a fixed 28px slot — this pins both the
    // explicit size and the single shared slot, across all three states.
    stubMatchMedia(false);
    await render();

    // Exactly ONE slot element, carrying the tracker rows' fixed-slot classes.
    const slots = button().querySelectorAll("span.inline-flex.size-7.items-center.justify-center");
    expect(slots.length).toBe(1);
    expect(slot()).toBe(slots[0]);
    expect(slot().className.split(/\s+/)).toContain("shrink-0");

    // Countdown: the ring svg itself carries the explicit size…
    const ringEl = ring();
    expect(ringEl?.getAttribute("width")).toBe("22");
    expect(ringEl?.getAttribute("height")).toBe("22");
    expect(ringEl?.getAttribute("viewBox")).toBe("0 0 22 22");
    expect(slot().contains(ringEl)).toBe(true);
    // …and the countdown label sits OUTSIDE the slot, directly on the button before it.
    expect(visibleLabel()?.textContent).toContain("Refreshing in 30s");

    // Updating: the SAME slot holds the spinner — still exactly one slot element, and now the
    // ring's own 22-unit geometry (see the glyph-size test for the full comparison).
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(button().querySelectorAll("span.inline-flex.size-7").length).toBe(1);
    const spinner = slot().querySelector("svg");
    expect(spinner?.getAttribute("width")).toBe("22");
    expect(spinner?.getAttribute("height")).toBe("22");
    expect(spinner?.getAttribute("viewBox")).toBe("0 0 22 22");
    expect(updatingLabel()?.parentElement).toBe(button());
    expect(slot().previousElementSibling).toBe(updatingLabel());

    // Confirmation: the green check takes the same slot again — the row never re-flowed.
    store.isRefreshing.set(false);
    fixture.detectChanges();
    await clickAndSettle();
    expect(button().querySelectorAll("span.inline-flex.size-7").length).toBe(1);
    const check = slot().querySelector("svg");
    expect(check?.getAttribute("class")).toContain("text-green-600");
    expect(check?.getAttribute("width")).toBe("22");
    expect(slot().contains(check)).toBe(true);
    expect(confirmation()?.parentElement).toBe(button());
  });

  it("puts the glyph AFTER the label, so the circle never moves as the label's width changes", async () => {
    // The request this pins: with the slot LEADING, "Refreshing in 30s" → "Refreshing in 9s" moved
    // the circle sideways under the reader, because the button shrink-wraps to its content and the
    // row's right edge is the one fixed edge. The label first pins the glyph to that edge. jsdom
    // does no layout, so the DOM ORDER is the assertion — which is exactly what CSS `order`-free
    // flex resolves from.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    // Countdown: label, then slot. The countdown label is a direct child of the button, so
    // `previousElementSibling` is the DOM-order proof.
    expect(visibleLabel()?.textContent).toContain("Refreshing in 30s");
    expect(visibleLabel()?.parentElement).toBe(button());

    store.polling.secondsRemaining.set(9);
    fixture.detectChanges();
    expect(visibleLabel()?.textContent).toContain("Refreshing in 9s");
    expect(visibleLabel()?.nextElementSibling).toBe(slot());

    // The same order holds in the other two states — it is the template's, not one branch's.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(slot().previousElementSibling).toBe(updatingLabel());

    store.isRefreshing.set(false);
    fixture.detectChanges();
    await clickAndSettle();
    expect(slot().previousElementSibling).toBe(confirmation());
    expect(visibleLabel()?.textContent?.trim()).toBe("Updated");
  });

  it("draws every one of the three glyphs at the same 22px inside that one slot", async () => {
    // A 14px spinner and check beside the ring's 22px read as three different controls answering
    // the same button — the spinner is now rebuilt on the ring's own 22-unit geometry (r=9 at
    // cx/cy 11, stroke 2.5) and the check keeps its 24-unit viewBox but is scaled down to the same
    // box (an svg preserves its aspect ratio, so only the box changed). One width across all three
    // states is what makes the swap invisible.
    stubMatchMedia(false);
    await render();

    const glyph = (): SVGElement => {
      const el = slot().querySelector<SVGElement>("svg");
      if (!el) {
        throw new Error("no glyph in the slot");
      }
      return el;
    };

    const ringGlyph = glyph();
    expect(ringGlyph.getAttribute("data-testid")).toBe("line-refresh-ring");
    expect([ringGlyph.getAttribute("width"), ringGlyph.getAttribute("height")]).toEqual([
      "22",
      "22",
    ]);

    store.isRefreshing.set(true);
    fixture.detectChanges();
    const spinnerGlyph = glyph();
    expect([spinnerGlyph.getAttribute("width"), spinnerGlyph.getAttribute("height")]).toEqual([
      "22",
      "22",
    ]);
    // The ring's geometry, not a 24-unit icon: nothing may re-introduce a `size-*` class either,
    // since a CSS size outranks the width/height attributes and would silently shrink the glyph.
    expect(spinnerGlyph.getAttribute("viewBox")).toBe("0 0 22 22");
    expect(spinnerGlyph.getAttribute("class") ?? "").not.toMatch(/\bsize-/);
    expect(spinnerGlyph.querySelector("circle")?.getAttribute("cx")).toBe("11");
    expect(spinnerGlyph.querySelector("circle")?.getAttribute("r")).toBe("9");
    expect(spinnerGlyph.querySelector("circle")?.getAttribute("stroke-width")).toBe("2.5");

    store.isRefreshing.set(false);
    fixture.detectChanges();
    await clickAndSettle();
    const checkGlyph = glyph();
    // The check keeps the 24-unit viewBox every other icon in the app uses…
    expect(checkGlyph.getAttribute("viewBox")).toBe("0 0 24 24");
    // …at the ring's 22×22 box.
    expect([checkGlyph.getAttribute("width"), checkGlyph.getAttribute("height")]).toEqual([
      "22",
      "22",
    ]);
    expect(checkGlyph.getAttribute("class") ?? "").not.toMatch(/\bsize-/);
  });

  it("draws no ring while a refresh is in flight, and none when the beat is paused", async () => {
    await render();
    expect(ring()).not.toBeNull();

    // The one state a shrinking countdown cannot express (there is no fraction — a refresh is in
    // flight, not pending): the ring makes way for the spinner, not for a second ring.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(ring()).toBeNull();
    expect(updatingLabel()).not.toBeNull();

    store.isRefreshing.set(false);
    store.polling.intervalMs.set(null);
    fixture.detectChanges();
    expect(ring()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).not.toContain("Refreshing in");
  });

  it("refreshes the page through the store's polling beat on click", async () => {
    stubMatchMedia(false);
    await render();

    button().click();
    fixture.detectChanges();

    // One action drives both sections: the beat is the store's, not a lines-only reload.
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
  });

  it("confirms with a green check after a clean settle, for 500ms", async () => {
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);

    // In flight: the click's own request is out, so it reads "Updating" — and nothing is
    // confirmed yet.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    expect(confirmation()).toBeNull();

    // Settled with no error: the label is green…
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
    const shown = confirmation();
    expect(shown?.textContent?.trim()).toBe("Updated");
    expect(shown?.getAttribute("role")).toBe("status");
    expect(shown?.className).toContain("text-green-600");
    expect(shown?.className).toContain("dark:text-green-400");
    // …and so is the tick beside it (the only svg in the row while the confirmation is up).
    const icon = button().querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("text-green-600");
    expect(icon?.getAttribute("class")).toContain("dark:text-green-400");

    // …and hides itself again after 500ms — an acknowledgement flash, not a state. The old 2000ms
    // window meant the beat fired every 30s with a 2s "Updated" on screen one time in fifteen.
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS - 1);
    fixture.detectChanges();
    expect(confirmation()).not.toBeNull();
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
  });

  it("confirms nothing when a refresh settles on an error", async () => {
    // The regression this pins: the old page effect keyed on `isLoading` and ignored `hasError`
    // entirely, so a FAILED manual refresh could still flash a success "Updated".
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    await clickAndSettle(true);
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
    // The error settle confirmed nothing, but it must still have taken the label down — otherwise
    // the control would sit on "Updating" for good and the banner would be the only honest story.
    expect(confirmation()).toBeNull();
    expect(updatingLabel()).toBeNull();
  });

  it("confirms an automatic refresh too — it is the same clean settle a click gets", async () => {
    // The rule this pins, and the change from the old click-only arming: ANY refresh the page
    // visibly completes confirms, the 30s beat's included. A reader who watched the row change is
    // owed the same acknowledgement; what keeps that from becoming noise is the 500ms window, not
    // withholding the fact. The beat's own refresh still runs without `refreshNow` ever being
    // called — this is the store's, not the control's.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    expect(updatingLabel()?.getAttribute("role")).toBe("status");
    expect(confirmation()).toBeNull();
    // The countdown is displaced while the beat runs, for the same reason a click displaces it.
    expect(button().textContent?.replace(/\s+/g, " ")).not.toContain("Refreshing in");

    // Settled: the label comes down and the confirmation takes its place…
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
    expect(confirmation()?.textContent?.trim()).toBe("Updated");

    // …for the same 500ms as a click's, and then the countdown is back. Asserted on both sides of
    // the boundary, and the still-up read is the one that catches a shortened window.
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS - 1);
    fixture.detectChanges();
    expect(confirmation()).not.toBeNull();
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    expect(store.polling.refreshNow).not.toHaveBeenCalled();
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 30s");
  });

  it("keeps the countdown through the pristine initial load, then updates like any other refresh", async () => {
    // The one exclusion: the page's FIRST fetch is not a refresh, so the first paint stays on its
    // countdown. The store's loading flags are pristine-first-fetch-only, so they are true exactly
    // during that window and never again — and the exclusion has to cover ALL THREE resources, which
    // is why it is the OR of `isLoading` (lines + Today feed) and `isLoadingLastWeek`. Pinned phase by
    // phase: dropping the OR would show "Updating" on a last-week-only initial load.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    // Phase 1: lines + feed still on their first fetch.
    store.isLoading.set(true);
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 30s");

    // Phase 2: those two have settled but Last Week's own first fetch is still up — the store's
    // combined `isLoading` is already false here, so this is the half an OR-less check would miss.
    store.isLoading.set(false);
    store.isLoadingLastWeek.set(true);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();

    // Phase 4: every resource has fetched once; this `isRefreshing` is a REFRESH (the beat), and the
    // page is expected to say so.
    store.isLoadingLastWeek.set(false);
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    expect(confirmation()).toBeNull();

    // Phase 5: it settles like any other refresh — the label comes down and the confirmation takes
    // its place. Only the PRISTINE load is excluded from that; a first paint confirms nothing,
    // because data that was never on screen cannot have gone stale.
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
    expect(confirmation()?.textContent?.trim()).toBe("Updated");

    // …and the countdown is what comes back once the flash is over.
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 30s");
  });

  it("confirms nothing when a click armed it but no request ever went out", async () => {
    // A click whose refresh is a no-op must not flash "Updated" on the spot: the confirmation
    // requires having OBSERVED the request in flight, not just having asked for one.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");

    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
    expect(confirmation()).toBeNull();
    // The stale-label expiry is the OTHER exit out of a clicked window, so it has to take "Updating"
    // with it — this is the case that would otherwise be stuck on the label for the whole session.
    expect(updatingLabel()).toBeNull();
  });

  it("confirms once when the click lands while a request is already in flight", async () => {
    // The beat (or a second instance of this control) can already have a request up when the user
    // clicks. The click's own label has to outlive the edge it never sees — until the expiry, or
    // until the one real settle — so that settle still confirms.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    store.isRefreshing.set(true);
    fixture.detectChanges();

    button().click();
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
    // The click owns the label even though the request was already up before it: the reader asked
    // for a refresh, so the row says so.
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");

    store.isRefreshing.set(false);
    fixture.detectChanges();

    expect(host().querySelectorAll('[data-testid="line-refresh-confirmation"]').length).toBe(1);
    expect(confirmation()?.textContent?.trim()).toBe("Updated");
    expect(updatingLabel()).toBeNull();

    // Exactly one flash: a duplicated timer would leave a second one to re-show (or hide) it.
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
  });

  it("re-arms on a double click but still flashes exactly one confirmation", async () => {
    // Two clicks, two `refreshNow`s, ONE confirmation. Pins the re-arm: the second click must not
    // leave a SECOND expiry timer behind, whose firing would take "Updating" down under a request
    // that is still in flight.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();
    button().click();
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(2);

    store.isRefreshing.set(true);
    fixture.detectChanges();

    // Past ARM_EXPIRY_MS with the request live: a leaked timer from the FIRST click would clear the
    // label here, and the `_sawRefresh` guard is what stops it.
    vi.advanceTimersByTime(5001);
    fixture.detectChanges();

    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(host().querySelectorAll('[data-testid="line-refresh-confirmation"]').length).toBe(1);
    // The double click raised "Updating" twice but it is ONE flag, so the settle clears it once and
    // there is no second "Updating" to linger behind the confirmation.
    expect(updatingLabel()).toBeNull();

    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();

    // And the settle consumed the latch, so the NEXT cycle is one clean settle again — one
    // confirmation, not two stacked, and not a second "Updating" left behind.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(host().querySelectorAll('[data-testid="line-refresh-confirmation"]').length).toBe(1);
    expect(updatingLabel()).toBeNull();
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(2);
    expect(updatingLabel()).toBeNull();
  });

  it("expires a stale arm, and still lets the NEXT real refresh confirm its own settle", async () => {
    // The leak this pins: a click whose refresh never put a request on the wire (nothing to fetch,
    // a superseded beat) left "Updating" up for the rest of the session. The expiry is the only
    // exit for a label whose window has no refresh in it.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);

    // Past ARM_EXPIRY_MS: the request never went in flight, so the label is stale and now dropped.
    vi.advanceTimersByTime(5001);
    fixture.detectChanges();
    // …and the label goes with it, in the same write. The expiry is the only other exit out of a
    // clicked window, so a teardown on the settle edge alone would leave this case — the no-op
    // click — frozen on "Updating" with nothing in flight at all.
    expect(updatingLabel()).toBeNull();

    // The no-op click confirms nothing, and not merely because its own window closed: asserted
    // BEFORE any further timer advance, so a confirmation that wrongly appeared and hid itself
    // before this read could not make it pass for the right reason.
    expect(confirmation()).toBeNull();

    // A LATER automatic beat is a refresh in its own right, so it confirms ITS OWN clean settle —
    // the point of the latch being per-refresh rather than per-click. What the stale click must not
    // do is confirm for a refresh that never happened.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    expect(confirmation()).toBeNull();
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(host().querySelectorAll('[data-testid="line-refresh-confirmation"]').length).toBe(1);
    expect(confirmation()?.textContent?.trim()).toBe("Updated");

    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
  });

  it("confirms nothing when the error lands after the settle write, in the same flush", async () => {
    // The INVERSE of `clickAndSettle(true)`: here `isRefreshing` goes false FIRST and `hasError`
    // second, with the effect free to run only after both. Outcome must not depend on the write
    // order inside one flush — `hasError` is read at the settle edge, and the latch is consumed
    // there either way (so the follow-up below cannot resurrect it into a confirmation).
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();
    store.isRefreshing.set(true);
    fixture.detectChanges();

    store.isRefreshing.set(false);
    store.hasError.set(true);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    // Write order inside the flush must not change the label's teardown either: the settle edge
    // clears "Updating" before it looks at `hasError`, so an errored click reads as "it tried and
    // failed" rather than staying on "Updating" or claiming success.
    expect(updatingLabel()).toBeNull();

    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();

    // The error is gone and the page is healthy again, yet nothing is shown: the settle edge
    // consumed the latch. That is the cost of the conservative rule, and it is deliberate.
    store.hasError.set(false);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
  });

  it("shrink-wraps the trigger to its visible content instead of claiming the whole row", async () => {
    stubMatchMedia(true);
    await render();

    // The page gates both instances with a CSS-only `flex justify-end` div, and a flex item's width
    // is its CONTENT's — so the control shrink-wraps and the wrapper's `justify-end` is what parks
    // it at the right edge. The button must therefore NOT claim the row: the `w-full` that used to
    // sit here made the whole width tappable, an invisible hit area the reader had no reason to
    // aim at (its own `:host` is `inline-block` now, so a full-width button would only put the old
    // hit area back). jsdom does no layout, so the classes ARE the assertion.
    expect(button().className.split(/\s+/)).not.toContain("w-full");
    // The alignment the class above used to serve is the gate's job and still present in shape:
    // the row itself is still a flex line, just no longer stretched.
    expect(button().className.split(/\s+/)).toContain("flex");
    expect(button().className.split(/\s+/)).toContain("items-center");
  });

  it("reads as Updating while the clicked refresh is in flight, then Updated, then the countdown", async () => {
    // The whole click vocabulary, in order. The countdown cannot come first: `refreshNow()` has
    // just RESET the beat, so an in-flight click that showed "Refreshing in 30s" would be claiming
    // the page is idle while it is in fact working on the reader's request.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);

    store.isRefreshing.set(true);
    fixture.detectChanges();
    const updating = updatingLabel();
    expect(updating?.textContent?.trim()).toBe("Updating");
    expect(updating?.getAttribute("role")).toBe("status");
    expect(updating?.className).toContain("text-muted-foreground");
    expect(confirmation()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).not.toContain("Refreshing in");

    // The "Updating" spinner, counter-clockwise at 2s per revolution (half the tracker's 1s) — so
    // "you asked for this" can never be mistaken for "the beat is running", which is a draining ring
    // rather than a spin at all.
    //
    // ⚠️ `reverse` must stay INSIDE the shorthand: `animation` is a shorthand that resets every
    // animation sub-property, so a separate [animation-direction:reverse] would be silently reset to
    // `normal` by it. Found by browser verification (the class was dead markup); jsdom cannot see it,
    // which is why the shorthand ITSELF is the assertion.
    //
    // ⚠️ And it must be an arbitrary-property UTILITY, not an inline `style`: an inline `animation`
    // outranks every class in the cascade, including the `motion-reduce:[animation:none]` that
    // switches it off. Asserting the style attribute is empty is the assertion that the
    // reduced-motion opt-out can actually win.
    //
    // There is NO delay in the shorthand: the rotation runs WHILE the bright line draws itself in
    // (see the draw-in test above), so the spin reads as the line appearing rather than as a
    // completed circle that then starts moving.
    const icon = button().querySelector("svg");
    const iconClass = icon?.getAttribute("class") ?? "";
    expect(iconClass).toContain("[animation:spin_2s_linear_infinite_reverse]");
    expect(iconClass).toContain("motion-reduce:[animation:none]");
    // The 12-o'clock start is the group's transform, never a class on the spinning svg.
    expect(icon?.querySelector('g[transform="rotate(-90 11 11)"]')).not.toBeNull();
    expect(iconClass).not.toContain("-rotate-90");
    expect(icon?.getAttribute("style")).toBeNull();
    expect(iconClass).toContain("text-muted-foreground");
    expect(iconClass).not.toContain("text-green-600");

    // Settled clean: "Updating" hands straight over to "Updated" — never both, never the countdown.
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
    expect(confirmation()?.textContent?.trim()).toBe("Updated");
    expect(button().textContent?.replace(/\s+/g, " ")).not.toContain("Refreshing in");

    // …and the confirmation is a 500ms flash, after which the countdown resumes.
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS - 1);
    fixture.detectChanges();
    expect(confirmation()).not.toBeNull();
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    expect(updatingLabel()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 30s");
  });

  it("toggles the tooltip on a tap when the device has no hover", async () => {
    stubMatchMedia(false);
    await render();

    expect(tooltip()).toBeNull();

    button().click();
    fixture.detectChanges();
    expect(tooltip()?.textContent).toContain("Click to Refresh Now");

    button().click();
    fixture.detectChanges();
    expect(tooltip()).toBeNull();
  });

  it("shows the tooltip on hover and closes it 300ms after the pointer leaves", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    expect(tooltip()?.textContent).toContain("Click to Refresh Now");

    // Leaving does not close on the spot: a pointer merely crossing off the trigger (or back onto
    // it) must not blink the tooltip away. Same 300ms default InfoPopover and the nav use.
    button().dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
    expect(tooltip()).not.toBeNull();

    vi.advanceTimersByTime(TOOLTIP_CLOSE_DELAY_MS - 1);
    fixture.detectChanges();
    expect(tooltip()).not.toBeNull();

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(tooltip()).toBeNull();

    // A hover-capable device must not toggle the tooltip on click — the tap path is for touch.
    button().click();
    fixture.detectChanges();
    expect(tooltip()).toBeNull();
  });

  it("cancels the pending tooltip close when the pointer re-enters inside the grace window", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    button().dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(TOOLTIP_CLOSE_DELAY_MS / 2);
    fixture.detectChanges();
    expect(tooltip()).not.toBeNull();

    button().dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(TOOLTIP_CLOSE_DELAY_MS * 2);
    fixture.detectChanges();
    // Without the cancel, the superseded timer would have closed it at the original 300ms.
    expect(tooltip()).not.toBeNull();
  });

  it("stacks the tooltip above the page so nothing overlaps it", async () => {
    stubMatchMedia(true);
    await render();

    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();

    // The control lives in the hero's headline row, so its panel must clear the whole page layer.
    expect(tooltip()?.classList.contains("absolute")).toBe(true);
    expect(tooltip()?.classList.contains("z-50")).toBe(true);
  });

  it("reports how stale the page already is, and re-reads the age on every render", async () => {
    // The countdown says when the NEXT refresh is; it cannot say how old the numbers on screen are,
    // which is the question a reader hovers a freshness control to ask. Stamped on a clean settle and
    // rendered as an age — a `computed` would freeze the string at "just now" for as long as the
    // tooltip was open, and a timer behind it would be a second clock this control does not
    // otherwise need.
    //
    // Mounted mid-load on purpose: an idle store at mount is the MISSED-SETTLE case (the first fetch
    // finished before the control existed), and it stamps on its first run — see the next test.
    stubMatchMedia(true);
    store.isLoading.set(true);
    await render();
    vi.useFakeTimers();

    // A page whose first fetch has not finished has no honest answer yet, and an invented one
    // ("just now", or a 1970 date) is worse than the em dash.
    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    expect(tooltip()?.textContent).toContain("Last updated —");

    // The load starts and then settles clean: that settle is what stamps it…
    store.isRefreshing.set(true);
    fixture.detectChanges();
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(tooltip()?.textContent).toContain("Last updated just now");

    // …and five seconds later the age is five seconds, off the clock, not off the stamp. The pointer
    // leaving and coming back is what marks the view dirty again (there is no timer behind the
    // label), and that is the same render a real re-hover produces.
    vi.advanceTimersByTime(5000);
    button().dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(TOOLTIP_CLOSE_DELAY_MS);
    fixture.detectChanges();
    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    expect(tooltip()?.textContent).toContain("Last updated 5s ago");

    // The two tooltip lines coexist — the affordance is not replaced by the stamp.
    expect(tooltip()?.textContent).toContain("Click to Refresh Now");
  });

  it("stamps the tooltip when the first fetch settled before the control existed", async () => {
    // Live-QA regression: the pristine load frequently finishes BEFORE this control's effect first
    // runs (warm cache / local API / late hydration), so the pristine branch never sees it in
    // flight — and the tooltip sat on "Last updated —" until the first 30s beat, on a page whose
    // data was seconds old. The store mock starts IDLE, which is exactly that window.
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();

    expect(tooltip()?.textContent).toContain("Last updated just now");
    // …and it is a stamp, not a confirmation: no refresh ever ran, so there is nothing to confirm
    // and the countdown still owns the row.
    expect(store.polling.refreshNow).not.toHaveBeenCalled();
    expect(confirmation()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 30s");
  });

  it("clears the pending tooltip close on destroy", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    button().dispatchEvent(new MouseEvent("mouseleave"));

    fixture.destroy();
    vi.advanceTimersByTime(TOOLTIP_CLOSE_DELAY_MS);

    // Still true: the timer was cleared, so the pending close never ran against a destroyed view.
    const component = fixture.componentInstance as unknown as ComponentUnderTest;
    expect(component._refreshTooltipOpen()).toBe(true);
  });

  it("clears the confirmation timer on destroy", async () => {
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    await clickAndSettle();
    expect(confirmation()).not.toBeNull();

    const component = fixture.componentInstance as unknown as ComponentUnderTest;
    fixture.destroy();
    vi.advanceTimersByTime(5000);

    // Still true: the timer was cleared, so the pending hide never ran against a destroyed view.
    expect(component._showRefreshed()).toBe(true);
  });

  it("clears the arm-expiry timer on destroy", async () => {
    // Paired with the confirmation timer: the arm-expiry timer is also a live handle that must not
    // fire against a destroyed component.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as ComponentUnderTest;
    expect(component._isUpdating()).toBe(true);

    fixture.destroy();
    vi.advanceTimersByTime(5001);

    // Still true: the timer was cleared, so the expiry never ran after teardown.
    expect(component._isUpdating()).toBe(true);
  });
});

/**
 * The same component against a REAL `HomeStore`, because the mocked-store specs above pin the
 * settle-edge LOGIC but cannot pin the thing that actually decides the outcome: the ORDER in which a recovering
 * `graphqlResource` publishes `isFetching` → false and `hasError` → false. Both settle in ONE
 * flush, `hasError` is cleared by the resource's OWN effect (created in the store's constructor,
 * hence before this component's effect), and this component reads the already-clean state. Nothing
 * about that ordering is visible through a hand-driven mock — if the two effects ever swapped, every
 * confirmation would silently disappear with no failing test anywhere.
 */
describe("HomeRefreshControlComponent (real HomeStore ordering)", () => {
  const EMPTY_FEED = {
    publicSocialMediaLinks: {
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount: 0,
    },
  };

  let httpMock: HttpTestingController;
  let fixture: ComponentFixture<HomeRefreshControlComponent>;
  let store: HomeStore;

  beforeEach(async () => {
    stubMatchMedia(true);

    await TestBed.configureTestingModule({
      imports: [HomeRefreshControlComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        HomeStore,
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: signal(false),
            isAdmin: () => false,
            idToken: async () => "token",
            whenReady: Promise.resolve(),
          },
        },
        {
          provide: GraphQLClient,
          useValue: {
            request: vi.fn().mockResolvedValue(EMPTY_FEED),
          },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    httpMock.verify();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(): HTMLButtonElement {
    const el = host().querySelector<HTMLButtonElement>('[data-testid="line-refresh-countdown"]');
    if (!el) {
      throw new Error("refresh button not rendered");
    }
    return el;
  }

  function confirmation(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[data-testid="line-refresh-confirmation"]');
  }

  function updatingLabel(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[data-testid="line-refresh-updating"]');
  }

  /** Answers every request `HomeStore` has on the wire — one per resource, on every refresh. */
  function flushAll(outcome: "success" | "error"): void {
    const reqs = httpMock.match((r) => r.method === "POST");
    expect(reqs.length).toBe(3);
    for (const req of reqs) {
      if (outcome === "error") {
        req.flush({ message: "boom" }, { status: 500, statusText: "Server Error" });
      } else if (req.request.body.query.includes("FrontPageLines")) {
        req.flush({ data: { lines: [] } });
      } else {
        req.flush({ data: EMPTY_FEED });
      }
    }
  }

  /** The store spec's own flush cadence: let `httpResource` publish, run the effects, let the
   * effects' own signal writes settle. One `Promise.resolve()` is not enough — the resource's
   * effect flips `hasError` during the tick, and the component reads it on the next microtask. */
  async function settle(): Promise<void> {
    await Promise.resolve();
    TestBed.tick();
    fixture.detectChanges();
    await Promise.resolve();
    TestBed.tick();
    fixture.detectChanges();
  }

  async function clickAndSettleRequests(outcome: "success" | "error"): Promise<void> {
    button().click();
    fixture.detectChanges();
    TestBed.tick();
    flushAll(outcome);
    await settle();
  }

  it("confirms a refresh that recovers from a real resource error", async () => {
    vi.useFakeTimers();

    fixture = TestBed.createComponent(HomeRefreshControlComponent);
    store = TestBed.inject(HomeStore);
    fixture.detectChanges();
    TestBed.tick();

    // 1. Mount: the store's three resources fetch, and all three come back clean.
    flushAll("success");
    await settle();
    expect(store.hasError()).toBe(false);
    expect(store.isRefreshing()).toBe(false);
    expect(confirmation()).toBeNull();

    // 2. Click #1 and its refresh FAILS for real: every resource settles into `hasError`, so the
    //    settle edge must confirm nothing — while still taking "Updating" down, because that
    //    teardown sits in front of the `hasError` gate in the effect.
    await clickAndSettleRequests("error");
    expect(store.isRefreshing()).toBe(false);
    expect(store.hasError()).toBe(true);
    expect(confirmation()).toBeNull();
    expect(updatingLabel()).toBeNull();

    // 3. Click #2, and this time it SUCCEEDS. `isFetching` → false and `hasError` → false land in
    //    the same flush — the pin. A component that read `hasError` a microtask early would suppress
    //    the confirmation here and the user's successful retry would look like a failure.
    await clickAndSettleRequests("success");
    expect(store.isRefreshing()).toBe(false);
    expect(store.hasError()).toBe(false);
    expect(confirmation()?.textContent?.trim()).toBe("Updated");

    // …and it is still a transient flash, not a stuck one.
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
  });

  it("restores the countdown when a retained store is restarted after a stop", async () => {
    vi.useFakeTimers();

    fixture = TestBed.createComponent(HomeRefreshControlComponent);
    store = TestBed.inject(HomeStore);
    fixture.detectChanges();
    TestBed.tick();
    flushAll("success");
    await settle();
    expect(button().textContent).toContain("Refreshing in");

    // Leaving `/` runs HomePage.ngOnDestroy → stop(); the route injector retains the store, so
    // the countdown must come back when the recreated page calls start() again — not stay blank
    // for the rest of the session (the bug this pins).
    store.stop();
    fixture.detectChanges();
    expect(button().textContent?.trim()).toBe("");

    // Re-entry also revalidates the first pages through the same beat, so the row says "Updating"
    // while that runs — a re-entry is a REFRESH, not a first paint, and only the pristine initial
    // load is exempt. The countdown is back underneath it (that is what `start()` restored), it just
    // is not the branch on screen until the revalidation settles.
    store.start();
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");

    // …and it takes the row back once the beat's revalidation lands: a clean settle, so the 500ms
    // confirmation owns the row for that flash and the countdown is what returns behind it.
    flushAll("success");
    await settle();
    expect(store.isRefreshing()).toBe(false);
    expect(updatingLabel()).toBeNull();
    expect(confirmation()?.textContent?.trim()).toBe("Updated");
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    expect(button().textContent).toContain("Refreshing in");
  });

  it("says Updating for the beat's own refresh, and confirms its clean settle like any other", async () => {
    // The exclusion against the REAL store rather than a mock: the pristine first load must stay on
    // its countdown even though the store really is refreshing, and the BEAT's own refresh must say
    // "Updating" while it runs. The exclusion is decided by the store's real
    // pristine-first-fetch-only flags, so a mock agreeing by accident is not possible here — and the
    // settle afterwards is a plain clean settle, which confirms like one.
    vi.useFakeTimers();

    fixture = TestBed.createComponent(HomeRefreshControlComponent);
    store = TestBed.inject(HomeStore);
    fixture.detectChanges();
    TestBed.tick();

    // 1. Mount: three first fetches on the wire, so `isRefreshing` is genuinely true — and the row
    //    must still be the countdown. A first paint is not a refresh, and it confirms nothing.
    expect(store.isRefreshing()).toBe(true);
    expect(updatingLabel()).toBeNull();

    flushAll("success");
    await settle();
    expect(store.isRefreshing()).toBe(false);
    expect(updatingLabel()).toBeNull();
    expect(confirmation()).toBeNull();

    // 2. The beat, with no click anywhere: `PollingSource` self-schedules from its constructor, so
    //    advancing past its 30s deadline fires the store's own reload callback — the real timer, not
    //    a stand-in for it.
    vi.advanceTimersByTime(30000);
    TestBed.tick();
    expect(store.isRefreshing()).toBe(true);
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    expect(confirmation()).toBeNull();

    // 3. It settles like any other refresh: the label comes down, and the confirmation takes the row
    //    for its 500ms — nobody clicked, and a reader who watched the numbers change is still owed
    //    the acknowledgement.
    flushAll("success");
    await settle();
    expect(store.isRefreshing()).toBe(false);
    expect(updatingLabel()).toBeNull();
    expect(confirmation()?.textContent?.trim()).toBe("Updated");

    // …and it does not linger: the countdown is back, with nothing waiting to pop after it.
    vi.advanceTimersByTime(REFRESHED_VISIBLE_MS);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
    expect(button().textContent).toContain("Refreshing in");
  });
});
