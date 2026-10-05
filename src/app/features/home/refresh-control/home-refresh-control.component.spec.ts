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
  _refreshPending: () => boolean;
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

  /** The ONE fixed glyph slot every state renders its leading svg into (the tracker rows'
   * pattern — CountdownRingComponent / LayerChecklistComponent): always present, contents vary,
   * so the row never shifts between states. */
  function slot(): HTMLElement {
    const el = button().querySelector<HTMLElement>("span.inline-flex.size-7");
    if (!el) {
      throw new Error("glyph slot not rendered");
    }
    return el;
  }

  /** A full manual refresh, as the store would drive it: armed by the click, request in flight,
   * then settled. `withError` settles it against `hasError`. */
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
    // …and the countdown label sits OUTSIDE the slot, directly on the button after it.
    expect(slot().nextElementSibling?.textContent).toContain("Refreshing in 30s");

    // Updating: the SAME slot holds the spinner — still exactly one slot element.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(button().querySelectorAll("span.inline-flex.size-7").length).toBe(1);
    expect(slot().querySelector("svg")?.getAttribute("class")).toContain("size-3.5");
    expect(updatingLabel()?.parentElement).toBe(button());
    expect(slot().nextElementSibling).toBe(updatingLabel());

    // Confirmation: the green check takes the same slot again — the row never re-flowed.
    store.isRefreshing.set(false);
    fixture.detectChanges();
    await clickAndSettle();
    expect(button().querySelectorAll("span.inline-flex.size-7").length).toBe(1);
    const check = slot().querySelector("svg");
    expect(check?.getAttribute("class")).toContain("text-green-600");
    expect(slot().contains(check)).toBe(true);
    expect(confirmation()?.parentElement).toBe(button());
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

  it("confirms with a green check only after a click-armed refresh settles clean", async () => {
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

    // …and hides itself again after ~2s.
    vi.advanceTimersByTime(1999);
    fixture.detectChanges();
    expect(confirmation()).not.toBeNull();
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
  });

  it("confirms nothing when the armed refresh settles on an error", async () => {
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

  it("shows Updating while an automatic refresh is in flight, but confirms nothing", async () => {
    // The beat fires every 30s. Saying "Updating" while it works is honest — the reader can see the
    // page change under them — but the CONFIRMATION stays click-only: a passive reader must not be
    // told "just refreshed" on a timer they never set.
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

    // Settled: the label comes down and the countdown comes back. No confirmation ever.
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
    expect(confirmation()).toBeNull();
    expect(button().textContent?.replace(/\s+/g, " ")).toContain("Refreshing in 30s");

    // And still nothing 2s later, which is the window a confirmation would have occupied: asserted
    // after a long advance so a wrongly-shown one could not have hidden itself before this read.
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(store.polling.refreshNow).not.toHaveBeenCalled();
    expect(confirmation()).toBeNull();
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

    // Phase 3: every resource has fetched once; this `isRefreshing` is a REFRESH (the beat), and the
    // page is expected to say so.
    store.isLoadingLastWeek.set(false);
    fixture.detectChanges();
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    expect(confirmation()).toBeNull();

    // Phase 4: it settles like any other — label down, countdown back, still no confirmation.
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
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
    // The stale-arm expiry is the OTHER exit out of the armed window, so it has to take "Updating"
    // with it — this is the case that would otherwise be stuck on the label for the whole session.
    expect(updatingLabel()).toBeNull();
  });

  it("confirms once when the click lands while a request is already in flight", async () => {
    // The beat (or a second instance of this control) can already have a request up when the user
    // clicks. The arm must latch off the ALREADY-TRUE reading — not miss the edge and hang until
    // the expiry — so the one real settle still confirms.
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

    // Exactly one flash: a duplicated arm would leave a second timer to re-show it.
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
  });

  it("re-arms on a double click but still flashes exactly one confirmation", async () => {
    // Two clicks, two `refreshNow`s, ONE confirmation. Pins both halves of the re-arm: the second
    // click must not leave a second arm behind, and it must not leave a SECOND expiry timer whose
    // firing would expire the live arm out from under an in-flight request.
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
    // arm here and swallow the confirmation below.
    vi.advanceTimersByTime(5001);
    fixture.detectChanges();

    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(host().querySelectorAll('[data-testid="line-refresh-confirmation"]').length).toBe(1);
    // The double click armed twice but `_isUpdating` is ONE flag, so the settle clears it once and
    // there is no second "Updating" to linger behind the confirmation.
    expect(updatingLabel()).toBeNull();

    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();

    // And the settle consumed the arm, so a following AUTOMATIC cycle flashes nothing.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    store.isRefreshing.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(2);
    expect(confirmation()).toBeNull();
    expect(updatingLabel()).toBeNull();
  });

  it("expires a stale arm so a later automatic tick cannot confirm it", async () => {
    // The leak this pins: a click whose refresh never put a request on the wire (nothing to fetch,
    // a superseded beat) left the arm up FOREVER, and the next automatic 30s tick — which nobody
    // asked for — consumed it and popped a green "Updated".
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    button().click();
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);

    // Past ARM_EXPIRY_MS: the request never went in flight, so the arm is stale and now dropped.
    vi.advanceTimersByTime(5001);
    fixture.detectChanges();
    // …and the label goes with it, in the same write that drops the arm. The expiry is the only
    // other exit out of an armed window, so a teardown on the settle edge alone would leave this
    // case — the no-op click — frozen on "Updating" with nothing in flight at all.
    expect(updatingLabel()).toBeNull();

    // A LATER automatic beat cycles `isRefreshing`. With the arm still up, this would latch
    // `_refreshStarted`, consume the arm on the way down, and show a confirmation for a refresh
    // the reader never requested. Asserted BEFORE any timer advance: 2s of fake time would hide a
    // confirmation that wrongly appeared and make this assertion pass for the wrong reason.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();

    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
    expect(confirmation()).toBeNull();
  });

  it("confirms nothing when the error lands after the settle write, in the same flush", async () => {
    // The INVERSE of `clickAndSettle(true)`: here `isRefreshing` goes false FIRST and `hasError`
    // second, with the effect free to run only after both. Outcome must not depend on the write
    // order inside one flush — `hasError` is read at the settle edge, and the arm is consumed there
    // either way (so the follow-up below cannot resurrect it into a confirmation).
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
    // consumed the arm. That is the cost of the conservative rule, and it is deliberate.
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

    // The "Updating" spinner, at the tracker checklist's 1s speed and counter-clockwise — so "you
    // asked for this" can never be mistaken for "the beat is running", which is a draining ring
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
    const icon = button().querySelector("svg");
    const iconClass = icon?.getAttribute("class") ?? "";
    expect(iconClass).toContain("[animation:spin_1s_linear_infinite_reverse]");
    expect(iconClass).toContain("motion-reduce:[animation:none]");
    expect(icon?.getAttribute("style")).toBeNull();
    expect(iconClass).toContain("text-muted-foreground");
    expect(iconClass).not.toContain("text-green-600");

    // Settled clean: "Updating" hands straight over to "Updated" — never both, never the countdown.
    store.isRefreshing.set(false);
    fixture.detectChanges();
    expect(updatingLabel()).toBeNull();
    expect(confirmation()?.textContent?.trim()).toBe("Updated");
    expect(button().textContent?.replace(/\s+/g, " ")).not.toContain("Refreshing in");

    // …and the confirmation is still the ordinary 2s transient, after which the countdown resumes.
    vi.advanceTimersByTime(1999);
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
    expect(tooltip()?.textContent?.trim()).toBe("Click to Refresh Now");

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
    expect(tooltip()?.textContent?.trim()).toBe("Click to Refresh Now");

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
    expect(component._refreshPending()).toBe(true);

    fixture.destroy();
    vi.advanceTimersByTime(5001);

    // Still true: the timer was cleared, so the expiry never ran after teardown.
    expect(component._refreshPending()).toBe(true);
  });
});

/**
 * The same component against a REAL `HomeStore`, because the mocked-store specs above pin the arm
 * LOGIC but cannot pin the thing that actually decides the outcome: the ORDER in which a recovering
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

  it("confirms a click-armed refresh that recovers from a real resource error", async () => {
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

    // 2. Click #1 arms the confirmation and its refresh FAILS for real: every resource settles into
    //    `hasError`, so the settle edge must confirm nothing — while still taking "Updating" down,
    //    because that teardown sits in front of the `hasError` gate in the effect.
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

    // …and it is still an ordinary transient confirmation, not a stuck one.
    vi.advanceTimersByTime(2000);
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

    // …and it takes the row back once the beat's revalidation lands.
    flushAll("success");
    await settle();
    expect(updatingLabel()).toBeNull();
    expect(button().textContent).toContain("Refreshing in");
  });

  it("says Updating for the beat's own refresh, and never confirms it", async () => {
    // The two halves of the split, against the REAL store rather than a mock: the pristine first
    // load must stay on its countdown even though the store really is refreshing, and the BEAT's own
    // refresh must say "Updating" while it runs. The exclusion is decided by the store's real
    // pristine-first-fetch-only flags, so a mock agreeing by accident is not possible here.
    vi.useFakeTimers();

    fixture = TestBed.createComponent(HomeRefreshControlComponent);
    store = TestBed.inject(HomeStore);
    fixture.detectChanges();
    TestBed.tick();

    // 1. Mount: three first fetches on the wire, so `isRefreshing` is genuinely true — and the row
    //    must still be the countdown. A first paint is not a refresh.
    expect(store.isRefreshing()).toBe(true);
    expect(updatingLabel()).toBeNull();

    flushAll("success");
    await settle();
    expect(store.isRefreshing()).toBe(false);
    expect(updatingLabel()).toBeNull();

    // 2. The beat, with no click anywhere: `PollingSource` self-schedules from its constructor, so
    //    advancing past its 30s deadline fires the store's own reload callback — the real timer, not
    //    a stand-in for it.
    vi.advanceTimersByTime(30000);
    TestBed.tick();
    expect(store.isRefreshing()).toBe(true);
    expect(updatingLabel()?.textContent?.trim()).toBe("Updating");
    expect(confirmation()).toBeNull();

    // 3. It settles like any other refresh: the label comes down and the countdown comes back.
    flushAll("success");
    await settle();
    expect(store.isRefreshing()).toBe(false);
    expect(updatingLabel()).toBeNull();
    expect(button().textContent).toContain("Refreshing in");

    // …and nothing is left waiting to pop: the beat is not a click, so "Updated" stays click-only
    // and a 30s timer the reader never set gets no confirmation.
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();
  });
});
