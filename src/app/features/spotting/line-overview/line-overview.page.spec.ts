import { PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { toastState } from "@spartan-ng/brain/sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpottingLinesStore } from "../data/spotting-lines.store";
import type { Line } from "../data/spotting.queries";
import { LineOverviewPage } from "./line-overview.page";

const LINE: Line = { id: "4", code: "KJL", displayName: "Kelana Jaya Line", status: "ACTIVE" };

describe("LineOverviewPage", () => {
  let fixture: ComponentFixture<LineOverviewPage>;
  let httpMock: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  /** The page's template is not under test, only its not-found effect; the real ToastService is
   * used because the bug is a toast reading then rewriting the shared toast list. */
  async function render(lineId: string, platform: "browser" | "server" = "browser"): Promise<void> {
    TestBed.overrideComponent(LineOverviewPage, { set: { template: "", imports: [] } });
    const lines = signal([LINE]);
    await TestBed.configureTestingModule({
      imports: [LineOverviewPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        {
          provide: SpottingLinesStore,
          useValue: {
            isLoading: signal(false),
            lines,
            firstLineId: signal(LINE.id),
            lineById: (id: string) => lines().find((line) => line.id === id),
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    fixture = TestBed.createComponent(LineOverviewPage);
    fixture.componentRef.setInput("lineId", lineId);
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** The sort-sync effect also navigates (to the same line, merging query params). */
  function redirects(): unknown[][] {
    return navigate.mock.calls.filter(([commands]: [unknown[]]) => commands[0] === "/spotting");
  }

  afterEach(() => {
    fixture.destroy();
    httpMock.match(() => true);
    httpMock.verify();
    vi.clearAllMocks();
    toastState.reset();
  });

  it("raises the not-found toast once, instead of re-running its own effect forever", async () => {
    await render("99999");

    expect(toastState.toasts()).toHaveLength(1);
    expect(redirects()).toEqual([[["/spotting", "4"], { replaceUrl: true }]]);
  });

  it("neither toasts nor redirects for a known line", async () => {
    await render("4");

    expect(toastState.toasts()).toHaveLength(0);
    expect(redirects()).toEqual([]);
  });

  it("leaves the redirect to the browser, not the server render", async () => {
    await render("99999", "server");

    expect(toastState.toasts()).toHaveLength(0);
    expect(redirects()).toEqual([]);
  });
});
