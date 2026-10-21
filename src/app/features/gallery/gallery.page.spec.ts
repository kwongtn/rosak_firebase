import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA, ErrorHandler, PLATFORM_ID } from "@angular/core";
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

/** The site-wide share tags src/index.html carries, which an open photo overrides and closing the
 * viewer must put back. There is deliberately no og:title or og:description. */
const DEFAULT_IMAGE = "https://community.mlptf.org.my/share-card.png";
const DEFAULT_IMAGE_ALT =
  "MLPTF: community-run Malaysian public transport spotting, tracking and incident log.";
const INDEX_HTML_TAGS: Record<string, string>[] = [
  { property: "og:site_name", content: "MLPTF" },
  { property: "og:type", content: "website" },
  { property: "og:image", content: DEFAULT_IMAGE },
  { property: "og:image:alt", content: DEFAULT_IMAGE_ALT },
  { name: "twitter:card", content: "summary_large_image" },
];

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
  // Start each test from what index.html serves, so a tag the page wrongly deletes shows up.
  document.head
    .querySelectorAll('meta[property^="og:"], meta[name="twitter:card"]')
    .forEach((tag) => {
      tag.remove();
    });
  for (const attrs of INDEX_HTML_TAGS) {
    const tag = document.createElement("meta");
    for (const [name, value] of Object.entries(attrs)) {
      tag.setAttribute(name, value);
    }
    document.head.appendChild(tag);
  }
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

  it("does not throw or scroll when the visitor left the page while the jump was loading", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const fixture = create("browser");
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((req) => req.body.query === MEDIA_YEAR_COUNTS_QUERY)
      .flush({ data: { mediasGroupByPeriod: [] } });
    http.expectOne((req) => req.body.query === MEDIAS_QUERY).flush(feedOf([node], true));
    await settle(fixture); // the first page's load is over, so the jump asks for its own page
    const target = document.createElement("section");
    target.id = "gallery-year-2023";
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);

    const jump = fixture.componentInstance.jumpToYear(2023);
    const nextPage = http.expectOne((req) => req.body.query === MEDIAS_QUERY);
    fixture.destroy(); // a nav link was clicked; GalleryPage is not a reuse route
    nextPage.flush(feedOf([{ ...node, id: "m0", createdDate: "2023-06-01" }]));

    // afterNextRender on the destroyed view's injector would throw NG0911 here.
    await expect(jump).resolves.toBeUndefined();
    TestBed.tick();
    target.remove();
    expect(scrollIntoView).not.toHaveBeenCalled();
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

/** A page of the feed. `offset` is how many rows came before it, so its cursors go on from there. */
function feedOf(
  nodes: MediaNode[],
  hasNextPage = false,
  offset = 0,
): { data: MediasFeedQueryData } {
  return {
    data: {
      medias: {
        totalCount: nodes.length,
        pageInfo: { hasNextPage, endCursor: nodes.length ? `c${offset + nodes.length}` : null },
        edges: nodes.map((node, i) => ({ cursor: `c${offset + i + 1}`, node })),
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

/** The Sentry-backed handler in the app; a spy here so a reported error does not rethrow. */
function spyErrorHandler() {
  return vi.spyOn(TestBed.inject(ErrorHandler), "handleError").mockImplementation(() => {});
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
    const handleError = spyErrorHandler();

    mediaByIdRequest().flush({ data: { media: null } });
    feedRequest().flush({ data: NO_MEDIAS });
    await settle(fixture);

    expect(navigate).toHaveBeenCalledWith(["/gallery"], { replaceUrl: true });
    expect(toast).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled(); // a missing photo is not an error
  });

  it("falls back to /gallery with one toast when the backend answers with a GraphQL error", async () => {
    const toast = vi.spyOn(ToastService.prototype, "error").mockImplementation(() => {});
    const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
    const fixture = createPage("browser", "broken");
    answerYearCounts();

    mediaByIdRequest().flush({ data: null, errors: [{ message: "boom" }] });
    feedRequest().flush({ data: NO_MEDIAS });
    await settle(fixture);

    // GraphQLClient has already toasted it; the page must not add a second one.
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("GraphQL Error", "boom");
    expect(navigate).toHaveBeenCalledWith(["/gallery"], { replaceUrl: true });
    expect(viewerOf(fixture)).toBeNull();
  });

  it("falls back to /gallery with an error toast when the request itself fails", async () => {
    const toast = vi.spyOn(ToastService.prototype, "error").mockImplementation(() => {});
    const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
    const fixture = createPage("browser", "broken");
    answerYearCounts();

    mediaByIdRequest().flush("down", { status: 503, statusText: "Service Unavailable" });
    feedRequest().flush({ data: NO_MEDIAS });
    await settle(fixture);

    expect(toast).toHaveBeenCalledTimes(1);
    // An HttpErrorResponse is not an Error, so it must not read "Unknown error".
    expect(toast).toHaveBeenCalledWith(
      "Couldn't load that photo",
      "Check your connection and try again.",
    );
    expect(navigate).toHaveBeenCalledWith(["/gallery"], { replaceUrl: true });
    expect(viewerOf(fixture)).toBeNull();
  });

  it.each([
    ["a 5xx", (req: TestRequest) => req.flush("down", { status: 502, statusText: "Bad Gateway" })],
    ["a timeout", (req: TestRequest) => req.error(new ProgressEvent("timeout"))],
    [
      "a GraphQL error",
      (req: TestRequest) => req.flush({ data: null, errors: [{ message: "boom" }] }),
    ],
  ])(
    "renders the gallery without the viewer, reports the failure and does not navigate when the server hits %s",
    async (_name, fail) => {
      const toast = vi.spyOn(ToastService.prototype, "error").mockImplementation(() => {});
      const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = createPage("server", "m1");
      const handleError = spyErrorHandler();

      fail(mediaByIdRequest());
      feedRequest().flush(feedOf([PHOTO]));
      await settle(fixture);

      // Not "no such photo": no redirect to /gallery. After a 5xx or timeout the browser asks
      // again on hydration; a GraphQL errors answer is an HTTP 200 the transfer cache replays, so
      // the browser then fails the same way. GraphQLClient only reports in the browser, so the
      // page must hand the server-side failure to the ErrorHandler itself.
      expect(handleError).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      expect(viewerOf(fixture)).toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector("app-justified-grid"),
      ).not.toBeNull();
    },
  );

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
    expect(tag('property="og:image:alt"')).toBe(DEFAULT_IMAGE_ALT);
  });

  it("puts the defaults back when the page is left with the viewer open", async () => {
    const fixture = await openPhoto("browser");

    fixture.destroy();

    expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Gallery");
    expect(tag('property="og:image"')).toBe(DEFAULT_IMAGE);
    expect(tag('property="og:image:alt"')).toBe(DEFAULT_IMAGE_ALT);
    expect(tag('property="og:title"')).toBeUndefined();
    expect(tag('property="og:description"')).toBeUndefined();
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
    expect(tag('property="og:image"')).toBe(DEFAULT_IMAGE);
    expect(tag('property="og:image:alt"')).toBe(DEFAULT_IMAGE_ALT);
  });
});

describe("GalleryPage photo viewer navigation", () => {
  function photoOf(id: string, nickname: string): MediaNode {
    return {
      ...PHOTO,
      id,
      uploader: { nickname },
      file: { url: `https://i.imgur.com/${id}.jpg` },
    };
  }
  const P1 = photoOf("p1", "alpha");
  const P2 = photoOf("p2", "bravo");
  const P3 = photoOf("p3", "charlie");

  afterEach(() => {
    Reflect.deleteProperty(navigator, "share");
  });

  function control(fixture: ComponentFixture<GalleryPage>, name: string): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `[data-testid="media-viewer-${name}"]`,
    )!;
  }

  function shownImage(fixture: ComponentFixture<GalleryPage>): string | null | undefined {
    return viewerOf(fixture)?.querySelector("img")?.getAttribute("src");
  }

  function tag(selector: string): string | undefined {
    return TestBed.inject(Meta).getTag(selector)?.content;
  }

  function noFeedRequest(): void {
    TestBed.inject(HttpTestingController).expectNone((req) => req.body.query === MEDIAS_QUERY);
  }

  /** The page with `nodes` loaded and the viewer open on one of them, the way Back/Forward onto
   * /gallery/:id opens a photo the feed already holds. */
  async function openFromFeed(
    nodes: MediaNode[],
    openId: string,
    hasNextPage = false,
    platform: "browser" | "server" = "browser",
  ): Promise<ComponentFixture<GalleryPage>> {
    const fixture = createPage(platform);
    if (platform === "browser") {
      answerYearCounts();
    }
    feedRequest().flush(feedOf(nodes, hasNextPage));
    await settle(fixture);
    fixture.componentRef.setInput("mediaId", openId);
    await settle(fixture);
    return fixture;
  }

  async function click(fixture: ComponentFixture<GalleryPage>, name: string): Promise<void> {
    control(fixture, name).click();
    await settle(fixture);
  }

  describe("stepping", () => {
    it("opens the next and previous photo, replacing the URL so Back still returns to the grid", async () => {
      const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2, P3], "p2");
      expect(shownImage(fixture)).toBe(P2.file!.url);

      await click(fixture, "next");
      expect(shownImage(fixture)).toBe(P3.file!.url);
      expect(navigate).toHaveBeenLastCalledWith(["/gallery", "p3"], { replaceUrl: true });

      await click(fixture, "prev");
      await click(fixture, "prev");
      expect(shownImage(fixture)).toBe(P1.file!.url);
      expect(navigate).toHaveBeenLastCalledWith(["/gallery", "p1"], { replaceUrl: true });
      // Every step replaced; none pushed a history entry of its own.
      expect(navigate).toHaveBeenCalledTimes(3);
      expect(navigate.mock.calls.every(([, extras]) => extras?.replaceUrl === true)).toBe(true);
    });

    it("steps on the arrow keys too", async () => {
      const navigate = vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2, P3], "p2");

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      await settle(fixture);
      expect(shownImage(fixture)).toBe(P3.file!.url);

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
      await settle(fixture);
      expect(shownImage(fixture)).toBe(P2.file!.url);
      expect(navigate).toHaveBeenLastCalledWith(["/gallery", "p2"], { replaceUrl: true });
    });

    it("gives the viewer no photo before the first or after the last one", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2], "p1");

      expect(control(fixture, "prev").getAttribute("aria-disabled")).toBe("true");
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("false");

      await click(fixture, "next");
      expect(control(fixture, "prev").getAttribute("aria-disabled")).toBe("false");
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("true");
    });

    it("puts the photo it steps to into the title and the share tags, as opening one does", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2, P3], "p2");
      expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Photo by bravo, 12 May 2024");

      await click(fixture, "next");

      expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Photo by charlie, 12 May 2024");
      expect(tag('property="og:title"')).toBe("MLPTF | Photo by charlie, 12 May 2024");
      expect(tag('property="og:image"')).toBe("https://i.imgur.com/p3h.jpg");
      expect(tag('property="og:image:alt"')).toBe("Photo by charlie, 12 May 2024");
    });

    it("puts the defaults back when the viewer is closed after stepping", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2, P3], "p2");
      await click(fixture, "next");

      fixture.componentRef.setInput("mediaId", undefined);
      await settle(fixture);

      expect(viewerOf(fixture)).toBeNull();
      expect(TestBed.inject(Title).getTitle()).toBe("MLPTF | Gallery");
      expect(tag('property="og:image"')).toBe(DEFAULT_IMAGE);
      expect(tag('property="og:title"')).toBeUndefined();
    });

    it("shows a photo once that the next page repeats, which the backend's untied order can do at a page boundary", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2], "p2", true);
      // The next page starts with the last photo of the one before it (as on the dev data).
      feedRequest().flush(feedOf([P2, P3], false, 2));
      await settle(fixture);

      const grid = (fixture.nativeElement as HTMLElement).querySelectorAll(
        "app-justified-grid button",
      );
      expect(Array.from(grid, (tile) => tile.getAttribute("aria-label"))).toEqual([
        "Photo by alpha, 12 May 2024",
        "Photo by bravo, 12 May 2024",
        "Photo by charlie, 12 May 2024",
      ]);
      // And the viewer steps from the open photo to the next one, not to itself.
      await click(fixture, "next");
      expect(shownImage(fixture)).toBe(P3.file!.url);
      await click(fixture, "prev");
      expect(shownImage(fixture)).toBe(P2.file!.url);
      await click(fixture, "prev");
      expect(shownImage(fixture)).toBe(P1.file!.url);
    });

    it("offers no neighbours for a shared photo the feed has not reached", async () => {
      const fixture = createPage("browser", "p9");
      answerYearCounts();
      mediaByIdRequest().flush({ data: { media: photoOf("p9", "zulu") } });
      feedRequest().flush(feedOf([P1, P2], true));
      await settle(fixture);

      expect(viewerOf(fixture)).not.toBeNull();
      expect(control(fixture, "prev")).toBeNull();
      expect(control(fixture, "next")).toBeNull();
      // Not in the feed, so it is not at the feed's end either: no page is fetched for it.
      noFeedRequest();
    });
  });

  describe("at the end of what is loaded", () => {
    it("fetches the next page and then offers its first photo", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2], "p2", true);

      const more = feedRequest();
      expect(more.request.body.variables).toEqual({ first: 24, after: "c2" });
      // Nothing to go to until it lands.
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("true");
      more.flush(feedOf([P3]));
      await settle(fixture);

      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("false");
      await click(fixture, "next");
      expect(shownImage(fixture)).toBe(P3.file!.url);
      noFeedRequest(); // that was the last page
    });

    it("goes on from where a page of nothing but repeats ended, not from the last photo it kept", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const fixture = await openFromFeed([P1, P2], "p2", true);

      // The page after is only a repeat of what is loaded: nothing to add, and more to come.
      const repeats = feedRequest();
      expect(repeats.request.body.variables).toEqual({ first: 24, after: "c2" });
      repeats.flush(feedOf([P2], true, 2));
      await settle(fixture);
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("true");

      // Off the last photo and back asks again. From c2 that would bring the same repeat for good.
      await click(fixture, "prev");
      await click(fixture, "next");
      const more = feedRequest();
      expect(more.request.body.variables).toEqual({ first: 24, after: "c3" });
      more.flush(feedOf([P3], false, 3));
      await settle(fixture);
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("false");
    });

    it("fetches it for a shared photo that turns out to be the last one the feed loaded", async () => {
      const fixture = createPage("browser", "p2");
      answerYearCounts();
      mediaByIdRequest().flush({ data: { media: P2 } });
      feedRequest().flush(feedOf([P1, P2], true));
      await settle(fixture);

      const more = feedRequest();
      expect(more.request.body.variables).toEqual({ first: 24, after: "c2" });
      more.flush(feedOf([P3]));
      await settle(fixture);
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("false");
    });

    it("does not fetch when the feed has no more photos", async () => {
      const fixture = await openFromFeed([P1, P2], "p2", false);

      noFeedRequest();
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("true");
    });

    it("does not fetch while the open photo has a next one", async () => {
      await openFromFeed([P1, P2, P3], "p2", true);

      noFeedRequest();
    });

    it("does not fetch on the server, where nobody can step", async () => {
      await openFromFeed([P1, P2], "p2", true, "server");

      noFeedRequest();
    });

    it("does not retry a failed page by itself, and tries again when the visitor next opens that photo", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const toast = vi.spyOn(ToastService.prototype, "error").mockImplementation(() => {});
      const fixture = await openFromFeed([P1, P2], "p2", true);

      feedRequest().flush("down", { status: 503, statusText: "Service Unavailable" });
      await settle(fixture);
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast.mock.calls[0][0]).toBe("Couldn't load photos");
      // The failure leaves everything the effect reads as it was: it must not run again.
      await new Promise((resolve) => setTimeout(resolve, 50));
      noFeedRequest();

      await click(fixture, "prev");
      await click(fixture, "next");
      feedRequest().flush(feedOf([P3]));
      await settle(fixture);
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("false");
    });

    it("does not loop when the next page comes back empty yet claims there is more", async () => {
      const fixture = await openFromFeed([P1, P2], "p2", true);

      feedRequest().flush(feedOf([], true));
      await settle(fixture);
      await new Promise((resolve) => setTimeout(resolve, 50));

      noFeedRequest();
      expect(control(fixture, "next").getAttribute("aria-disabled")).toBe("true");
    });
  });

  describe("sharing", () => {
    // The share sheet is what a phone gets: a coarse primary pointer (a desktop copies the link).
    beforeEach(() => {
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)" }));
    });

    it("shares the open photo's own page, and follows the viewer as it steps", async () => {
      vi.spyOn(Router.prototype, "navigate").mockResolvedValue(true);
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { configurable: true, value: share });
      const fixture = await openFromFeed([P1, P2, P3], "p2");

      control(fixture, "share").click();
      await click(fixture, "next");
      control(fixture, "share").click();

      expect(share.mock.calls).toEqual([
        [{ url: `${window.location.origin}/gallery/p2`, title: "Photo by bravo, 12 May 2024" }],
        [{ url: `${window.location.origin}/gallery/p3`, title: "Photo by charlie, 12 May 2024" }],
      ]);
    });

    it("escapes an id the way the address bar does, so the link opens the same photo", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { configurable: true, value: share });
      const relayId = "TWVkaWE6MQ==/+";
      const fixture = await openFromFeed([photoOf(relayId, "alpha")], relayId);

      control(fixture, "share").click();

      const { url } = share.mock.calls[0][0] as { url: string };
      expect(new URL(url).origin).toBe(window.location.origin);
      const segments = new URL(url).pathname.split("/");
      expect(segments.slice(0, 2)).toEqual(["", "gallery"]);
      expect(segments).toHaveLength(3);
      expect(decodeURIComponent(segments[2])).toBe(relayId);
    });

    it.each(["server", "browser"] as const)(
      "has the Share button in the viewer a shared link opens on the %s",
      async (platform) => {
        const fixture = createPage(platform, "p1");
        if (platform === "browser") {
          answerYearCounts();
        }
        mediaByIdRequest().flush({ data: { media: P1 } });
        feedRequest().flush({ data: NO_MEDIAS });
        await settle(fixture);

        expect(control(fixture, "share")).not.toBeNull();
      },
    );
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

describe("GalleryPage year grouping", () => {
  // The type-check has no Node types; the runner is Node, where assigning TZ moves the local zone.
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
    .process.env;
  const originalTz = env["TZ"];

  afterEach(() => {
    if (originalTz === undefined) {
      delete env["TZ"];
    } else {
      env["TZ"] = originalTz;
    }
  });

  it("groups a photo by the year in its date, whatever the time zone", async () => {
    // A UTC-parsed "2024-01-01" is still 31 Dec 2023 anywhere west of Greenwich.
    env["TZ"] = "America/New_York";
    const fixture = createPage("browser");
    answerYearCounts();
    feedRequest().flush(
      feedOf([
        { ...PHOTO, id: "a", createdDate: "2024-01-01" },
        { ...PHOTO, id: "b", createdDate: "2023-12-31" },
      ]),
    );
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("#gallery-year-2024")).not.toBeNull();
    expect(root.querySelector("#gallery-year-2023")).not.toBeNull();
  });
});
