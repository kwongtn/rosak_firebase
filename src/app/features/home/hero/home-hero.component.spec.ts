import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import type { LinePulse, LineStatusHourBucket } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { ReportChooserService } from "../report/report-chooser.service";
import { HomeHeroComponent } from "./home-hero.component";

/** One `pulseLinks` entry. `isAutomated` is what separates an operator-sourced post from a rider's. */
function pulseLink(
  overrides: Partial<LinePulse["pulseLinks"][number]> = {},
): LinePulse["pulseLinks"][number] {
  return {
    id: "pl-1",
    url: "https://operator.example/post/1",
    normalizedUrl: "https://operator.example/post/1",
    title: "Signal fault at Angkasapuri",
    created: "2026-10-03T08:00:00",
    occurredAt: "2026-10-03T08:00:00",
    isAutomated: true,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    user: null,
    ...overrides,
  };
}

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

/**
 * `total` lines of which `broken` are down — the ONLY two numbers the hero's tone reads, so this is
 * the shortest way to reach each of its four branches without touching the rule itself.
 */
function linesWith(total: number, broken: number): LinePulse[] {
  return [
    ...Array.from({ length: total - broken }, (_, index) =>
      makeLine({ id: `ok-${index}`, code: `OK${index}` }),
    ),
    ...Array.from({ length: broken }, (_, index) =>
      makeLine({ id: `bad-${index}`, code: `BAD${index}`, status: "TOTAL_DISRUPTION" }),
    ),
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
  let chooser: { open: ReturnType<typeof vi.fn> };
  let storeMock: {
    isRefreshing: ReturnType<typeof signal<boolean>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    isLoadingLastWeek: ReturnType<typeof signal<boolean>>;
    hasError: ReturnType<typeof signal<boolean>>;
    // The hosted sparkline reads the store's service-day history read. It is EMPTY here on purpose:
    // this spec is about the hero's own numbers, and the sparkline has its own spec — what matters
    // here is that hosting it adds no request of its own and, on an empty read, only its own
    // fixed-height empty state.
    networkHistory: ReturnType<typeof signal<LineStatusHourBucket[]>>;
    networkHistoryFailed: ReturnType<typeof signal<boolean>>;
    requestHistoryReads: ReturnType<typeof vi.fn>;
    polling: {
      intervalMs: ReturnType<typeof signal<number | null>>;
      secondsRemaining: ReturnType<typeof signal<number>>;
      refreshNow: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    reportSheet = { open: vi.fn(), openFor: vi.fn() };
    linkSheet = { open: vi.fn(), openEdit: vi.fn() };
    chooser = { open: vi.fn() };
    // The hero hosts the page's live refresh indicator, which injects `HomeStore` itself — so the
    // hero's own "reads nothing" claim is about REQUESTS, and the store it renders against is the
    // same route-scoped one the page already has.
    storeMock = {
      isRefreshing: signal(false),
      isLoading: signal(false),
      isLoadingLastWeek: signal(false),
      hasError: signal(false),
      networkHistory: signal<LineStatusHourBucket[]>([]),
      networkHistoryFailed: signal(false),
      requestHistoryReads: vi.fn(),
      polling: {
        intervalMs: signal<number | null>(30000),
        secondsRemaining: signal(30),
        refreshNow: vi.fn(),
      },
    };

    await TestBed.configureTestingModule({
      imports: [HomeHeroComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ReportSheetService, useValue: reportSheet },
        { provide: LinkSheetService, useValue: linkSheet },
        // Root-provided, and HOSTED by the page rather than the hero — the hero is only a trigger.
        { provide: ReportChooserService, useValue: chooser },
        { provide: HomeStore, useValue: storeMock },
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

  function rootOf(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it("reads only its inputs — the hero issues no request of its own", () => {
    render(networkLines());
    // Everything on screen is derived from `lines` + `linksToday`; the page passes both from reads
    // it already has. A new request here would be the phase's acceptance criterion broken. The two
    // hosted store-reading widgets (refresh control, sparkline) read the STORE's resources, not their
    // own, so hosting them does not change that.
    expect(fixture.componentInstance.lines()).toHaveLength(16);
    expect(fixture.componentInstance.linksToday()).toBe(0);
  });

  it("hosts the network sparkline, which holds its space while the history read has no data", () => {
    const root = render(networkLines());

    // The hero asks the store for the read (the widget owns that opt-in) but draws nothing itself.
    expect(storeMock.requestHistoryReads).toHaveBeenCalled();
    // The widget no longer vanishes: an area that appears and disappears on the slowest read is a
    // scroll shift under the reader, which is what this whole change set exists to stop.
    expect(root.querySelector('[data-testid="network-sparkline"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="network-sparkline-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="sparkline-bar"]')).toBeNull();
  });

  it("draws the sparkline once the store's network history has data", () => {
    storeMock.networkHistory.set([
      {
        hourStart: "2026-09-21T19:00:00+00:00",
        hourEnd: "2026-09-21T20:00:00+00:00",
        count: 4,
        dominantStatus: "NORMAL",
        statusCounts: [{ status: "NORMAL", count: 4 }],
      },
    ]);
    const root = render(networkLines());

    expect(root.querySelector('[data-testid="network-sparkline"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="sparkline-bar"]')).toHaveLength(1);
  });

  it("keeps the sparkline and the rest of the hero intact when that read failed", () => {
    storeMock.networkHistoryFailed.set(true);
    storeMock.networkHistory.set([
      {
        hourStart: "2026-09-21T19:00:00+00:00",
        hourEnd: "2026-09-21T20:00:00+00:00",
        count: 4,
        dominantStatus: "NORMAL",
        statusCounts: [{ status: "NORMAL", count: 4 }],
      },
    ]);
    const root = render(networkLines());

    // Widget-level failure isolation, seen from the host: a broken chart does not blank the hero, and
    // does not put the page's retry banner up either. It says what happened rather than drawing the
    // last good answer as if it were fresh — and, like the empty case, keeps the same box.
    expect(root.querySelector('[data-testid="network-sparkline"]')).not.toBeNull();
    expect(textOf(root, "network-sparkline-empty")).toBe("Activity data unavailable");
    expect(root.querySelector('[data-testid="hero-headline"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="hero-actions"]')).not.toBeNull();
    expect(storeMock.hasError()).toBe(false);
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

  it("publishes the two tile RULES from the registry too, each on its own label", () => {
    const root = render(networkLines());

    // 🔴 The Phase 5B registry audit's whole finding, pinned: "Needs attention" and "Reports now"
    // were numbers a reader is asked to weigh, with their rules nowhere a reader could reach. Each
    // label is now its own popover trigger reading the registry string, so a tile's explanation and
    // /methodology's sentence are the same string rather than two phrasings of one rule.
    for (const [tileTestId, metricId, panelTestId] of [
      ["hero-stat-needs-attention", "network.needs-attention", "hero-needs-attention-popover"],
      ["hero-stat-reports-now", "network.reports-now", "hero-reports-now-popover"],
    ] as const) {
      const tile = root.querySelector(`[data-testid="${tileTestId}"]`) as HTMLElement;
      const popover = tile.querySelector("app-info-popover") as HTMLElement;
      expect(popover, tileTestId).not.toBeNull();

      // The FIGURE stays out of the trigger: it is the tile's value, and the tick-up span already
      // owns that slot — wrapping the number in a button would put the animation inside a control
      // and make the value's own text part of a control's accessible name.
      const trigger = popover.querySelector("button") as HTMLButtonElement;
      expect(trigger.querySelector("span[class*='tabular-nums']")).toBeNull();
      expect(trigger.getAttribute("aria-label")).toMatch(/^What is /);
      expect(root.querySelector(`[data-testid="${panelTestId}"]`)).toBeNull();

      trigger.click();
      fixture.detectChanges();

      const panel = popover.querySelector(`[data-testid="${panelTestId}"]`) as HTMLElement;
      expect(panel, metricId).not.toBeNull();
      expect(panel.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
        renderMethodologyCopy(metricDoc(metricId).definition),
      );
      expect(panel.querySelector("a")?.getAttribute("href")).toBe("/methodology#line-status");
    }

    // "Lines normal" and "Links today" stay plain: the first is the headline's own sentence one
    // tile above, and the second is the row count of the feed list further down the page. Counted
    // outside the hosted sparkline, which owns a fourth popover for its OWN definition.
    expect(
      [...root.querySelectorAll("app-info-popover")].filter(
        (popover) => popover.closest("app-network-sparkline") === null,
      ).length,
    ).toBe(3);
  });

  it("opens the report CHOOSER from Report a delay, not a sheet and not a scroll", () => {
    const root = render(networkLines());

    root.querySelector<HTMLButtonElement>('[data-testid="hero-report-delay"]')?.click();

    // "Report a delay" names an intent, and the reader who clicks it is on a platform without the
    // board's line list in front of them: the chooser is what asks "which line?", so the hero neither
    // opens a sheet that needs a line id nor scrolls somewhere the reader has to go and look.
    expect(chooser.open).toHaveBeenCalledTimes(1);
    expect(reportSheet.open).not.toHaveBeenCalled();
    expect(linkSheet.open).not.toHaveBeenCalled();
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

  // The page's heading structure: ONE h1, and it is the sentence about the network. The board's group
  // headings and the card titles step down from it, so a screen reader's heading list has a root.
  it("gives the page exactly one h1, and it is the headline", () => {
    const root = render(networkLines());

    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector("h1")?.getAttribute("data-testid")).toBe("hero-headline");
  });

  it("animates a changed stat tile through the tick-up directive, and not before", () => {
    render(networkLines(), 7);
    const figure = (testId: string): HTMLElement =>
      rootOf().querySelector(`[data-testid="${testId}"] span`) as HTMLElement;

    // First paint: the directive skips its own first run, so the numbers arrive as plain text.
    expect(figure("hero-stat-lines-normal").className).not.toContain("animate-tick-up");

    render(networkLines(), 8);
    fixture.detectChanges();

    expect(figure("hero-stat-links-today").className).toContain("motion-safe:animate-tick-up");
    expect(figure("hero-stat-lines-normal").className).not.toContain("animate-tick-up");
  });

  it("paints the top line and the headline with the network's TONE, not a brand rail", () => {
    const classes = (testId: string, lines: LinePulse[]): string =>
      render(lines).querySelector(`[data-testid="${testId}"]`)?.className ?? "";

    // One colour, one sentence, one rule: the fastest thing a returning rider sees before reading
    // anything is already the answer. Both surfaces come from the same two counts as the headline —
    // the IN-SERVICE ones, so the degraded and critical fixtures below have to be operational
    // statuses; a TESTING/DEFUNCT line would no longer move either surface.
    for (const [lines, fill, text] of [
      [linesWith(16, 0), "bg-green-500", "text-green-600"],
      [networkLines(), "bg-orange-500", "text-orange-600"],
      [linesWith(16, 9), "bg-red-500", "text-red-600"],
      [[], "bg-muted-foreground/40", "text-foreground"],
    ] as const satisfies [LinePulse[], string, string][]) {
      expect(classes("hero-countdown-line", lines), fill).toContain(fill);
      expect(classes("hero-headline", lines), text).toContain(text);
    }

    // The status line replaced the brand rail rather than joining it: brand orange as an accent said
    // "this is the page's headline region" and nothing about the network, on the one surface a rider
    // glances at first.
    expect(render(linesWith(16, 0)).querySelector(".bg-brand")).toBeNull();
  });

  it("shrinks the top line across the poll beat, from the seconds remaining", () => {
    const width = (): string =>
      rootOf().querySelector<HTMLElement>('[data-testid="hero-countdown-line"]')?.style.width ?? "";

    render(networkLines());
    expect(width()).toBe("100%");

    storeMock.polling.secondsRemaining.set(15);
    fixture.detectChanges();
    expect(width()).toBe("50%");

    storeMock.polling.secondsRemaining.set(0);
    fixture.detectChanges();
    expect(width()).toBe("0%");

    // A paused beat ("Never refresh") has no countdown to draw, so the line reads full rather than
    // NaN — which would collapse it to nothing and look like a dark network on an idle page.
    storeMock.polling.intervalMs.set(null);
    fixture.detectChanges();
    expect(width()).toBe("100%");

    // 🔴 It SNAPS. The width is rewritten once per second, so animating it made every refresh read as
    // the line flowing back to full — a slow, continuous sweep that has no meaning on a countdown.
    const fill = rootOf().querySelector('[data-testid="hero-countdown-line"]') as HTMLElement;
    expect(fill.className.split(/\s+/)).not.toContain("transition-[width]");
    expect(fill.className.split(/\s+/)).not.toContain("duration-1000");
  });

  it("clips both edge lines in one card-shaped overlay rather than the card itself", () => {
    const section = render(networkLines()).querySelector(
      '[data-testid="home-hero"]',
    ) as HTMLElement;

    // A 4px-tall box cannot carry the card's 18px radius — CSS clamps it — so the lines used to end
    // square, poking outside the card's corners. The card cannot clip itself either: its popover
    // panels must escape it. So the clip lives in a CARD-SIZED box, where the radius is not clamped.
    const overlay = section.firstElementChild as HTMLElement;
    expect(overlay.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "pointer-events-none",
        "absolute",
        "inset-0",
        "overflow-hidden",
        "rounded-2xl",
      ]),
    );
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.querySelector('[data-testid="hero-countdown-line"]')).not.toBeNull();
    expect(overlay.querySelector('[data-testid="hero-ribbon"]')).not.toBeNull();

    // The lines themselves keep no radius of their own — that was the clamped thing.
    for (const id of ["hero-countdown-line", "hero-ribbon"]) {
      const el = overlay.querySelector(`[data-testid="${id}"]`) as HTMLElement;
      expect(el.className.split(/\s+/).filter((cls) => cls.startsWith("rounded"))).toEqual([]);
    }
    // …and the card itself is still un-clipped, so the popovers can escape.
    expect(section.className.split(/\s+/)).not.toContain("overflow-hidden");
  });

  it("reads the headline and the tone off the lines actually in service", () => {
    // The live read: 14 running lines, LRT SAL in trial service, one defunct line. Neither of the
    // last two can ever be "running normally", so they must not read as a degradation nobody can
    // wait out — but the tile deliberately still counts them, because that is a question about
    // lines rather than about service.
    const healthy14 = (): LinePulse[] =>
      Array.from({ length: 14 }, (_, index) => makeLine({ id: `ok-${index}`, code: `OK${index}` }));
    const classes = (root: HTMLElement, testId: string): string =>
      root.querySelector(`[data-testid="${testId}"]`)?.className ?? "";

    const root = render([
      ...healthy14(),
      makeLine({ id: "trial", code: "SAL", status: "TESTING" }),
      makeLine({ id: "closed", code: "SKY", status: "DEFUNCT" }),
    ]);
    expect(textOf(root, "hero-headline")).toBe("All 14 lines running normally");
    expect(classes(root, "hero-countdown-line")).toContain("bg-green-500");
    expect(classes(root, "hero-headline")).toContain("text-green-600");
    // The all-lines count the tile publishes is untouched by that scoping.
    expect(tile(root, "hero-stat-needs-attention")).toEqual(["2", "Needs attention"]);

    // A real disruption still speaks: PARTIAL_DISRUPTION is operational, so it moves both the words
    // and the colour.
    const disrupted = render([
      ...healthy14().slice(0, 9),
      makeLine({ id: "dead", code: "KJL", status: "PARTIAL_DISRUPTION" }),
      makeLine({ id: "trial", code: "SAL", status: "TESTING" }),
    ]);
    expect(textOf(disrupted, "hero-headline")).toBe("9 of 10 lines running normally");
    expect(classes(disrupted, "hero-headline")).toContain("text-orange-600");
  });

  it("keeps the CTA row on the default theme rather than brand orange", () => {
    const root = render(networkLines());

    // The page's identity is type and layout; a brand-coloured button was a second brand surface on a
    // card whose top line already carries the status colour. The variant defaults do the rest.
    expect(root.querySelector('[data-testid="hero-report-delay"]')?.className).not.toContain(
      "bg-brand",
    );
    expect(root.querySelector('[data-testid="hero-live-map"]')?.className).not.toContain(
      "text-brand",
    );
  });

  it("draws the network's own colours as a decorative, hidden ribbon", () => {
    const root = render([
      makeLine({ id: "a", code: "A", displayColor: "#00af91" }),
      makeLine({ id: "b", code: "B", displayColor: "#e11d48" }),
    ]);

    const ribbon = root.querySelector<HTMLElement>('[data-testid="hero-ribbon"]');
    expect(ribbon).not.toBeNull();
    // Decorative: sixteen colour swatches are not information, and announcing them would drown the
    // headline the screen reader is actually here for.
    expect(ribbon?.getAttribute("aria-hidden")).toBe("true");
    const segments = ribbon?.querySelectorAll("span") ?? [];
    expect(segments).toHaveLength(2);
    expect((segments[0] as HTMLElement).style.backgroundColor).toBe("rgb(0, 175, 145)");
    expect((segments[1] as HTMLElement).style.backgroundColor).toBe("rgb(225, 29, 72)");
  });

  it("drops a blank line colour instead of leaving a hole in the ribbon", () => {
    const root = render([
      makeLine({ id: "a", code: "A", displayColor: "#00af91" }),
      makeLine({ id: "b", code: "B", displayColor: "" }),
    ]);

    const ribbon = root.querySelector<HTMLElement>('[data-testid="hero-ribbon"]');
    expect(ribbon?.querySelectorAll("span")).toHaveLength(1);
  });

  it("draws no ribbon at all before the first read lands", () => {
    const root = render([]);
    expect(root.querySelector('[data-testid="hero-ribbon"]')).toBeNull();
  });

  it("calls out an operator-sourced post on the worst line, and opens the original safely", () => {
    const root = render([
      makeLine({
        id: "dead",
        code: "KJL",
        status: "TOTAL_DISRUPTION",
        pulseLinks: [pulseLink({ isAutomated: false, id: "rider" }), pulseLink()],
      }),
      makeLine({ id: "ok", code: "SPL" }),
    ]);

    const callout = root.querySelector<HTMLElement>('[data-testid="hero-official-callout"]');
    expect(callout).not.toBeNull();
    expect(textOf(root, "hero-official-badge")).toBe("Official update");
    expect(callout?.textContent).toContain("Signal fault at Angkasapuri");

    const link = root.querySelector<HTMLAnchorElement>('[data-testid="hero-official-link"]');
    expect(link?.getAttribute("href")).toBe("https://operator.example/post/1");
    expect(link?.textContent?.trim()).toBe("Open original");
    // A community page quoting an operator must never look like the operator said it here.
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("puts the official callout ABOVE the disruption callout", () => {
    const root = render([
      makeLine({ id: "dead", code: "KJL", status: "TOTAL_DISRUPTION", pulseLinks: [pulseLink()] }),
    ]);

    // "The operator has announced something" is a stronger claim than "a summary of reports says a
    // line is broken"; reading them the other way round inverts the reader's confidence.
    const official = root.querySelector('[data-testid="hero-official-callout"]');
    const disruption = root.querySelector('[data-testid="hero-disruption-callout"]');
    expect(official?.compareDocumentPosition(disruption as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows no official callout when the worst line has no operator post", () => {
    const root = render([
      makeLine({
        id: "dead",
        code: "KJL",
        status: "TOTAL_DISRUPTION",
        pulseLinks: [pulseLink({ isAutomated: false })],
      }),
    ]);

    expect(root.querySelector('[data-testid="hero-official-callout"]')).toBeNull();
    // …and the plain disruption callout is untouched, which is the point of scoping the official
    // one to the line the summary is already talking about.
    expect(textOf(root, "hero-disruption-callout")).toBe("KJL — Total Disruption");
  });

  it("does not raise an official callout about a HEALTHIER line while a worse one is broken", () => {
    const root = render([
      makeLine({ id: "dead", code: "KJL", status: "TOTAL_DISRUPTION" }),
      makeLine({ id: "late", code: "SPL", passengerStatus: "DELAYED", pulseLinks: [pulseLink()] }),
    ]);

    // `summarizeNetwork` names ONE worst line; a callout about any other would contradict the
    // sentence right underneath it.
    expect(textOf(root, "hero-disruption-callout")).toBe("KJL — Total Disruption");
    expect(root.querySelector('[data-testid="hero-official-callout"]')).toBeNull();
  });

  it("puts the page's live refresh indicator on the headline row at every width", () => {
    const root = render(networkLines());

    const slot = root.querySelector<HTMLElement>('[data-testid="hero-refresh-slot"]');
    expect(slot).not.toBeNull();
    // It was desktop-only in a bottom-right corner, which hid it entirely below `lg` — exactly the
    // widths that had no other freshness signal. The freshness claim belongs beside the sentence it
    // qualifies, at every width.
    expect(slot?.className.split(/\s+/)).not.toContain("hidden");
    expect(slot?.querySelector('[data-testid="line-refresh-countdown"]')).not.toBeNull();

    // It shares one row with the headline it describes, so the reader reads them as one statement. The
    // HEADLINE popover's element, not its panel — a panel only exists once it has been opened.
    const row = slot?.parentElement;
    expect(row?.querySelector("app-info-popover")).not.toBeNull();
    expect(row?.querySelector("app-home-refresh-control")).not.toBeNull();
    expect(row?.querySelector('[data-testid="hero-refresh-slot"]')).toBe(slot);

    // ONE countdown instance on the whole page: the mobile feed-column copy is gone, replaced by the
    // sticky action bar's Refresh button on the same store beat. Moving the wrapper did not add a
    // second state machine.
    expect(root.querySelectorAll("app-home-refresh-control").length).toBe(1);
  });
});
