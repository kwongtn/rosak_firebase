import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { PLATFORM_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it } from "vitest";
import { MEDIA_YEAR_COUNTS_QUERY, MEDIAS_QUERY, MediasFeedQueryData } from "./data/gallery.queries";
import { GalleryPage } from "./gallery.page";

const NO_MEDIAS: MediasFeedQueryData = {
  medias: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, edges: [] },
};

describe("GalleryPage data requests", () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function create(platform: "browser" | "server"): ComponentFixture<GalleryPage> {
    TestBed.configureTestingModule({
      imports: [GalleryPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
      ],
    }).overrideComponent(GalleryPage, { set: { template: "", imports: [] } });
    const fixture = TestBed.createComponent(GalleryPage);
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  }

  it("does not ask for the year counts while server-rendering, only for the first photos", () => {
    create("server");
    const http = TestBed.inject(HttpTestingController);

    // SSR holds the response until every httpResource settles, so a slow aggregate for the
    // decorative year slider must never be requested on the server.
    http.expectNone((req) => req.body.query === MEDIA_YEAR_COUNTS_QUERY);
    http.expectOne((req) => req.body.query === MEDIAS_QUERY).flush({ data: NO_MEDIAS });
  });

  it("asks for the year counts in the browser", () => {
    create("browser");
    const http = TestBed.inject(HttpTestingController);

    http
      .expectOne((req) => req.body.query === MEDIA_YEAR_COUNTS_QUERY)
      .flush({ data: { mediasGroupByPeriod: [{ year: 2024, count: 3 }] } });
    http.expectOne((req) => req.body.query === MEDIAS_QUERY).flush({ data: NO_MEDIAS });
  });
});
