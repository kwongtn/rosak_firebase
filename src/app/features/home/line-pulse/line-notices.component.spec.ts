import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it } from "vitest";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import type { HomeIncidentItem } from "../data/home-incidents.queries";
import { HomeStore } from "../data/home.store";
import { LineNoticesComponent } from "./line-notices.component";

@Component({ selector: "app-notices-route-stub", template: "" })
class RouteStub {}

function makeIncident(id: string, overrides: Partial<HomeIncidentItem> = {}): HomeIncidentItem {
  return {
    id,
    startDatetime: "2026-10-22T08:00:00",
    endDatetime: null,
    severity: "MINOR",
    title: `Incident ${id}`,
    brief: "",
    lines: [{ id: "1", code: "KJL" }],
    ...overrides,
  };
}

/**
 * The slice of the store the chips read. Both lookups read a signal INSIDE the call, as the real
 * store's do, so a computed that calls them re-evaluates when a test replaces the lists — a mock that
 * closed over plain arrays would make the "lands later" spec pass vacuously.
 */
function makeStore() {
  const notices = signal<Record<string, HomeIncidentItem[]>>({});
  const planned = signal<Record<string, HomeIncidentItem[]>>({});
  return {
    notices,
    planned,
    noticesFor: (lineId: string) => notices()[lineId] ?? [],
    plannedWorksFor: (lineId: string) => planned()[lineId] ?? [],
  };
}

type StoreMock = ReturnType<typeof makeStore>;

function textOf(element: Element | null): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The words a chip shows, in reading order: its flex items joined by the space the gap stands for. */
function visibleWords(link: Element | null): string {
  const parts = [...(link?.children ?? [])].map((part) => textOf(part));
  return parts.length > 0 ? parts.join(" ") : textOf(link);
}

/** Runs `body` with the runner's zone forced to `tz`, then restores it. */
function withTimeZone(tz: string, body: () => void): void {
  const previous = process.env["TZ"];
  process.env["TZ"] = tz;
  try {
    body();
  } finally {
    if (previous === undefined) {
      delete process.env["TZ"];
    } else {
      process.env["TZ"] = previous;
    }
  }
}

describe("LineNoticesComponent", () => {
  let store: StoreMock;
  let fixture: ComponentFixture<LineNoticesComponent>;

  beforeEach(async () => {
    store = makeStore();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LineNoticesComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "", component: RouteStub },
          { path: "insiden", children: [{ path: ":date", children: [] }] },
        ]),
        { provide: HomeStore, useValue: store },
      ],
    }).compileComponents();
  });

  function render(
    inputs: { lineId?: string; lineName?: string; planned?: boolean } = {},
  ): HTMLElement {
    fixture = TestBed.createComponent(LineNoticesComponent);
    fixture.componentRef.setInput("lineId", inputs.lineId ?? "1");
    fixture.componentRef.setInput("lineName", inputs.lineName ?? "Kelana Jaya Line");
    if (inputs.planned !== undefined) {
      fixture.componentRef.setInput("planned", inputs.planned);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rerender(): void {
    TestBed.tick();
    fixture.detectChanges();
  }

  it("draws NOTHING for a line with no incident: no strip, no skeleton, no placeholder text", () => {
    const root = render();

    expect(root.querySelector('[data-testid="line-notices"]')).toBeNull();
    expect(root.querySelector("[hlmskeleton], [data-testid*='skeleton']")).toBeNull();
    expect(textOf(root)).toBe("");
    // The host collapses when empty, so a parent's flex gap or margin leaves no hole.
    expect(root.className).toContain("empty:hidden");
  });

  it("draws nothing while the read is loading or failed, and the chip appears when the answer lands", () => {
    // The store answers `[]` for "not asked yet", "in flight" and "failed" alike.
    const root = render();
    expect(root.querySelector('[data-testid="line-notice"]')).toBeNull();

    store.notices.set({ "1": [makeIncident("a")] });
    rerender();

    expect(root.querySelector('[data-testid="line-notice"]')).not.toBeNull();

    store.notices.set({});
    rerender();

    expect(root.querySelector('[data-testid="line-notices"]')).toBeNull();
  });

  describe("the Notice chip", () => {
    it("shows the word Notice, the severity word and the incident title", () => {
      store.notices.set({ "1": [makeIncident("a", { title: "Signal fault at KL Sentral" })] });
      const root = render();

      // Three flex items (the gap, not a text space, separates them), in reading order.
      const chip = root.querySelector('[data-testid="line-notice"]');
      expect([...(chip?.children ?? [])].map((part) => textOf(part))).toEqual([
        "Notice",
        "Minor",
        "Signal fault at KL Sentral",
      ]);
      expect(textOf(root.querySelector('[data-testid="line-notice-title"]'))).toBe(
        "Signal fault at KL Sentral",
      );
      expect(textOf(root.querySelector('[data-testid="line-notice-severity"]'))).toBe("Minor");
    });

    it("is a link to /insiden/<the day it started>, read from the datetime string", () => {
      store.notices.set({ "1": [makeIncident("a", { startDatetime: "2026-10-20T23:45:00" })] });
      const root = render();

      expect(root.querySelector('[data-testid="line-notice"]')?.getAttribute("href")).toBe(
        "/insiden/2026-10-20",
      );
    });

    it("links to the same day whatever timezone the page is rendered in", () => {
      // 23:45 on the 20th is the 21st in any zone ahead of Kuala Lumpur if the day were derived from a
      // Date; the server render and the hydrated page must agree on the href.
      store.notices.set({ "1": [makeIncident("a", { startDatetime: "2026-10-20T23:45:00" })] });
      const hrefs: Array<string | null | undefined> = [];
      for (const zone of ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
        withTimeZone(zone, () => {
          const root = render();
          hrefs.push(root.querySelector('[data-testid="line-notice"]')?.getAttribute("href"));
        });
      }

      expect(hrefs).toEqual(["/insiden/2026-10-20", "/insiden/2026-10-20", "/insiden/2026-10-20"]);
    });

    it("falls back to the calendar's landing page when the datetime is unreadable", () => {
      store.notices.set({ "1": [makeIncident("a", { startDatetime: "not a date" })] });
      const root = render();

      expect(root.querySelector('[data-testid="line-notice"]')?.getAttribute("href")).toBe(
        "/insiden",
      );
    });

    it("is named by its visible words: no aria-label or description overrides them", () => {
      // 🔴 WCAG 2.5.3 (label in name). An `aria-label` of `Notice: <title>` replaced the content as the
      // link's name, so a voice-control user who said "click Major" reached nothing. With no override
      // the name is the visible text — `Notice Major <title>` — and the severity word is part of it.
      store.notices.set({ "1": [makeIncident("a", { title: "Signal fault", severity: "MAJOR" })] });
      const root = render();

      const chip = root.querySelector('[data-testid="line-notice"]');
      expect(visibleWords(chip)).toBe("Notice Major Signal fault");
      expect(chip?.hasAttribute("aria-label")).toBe(false);
      expect(chip?.hasAttribute("aria-describedby")).toBe(false);
    });

    it("never dims a word on the chip: the severity word must keep its badge contrast", () => {
      // opacity-80 on the severity word measured 3.5:1 (red, light), 4.2:1 (amber, light) and 3.4:1
      // (red, dark) against 4.5:1 for 12px text; without it amber is 6.4:1. Hierarchy comes from the
      // font weight instead.
      store.notices.set({ "1": [makeIncident("a", { severity: "MINOR" })] });
      store.planned.set({ "1": [makeIncident("p")] });
      const root = render({ planned: true });

      const chips = root.querySelectorAll(
        '[data-testid="line-notice"] *, [data-testid="line-planned"] *',
      );
      expect(chips.length).toBeGreaterThan(0);
      for (const part of chips) {
        expect(part.className, textOf(part)).not.toMatch(/opacity-/);
      }
    });

    it("uses the severity colours /insiden uses: red for Major, amber for Minor, neutral for Other", () => {
      store.notices.set({
        "1": [
          makeIncident("major", { severity: "MAJOR" }),
          makeIncident("minor", { severity: "MINOR" }),
        ],
        "2": [makeIncident("other", { severity: "OTHERS", lines: [{ id: "2", code: "MRL" }] })],
      });
      const first = render({ lineId: "1" });
      const classes = [...first.querySelectorAll('[data-testid="line-notice"]')].map(
        (chip) => chip.className,
      );
      const second = render({ lineId: "2" });
      const otherClass = second.querySelector('[data-testid="line-notice"]')?.className ?? "";

      expect(classes[0]).toContain("text-destructive");
      expect(classes[1]).toContain("text-amber-800");
      expect(otherClass).toContain("text-neutral-700");
    });
  });

  describe("the Planned works chip", () => {
    const works = (id: string, overrides: Partial<HomeIncidentItem> = {}) =>
      makeIncident(id, {
        startDatetime: "2026-10-24T22:00:00",
        title: "Track works",
        ...overrides,
      });

    it("is NOT drawn unless the host asks for planned works (only pinned lines do)", () => {
      store.planned.set({ "1": [works("p")] });
      const root = render();

      expect(root.querySelector('[data-testid="line-planned"]')).toBeNull();
      expect(root.querySelector('[data-testid="line-notices"]')).toBeNull();
    });

    it("shows the words Planned works, the start date written like the board, and the title", () => {
      store.planned.set({ "1": [works("p")] });
      const root = render({ planned: true });

      const chip = root.querySelector('[data-testid="line-planned"]');
      expect([...(chip?.children ?? [])].map((part) => textOf(part))).toEqual([
        "Planned works",
        "Sat 24 Oct",
        "Track works",
      ]);
      expect(textOf(root.querySelector('[data-testid="line-planned-date"]'))).toBe("Sat 24 Oct");
      expect(textOf(root.querySelector('[data-testid="line-planned-title"]'))).toBe("Track works");
    });

    it("links to the day the works start, and is named by its visible words", () => {
      store.planned.set({ "1": [works("p")] });
      const root = render({ planned: true });

      const chip = root.querySelector('[data-testid="line-planned"]');
      expect(chip?.getAttribute("href")).toBe("/insiden/2026-10-24");
      // Label in name: the date the chip shows is part of the name, so there is no aria-label to
      // reorder or drop it.
      expect(visibleWords(chip)).toBe("Planned works Sat 24 Oct Track works");
      expect(chip?.hasAttribute("aria-label")).toBe(false);
    });

    it("drops the date, not the chip, when the datetime is unreadable", () => {
      store.planned.set({ "1": [works("p", { startDatetime: "later" })] });
      const root = render({ planned: true });

      const chip = root.querySelector('[data-testid="line-planned"]');
      expect(root.querySelector('[data-testid="line-planned-date"]')).toBeNull();
      expect(visibleWords(chip)).toBe("Planned works Track works");
      expect(chip?.getAttribute("href")).toBe("/insiden");
    });

    it("draws the Notice first, then the Planned works", () => {
      store.notices.set({ "1": [makeIncident("n")] });
      store.planned.set({ "1": [works("p")] });
      const root = render({ planned: true });

      const order = [
        ...root.querySelectorAll("[data-testid='line-notice'], [data-testid='line-planned']"),
      ].map((chip) => chip.getAttribute("data-testid"));
      expect(order).toEqual(["line-notice", "line-planned"]);
    });
  });

  describe("the cap and the +N link", () => {
    it("draws at most two chips and links the rest to /insiden", () => {
      store.notices.set({ "1": [makeIncident("a"), makeIncident("b"), makeIncident("c")] });
      const root = render();

      expect(root.querySelectorAll('[data-testid="line-notice"]')).toHaveLength(2);
      const more = root.querySelector('[data-testid="line-notices-more"]');
      expect(textOf(more)).toBe("+1");
      expect(more?.getAttribute("href")).toBe("/insiden");
      // The name STARTS with the visible "+1", so a voice-control user can say it.
      expect(more?.getAttribute("aria-label")).toBe("+1 more on the incident calendar");
    });

    it("counts every chip it left out, notices and planned works together", () => {
      store.notices.set({ "1": [makeIncident("a"), makeIncident("b"), makeIncident("c")] });
      store.planned.set({ "1": [makeIncident("p1"), makeIncident("p2")] });
      const root = render({ planned: true });

      // 5 incidents, 2 drawn (both notices): the link says +3.
      expect(root.querySelectorAll('[data-testid="line-planned"]')).toHaveLength(0);
      expect(textOf(root.querySelector('[data-testid="line-notices-more"]'))).toBe("+3");
    });

    it("lets a planned work take the second slot when there is a single notice", () => {
      store.notices.set({ "1": [makeIncident("a")] });
      store.planned.set({ "1": [makeIncident("p1"), makeIncident("p2")] });
      const root = render({ planned: true });

      expect(root.querySelectorAll('[data-testid="line-notice"]')).toHaveLength(1);
      expect(root.querySelectorAll('[data-testid="line-planned"]')).toHaveLength(1);
      expect(textOf(root.querySelector('[data-testid="line-notices-more"]'))).toBe("+1");
    });

    it("has no +N link when everything fits", () => {
      store.notices.set({ "1": [makeIncident("a"), makeIncident("b")] });
      const root = render();

      expect(root.querySelectorAll('[data-testid="line-notice"]')).toHaveLength(2);
      expect(root.querySelector('[data-testid="line-notices-more"]')).toBeNull();
    });

    it("does not count planned works the host did not ask for", () => {
      store.notices.set({ "1": [makeIncident("a")] });
      store.planned.set({ "1": [makeIncident("p1"), makeIncident("p2"), makeIncident("p3")] });
      const root = render();

      expect(root.querySelector('[data-testid="line-notices-more"]')).toBeNull();
    });
  });

  describe("accessible names", () => {
    it("names the strip by its line, so the same words on every row still say whose they are", () => {
      store.notices.set({ "1": [makeIncident("a")] });
      const root = render({ lineName: "Monorail Line" });

      expect(root.querySelector('[data-testid="line-notices"]')?.getAttribute("aria-label")).toBe(
        "Incidents on Monorail Line",
      );
    });

    it("never overrides the words a link shows: any aria-label contains them (label in name)", () => {
      // WCAG 2.5.3 for the whole strip, whatever kind of chip it holds. A name that only paraphrased
      // the visible words would leave voice control and speech-to-text users unable to say what they
      // see.
      store.notices.set({
        "1": [makeIncident("a", { severity: "MAJOR" }), makeIncident("b"), makeIncident("c")],
      });
      store.planned.set({ "1": [makeIncident("p", { startDatetime: "2026-10-24T22:00:00" })] });
      const root = render({ planned: true });

      const links = [...root.querySelectorAll("a")];
      // Two Notice chips, then the "+2" link for the third Notice and the Planned works.
      expect(links).toHaveLength(3);
      for (const link of links) {
        const label = link.getAttribute("aria-label");
        if (label !== null) {
          expect(label.toLowerCase()).toContain(visibleWords(link).toLowerCase());
        }
      }
    });
  });

  it("explains the rule in a popover whose copy is the methodology registry's", () => {
    store.notices.set({ "1": [makeIncident("a")] });
    const root = render();

    const trigger = root.querySelector<HTMLButtonElement>(
      'app-info-popover button[aria-label="What is Notices and planned works?"]',
    );
    expect(trigger).not.toBeNull();
    trigger?.click();
    fixture.detectChanges();

    // The registry's tooltip-sized text, token-rendered: the 7 days and the cap of 2 come from the
    // registry constants, not from a literal in this template.
    const panel = root.querySelector('[data-testid="line-notices-popover"]');
    expect(textOf(panel)).toContain(metricTooltip("incidents.line-notices"));
    expect(textOf(panel)).toContain("within 7 days");
    expect(textOf(panel)).toContain("At most 2 chips a line");
  });
});
