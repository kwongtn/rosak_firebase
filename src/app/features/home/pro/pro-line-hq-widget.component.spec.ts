import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LinePulse } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { ProLineHqWidgetComponent } from "./pro-line-hq-widget.component";

@Component({ selector: "app-hq2-host-stub", template: "" })
class Hq2HostStub {}

function makeLine(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 1,
    totalVehicleCount: 2,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

describe("pro-line-hq-widget.component: ProLineHqWidgetComponent", () => {
  let fixture: ComponentFixture<ProLineHqWidgetComponent>;
  let lines: ReturnType<typeof signal<LinePulse[]>>;
  let visibleLines: ReturnType<typeof signal<LinePulse[]>>;

  beforeEach(() => {
    localStorage.clear();
  });

  async function widget(seed: LinePulse[]): Promise<HTMLElement> {
    lines = signal(seed);
    visibleLines = signal(seed);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProLineHqWidgetComponent],
      providers: [
        provideZonelessChangeDetection(),
        // The two destinations have to RESOLVE, or `RouterLink` throws NG04002 the moment it renders.
        provideRouter([
          {
            path: "",
            component: Hq2HostStub,
            children: [{ path: "spotting/:lineId", children: [{ path: "details", children: [] }] }],
          },
        ]),
        {
          provide: HomeStore,
          // The widget reads no requests at all, so a store of two signals is the whole mock. A
          // request here would be a bug the mock would be hiding.
          useValue: { lines, visibleLines },
        },
      ],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProLineHqWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("links every line to BOTH of its HQ pages", async () => {
    const root = await widget([makeLine("line-42")]);

    const open = root.querySelector('[data-testid="pro-line-hq-link"]');
    const details = root.querySelector('[data-testid="pro-line-hq-details"]');
    expect(open?.getAttribute("href")).toBe("/spotting/line-42");
    expect(details?.getAttribute("href")).toBe("/spotting/line-42/details");
  });

  it("shows both destinations per row rather than hiding one behind a kebab", async () => {
    const root = await widget([makeLine("line-42")]);

    // A reader who cannot remember which of the two they want should not have to hover a kebab to find
    // out — and a grid of three controls per line is three times the tap targets for the same two facts.
    expect(root.querySelectorAll('[data-testid="pro-line-hq-link"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-testid="pro-line-hq-details"]')).toHaveLength(1);
  });

  it("follows the board's filter, so the HQ grid never disagrees with the rows beside it", async () => {
    const root = await widget([makeLine("a"), makeLine("b")]);
    expect(root.querySelectorAll('[data-testid="pro-line-hq-row"]')).toHaveLength(2);

    visibleLines.set([makeLine("a")]);
    fixture.detectChanges();

    // A HQ list containing a line the board had filtered out would let a reader walk into a line's page
    // from a grid that disagrees with every other widget on the screen.
    expect(root.querySelectorAll('[data-testid="pro-line-hq-row"]')).toHaveLength(1);
    expect(root.querySelector('[data-line-id="a"]')).not.toBeNull();
  });

  it("flags a line that is not fully running, using the board's own test", async () => {
    const root = await widget([makeLine("ok"), makeLine("dead", { status: "TOTAL_DISRUPTION" })]);

    const flags = [...root.querySelectorAll('[data-testid="pro-line-hq-flag"]')];
    expect(flags).toHaveLength(1);
    expect(root.querySelector('[data-line-id="dead"]')?.textContent).toContain("Needs attention");
    expect(root.querySelector('[data-line-id="ok"]')?.textContent).not.toContain("Needs attention");
  });

  it("says so when there is nothing to link to", async () => {
    const root = await widget([]);

    expect(root.querySelector('[data-testid="pro-line-hq-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-line-hq-row"]')).toBeNull();
  });

  it("issues NO request of its own — it is a projection of the one lines read", async () => {
    await widget([makeLine("a")]);

    // A widget with nothing of its own that can fail also needs no failure isolation: this is the
    // recorded reason it is not behind an error flag. The mock therefore carries ONLY the two signals
    // it reads — no `requestHistoryReads`, no lazy resource.
    const store = TestBed.inject(HomeStore) as unknown as Record<string, unknown>;
    expect(Object.keys(store).sort()).toEqual(["lines", "visibleLines"]);
  });
});
