import * as Sentry from "@sentry/angular";
import { TestBed } from "@angular/core/testing";
import { HttpClient } from "@angular/common/http";
import { throwError } from "rxjs";
import type JSZip from "jszip";
import { GtfsStaticService, StaticSource } from "./gtfs-static.service";

vi.mock("@sentry/angular", () => ({
  captureException: vi.fn(),
}));

describe("gtfs-static.service", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  describe("StaticSource.load (parse failure)", () => {
    it("routes parse errors to Sentry.captureException", async () => {
      const source = new StaticSource({ sourceUrl: "https://example.com/static.zip" });
      // A zip with no stops.txt throws inside the try, exercising the catch.
      const badZip = { file: () => null } as unknown as JSZip;
      await source.load(badZip);
      expect(Sentry.captureException).toHaveBeenCalled();
      const err = vi.mocked(Sentry.captureException).mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("GtfsStaticService.fetchAndLoad (fetch failure)", () => {
    it("routes fetch errors to Sentry.captureException", async () => {
      TestBed.configureTestingModule({
        providers: [
          GtfsStaticService,
          {
            provide: HttpClient,
            useValue: {
              get: () => throwError(() => new Error("network down")),
            },
          },
        ],
      });
      const service = TestBed.inject(GtfsStaticService);
      service.upsertSources({ rail: { sourceUrl: "https://example.com/static.zip" } });
      // fetchAndLoad is fire-and-forget; let its rejection reach the catch.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
