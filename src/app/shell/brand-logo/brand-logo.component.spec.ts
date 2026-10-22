import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { BrandLogoComponent } from "./brand-logo.component";

const SVG_NS = "http://www.w3.org/2000/svg";

@Component({
  imports: [BrandLogoComponent],
  template: `<svg app-brand-logo class="h-9 w-auto"></svg>`,
})
class TestHost {}

describe("BrandLogoComponent", () => {
  it("renders the wordmark as an SVG element with SVG paths, keeping the consumer's classes", () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();

    const svg = (fixture.nativeElement as HTMLElement).querySelector("svg");
    expect(svg?.namespaceURI).toBe(SVG_NS);
    expect(svg?.getAttribute("viewBox")).toBe("0 0 570.14 178.35");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("class")).toContain("h-9");

    const paths = [...(svg?.children ?? [])];
    expect(paths).toHaveLength(8);
    // An HTML <path> would be created if the template lost its `svg:` prefix, and would never draw.
    expect(paths.every((p) => p.namespaceURI === SVG_NS && p.localName === "path")).toBe(true);
  });
});
