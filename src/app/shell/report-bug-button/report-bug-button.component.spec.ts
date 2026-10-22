import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";

import { FeedbackService } from "../../core/sentry/feedback.service";
import { ReportBugButtonComponent } from "./report-bug-button.component";

@Component({
  imports: [ReportBugButtonComponent],
  template: `
    <button app-report-bug-button class="size-8" data-testid="default"></button>
    <button app-report-bug-button class="size-7" data-testid="compact"></button>
  `,
})
class TestHost {}

describe("ReportBugButtonComponent", () => {
  function render(openForm = vi.fn()): { button: HTMLButtonElement; openForm: typeof openForm } {
    TestBed.configureTestingModule({
      providers: [{ provide: FeedbackService, useValue: { openForm } }],
    });
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector("button");
    if (!button) throw new Error("button not rendered");
    return { button, openForm };
  }

  it("is a labelled, non-submitting icon button that keeps the consumer's size class", () => {
    const { button } = render();
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Report a bug");
    expect(button.title).toBe("Report a bug");
    expect(button.classList.contains("size-8")).toBe(true);
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("takes the consumer's size over the icon button's default size", () => {
    const { button } = render();
    const compact = button.parentElement?.querySelector<HTMLElement>('[data-testid="compact"]');
    expect(compact?.classList.contains("size-7")).toBe(true);
    expect(compact?.classList.contains("size-8")).toBe(false);
    expect(compact?.classList.contains("rounded-full")).toBe(true);
  });

  it("opens the feedback form on click", () => {
    const { button, openForm } = render();
    button.click();
    expect(openForm).toHaveBeenCalledTimes(1);
  });
});
