import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import type { LinePulse } from "../data/home.queries";
import { HomeHeroComponent } from "./home-hero.component";

function makeLine(overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id: "line-1",
    code: "KJL",
    displayName: "Kelana Jaya Line",
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 12,
    totalVehicleCount: 16,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 2,
    vehicleStatusCounts: [],
    passengerStatusCount: 1,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

/** 14 healthy lines plus one dead one and one late one. */
function networkLines(): LinePulse[] {
  return [
    ...Array.from({ length: 14 }, (_, index) =>
      makeLine({ id: `ok-${index}`, code: `OK${index}` }),
    ),
    makeLine({ id: "dead", code: "KJL", status: "TOTAL_DISRUPTION", statusReportCount: 9 }),
    makeLine({ id: "late", code: "SPL", passengerStatus: "DELAYED" }),
  ];
}

function textOf(root: HTMLElement, testId: string): string {
  return (root.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A stat tile's value and label as separate cells.
 *
 * Read from the tile's two child spans rather than from its concatenated text: Prettier wraps a
 * long interpolation onto its own line (which inserts a text node) but leaves a short one inline
 * (which does not), so a concatenated-text assertion would be testing the formatter's line width
 * rather than the component.
 */
function tile(root: HTMLElement, testId: string): [string, string] {
  const spans = [...(root.querySelector(`[data-testid="${testId}"]`)?.children ?? [])];
  return [(spans[0]?.textContent ?? "").trim(), (spans[1]?.textContent ?? "").trim()];
}

describe("HomeHeroComponent", () => {
  let fixture: ComponentFixture<HomeHeroComponent>;
  let reportSheet: { open: ReturnType<typeof vi.fn>; openFor: ReturnType<typeof vi.fn> };
  let linkSheet: { open: ReturnType<typeof vi.fn>; openEdit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    reportSheet = { open: vi.fn(), openFor: vi.fn() };
    linkSheet = { open: vi.fn(), openEdit: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [HomeHeroComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ReportSheetService, useValue: reportSheet },
        { provide: LinkSheetService, useValue: linkSheet },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeHeroComponent);
  });

  function render(lines: LinePulse[], linksToday = 0): HTMLElement {
    fixture.componentRef.setInput("lines", lines);
    fixture.componentRef.setInput("linksToday", linksToday);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("reads only its inputs — the hero issues no request of its own", () => {
    render(networkLines());
    // Everything on screen is derived from `lines` + `linksToday`; the page passes both from reads
    // it already has. A new request here would be the phase's acceptance criterion broken.
    expect(fixture.componentInstance.lines()).toHaveLength(16);
    expect(fixture.componentInstance.linksToday()).toBe(0);
  });

  it("renders the plain-language headline with the normal/attention counts", () => {
    const root = render(networkLines(), 7);

    expect(textOf(root, "hero-headline")).toBe("14 of 16 lines running normally");
    expect(tile(root, "hero-stat-lines-normal")).toEqual(["14", "Lines normal"]);
    expect(tile(root, "hero-stat-needs-attention")).toEqual(["2", "Needs attention"]);
    expect(tile(root, "hero-stat-reports-now")).toEqual(["39", "Reports now"]);
    expect(tile(root, "hero-stat-links-today")).toEqual(["7", "Links today"]);
  });

  it("names the worst line in the callout and drops it when the network is clean", () => {
    const busy = render(networkLines());
    expect(textOf(busy, "hero-disruption-callout")).toBe("KJL — Total Disruption");

    const clean = render(
      Array.from({ length: 3 }, (_, index) => makeLine({ id: `ok-${index}`, code: `OK${index}` })),
    );
    expect(clean.querySelector('[data-testid="hero-disruption-callout"]')).toBeNull();
    expect(textOf(clean, "hero-headline")).toBe("All 3 lines running normally");
  });

  it("says so plainly before the first read lands instead of rendering 0 of 0", () => {
    const root = render([], 0);

    expect(textOf(root, "hero-headline")).toBe("No live line data yet");
    expect(tile(root, "hero-stat-lines-normal")).toEqual(["0", "Lines normal"]);
  });

  it("publishes the headline metric from the methodology registry, not a literal", () => {
    const root = render(networkLines());

    // The hero must not carry its own copy of the rule: the popover's panel text comes from the
    // registry, so /methodology and this tile cannot drift.
    (root.querySelector('[data-testid="hero-headline"]')?.closest("button") as HTMLElement).click();
    fixture.detectChanges();

    const panel = root.querySelector('[data-testid="hero-headline-popover"]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      renderMethodologyCopy(metricDoc("network.lines-normal").definition),
    );
    expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#line-status");
  });

  it("emits reportDelay instead of opening a chooser of its own", () => {
    const root = render(networkLines());
    const emitted = vi.fn();
    fixture.componentInstance.reportDelay.subscribe(emitted);

    root.querySelector<HTMLButtonElement>('[data-testid="hero-report-delay"]')?.click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(reportSheet.open).not.toHaveBeenCalled();
  });

  it("opens the spotting sheet from Spot a train and the link sheet from Share a link", () => {
    const root = render(networkLines());

    root.querySelector<HTMLButtonElement>('[data-testid="hero-spot-train"]')?.click();
    expect(reportSheet.open).toHaveBeenCalledTimes(1);

    root.querySelector<HTMLButtonElement>('[data-testid="hero-share-link"]')?.click();
    expect(linkSheet.open).toHaveBeenCalledTimes(1);
  });

  it("sends Live map to the tracker as a router link", () => {
    const root = render(networkLines());
    const map = root.querySelector('[data-testid="hero-live-map"]') as HTMLAnchorElement;

    expect(map.tagName).toBe("A");
    expect(map.getAttribute("href")).toBe("/tracker");
  });

  it("carries the brand accent rail without making the block unreadable in dark mode", () => {
    const root = render(networkLines());

    // The rail is the only brand-orange surface in the hero, and the CTA reuses the same token —
    // both resolve through `--brand`, which `:root.dark` overrides, so neither needs a `dark:`
    // utility that could drift from the token.
    const rail = root.querySelector("span.bg-brand");
    expect(rail).not.toBeNull();
    const cta = root.querySelector('[data-testid="hero-report-delay"]');
    expect(cta?.className).toContain("bg-brand");
    expect(cta?.className).toContain("text-brand-foreground");
  });
});
