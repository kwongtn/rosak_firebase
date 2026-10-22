import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { HlmCard, HlmCardContent } from "./card";

@Component({
  imports: [HlmCard, HlmCardContent],
  template: `
    <div hlmCard data-testid="default"></div>
    <div hlmCard class="gap-3 p-4" data-testid="override">
      <div hlmCardContent class="gap-2" data-testid="content"></div>
    </div>
  `,
})
class HostComponent {}

describe("HlmCard class merge", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function classes(testId: string): DOMTokenList {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
    if (!el) throw new Error(`no [data-testid="${testId}"]`);
    return el.classList;
  }

  it("keeps the default gap and padding without a consumer class", () => {
    const list = classes("default");
    expect(list.contains("gap-4")).toBe(true);
    expect(list.contains("p-5")).toBe(true);
  });

  it("lets a consumer gap and padding replace the host's, and keeps the rest", () => {
    const list = classes("override");
    expect(list.contains("gap-3")).toBe(true);
    expect(list.contains("p-4")).toBe(true);
    expect(list.contains("gap-4")).toBe(false);
    expect(list.contains("p-5")).toBe(false);
    expect(list.contains("rounded-xl")).toBe(true);
  });

  it("lets HlmCardContent take a consumer gap", () => {
    const list = classes("content");
    expect(list.contains("gap-2")).toBe(true);
    expect(list.contains("gap-3")).toBe(false);
    expect(list.contains("flex-col")).toBe(true);
  });
});
