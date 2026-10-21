import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it } from "vitest";

import type { AssetStatus } from "../../core/graphql/types";
import { HlmBadge } from "../../ui/badge/badge";
import { AssetStatusBadge } from "./asset-status-badge";

describe("AssetStatusBadge", () => {
  let fixture: ComponentFixture<AssetStatusBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssetStatusBadge],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function render(status: AssetStatus): void {
    fixture = TestBed.createComponent(AssetStatusBadge);
    fixture.componentRef.setInput("status", status);
    fixture.detectChanges();
  }

  function badge(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="asset-status-badge"]',
    )!;
  }

  function variant(): string | null | undefined {
    return fixture.debugElement.query(By.directive(HlmBadge)).injector.get(HlmBadge).variant();
  }

  it.each([
    ["IN_OPERATION", "In service", "success"],
    ["UNDER_MAINTENANCE", "Out of service", "destructive"],
  ] as const)("renders %s as %s in the %s colour", (status, label, expectedVariant) => {
    render(status);

    expect(badge().textContent?.replace("Status:", "").trim()).toBe(label);
    expect(variant()).toBe(expectedVariant);
  });

  it("gives a screen reader the whole phrase, with the prefix hidden from sight only", () => {
    render("UNDER_MAINTENANCE");

    expect(badge().textContent).toBe("Status: Out of service");
    // `sr-only` keeps the prefix in the accessibility tree; `hidden` or aria-hidden would not.
    const prefix = badge().querySelector<HTMLElement>(".sr-only");
    expect(prefix?.textContent).toBe("Status: ");
    expect(prefix?.closest("[aria-hidden]")).toBeNull();
  });

  it("follows its input when the status changes", () => {
    render("IN_OPERATION");
    fixture.componentRef.setInput("status", "UNDER_MAINTENANCE");
    fixture.detectChanges();

    expect(badge().textContent).toContain("Out of service");
    expect(variant()).toBe("destructive");
  });

  it("shows a neutral Unknown, not a blank pill, for a status it does not know", () => {
    render("BROKEN" as AssetStatus);

    expect(badge().textContent).toBe("Status: Unknown");
    expect(variant()).toBe("neutral");
  });
});
