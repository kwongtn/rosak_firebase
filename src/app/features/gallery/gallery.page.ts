import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { injectIsBrowser } from "../../core/composables/is-browser";
import {
  GraphQLClient,
  GraphQLRequestError,
  graphqlResource,
} from "../../core/graphql/graphql-client";
import { resolveAdSlot } from "../../core/ads/ads.config";
import { ToastService } from "../../ui/toast/toast.service";
import { HlmButton } from "../../ui/button/button";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import {
  MEDIA_BY_ID_QUERY,
  MEDIA_YEAR_COUNTS_QUERY,
  MEDIAS_QUERY,
  MediaByIdQueryData,
  MediaByIdQueryVars,
  MediaNode,
  MediaYearCountsQueryData,
  MediasFeedQueryData,
  MediasFeedQueryVars,
} from "./data/gallery.queries";
import { getImgurThumbnail } from "./data/imgur.util";
import { mediaLabel } from "./data/media-label.util";
import { GalleryYearSliderComponent } from "./year-slider/gallery-year-slider.component";
import {
  JustifiedGridComponent,
  TARGET_ROW_HEIGHT,
} from "./justified-grid/justified-grid.component";
import { MediaViewerComponent } from "./media-viewer/media-viewer.component";

const PAGE_SIZE = 24;
/** The first photos are the page's LCP candidates, so they load eagerly (the very first at high
 * priority); everything after them stays lazy. */
const EAGER_IMAGE_COUNT = 4;
/** Relative widths for the initial-load skeleton, echoing the justified grid's own mix of
 * landscape/portrait/wide tiles (each row's numbers are flex-grow weights, not real aspect
 * ratios) so the loading state previews the real layout's character instead of a uniform grid —
 * and so there's no jarring reflow-of-shape once actual photos replace it. Fixed, not random:
 * this can render on the server, where a per-load-random pattern would mismatch on hydration. */
const SKELETON_ROWS: number[][] = [
  [1.6, 1, 2.2, 1.3],
  [1, 1.8, 1, 1.5, 1.1],
  [2, 1.2, 1.6, 1],
];
// Jumping to an old year has to walk every newer item first (no server-side year filter — see
// the rewrite notes in archive/frontend-map/gallery.md), which can genuinely be 1000+ photos deep
// for a popular year. A bigger page size here (vs. PAGE_SIZE's smaller, UI-friendly granularity)
// keeps the request count reasonable, and the delay between requests keeps this from reading as
// a burst/scrape against the real backend.
const JUMP_PAGE_SIZE = 100;
const JUMP_REQUEST_DELAY_MS = 200;
const MAX_JUMP_PAGES = 100;

/** What /gallery carries when no photo is open: the route's title (app.routes.ts) and the
 * site-wide share image from src/index.html, which an open photo overrides. */
const DEFAULT_TITLE = "MLPTF | Gallery";
const DEFAULT_SHARE_IMAGE = "https://community.mlptf.org.my/share-card.png";
const DEFAULT_IMAGE_ALT =
  "MLPTF: community-run Malaysian public transport spotting, tracking and incident log.";

interface YearGroup {
  year: number;
  items: MediaNode[];
}

/**
 * /gallery — community-submitted spotting photos. Ported from gallery.component.ts, but fixing
 * the one thing every prior doc pass and this rewrite plan flagged as the real problem: the old
 * page fetched every image that has ever existed in one request (`mediasGroupByPeriod` has no
 * pagination argument at all — see archive/frontend-map/gallery.md). This uses the `medias` Relay
 * connection instead, which is genuinely paginated, loading a reasonable first page and more
 * only on request.
 */
@Component({
  selector: "app-gallery",
  imports: [
    HlmButton,
    HlmSkeleton,
    AdSlotComponent,
    AppNavComponent,
    AppFooterComponent,
    GalleryYearSliderComponent,
    JustifiedGridComponent,
    MediaViewerComponent,
  ],
  templateUrl: "./gallery.page.html",
})
export class GalleryPage {
  /** Absent on the bare `/gallery` route (see app.routes.ts) — that's the closed state. */
  readonly mediaIdParam = input<string | undefined>(undefined, { alias: "mediaId" });

  private readonly isBrowser = injectIsBrowser();
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly skeletonRowHeight = TARGET_ROW_HEIGHT;
  protected readonly eagerImageCount = EAGER_IMAGE_COUNT;
  protected readonly selectedMedia = signal<MediaNode | null>(null);

  protected readonly footerEndSlotId = resolveAdSlot("footerEnd");
  protected readonly footerEndRightSlotId = resolveAdSlot("footerEndRight");
  /** Renders once, between the first and second year sections (see the @if ($index === 0)
   * block in the template) — below lg only, where it pairs with footerEnd for the page's
   * 2-unit density cap; on lg+ the sidebar unit replaces it (see gallerySidebarSlotId). */
  protected readonly galleryBetweenYearsSlotId = resolveAdSlot("galleryBetweenYears");
  /** Desktop-only (lg+) unit under the year slider in the right aside — mutually exclusive
   * with galleryBetweenYears by breakpoint so every page state shows exactly 2 units
   * (this + footerEnd). See the template comments for the full cap rule. */
  protected readonly gallerySidebarSlotId = resolveAdSlot("gallerySidebar");

  protected readonly edges = signal<MediasFeedQueryData["medias"]["edges"]>([]);
  protected readonly hasMore = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly isJumping = signal(false);
  protected readonly jumpTargetYear = signal<number | null>(null);

  /** Browser-only: SSR holds the response until an httpResource settles, and these counts feed
   * nothing but the year slider — the server HTML must not wait on an aggregate for it. The
   * slider fills in once the browser's own request lands (it reserves its space meanwhile). */
  private readonly yearCountsResource = graphqlResource<MediaYearCountsQueryData>(() =>
    this.isBrowser ? { query: MEDIA_YEAR_COUNTS_QUERY } : undefined,
  );
  protected readonly yearCounts = computed(() =>
    [...(this.yearCountsResource.data()?.mediasGroupByPeriod ?? [])].sort(
      (a, b) => b.year - a.year,
    ),
  );

  protected readonly yearGroups = computed<YearGroup[]>(() => {
    const groups: YearGroup[] = [];
    for (const edge of this.edges()) {
      // createdDate is YYYY-MM-DD; the labels format it in local time, so don't Date-parse (UTC).
      const year = Number(edge.node.createdDate.slice(0, 4));
      const last = groups.at(-1);
      if (last?.year === year) {
        last.items.push(edge.node);
      } else {
        groups.push({ year, items: [edge.node] });
      }
    }
    return groups;
  });

  private readonly _loadedYears = computed(() => new Set(this.yearGroups().map((g) => g.year)));

  constructor() {
    this.loadMore();
    // Keeps the open photo in sync with the URL both ways: a direct/shared link to
    // /gallery/:mediaId fetches that one photo and opens it, and Back/Forward closes or reopens
    // it to match. Opening/closing via the UI itself (onOpenMedia/onCloseMedia) sets
    // `selectedMedia` directly for instant feedback and navigates separately — by the time that
    // navigation lands here, `openMediaById`'s own already-open check makes this a no-op.
    effect(() => {
      const id = this.mediaIdParam();
      untracked(() => {
        if (id) {
          this.openMediaById(id);
        } else {
          this.selectedMedia.set(null);
        }
      });
    });
    // Share metadata for the open photo, so the server HTML of a shared link previews as that
    // photo. The cleanup puts the defaults back when the photo changes, the viewer closes or the
    // page is left. `mediaIdParam` is read only to re-run this once the router has landed the
    // navigation: it resets the title to the route's on every NavigationEnd, which can come after
    // the viewer opened from a click.
    effect((onCleanup) => {
      const media = this.selectedMedia();
      this.mediaIdParam();
      if (!media) {
        return;
      }
      this.setPhotoMeta(media);
      onCleanup(() => this.restoreDefaultMeta());
    });
  }

  private setPhotoMeta(media: MediaNode): void {
    const label = mediaLabel(media);
    const title = `MLPTF | ${label}`;
    this.title.setTitle(title);
    this.meta.updateTag({ property: "og:title", content: title });
    this.meta.updateTag({
      property: "og:description",
      content: `${label}. A community spotting photo on the MLPTF gallery.`,
    });
    // A photo without a file keeps the site-wide share image.
    if (media.file) {
      this.meta.updateTag({
        property: "og:image",
        content: getImgurThumbnail(media.file.url, "h"),
      });
      this.meta.updateTag({ property: "og:image:alt", content: label });
    }
  }

  /** index.html carries og:image and og:image:alt but no og:title or og:description, so closing
   * puts the first two back and removes the last two. */
  private restoreDefaultMeta(): void {
    this.title.setTitle(DEFAULT_TITLE);
    this.meta.updateTag({ property: "og:image", content: DEFAULT_SHARE_IMAGE });
    this.meta.removeTag('property="og:title"');
    this.meta.removeTag('property="og:description"');
    this.meta.updateTag({ property: "og:image:alt", content: DEFAULT_IMAGE_ALT });
  }

  protected onOpenMedia(media: MediaNode): void {
    this.selectedMedia.set(media);
    this.router.navigate(["/gallery", media.id]);
  }

  protected onCloseMedia(): void {
    this.selectedMedia.set(null);
    this.router.navigate(["/gallery"]);
  }

  private inFlightLoad: Promise<boolean> | undefined;

  /** Returns whether the load actually succeeded — callers that loop (jumpToYear) need to know
   * so they can stop instead of hammering a failing request repeatedly. Concurrent calls share
   * the same in-flight request rather than one bailing out with `false`: the constructor's own
   * initial load and a year jump clicked before it lands race by construction, and a bailed-out
   * `false` read as a real failure — which then gave up on a perfectly valid jump purely
   * because it arrived a moment before the first page had loaded. */
  async loadMore(pageSize = PAGE_SIZE): Promise<boolean> {
    if (this.inFlightLoad) {
      return this.inFlightLoad;
    }
    this.isLoading.set(true);
    this.inFlightLoad = (async () => {
      try {
        const after = this.edges().at(-1)?.cursor ?? null;
        const data = await this.graphql.request<MediasFeedQueryData, MediasFeedQueryVars>(
          MEDIAS_QUERY,
          {
            first: pageSize,
            after,
          },
        );
        this.hasMore.set(data.medias.pageInfo.hasNextPage);
        this.edges.update((list) => [...list, ...data.medias.edges]);
        return true;
      } catch (err) {
        this.toast.error(
          "Couldn't load photos",
          err instanceof Error ? err.message : "Unknown error",
        );
        return false;
      } finally {
        this.isLoading.set(false);
        this.inFlightLoad = undefined;
      }
    })();
    return this.inFlightLoad;
  }

  /** There's no server-side year filter (see class doc) — jumping to an unloaded year means
   * loading more pages, in `created` order, until we reach it or run out. */
  async jumpToYear(year: number): Promise<void> {
    this.jumpTargetYear.set(year);
    const { found, stoppedOnError } = await this.loadUntil(() => this._loadedYears().has(year));
    if (!found) {
      // loadMore() already toasted the specific error; only add a message for the
      // no-error case (genuinely ran out of pages, or hit the safety cap).
      if (!stoppedOnError) {
        this.toast.info("Still loading", `Keep clicking "Load more" — ${year} hasn't come up yet.`);
      }
      this.jumpTargetYear.set(null);
      return;
    }
    // A jump can take seconds; if the visitor left /gallery meanwhile, registering a render hook
    // on the destroyed view would throw NG0911.
    if (this.isBrowser && !this.destroyRef.destroyed) {
      // The year's section is rendered by the next change detection (a macrotask away when
      // zoneless), so scrolling any earlier finds nothing.
      afterNextRender(
        () => {
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          document
            .getElementById(`gallery-year-${year}`)
            ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        },
        { injector: this.injector },
      );
    }
  }

  /** Opens a shared /gallery/:mediaId link: the one photo is fetched by id and the viewer opens
   * the moment it arrives — on the server too, so the HTML of the link already holds the viewer —
   * while the feed loads on its own. A photo the feed already holds (Back/Forward) opens without
   * a request. Only a missing photo (null) always falls back to /gallery. A failed request does
   * too in the browser, but on the server it keeps the link: the gallery renders without the
   * viewer and the browser asks again on hydration. */
  private async openMediaById(id: string): Promise<void> {
    if (this.selectedMedia()?.id === id) {
      return;
    }
    const loaded = this.edges().find((e) => e.node.id === id);
    if (loaded) {
      this.selectedMedia.set(loaded.node);
      return;
    }
    let media: MediaNode | null = null;
    let failure: { error: unknown } | undefined;
    try {
      const data = await this.graphql.request<MediaByIdQueryData, MediaByIdQueryVars>(
        MEDIA_BY_ID_QUERY,
        { id },
      );
      media = data.media;
    } catch (error) {
      failure = { error };
    }
    if (this.mediaIdParam() !== id) {
      return; // the visitor moved on while it loaded
    }
    if (media) {
      this.selectedMedia.set(media);
      return;
    }
    if (failure && !this.isBrowser) {
      return;
    }
    // On the server nobody sees a toast (the redirect below answers the request) and it would only
    // pile up in the shared toast state, so — like GraphQLClient — toast in the browser only.
    if (this.isBrowser) {
      if (!failure) {
        this.toast.error(
          "Couldn't find that photo",
          "It may have been removed, or the link is out of date.",
        );
      } else if (!(failure.error instanceof GraphQLRequestError)) {
        // (GraphQLClient has already toasted a GraphQLRequestError.)
        this.toast.error(
          "Couldn't load that photo",
          failure.error instanceof Error ? failure.error.message : "Unknown error",
        );
      }
    }
    this.router.navigate(["/gallery"], { replaceUrl: true });
  }

  /** Pages through `medias` (in `created` order) until `isFound()` is satisfied or we run out —
   * the loop behind jumpToYear. `stoppedOnError` lets a caller skip its own "ran out" messaging
   * when `loadMore` has already toasted the real reason. */
  private async loadUntil(
    isFound: () => boolean,
  ): Promise<{ found: boolean; stoppedOnError: boolean }> {
    if (isFound()) {
      return { found: true, stoppedOnError: false };
    }
    this.isJumping.set(true);
    let pagesLoaded = 0;
    let stoppedOnError = false;
    while (!isFound() && this.hasMore() && pagesLoaded < MAX_JUMP_PAGES) {
      if (!(await this.loadMore(JUMP_PAGE_SIZE))) {
        stoppedOnError = true;
        break;
      }
      pagesLoaded++;
      if (!isFound() && this.hasMore()) {
        await new Promise((resolve) => setTimeout(resolve, JUMP_REQUEST_DELAY_MS));
      }
    }
    this.isJumping.set(false);
    return { found: isFound(), stoppedOnError };
  }
}
