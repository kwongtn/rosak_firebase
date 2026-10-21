import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA, PLATFORM_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Meta, Title } from "@angular/platform-browser";
import { provideRouter, Router } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { ToastService } from "../../ui/toast/toast.service";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import {
  MEDIA_BY_ID_QUERY,
  MEDIA_YEAR_COUNTS_QUERY,
  MEDIAS_QUERY,
  MediaNode,
  MediasFeedQueryData,
} from "./data/gallery.queries";
import { GalleryPage } from "./gallery.page";

const NO_MEDIAS: MediasFeedQueryData = {
  medias: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, edges: [] },
};

const PHOTO_URL = "https://i.imgur.com/m1.jpg";
const PHOTO: MediaNode = {
  id: "m1",
  createdDate: "2024-05-12",
  width: 400,
  height: 300,
  file: { url: PHOTO_URL },
  uploader: { nickname: "spotter123" },
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

beforeEach(() => {
  // The head is shared by every test in the file; a photo's share tags must not leak into the next.
  document.head
    .querySelectorAll('meta[property^="og:"], meta[name="twitter:card"]')
    .forEach((tag) => {
      tag.remove();
    });
  document.title = "";
});

afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  const node = PHOTO;

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
    TestBed.tick(); // the scroll waits for the next render
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

/** The page's real template, minus the shell and ad children (they pull in live services). */
function createPage(
  platform: "browser" | "server",
  mediaId?: string,
): ComponentFixture<GalleryPage> {
  TestBed.configureTestingModule({
    imports: [GalleryPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: platform },
    ],
  }).overrideComponent(GalleryPage, {
    remove: { imports: [AppNavComponent, AppFooterComponent, AdSlotComponent] },
    add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
  });
  // The router binds the route param to this input before the first change detection.
  const fixture = TestBed.createComponent(GalleryPage);
  if (mediaId) {
    fixture.componentRef.setInput("mediaId", mediaId);
  }
  fixture.detectChanges();
  TestBed.tick();
  return fixture;
}

/** Lets the awaits in the page finish, then renders. Not `fixture.whenStable()`: that would wait
 * for the requests still open in the test, which only the test itself can answer. */
async function settle(fixture: ComponentFixture<GalleryPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  TestBed.tick();
}

function feedOf(nodes: MediaNode[], hasNextPage = false): { data: MediasFeedQueryData } {
  return {
    data: {
      medias: {
        totalCount: nodes.length,
        pageInfo: { hasNextPage, endCursor: nodes.length ? `c${nodes.length}` : null },
        edges: nodes.map((node, i) => ({ cursor: `c${i + 1}`, node })),
      },
    },
  };
}

function answerYearCounts(): void {
  TestBed.inject(HttpTestingController)
    .expectOne((req) => req.body.query === MEDIA_YEAR_COUNTS_QUERY)
    .flush({ data: { mediasGroupByPeriod: [] } });
}

function mediaByIdRequest() {
  return TestBed.inject(HttpTestingController).expectOne(
    (req) => req.body.query === MEDIA_BY_ID_QUERY,
  );
}

function feedRequest() {
  return TestBed.inject(HttpTestingController).expectOne((req) => req.body.query === MEDIAS_QUERY);
}

function viewerOf(fixture: ComponentFixture<GalleryPage>): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector("app-media-viewer");
}

describe("GalleryPage deep link", () => {
  it("fetches the one photo and opens the viewer before the feed answers, without paging", async () => {
    const fixture = createPage("server", PHOTO.id);

    const media = mediaByIdRequest();
    expect(media.request.body.variables).toEqual({ id: PHOTO.id });
    media.flush({ data: { media: PHOTO } });
    await settle(fixture);

    // The feed is still in flight and the viewer is already open — on the server platform too, so
    // the HTML of a shared link carries the viewer.
    expect(viewerOf(fixture)?.querySelector("img")?.getAttribute("src")).toBe(PHOTO_URL);

    const feed = feedRequest();
    expect(feed.request.body.variables).toEqual({ first: 24, after: null });
    feed.flush(feedOf([], true));
    await settle(fixture);

    // The old walk asked for the next 100-photo page 200 ms after each answer; wait that out.
    await new Promise((resolve) => setTimeout(resolve, 250));
    TestBed.inject(HttpTestingController).expectNone((req) => req.body.query === MEDIAS_QUERY);
    expect(viewerOf(fixture)).not.toBeNull();
  });

  it("shows the not-found toast and falls back to /gallery when there is no such photo", async () => {
    const toast = vi.spyOn(ToastService.prototype, "error").mockImplementation(() => {});
    const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
    const fixture = createPage("browser", "gone");
    answerYearCounts();

    mediaByIdRequest().flush({ data: { media: null } });
    feedRequest().flush({ data: NO_MEDIAS });
    await settle(fixture);

    expect(toast).toHaveBeenCalledWith(
      "Couldn't find that photo",
      "It may have been removed, or the link is out of date.",
    );
    expect(navigate).toHaveBeenCalledWith(["/gallery"], { replaceUrl: true });
    expect(viewerOf(fixture)).toBeNull();
    // No walk: the feed was asked for once, at its normal page size.
    TestBed.inject(HttpTestingController).expectNone((req) => req.body.query === MEDIAS_QUERY);
  });

  it("redirects without a toast when the server finds no such photo", async () => {
    const toast = vi.spyOn(ToastService.prototype, "error").mockImplementation(() => {});
    const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
    const fixture = createPage("server", "gone");

    mediaByIdRequest().flush({ data: { media: null } });
    feedRequest().flush({ data: NO_MEDIAS });
    await settle(fixture);

    expect(navigate).toHaveBeenCalledWith(["/gallery"], { replaceUrl: true });
    expect(toast).not.toHaveBeenCalled();
  });

  it("falls back to /gallery with an error toast when the request fails", async () => {
    const toast = vi.spyOn(ToastService.prototype, "error").mockImplementation(() => {});
    const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
    const fixture = createPage("browser", "broken");
    answerYearCounts();

    mediaByIdRequest().flush({ data: null, errors: [{ message: "boom" }] });
    feedRequest().flush({ data: NO_MEDIAS });
    await settle(fixture);

    expect(toast).toHaveBeenCalledWith("Couldn't load that photo", "boom");
    expect(toast).not.toHaveBeenCalledWith("Couldn't find that photo", expect.anything());
    expect(navigate).toHaveBeenCalledWith(["/gallery"], { replaceUrl: true });
    expect(viewerOf(fixture)).toBeNull();
  });

  it("opens a photo the feed already holds without asking for it again", async () => {
    const fixture = createPage("browser");
    answerYearCounts();
    feedRequest().flush(feedOf([PHOTO]));
    await settle(fixture);
    expect(viewerOf(fixture)).toBeNull();

    // Back/Forward onto /gallery/m1.
    fixture.componentRef.setInput("mediaId", PHOTO.id);
    await settle(fixture);

    TestBed.inject(HttpTestingController).expectNone((req) => req.body.query === MEDIA_BY_ID_QUERY);
    expect(viewerOf(fixture)?.querySelector("img")?.getAttribute("src")).toBe(PHOTO_URL);
  });

  it("does not open a photo after the visitor has left its link", async () => {
    const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
    const fixture = createPage("server", PHOTO.id);
    const media = mediaByIdRequest();
    feedRequest().flush({ data: NO_MEDIAS });

    fixture.componentRef.setInput("mediaId", undefined);
    await settle(fixture);
    media.flush({ data: { media: PHOTO } });
    await settle(fixture);

    expect(viewerOf(fixture)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("GalleryPage share metadata", () => {
  const DEFAULT_IMAGE = "https://community.mlptf.org.my/share-card.png";

  function tag(selector: string): string | undefined {
    return TestBed.inject(Meta).getTag(selector)?.content;
  }

  async function openPhoto(
    platform: "browser" | "server",
    photo: MediaNode = PHOTO,
  ): Promise<ComponentFixture<GalleryPage>> {
    const fixture = createPage(platform, photo.id);
    if (platform === "browser") {
      answerYearCounts();
    }
    mediaByIdRequest().flush({ data: { media: photo } });
    feedRequest().flush({ data: NO_MEDIAS });
    await settle(fixture);
    return fixture;
  }

  it.each(["server", "browser"] as const)(
    "gives the open photo its own title and share tags on the %s",
    async (platform) => {
      await openPhoto(platform);

      const label = "Photo by spotter123, 12 May 2024";
      expect(TestBed.inject(Title).getTitle()).toBe(`MLPTF | ${label}`);
      expect(tag('property="og:title"')).toBe(`MLPTF | ${label}`);
      expect(tag('property="og:description"')).toContain(label);
      // The large Imgur size, not the 'm' the grid uses and not the original.
      expect(tag('property="og:image"')).toBe("https://i.imgur.com/m1h.jpg");
      expect(tag('property="og:image:alt"')).toBe(label);
      expect(tag('name="twitter:card"')).toBe("summary_large_image");
    },
  );

  it("puts the defaults back when the viewer closes", async () => {
    const fixture = await openPhoto("browser");

    fixture.componentRef.setInput("mediaId", undefined);
    await settle(fixture);

    expect(viewerOf(fixture)).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Gallery");
    expect(tag('property="og:image"')).toBe(DEFAULT_IMAGE);
    expect(tag('name="twitter:card"')).toBe("summary_large_image");
    expect(tag('property="og:title"')).toBeUndefined();
    expect(tag('property="og:description"')).toBeUndefined();
    expect(tag('property="og:image:alt"')).toBeUndefined();
  });

  it("puts the defaults back when the page is left with the viewer open", async () => {
    const fixture = await openPhoto("browser");

    fixture.destroy();

    expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Gallery");
    expect(tag('property="og:image"')).toBe(DEFAULT_IMAGE);
    expect(tag('property="og:title"')).toBeUndefined();
  });

  it("switches the tags to the next photo", async () => {
    const other: MediaNode = { ...PHOTO, id: "m2", file: { url: "https://i.imgur.com/m2.png" } };
    const fixture = await openPhoto("browser");

    // Forward/Back between two photos the feed would hold; here the second is fetched by id.
    fixture.componentRef.setInput("mediaId", other.id);
    await settle(fixture);
    mediaByIdRequest().flush({ data: { media: other } });
    await settle(fixture);

    expect(tag('property="og:image"')).toBe("https://i.imgur.com/m2h.png");
  });

  it("keeps the site-wide share image for a photo without a file", async () => {
    await openPhoto("server", { ...PHOTO, file: null });

    expect(tag('property="og:title"')).toBe("MLPTF | Photo by spotter123, 12 May 2024");
    expect(tag('property="og:image"')).toBeUndefined();
    expect(tag('property="og:image:alt"')).toBeUndefined();
  });
});

describe("GalleryPage year jump progress", () => {
  const OLD_PHOTO: MediaNode = { ...PHOTO, id: "m0", createdDate: "2023-03-01" };

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("shows a loading indicator naming the year while the jump pages through the feed", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    Element.prototype.scrollIntoView = vi.fn(); // jsdom has none
    const fixture = createPage("browser");
    const root = fixture.nativeElement as HTMLElement;
    const indicator = () => root.querySelector('[data-testid="gallery-jump-loading"]');
    answerYearCounts();
    feedRequest().flush(feedOf([PHOTO], true));
    await settle(fixture);
    // The status region is always there, so the text is announced when it appears.
    expect(root.querySelector('[role="status"]')).not.toBeNull();
    expect(indicator()).toBeNull();

    const jump = fixture.componentInstance.jumpToYear(2023);
    const nextPage = feedRequest();
    expect(nextPage.request.body.variables).toEqual({ first: 100, after: "c1" });
    fixture.detectChanges();
    expect(indicator()?.textContent?.trim()).toBe("Loading 2023…");

    nextPage.flush(feedOf([OLD_PHOTO]));
    await jump;
    fixture.detectChanges();
    expect(indicator()).toBeNull();
  });

  it("scrolls to a year that was not loaded when the jump started, once it has rendered", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView; // jsdom has none
    const fixture = createPage("browser");
    answerYearCounts();
    feedRequest().flush(feedOf([PHOTO], true));
    await settle(fixture);
    expect(document.getElementById("gallery-year-2023")).toBeNull();

    const jump = fixture.componentInstance.jumpToYear(2023);
    feedRequest().flush(feedOf([OLD_PHOTO]));
    await jump;
    // The section only exists after the next render, so nothing may have scrolled yet.
    expect(scrollIntoView).not.toHaveBeenCalled();
    fixture.detectChanges();
    TestBed.tick();

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect((scrollIntoView.mock.contexts[0] as Element).id).toBe("gallery-year-2023");
  });
});
