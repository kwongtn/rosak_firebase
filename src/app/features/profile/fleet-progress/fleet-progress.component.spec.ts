import { ErrorHandler, provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import {
  FLEET_FAVOURITES_COUNT,
  GET_FLEET_PROGRESS_QUERY,
  type FleetSpottedVehicle,
  type GetFleetProgressData,
} from "../data/profile.queries";
import { FleetProgressComponent } from "./fleet-progress.component";

type FleetLine = FleetSpottedVehicle["vehicle"]["lines"][number];

const KJL: FleetLine = { id: "4", code: "LRT KJL", totalVehicleCount: 116 };
const AGL: FleetLine = { id: "5", code: "LRT AGL", totalVehicleCount: 50 };

function spotted(id: string, lines: FleetLine[]): FleetSpottedVehicle {
  return { vehicle: { id, lines } };
}

function answer(vehicles: FleetSpottedVehicle[]): GetFleetProgressData {
  return { user: { favouriteVehicles: vehicles } };
}

/** A request the test resolves by hand, so the card can be looked at while it is still loading. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("FleetProgressComponent", () => {
  let fixture: ComponentFixture<FleetProgressComponent>;
  let httpMock: HttpTestingController;
  let requestMock: ReturnType<typeof vi.fn>;
  let handleErrorMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // The info popover probes matchMedia after its first render, and the test DOM has none.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    requestMock = vi.fn();
    handleErrorMock = vi.fn();
    await TestBed.configureTestingModule({
      imports: [FleetProgressComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { idToken: vi.fn(async () => "token") } },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ErrorHandler, useValue: { handleError: handleErrorMock } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  /** Lets every promise that is already settled run to its end, e.g. the mocked read. */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  /** Mounts the card and lets its read (started after the first render) run. */
  async function render(): Promise<void> {
    fixture = TestBed.createComponent(FleetProgressComponent);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const byTestId = (id: string): HTMLElement | null =>
    root().querySelector<HTMLElement>(`[data-testid="${id}"]`);

  function rowCodes(): string[] {
    return [...root().querySelectorAll('[data-testid="fleet-line-code"]')].map(
      (el) => el.textContent?.trim() ?? "",
    );
  }

  describe("the read", () => {
    it("asks for the caller's own favourites, with their Firebase token, once", async () => {
      requestMock.mockResolvedValue(answer([spotted("1", [KJL])]));

      await render();

      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledWith(
        GET_FLEET_PROGRESS_QUERY,
        {},
        { "firebase-auth-key": "token" },
      );
    });

    it("shows a skeleton while the answer is on its way, then the card in its place", async () => {
      const pending = deferred<GetFleetProgressData>();
      requestMock.mockReturnValue(pending.promise);

      await render();

      expect(byTestId("fleet-progress-loading")).not.toBeNull();
      expect(byTestId("fleet-progress")).toBeNull();

      pending.resolve(answer([spotted("1", [KJL])]));
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(byTestId("fleet-progress")).not.toBeNull();
      });
      expect(byTestId("fleet-progress-loading")).toBeNull();
    });
  });

  describe("the card", () => {
    it.each([
      ["an empty list", []],
      ["vehicles on no line", [spotted("9", [])]],
    ])("renders nothing for %s, not a heading over nothing", async (_, vehicles) => {
      requestMock.mockResolvedValue(answer(vehicles));

      await render();

      expect(byTestId("fleet-progress")).toBeNull();
      expect(byTestId("fleet-progress-loading")).toBeNull();
      expect(root().textContent?.trim()).toBe("");
    });

    it("takes no box of its own, so an absent card leaves no gap in the page's flex column", async () => {
      requestMock.mockResolvedValue(answer([]));

      await render();

      expect(root().classList.contains("contents")).toBe(true);
    });

    it("renders one row per line, by line code, with its own count", async () => {
      requestMock.mockResolvedValue(
        answer([spotted("1", [KJL]), spotted("2", [KJL, AGL]), spotted("3", [AGL])]),
      );

      await render();

      expect(rowCodes()).toEqual(["LRT AGL", "LRT KJL"]);
      const counts = [...root().querySelectorAll('[data-testid="fleet-line-count"]')].map((el) =>
        el.textContent?.replace(/\s+/g, " ").trim(),
      );
      expect(counts).toEqual(["2 of 50 spotted", "2 of 116 spotted"]);
    });

    it("titles the card Fleet progress", async () => {
      requestMock.mockResolvedValue(answer([spotted("1", [KJL])]));

      await render();

      expect(root().querySelector("h2")?.textContent?.trim()).toContain("Fleet progress");
    });

    it("explains the metric from the methodology registry, from the card title", async () => {
      requestMock.mockResolvedValue(answer([spotted("1", [KJL])]));
      await render();

      const trigger = root().querySelector<HTMLButtonElement>("h2 button");
      expect(trigger?.getAttribute("aria-label")).toBe("What is Fleet progress?");
      trigger?.click();
      fixture.detectChanges();

      const panel = byTestId("fleet-progress-popover");
      expect(panel?.textContent).toContain(metricTooltip("fleet.progress"));
      expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#sightings");
    });

    it("says the card is private to the owner", async () => {
      requestMock.mockResolvedValue(answer([spotted("1", [KJL])]));

      await render();

      expect(root().textContent).toContain("Only you see this.");
    });
  });

  describe("when the read fails", () => {
    it("shows a retry banner for this card, and does not double-report a GraphQL error", async () => {
      requestMock.mockRejectedValue(new GraphQLRequestError([{ message: "boom" }]));

      await render();

      expect(root().querySelector("app-retry-banner")?.textContent).toContain(
        "Couldn't load your fleet progress.",
      );
      expect(byTestId("fleet-progress-loading")).toBeNull();
      // GraphQLClient has already toasted and reported a GraphQLRequestError.
      expect(handleErrorMock).not.toHaveBeenCalled();
    });

    it("reports an unexpected failure to the ErrorHandler and still shows the banner", async () => {
      const failure = new Error("Network down");
      requestMock.mockRejectedValue(failure);

      await render();

      expect(handleErrorMock).toHaveBeenCalledWith(failure);
      expect(root().querySelector("app-retry-banner")).not.toBeNull();
    });

    it("Try Now reads again and shows the card when it works", async () => {
      requestMock
        .mockRejectedValueOnce(new GraphQLRequestError([{ message: "boom" }]))
        .mockResolvedValueOnce(answer([spotted("1", [KJL])]));
      await render();

      root().querySelector<HTMLButtonElement>("app-retry-banner button")?.click();
      await flush();
      fixture.detectChanges();

      expect(byTestId("fleet-progress")).not.toBeNull();
      expect(root().querySelector("app-retry-banner")).toBeNull();
      expect(requestMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("a list that reaches the request's cap", () => {
    const vehicles = (count: number): FleetSpottedVehicle[] =>
      Array.from({ length: count }, (_, i) => spotted(String(i), [KJL]));

    it("is reported to Sentry, because the backend cuts at the cap without saying so", async () => {
      requestMock.mockResolvedValue(answer(vehicles(FLEET_FAVOURITES_COUNT)));

      await render();

      expect(handleErrorMock).toHaveBeenCalledTimes(1);
      const [error] = handleErrorMock.mock.calls[0] as [Error];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain("FLEET_FAVOURITES_COUNT");
      // The card still shows what it has.
      expect(rowCodes()).toEqual(["LRT KJL"]);
    });

    it("is not reported while there is room under the cap", async () => {
      requestMock.mockResolvedValue(answer(vehicles(FLEET_FAVOURITES_COUNT - 1)));

      await render();

      expect(handleErrorMock).not.toHaveBeenCalled();
    });
  });
});
