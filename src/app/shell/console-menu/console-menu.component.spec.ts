import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOVER_CLOSE_DELAY_MS } from "../app-nav/app-nav-menu-state";
import { CONSOLE_LINKS } from "../nav-config";
import { ConsoleMenuComponent } from "./console-menu.component";

@Component({ template: "" })
class TestOutlet {}

@Component({
  imports: [ConsoleMenuComponent],
  template: `<div
    app-console-menu
    [hoverCapable]="hoverCapable()"
    [showChevron]="chevron()"
  ></div>`,
})
class TestHost {
  readonly hoverCapable = signal(true);
  readonly chevron = signal(false);
}

describe("ConsoleMenuComponent", () => {
  let fixture: ComponentFixture<TestHost>;
  let host: HTMLElement;

  const panel = () => host.querySelector("div.absolute");
  const panelLabels = () =>
    [...host.querySelectorAll("div.absolute a")].map((a) => a.textContent?.trim());
  const enter = () => {
    host.dispatchEvent(new Event("mouseenter"));
    fixture.detectChanges();
  };
  const leave = () => host.dispatchEvent(new Event("mouseleave"));

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: "**", component: TestOutlet }])],
    });
    fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    host = (fixture.nativeElement as HTMLElement).querySelector(
      "div[app-console-menu]",
    ) as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the Console link to the spotting queue and no dropdown until hovered", () => {
    const link = host.querySelector("a");
    expect(link?.textContent?.trim()).toBe("Console");
    expect(link?.getAttribute("href")).toBe("/console/spotting");
    expect(panel()).toBeNull();
    expect(host.classList.contains("relative")).toBe(true);
  });

  it("opens the CONSOLE_LINKS dropdown on pointer enter", () => {
    enter();
    expect(panelLabels()).toEqual(CONSOLE_LINKS.map((l) => l.label));
  });

  it("closes after the hover-close delay, and a re-enter inside it cancels the close", () => {
    enter();
    leave();
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS - 1);
    enter();
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
    fixture.detectChanges();
    expect(panel()).not.toBeNull();

    leave();
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it("closes on Escape and when a sub-link is clicked", async () => {
    // The router settles through real timers: awaiting it under the fake ones would hang.
    vi.useRealTimers();
    enter();
    expect(panel()).not.toBeNull();
    panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();

    enter();
    const subLink = host.querySelector<HTMLAnchorElement>("div.absolute a");
    if (!subLink) throw new Error("dropdown sub-link not rendered");
    subLink.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it("never opens on a device without hover", () => {
    fixture.componentInstance.hoverCapable.set(false);
    fixture.detectChanges();
    enter();
    expect(panel()).toBeNull();
  });

  it("draws the chevron only when asked", () => {
    expect(host.querySelector("a svg")).toBeNull();
    fixture.componentInstance.chevron.set(true);
    fixture.detectChanges();
    expect(host.querySelector("a svg")).not.toBeNull();
  });
});
