import { provideZonelessChangeDetection, signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/** The private bits the "timer cleared on destroy" assertion reads back. */
interface ComponentUnderTest {
  _showRefreshed: () => boolean;
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

    // In flight: still the countdown, nothing confirmed yet.
    store.isRefreshing.set(true);
    fixture.detectChanges();
    expect(confirmation()).toBeNull();

    // Settled with no error: the label is green…
    store.isRefreshing.set(false);
    fixture.detectChanges();
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
    expect(confirmation()).toBeNull();
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
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
    expect(confirmation()).toBeNull();
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
});
