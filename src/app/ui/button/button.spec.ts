import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { HlmButton } from "./button";

@Component({
  imports: [HlmButton],
  template: `
    <form data-testid="form" (submit)="$event.preventDefault(); submits = submits + 1">
      <button hlmBtn data-testid="plain">Plain</button>
      <button hlmBtn type="submit" data-testid="submit">Submit</button>
      <button hlmBtn [type]="dynamicType()" data-testid="dynamic">Dynamic</button>
    </form>
    <a hlmBtn href="/somewhere" data-testid="anchor">Link</a>
  `,
})
class HostComponent {
  submits = 0;
  readonly dynamicType = signal<"button" | "submit" | "reset">("reset");
}

describe("HlmButton type", () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (testId: string): HTMLElement => {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    );
    if (!found) throw new Error(`no [data-testid="${testId}"]`);
    return found;
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  it("defaults a button to type=button", () => {
    expect(el("plain").getAttribute("type")).toBe("button");
  });

  it("lets a consumer ask for type=submit, as an attribute or a binding", async () => {
    expect(el("submit").getAttribute("type")).toBe("submit");
    expect(el("dynamic").getAttribute("type")).toBe("reset");

    fixture.componentInstance.dynamicType.set("submit");
    await fixture.whenStable();
    expect(el("dynamic").getAttribute("type")).toBe("submit");
  });

  it("does not submit the enclosing form from a default button, but does from type=submit", () => {
    el("plain").click();
    expect(fixture.componentInstance.submits).toBe(0);

    el("submit").click();
    expect(fixture.componentInstance.submits).toBe(1);
  });

  it("leaves an anchor without a type attribute", () => {
    expect(el("anchor").hasAttribute("type")).toBe(false);
  });
});
