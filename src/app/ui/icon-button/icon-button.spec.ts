import { Component, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HlmIconButton } from "./icon-button";

@Component({
  imports: [HlmIconButton],
  template: `
    <button hlmIconBtn aria-label="Close" data-testid="named"></button>
    <button hlmIconBtn aria-labelledby="heading" data-testid="labelled-by"></button>
    <button
      hlmIconBtn
      class="size-7 -mr-1.5"
      [attr.aria-label]="dynamicName"
      data-testid="dynamic"
    ></button>
  `,
})
class HostComponent {
  readonly dynamicName = "Close";
}

@Component({
  imports: [HlmIconButton],
  template: `<button hlmIconBtn data-testid="nameless"></button>`,
})
class NamelessHostComponent {}

describe("HlmIconButton", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  const render = async <T>(component: new () => T): Promise<ComponentFixture<T>> => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(component);
    await fixture.whenStable();
    return fixture;
  };

  const el = (fixture: ComponentFixture<unknown>, testId: string): HTMLElement => {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    );
    if (!found) throw new Error(`no [data-testid="${testId}"]`);
    return found;
  };

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("is a non-submitting button with the shared square, hover and focus-ring classes", async () => {
    const fixture = await render(HostComponent);
    const button = el(fixture, "named");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("data-slot")).toBe("icon-button");
    for (const cls of ["size-8", "rounded-full", "hover:bg-muted", "focus-visible:ring-3"]) {
      expect(button.classList.contains(cls)).toBe(true);
    }
  });

  it("lets a consumer class override the size and add a margin", async () => {
    const button = el(await render(HostComponent), "dynamic");
    expect(button.classList.contains("size-7")).toBe(true);
    expect(button.classList.contains("-mr-1.5")).toBe(true);
    expect(button.classList.contains("size-8")).toBe(false);
  });

  it("does not warn when an aria-label, a bound aria-label or aria-labelledby names it", async () => {
    await render(HostComponent);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns in dev mode when neither aria-label nor aria-labelledby is set", async () => {
    await render(NamelessHostComponent);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("accessible name");
  });
});
