import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { HlmTr } from "./table";

@Component({
  imports: [HlmTr],
  template: `
    <table>
      <tbody>
        <tr hlmTr data-testid="default"></tr>
        <tr hlmTr class="cursor-pointer hover:bg-muted" data-testid="clickable"></tr>
      </tbody>
    </table>
  `,
})
class HostComponent {}

describe("HlmTr class merge", () => {
  function classes(testId: string): DOMTokenList {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
    if (!el) throw new Error(`no [data-testid="${testId}"]`);
    return el.classList;
  }

  it("has the soft hover by default", () => {
    const list = classes("default");
    expect(list.contains("hover:bg-muted/50")).toBe(true);
    expect(list.contains("border-b")).toBe(true);
  });

  it("lets a clickable row replace the hover shade and keeps the border", () => {
    const list = classes("clickable");
    expect(list.contains("hover:bg-muted")).toBe(true);
    expect(list.contains("hover:bg-muted/50")).toBe(false);
    expect(list.contains("cursor-pointer")).toBe(true);
    expect(list.contains("border-b")).toBe(true);
  });
});
