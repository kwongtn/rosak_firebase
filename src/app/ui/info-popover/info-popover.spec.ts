import { Component, PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InfoPopover, type InfoPopoverLink } from "./info-popover";

/**
 * jsdom provides no `matchMedia` (same trap as the status-chip spec), so the popover's
 * `afterNextRender` capability probe is stubbed per test — before the first render, since that's
 * when the probe runs. An unstubbed environment therefore exercises the "no hover" default.
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

@Component({
  imports: [InfoPopover],
  template: `
    <app-info-popover
      [label]="label()"
      [content]="content()"
      [link]="link()"
      [align]="align()"
      [testId]="testId()"
      [showIcon]="showIcon()"
      [showMethodologyLink]="showMethodologyLink()"
      [iconPosition]="iconPosition()"
      [triggerClasses]="triggerClasses()"
    >
      <span data-testid="trigger-content">Reliability</span>
      <span popoverExtra data-testid="popover-extra">Updated hourly</span>
    </app-info-popover>
  `,
})
class InfoPopoverHost {
  readonly label = signal("Reliability");
  readonly content = signal("Share of scheduled trips that actually ran.");
  readonly link = signal<InfoPopoverLink | null>(null);
  readonly align = signal<"start" | "end" | "center">("start");
  readonly testId = signal("info-popover-panel");
  readonly showIcon = signal(true);
  readonly showMethodologyLink = signal(true);
  readonly iconPosition = signal<"start" | "end">("start");
  readonly triggerClasses = signal("");
}

/** Two independent popovers under one TestBed root injector — the exclusivity contract is about
 * two chips on the same page (same card or not), so the registry must be shared between them. */
@Component({
  imports: [InfoPopover],
  template: `
    <app-info-popover label="Reliability" content="First definition." testId="panel-a">
      <span>Reliability</span>
    </app-info-popover>
    <app-info-popover label="Punctuality" content="Second definition." testId="panel-b">
      <span>Punctuality</span>
    </app-info-popover>
  `,
})
class InfoPopoverPairHost {}

/** A trigger-template consumer: the popover stamps the CONSUMER'S button as its trigger. */
@Component({
  imports: [InfoPopover],
  template: `
    <app-info-popover
      label="Pin this line"
      content="Pin this line to keep it in My lines at the top of the board."
      [showIcon]="false"
      [showMethodologyLink]="false"
      [triggerTpl]="pinTpl"
      testId="bare-popover-panel"
    ></app-info-popover>
    <ng-template #pinTpl>
      <button type="button" data-testid="bare-trigger">Pin</button>
    </ng-template>
  `,
})
class InfoPopoverBareHost {}

/** The shared grace window between a host `mouseleave` and the panel closing. */
const HOVER_CLOSE_DELAY_MS = 300;

describe("InfoPopover", () => {
  let fixture: ComponentFixture<InfoPopoverHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfoPopoverHost],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** `afterNextRender` fills the panel id and the hover probe only after one full cycle —
   * detect, settle, detect, exactly like the status-chip spec. */
  async function render(): Promise<ComponentFixture<InfoPopoverHost>> {
    fixture = TestBed.createComponent(InfoPopoverHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function trigger(): HTMLButtonElement {
    const el = host().querySelector<HTMLButtonElement>("button");
    if (!el) throw new Error("trigger not rendered");
    return el;
  }

  function panel(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[data-testid="info-popover-panel"]');
  }

  /** Hover is tracked on the `app-info-popover` host, not on the trigger button, so entering
   * anywhere in the component (pill or panel) is what keeps it open. */
  function popoverHost(): HTMLElement {
    return host().querySelector<HTMLElement>("app-info-popover") ?? host();
  }

  function openByHover(): void {
    popoverHost().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
  }

  function leaveHost(): void {
    popoverHost().dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
  }

  function openByTap(): void {
    trigger().click();
    fixture.detectChanges();
  }

  it("is closed by default, behind a real button trigger", async () => {
    stubMatchMedia(true);
    await render();

    expect(trigger().tagName).toBe("BUTTON");
    expect(trigger().getAttribute("type")).toBe("button");
    expect(trigger().getAttribute("aria-label")).toBe("What is Reliability?");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(panel()).toBeNull();
  });

  it("opens on host hover and closes only after the pointer left the host for the grace window", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    openByHover();
    expect(panel()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(panel()?.textContent).toContain("Reliability");
    expect(panel()?.textContent).toContain("Share of scheduled trips that actually ran.");

    // Leaving the host does not close immediately: the pointer may be crossing the gap to the
    // panel, and the link inside it has to stay clickable for the whole window.
    leaveHost();
    expect(panel()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS - 1);
    fixture.detectChanges();
    expect(panel()).not.toBeNull();

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("cancels the pending close when the pointer re-enters the host within the grace window", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    openByHover();
    leaveHost();
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS / 2);
    fixture.detectChanges();

    openByHover();
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS * 2);
    fixture.detectChanges();

    expect(panel()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the panel open when the pointer moves off the trigger onto the panel", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    openByHover();
    // The panel is a DOM descendant of the host, so moving from the pill onto the panel fires the
    // trigger's own non-bubbling mouseleave but never the host's: no close is ever scheduled.
    trigger().dispatchEvent(new MouseEvent("mouseleave"));
    panel()?.dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();

    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS * 2);
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
  });

  it("stacks the panel above sibling pills so an overlapped pill cannot take the pointer", async () => {
    stubMatchMedia(true);
    await render();
    openByHover();

    expect(panel()?.classList.contains("absolute")).toBe(true);
    expect(panel()?.classList.contains("z-50")).toBe(true);
  });

  it("keeps only one panel open: opening a second popover closes the first", async () => {
    stubMatchMedia(true);
    const pairFixture = TestBed.createComponent(InfoPopoverPairHost);
    pairFixture.detectChanges();
    await pairFixture.whenStable();
    pairFixture.detectChanges();

    const root = pairFixture.nativeElement as HTMLElement;
    const popovers = Array.from(root.querySelectorAll<HTMLElement>("app-info-popover"));
    const first = popovers[0];
    const second = popovers[1];
    const firstTrigger = first?.querySelector("button");
    const secondTrigger = second?.querySelector("button");
    if (!first || !second || !firstTrigger || !secondTrigger) {
      throw new Error("popover pair not rendered");
    }

    first.dispatchEvent(new MouseEvent("mouseenter"));
    pairFixture.detectChanges();
    expect(first.querySelector('[data-testid="panel-a"]')).not.toBeNull();
    expect(firstTrigger.getAttribute("aria-expanded")).toBe("true");

    // Moving the cursor from pill A to pill B closes A at once — no grace window where both
    // panels are on screen — while B opens.
    second.dispatchEvent(new MouseEvent("mouseenter"));
    pairFixture.detectChanges();
    expect(second.querySelector('[data-testid="panel-b"]')).not.toBeNull();
    expect(secondTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(first.querySelector('[data-testid="panel-a"]')).toBeNull();
    expect(firstTrigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes immediately on Escape while a close is pending", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    openByHover();
    leaveHost();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes immediately on an outside click while a close is pending", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    openByHover();
    leaveHost();
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
  });

  it("wires aria-controls to the panel id generated after render", async () => {
    stubMatchMedia(true);
    await render();

    const controls = trigger().getAttribute("aria-controls");
    expect(controls).toBeTruthy();

    openByHover();
    expect(panel()?.id).toBe(controls);
  });

  it("opens on focus and closes on blur when the device is hover-capable", async () => {
    stubMatchMedia(true);
    await render();

    trigger().dispatchEvent(new FocusEvent("focus"));
    fixture.detectChanges();
    expect(panel()).not.toBeNull();

    trigger().dispatchEvent(new FocusEvent("blur"));
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it("keeps the panel open when focus moves into it", async () => {
    stubMatchMedia(true);
    await render();
    fixture.componentInstance.link.set({ text: "How this is counted", routerLink: "/methodology" });
    fixture.detectChanges();

    openByHover();
    const openPanel = panel();
    expect(openPanel).not.toBeNull();

    trigger().dispatchEvent(new FocusEvent("blur", { relatedTarget: openPanel }));
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    stubMatchMedia(true);
    await render();
    fixture.componentInstance.link.set({ text: "How this is counted", routerLink: "/methodology" });
    fixture.detectChanges();

    openByHover();
    const openPanel = panel();
    expect(openPanel).not.toBeNull();
    openPanel!.focus();
    expect(document.activeElement).toBe(openPanel);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on an outside click", async () => {
    stubMatchMedia(false);
    await render();
    openByTap();
    expect(panel()).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it("stays open when the click happens inside the panel", async () => {
    stubMatchMedia(false);
    await render();
    openByTap();
    const openPanel = panel();
    expect(openPanel).not.toBeNull();

    openPanel!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
  });

  it("toggles on tap when matchMedia reports no hover", async () => {
    stubMatchMedia(false);
    await render();

    openByTap();
    expect(panel()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    openByTap();
    expect(panel()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("treats a missing matchMedia as no hover and toggles on tap", async () => {
    // No stub at all: jsdom ships no `matchMedia`, which must fall back to the tap toggle.
    await render();

    openByTap();
    expect(panel()).not.toBeNull();

    openByTap();
    expect(panel()).toBeNull();
  });

  it("does not close on click while the pointer still hovers", async () => {
    stubMatchMedia(true);
    await render();

    openByHover();
    openByTap();
    expect(panel()).not.toBeNull();
  });

  it("renders the optional link with its routerLink and fragment", async () => {
    stubMatchMedia(false);
    await render();
    fixture.componentInstance.link.set({
      text: "How this is counted",
      routerLink: "/methodology",
      fragment: "reliability",
    });
    fixture.detectChanges();
    openByTap();

    const anchor = panel()?.querySelector("a");
    expect(anchor?.textContent?.trim()).toBe("How this is counted");
    expect(anchor?.getAttribute("href")).toBe("/methodology#reliability");
  });

  it("is a non-modal dialog when it carries a link, a tooltip when it does not", async () => {
    stubMatchMedia(false);
    await render();
    openByTap();

    expect(panel()?.getAttribute("role")).toBe("tooltip");
    expect(panel()?.getAttribute("tabindex")).toBeNull();

    fixture.componentInstance.link.set({ text: "How this is counted", routerLink: "/methodology" });
    fixture.detectChanges();

    expect(panel()?.getAttribute("role")).toBe("dialog");
    expect(panel()?.getAttribute("tabindex")).toBe("-1");
    expect(panel()?.getAttribute("aria-label")).toBe("Reliability");
    expect(panel()?.querySelector("a")?.textContent?.trim()).toBe("How this is counted");
  });

  it("renders no 'i' glyph when showIcon is false, leaving the projected content as the trigger", async () => {
    stubMatchMedia(false);
    await render();
    fixture.componentInstance.showIcon.set(false);
    fixture.detectChanges();

    expect(trigger().querySelector('span[aria-hidden="true"]')).toBeNull();
    expect(trigger().textContent?.trim()).toBe("Reliability");

    openByTap();
    expect(panel()).not.toBeNull();
  });

  it("leads the glyph by default and trails it with iconPosition end", async () => {
    stubMatchMedia(false);
    await render();

    const glyph = () => trigger().querySelector('span[aria-hidden="true"]');
    const content = () => trigger().querySelector('[data-testid="trigger-content"]');

    expect(glyph()).not.toBeNull();
    // The glyph keeps its badge styling whichever side of the projection it is bound on.
    expect(glyph()?.classList.contains("size-4")).toBe(true);
    expect(glyph()?.classList.contains("rounded-full")).toBe(true);
    // DOM order, not just painted order: the glyph is a sibling before the projected content.
    expect(glyph()!.compareDocumentPosition(content()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fixture.componentInstance.iconPosition.set("end");
    fixture.detectChanges();

    expect(glyph()).not.toBeNull();
    expect(content()!.compareDocumentPosition(glyph()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // Exactly one glyph either way — the placement swaps, it never duplicates.
    expect(trigger().querySelectorAll('span[aria-hidden="true"]').length).toBe(1);
  });

  it("merges triggerClasses onto the trigger button without dropping its base classes", async () => {
    stubMatchMedia(false);
    await render();

    expect(trigger().classList.contains("px-2")).toBe(false);

    fixture.componentInstance.triggerClasses.set("px-2 py-0.5 hover:bg-muted/60");
    fixture.detectChanges();

    expect(trigger().classList.contains("px-2")).toBe(true);
    expect(trigger().classList.contains("py-0.5")).toBe(true);
    expect(trigger().classList.contains("hover:bg-muted/60")).toBe(true);
    // The interaction contract survives the merge.
    expect(trigger().classList.contains("cursor-help")).toBe(true);
    expect(trigger().classList.contains("rounded-full")).toBe(true);
  });

  it("drops the link and demotes the panel to a tooltip when showMethodologyLink is false", async () => {
    stubMatchMedia(false);
    await render();
    fixture.componentInstance.link.set({ text: "How this is counted", routerLink: "/methodology" });
    fixture.componentInstance.showMethodologyLink.set(false);
    fixture.detectChanges();
    openByTap();

    expect(panel()?.querySelector("a")).toBeNull();
    expect(panel()?.getAttribute("role")).toBe("tooltip");
    expect(panel()?.getAttribute("tabindex")).toBeNull();
  });

  it("defaults to the start edge and flips to the right edge with align end", async () => {
    stubMatchMedia(false);
    await render();
    openByTap();

    expect(panel()?.classList.contains("left-0")).toBe(true);
    expect(panel()?.classList.contains("right-0")).toBe(false);

    fixture.componentInstance.align.set("end");
    fixture.detectChanges();

    expect(panel()?.classList.contains("right-0")).toBe(true);
    expect(panel()?.classList.contains("left-0")).toBe(false);
  });

  it("centers the panel on its trigger with align center, for a clipped ancestor", async () => {
    stubMatchMedia(false);
    await render();
    openByTap();

    fixture.componentInstance.align.set("center");
    fixture.detectChanges();

    expect(panel()?.classList.contains("left-1/2")).toBe(true);
    expect(panel()?.classList.contains("-translate-x-1/2")).toBe(true);
    expect(panel()?.classList.contains("left-0")).toBe(false);
    expect(panel()?.classList.contains("right-0")).toBe(false);
  });

  it("clamps the panel between the minimum width and the viewport width", async () => {
    stubMatchMedia(false);
    await render();
    openByTap();

    expect(panel()?.classList.contains("min-w-56")).toBe(true);
    expect(panel()?.classList.contains("max-w-[calc(100vw-2rem)]")).toBe(true);
  });

  it("uses the testId input as the panel test id", async () => {
    stubMatchMedia(false);
    await render();
    fixture.componentInstance.testId.set("custom-popover-panel");
    fixture.detectChanges();
    openByTap();

    expect(host().querySelector('[data-testid="custom-popover-panel"]')).not.toBeNull();
  });

  it("projects trigger content into the button and extras into the panel", async () => {
    stubMatchMedia(false);
    await render();

    expect(trigger().querySelector('[data-testid="trigger-content"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="popover-extra"]')).toBeNull();

    openByTap();
    expect(panel()?.querySelector('[data-testid="popover-extra"]')).not.toBeNull();
  });
});

describe("InfoPopover (bare trigger)", () => {
  let fixture: ComponentFixture<InfoPopoverBareHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfoPopoverBareHost],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function render(): Promise<ComponentFixture<InfoPopoverBareHost>> {
    fixture = TestBed.createComponent(InfoPopoverBareHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function control(): HTMLButtonElement {
    const el = host().querySelector<HTMLButtonElement>('[data-testid="bare-trigger"]');
    if (!el) throw new Error("bare trigger not rendered");
    return el;
  }

  function panel(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[data-testid="bare-popover-panel"]');
  }

  function popoverHost(): HTMLElement {
    return host().querySelector<HTMLElement>("app-info-popover") ?? host();
  }

  it("renders the projected control as the trigger, with no wrapping button", async () => {
    stubMatchMedia(false);
    await render();

    // The whole point: the projected button is not nested inside another button, and it is the
    // only button the popover owns.
    expect(control().closest("button")).toBe(control());
    expect(popoverHost().querySelectorAll("button").length).toBe(1);
    // No "i" glyph in bare mode — the glyphs live in the button branch.
    expect(control().querySelector('span[aria-hidden="true"]')).toBeNull();
    expect(panel()).toBeNull();
  });

  it("opens the panel on tap of the projected control, as a tooltip", async () => {
    stubMatchMedia(false);
    await render();

    control().click();
    fixture.detectChanges();

    expect(panel()).not.toBeNull();
    expect(panel()?.getAttribute("role")).toBe("tooltip");
    expect(panel()?.textContent).toContain("Pin this line");
    expect(panel()?.textContent).toContain(
      "Pin this line to keep it in My lines at the top of the board.",
    );

    control().click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it("closes on Escape without stealing focus, having no trigger button of its own", async () => {
    stubMatchMedia(true);
    await render();
    vi.useFakeTimers();

    popoverHost().dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    expect(panel()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
    // No `#trigger` in bare mode, so focus restoration is skipped: the consumer's control is left
    // where it was rather than being moved to a component-owned button that does not exist.
    expect(document.activeElement).not.toBe(control());
  });
});

describe("InfoPopover (server platform)", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfoPopoverHost],
      providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: "server" }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders closed without probing the browser", () => {
    const matchMedia = vi.fn();
    vi.stubGlobal("matchMedia", matchMedia);

    const fixture = TestBed.createComponent(InfoPopoverHost);
    expect(() => fixture.detectChanges()).not.toThrow();

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector("button");
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(button?.getAttribute("aria-controls")).toBeNull();
    expect(el.querySelector('[data-testid="info-popover-panel"]')).toBeNull();
    expect(matchMedia).not.toHaveBeenCalled();
  });
});
