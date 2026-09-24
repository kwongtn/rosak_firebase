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
  readonly align = signal<"start" | "end">("start");
  readonly testId = signal("info-popover-panel");
}

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

  function openByHover(): void {
    trigger().dispatchEvent(new MouseEvent("mouseenter"));
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

  it("opens on hover, flips aria-expanded, and closes on mouseleave", async () => {
    stubMatchMedia(true);
    await render();

    openByHover();
    expect(panel()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(panel()?.textContent).toContain("Reliability");
    expect(panel()?.textContent).toContain("Share of scheduled trips that actually ran.");

    trigger().dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
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
