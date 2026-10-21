import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { PLATFORM_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_YEAR_COUNTS_QUERY,
  MEDIAS_QUERY,
  MediaNode,
  MediasFeedQueryData,
} from "./data/gallery.queries";
import { GalleryPage } from "./gallery.page";

const NO_MEDIAS: MediasFeedQueryData = {
  medias: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, edges: [] },
};

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

afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
});

describe("GalleryPage data requests", () => {
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

describe("GalleryPage year jump", () => {
  const node: MediaNode = {
    id: "m1",
    createdDate: "2024-05-12",
    width: 400,
    height: 300,
    file: { url: "https://i.imgur.com/m1.jpg" },
    uploader: { nickname: "spotter123" },
  };

  async function jumpTo2024(prefersReducedMotion: boolean): Promise<ReturnType<typeof vi.fn>> {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion") && prefersReducedMotion,
    }));
    const fixture = create("browser");
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((req) => req.body.query === MEDIA_YEAR_COUNTS_QUERY)
      .flush({ data: { mediasGroupByPeriod: [{ year: 2024, count: 1 }] } });
    http
      .expectOne((req) => req.body.query === MEDIAS_QUERY)
      .flush({
        data: {
          medias: {
            totalCount: 1,
            pageInfo: { hasNextPage: false, endCursor: null },
            edges: [{ cursor: "c1", node }],
          },
        },
      });
    const target = document.createElement("section");
    target.id = "gallery-year-2024";
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);

    await fixture.componentInstance.jumpToYear(2024);
    target.remove();
    return scrollIntoView;
  }

  it("scrolls smoothly to the year", async () => {
    const scrollIntoView = await jumpTo2024(false);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("jumps without animation when the visitor prefers reduced motion", async () => {
    const scrollIntoView = await jumpTo2024(true);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});
