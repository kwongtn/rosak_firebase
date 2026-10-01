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

interface StoreMock {
  polling: {
    intervalMs: WritableSignal<number | null>;
    secondsRemaining: WritableSignal<number>;
    refreshNow: ReturnType<typeof vi.fn>;
  };
  isRefreshing: WritableSignal<boolean>;
  hasError: WritableSignal<boolean>;
}

/** The private bits the destroy assertions read back. */
interface ComponentUnderTest {
  _showRefreshed: () => boolean;
  _refreshPending: () => boolean;
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

  it("confirms nothing for an automatic refresh — only a click arms it", async () => {
    // The beat fires every 30s; a passive reader must not get a "Updated" popup each time.
    stubMatchMedia(false);
    await render();
    vi.useFakeTimers();

    store.isRefreshing.set(true);
    fixture.detectChanges();
    store.isRefreshing.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(store.polling.refreshNow).not.toHaveBeenCalled();
    // Neither half of the click's vocabulary: a tick the reader never asked for shows no
    // "Updating" (it would claim their own action is running) and no "Updated" either.
    expect(updatingLabel()).toBeNull();
    expect(confirmation()).toBeNull();
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

    // The countdown's own spinner, spun SLOWLY (3s) and counter-clockwise — the same markup so the
    // row does not change shape between the states, a different tempo so "you asked for this" can
    // never be mistaken for "the beat is running". The countdown keeps its 1s.
    //
    // ⚠️ `reverse` must be asserted INSIDE the shorthand, not only as the Tailwind class: `animation`
    // is a shorthand that resets every animation sub-property, so an inline one silently restores
    // `animation-direction: normal` and beats `[animation-direction:reverse]`. Found by browser
    // verification (computed value was "3s normal spin" — the class was dead markup); jsdom cannot
    // see it, which is why the inline value itself is the assertion.
    const icon = button().querySelector("svg");
    expect(icon?.getAttribute("style")).toContain("3s");
    expect(icon?.getAttribute("style")).toContain("reverse");
    expect(icon?.getAttribute("class")).toContain("[animation-direction:reverse]");
    expect(icon?.getAttribute("class")).toContain("text-muted-foreground");
    expect(icon?.getAttribute("class")).not.toContain("text-green-600");

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

  it("shows and hides the tooltip on hover when the device has a pointer", async () => {
    stubMatchMedia(true);
    await render();

    button().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    expect(tooltip()?.textContent?.trim()).toBe("Click to Refresh Now");

    button().dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
    expect(tooltip()).toBeNull();

    // A hover-capable device must not toggle the tooltip on click — the tap path is for touch.
    button().click();
    fixture.detectChanges();
    expect(tooltip()).toBeNull();
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
});
