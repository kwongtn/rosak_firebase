import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { VEHICLE_EVENTS_QUERY, type SpottingEvent } from "../../data/spotting.queries";
import { SpottingHistoryComponent } from "./spotting-history.component";

function makeEvent(id: string, overrides: Partial<SpottingEvent> = {}): SpottingEvent {
  return {
    id,
    spottingDate: "2026-10-01",
    status: "IN_SERVICE",
    type: "JUST_SPOTTING",
    notes: null,
    runNumber: null,
    mediaCount: 0,
    isMine: false,
    wheelStatus: null,
    originStation: null,
    destinationStation: null,
    ...overrides,
  };
}

/** A node's text with runs of whitespace (template indentation, line breaks) folded to one space. */
function textOf(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("SpottingHistoryComponent", () => {
  let fixture: ComponentFixture<SpottingHistoryComponent>;
  let request: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    request = vi.fn();
    await TestBed.configureTestingModule({
      imports: [SpottingHistoryComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: GraphQLClient, useValue: { request } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  /** Renders the list with `events` as the first (and only) page the backend answers. */
  async function render(events: SpottingEvent[]): Promise<void> {
    request.mockResolvedValue({ events });
    fixture = TestBed.createComponent(SpottingHistoryComponent);
    fixture.componentRef.setInput("vehicleId", "103");
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLElement[] {
    return [...root().querySelectorAll<HTMLElement>('[data-testid="history-row"]')];
  }

  it("asks for the fields its rows render, one page of 20 at a time", async () => {
    await render([makeEvent("a")]);

    expect(request).toHaveBeenCalledWith(VEHICLE_EVENTS_QUERY, {
      vehicleId: "103",
      limit: 20,
      offset: 0,
    });
    // The template reads these four; dropping one from the document would blank its element
    // without any other test noticing.
    for (const field of ["runNumber", "mediaCount", "isMine", "wheelStatus"]) {
      expect(VEHICLE_EVENTS_QUERY).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  describe("month headings", () => {
    it("are h3, one level under the card's h2, and never h4", async () => {
      await render([
        makeEvent("a", { spottingDate: "2026-10-12" }),
        makeEvent("b", { spottingDate: "2026-10-01" }),
        makeEvent("c", { spottingDate: "2026-09-20" }),
      ]);

      const headings = [...root().querySelectorAll("h3")].map(textOf);
      expect(headings).toEqual(["October 2026", "September 2026"]);
      expect(root().querySelector("h4")).toBeNull();
    });
  });

  describe("photo count", () => {
    it("shows a camera chip with the count, singular for one photo", async () => {
      await render([
        makeEvent("a", { mediaCount: 3 }),
        makeEvent("b", { mediaCount: 1 }),
        makeEvent("c", { mediaCount: 0 }),
      ]);

      const chips = [...root().querySelectorAll('[data-testid="history-media-count"]')];
      expect(chips.map(textOf)).toEqual(["3 photos", "1 photo"]);
      expect(chips[0].querySelector("ng-icon")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("is a plain chip, not a link: no gallery filter by spotting exists to point at", async () => {
      await render([makeEvent("a", { mediaCount: 2 })]);

      const chip = root().querySelector('[data-testid="history-media-count"]');
      expect(chip).not.toBeNull();
      expect(chip?.closest("a, button")).toBeNull();
      expect(chip?.querySelector("a, button")).toBeNull();
    });

    it("shows no chip for a spotting without photos", async () => {
      await render([makeEvent("a", { mediaCount: 0 })]);

      expect(root().querySelector('[data-testid="history-media-count"]')).toBeNull();
    });
  });

  describe("run number", () => {
    it('reads "Run 12"', async () => {
      await render([makeEvent("a", { runNumber: "12" })]);

      expect(textOf(root().querySelector('[data-testid="history-run-number"]'))).toBe("Run 12");
    });

    it("is left out when the spotter gave none (the API sends null or an empty string)", async () => {
      await render([makeEvent("a", { runNumber: null }), makeEvent("b", { runNumber: "" })]);

      expect(root().querySelector('[data-testid="history-run-number"]')).toBeNull();
      expect(root().querySelector('[data-testid="history-details"]')).toBeNull();
    });
  });

  describe("wheel condition", () => {
    it("shows the wheel-status badge, named so a bare word is not mistaken for the train's status", async () => {
      await render([makeEvent("a", { wheelStatus: "WORN_OUT" })]);

      const wheel = root().querySelector('[data-testid="history-wheel"]');
      expect(wheel?.querySelector("wheel-status-badge")).not.toBeNull();
      expect(textOf(wheel)).toBe("Wheels Worn Out");
    });

    it("is left out when no wheel condition was logged", async () => {
      await render([makeEvent("a", { wheelStatus: null })]);

      expect(root().querySelector('[data-testid="history-wheel"]')).toBeNull();
      expect(root().querySelector("wheel-status-badge")).toBeNull();
    });
  });

  describe('"Yours" tag', () => {
    it("marks the viewer's own entries and no one else's", async () => {
      await render([
        makeEvent("mine", { isMine: true }),
        makeEvent("theirs", { isMine: false }),
        makeEvent("mine-too", { isMine: true }),
      ]);

      const tagged = rows().map((row) => row.querySelector('[data-testid="history-yours"]'));
      expect(tagged.map((tag) => (tag ? textOf(tag) : null))).toEqual(["Yours", null, "Yours"]);
    });
  });

  it("keeps every detail on its own row, so a bare row stays as it was", async () => {
    await render([
      makeEvent("full", {
        isMine: true,
        runNumber: "7",
        wheelStatus: "FLAT",
        mediaCount: 2,
        notes: "Seen near KLCC",
      }),
      makeEvent("bare", { notes: "Depot visit" }),
    ]);

    const [full, bare] = rows();
    expect(textOf(full.querySelector('[data-testid="history-details"]'))).toBe(
      "Run 7 Wheels Flat 2 photos",
    );
    expect(textOf(full)).toContain("Seen near KLCC");
    expect(bare.querySelector('[data-testid="history-details"]')).toBeNull();
    expect(bare.querySelector('[data-testid="history-yours"]')).toBeNull();
    expect(textOf(bare)).toContain("Depot visit");
    expect(textOf(bare)).toContain("In Service");
  });
});
