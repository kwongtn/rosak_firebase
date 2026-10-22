import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "./axe";

@Component({ template: `<button type="button"></button>` })
class UnnamedButtonComponent {}

@Component({ template: `<button type="button" aria-label="Close">x</button>` })
class NamedButtonComponent {}

describe("expectNoAxeViolations", () => {
  function render<T>(component: new () => T) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }

  it("passes a button that has an accessible name", async () => {
    await expectNoAxeViolations(render(NamedButtonComponent));
  });

  it("reports the rule and the element of a button with no name", async () => {
    const outcome = expectNoAxeViolations(render(UnnamedButtonComponent));

    await expect(outcome).rejects.toThrow(/button-name \(critical\)[\s\S]*<button type="button">/);
  });
});
