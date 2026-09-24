import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { PASSENGER_INFO, passengerScale, type StatusInfo } from "../../home/data/status-info.util";
import { StatusInfoChipComponent, type StatusBreakdownRow } from "./status-info-chip.component";

/**
 * jsdom provides no `matchMedia` (same trap as compact-nav's ThemeService spec), so the chip's
 * `afterNextRender` capability probe is stubbed per test — before the first render, since that's
 * when the probe runs.
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

interface RenderOptions {
  info?: StatusInfo;
  scale?: ReturnType<typeof passengerScale>;
  message?: string | null;
  windowMinutes?: number | null;
  breakdown?: StatusBreakdownRow[];
  linkFragment?: string;
  showMethodologyLink?: boolean;
}

/** The shared grace window between the popover host's `mouseleave` and the panel closing. */
const HOVER_CLOSE_DELAY_MS = 1000;

describe("StatusInfoChipComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusInfoChipComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function render(
    options: RenderOptions = {},
  ): Promise<ComponentFixture<StatusInfoChipComponent>> {
    const fixture = TestBed.createComponent(StatusInfoChipComponent);
    fixture.componentRef.setInput("info", options.info ?? PASSENGER_INFO.CROWDED);
    if (options.scale) {
      fixture.componentRef.setInput("scale", options.scale);
    }
    if (options.message !== undefined) {
      fixture.componentRef.setInput("message", options.message);
    }
    if (options.windowMinutes !== undefined) {
      fixture.componentRef.setInput("windowMinutes", options.windowMinutes);
    }
    if (options.breakdown) {
      fixture.componentRef.setInput("breakdown", options.breakdown);
    }
    if (options.linkFragment !== undefined) {
      fixture.componentRef.setInput("linkFragment", options.linkFragment);
    }
    if (options.showMethodologyLink !== undefined) {
      fixture.componentRef.setInput("showMethodologyLink", options.showMethodologyLink);
    }
    // afterNextRender flips `_hoverCapable` only after one full cycle — detect, settle, detect.
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<StatusInfoChipComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function trigger(fixture: ComponentFixture<StatusInfoChipComponent>): HTMLButtonElement {
    return host(fixture).querySelector<HTMLButtonElement>("button") as HTMLButtonElement;
  }

  function popover(fixture: ComponentFixture<StatusInfoChipComponent>): HTMLElement | null {
    return host(fixture).querySelector<HTMLElement>('[data-testid="status-info-popover"]');
  }

  function textOf(fixture: ComponentFixture<StatusInfoChipComponent>, testId: string): string {
    const el = host(fixture).querySelector(`[data-testid="${testId}"]`);
    return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  /** Hover is tracked on the `app-info-popover` host, not on the trigger button. */
  function popoverHost(fixture: ComponentFixture<StatusInfoChipComponent>): HTMLElement {
    const el = host(fixture).querySelector<HTMLElement>("app-info-popover");
    if (!el) throw new Error("popover host not rendered");
    return el;
  }

  function hover(fixture: ComponentFixture<StatusInfoChipComponent>): void {
    popoverHost(fixture).dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
  }

  function leaveHost(fixture: ComponentFixture<StatusInfoChipComponent>): void {
    popoverHost(fixture).dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
  }

  it("stays hidden until the chip is hovered, focused or tapped", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    expect(popover(fixture)).toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows on hover and closes only after the pointer left the host for the grace window", async () => {
    stubMatchMedia(true);
    const fixture = await render();
    vi.useFakeTimers();

    hover(fixture);
    expect(popover(fixture)).not.toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("true");

    leaveHost(fixture);
    expect(popover(fixture)).not.toBeNull();

    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
    fixture.detectChanges();
    expect(popover(fixture)).toBeNull();
  });

  it("renders the projected badge as the trigger with no 'i' glyph", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    expect(trigger(fixture).querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("drops the methodology link and demotes the panel to a tooltip when asked to", async () => {
    stubMatchMedia(true);
    const fixture = await render({ showMethodologyLink: false });

    hover(fixture);

    expect(popover(fixture)).not.toBeNull();
    expect(popover(fixture)?.querySelector("a")).toBeNull();
    expect(popover(fixture)?.getAttribute("role")).toBe("tooltip");
  });

  it("opens from a click and never closes a hovered panel when the device is hover-capable", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    // The shared popover opens on click (keyboard activation after Escape) and never closes a
    // panel the pointer still hovers — a click can never toggle it shut.
    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).not.toBeNull();

    hover(fixture);
    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).not.toBeNull();
  });

  it("toggles on click when the device has no real hover", async () => {
    stubMatchMedia(false);
    const fixture = await render();

    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).not.toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("true");

    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows on focus and hides on blur", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    trigger(fixture).dispatchEvent(new FocusEvent("focus"));
    fixture.detectChanges();
    expect(popover(fixture)).not.toBeNull();

    trigger(fixture).dispatchEvent(new FocusEvent("blur"));
    fixture.detectChanges();
    expect(popover(fixture)).toBeNull();
  });

  it("renders the title and the universal metric explanation of the status", async () => {
    stubMatchMedia(true);
    const fixture = await render({ info: PASSENGER_INFO.DISRUPTED });

    hover(fixture);
    const text = (popover(fixture)?.textContent ?? "").replace(/\s+/g, " ").trim();

    expect(text).toContain("Disrupted");
    expect(text).toContain("Service suspended — use an alternative route.");
  });

  it("renders the status definition from the methodology registry", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    hover(fixture);

    const definition = popover(fixture)?.querySelectorAll("p")[1];
    expect(definition?.textContent?.trim()).toBe(
      renderMethodologyCopy(metricDoc("passenger.crowded").definition),
    );
  });

  it("deep-links to the methodology section named by linkFragment", async () => {
    stubMatchMedia(true);
    const fixture = await render({ linkFragment: "sightings" });

    hover(fixture);

    const link = popover(fixture)?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/methodology#sightings");
  });

  it("renders the consolidated message inside the popover when one is provided", async () => {
    stubMatchMedia(true);
    const fixture = await render({
      message: "According to 5 social media entries, this line is Crowded.",
    });

    hover(fixture);

    expect(textOf(fixture, "status-info-message")).toBe(
      "According to 5 social media entries, this line is Crowded.",
    );
    expect(popover(fixture)?.textContent).toContain(PASSENGER_INFO.CROWDED.title);
  });

  it("renders no message element when there is no message", async () => {
    stubMatchMedia(true);
    const fixture = await render({ message: null });

    hover(fixture);

    expect(popover(fixture)).not.toBeNull();
    expect(host(fixture).querySelector('[data-testid="status-info-message"]')).toBeNull();
  });

  it("renders the rolling-window line only when a window is known", async () => {
    stubMatchMedia(true);
    const withWindow = await render({ windowMinutes: 15 });

    hover(withWindow);
    expect(textOf(withWindow, "status-window")).toBe("Last 15 minutes");

    const withoutWindow = await render();
    hover(withoutWindow);
    expect(host(withoutWindow).querySelector('[data-testid="status-window"]')).toBeNull();
  });

  it("renders an extra per-category breakdown under the explanation", async () => {
    stubMatchMedia(true);
    const fixture = await render({
      breakdown: [
        { key: "IN_SERVICE", label: "In service", value: "12" },
        { key: "NOT_SPOTTED", label: "Not spotted", value: "3" },
        { key: "TOTAL", label: "Total", value: "15" },
      ],
    });

    hover(fixture);
    const rows = [...host(fixture).querySelectorAll('[data-testid="status-breakdown-row"]')].map(
      (row) =>
        [...row.querySelectorAll("span")].map((span) => (span.textContent ?? "").trim()).join(" "),
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe("In service 12");
    expect(rows[2]).toBe("Total 15");
  });

  it("folds the per-status counts into the legend rows, with no pill cluster left", async () => {
    stubMatchMedia(true);
    const fixture = await render({
      info: PASSENGER_INFO.CROWDED,
      scale: passengerScale("CROWDED", [
        { status: "NORMAL", count: 3 },
        { status: "BUSY", count: 2 },
      ]),
    });

    hover(fixture);

    const rows = [...host(fixture).querySelectorAll('[data-testid="status-scale-entry"]')];
    expect(rows).toHaveLength(7);

    const countOf = (label: string): string =>
      rows
        .find((row) => row.textContent?.includes(label))
        ?.querySelector('[data-testid="status-scale-count"]')
        ?.textContent?.trim() ?? "";

    expect(countOf("Normal")).toBe("(3)");
    expect(countOf("Busy")).toBe("(2)");
    expect(countOf("Crowded")).toBe("");
    expect(host(fixture).querySelectorAll('[data-testid="status-count-pill"]')).toHaveLength(0);
  });

  it("renders no count spans when the legend carries no counts", async () => {
    stubMatchMedia(true);
    const fixture = await render({ scale: passengerScale("CROWDED") });

    hover(fixture);

    expect(popover(fixture)).not.toBeNull();
    expect(host(fixture).querySelectorAll('[data-testid="status-scale-entry"]')).toHaveLength(7);
    expect(host(fixture).querySelectorAll('[data-testid="status-scale-count"]')).toHaveLength(0);
    expect(host(fixture).querySelectorAll('[data-testid="status-count-pill"]')).toHaveLength(0);
  });

  it("renders the 7-level legend with only the active level emphasised", async () => {
    stubMatchMedia(true);
    const fixture = await render({
      info: PASSENGER_INFO.CROWDED,
      scale: passengerScale("CROWDED"),
    });

    hover(fixture);
    const rows = host(fixture).querySelectorAll('[data-testid="status-scale-entry"]');
    expect(rows).toHaveLength(7);

    const active = host(fixture).querySelectorAll(
      '[data-testid="status-scale-entry"][data-active="true"]',
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent?.trim()).toBe("Crowded");
  });
});
