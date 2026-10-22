import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { HlmSkeleton } from "./skeleton";

@Component({
  imports: [HlmSkeleton],
  template: `
    <div hlmSkeleton data-testid="default"></div>
    <div hlmSkeleton class="size-16 rounded-full" data-testid="circle"></div>
  `,
})
class HostComponent {}

describe("HlmSkeleton class merge", () => {
  function classes(testId: string): DOMTokenList {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
    if (!el) throw new Error(`no [data-testid="${testId}"]`);
    return el.classList;
  }

  it("is a muted pulsing rounded-md block by default", () => {
    const list = classes("default");
    expect([...list].sort()).toEqual(["animate-pulse", "bg-muted", "block", "rounded-md"]);
  });

  it("takes the consumer's shape instead of rounded-md", () => {
    const list = classes("circle");
    expect(list.contains("rounded-full")).toBe(true);
    expect(list.contains("size-16")).toBe(true);
    expect(list.contains("rounded-md")).toBe(false);
    expect(list.contains("animate-pulse")).toBe(true);
  });
});
