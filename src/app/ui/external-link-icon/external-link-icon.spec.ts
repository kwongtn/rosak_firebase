import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { ExternalLinkIconComponent } from "./external-link-icon";

describe("ExternalLinkIconComponent", () => {
  it("renders a decorative arrow hidden from assistive tech", async () => {
    await TestBed.configureTestingModule({
      imports: [ExternalLinkIconComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExternalLinkIconComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelectorAll("svg path")).toHaveLength(2);
    expect(host.textContent?.trim()).toBe("");
  });
});
