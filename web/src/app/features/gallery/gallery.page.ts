import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { Router } from "@angular/router";
import { GraphQLClient, graphqlResource } from "../../core/graphql/graphql-client";
import { ToastService } from "../../ui/toast/toast.service";
import { HlmButton } from "../../ui/button/button";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import {
    MEDIA_YEAR_COUNTS_QUERY,
    MEDIAS_QUERY,
    MediaNode,
    MediaYearCountsQueryData,
    MediasFeedQueryData,
    MediasFeedQueryVars,
} from "./data/gallery.queries";
import { GalleryYearSliderComponent } from "./year-slider/gallery-year-slider.component";
import { JustifiedGridComponent, TARGET_ROW_HEIGHT } from "./justified-grid/justified-grid.component";
import { MediaViewerComponent } from "./media-viewer/media-viewer.component";

const PAGE_SIZE = 24;
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
// the rewrite notes in docs/frontend-map/gallery.md), which can genuinely be 1000+ photos deep
// for a popular year. A bigger page size here (vs. PAGE_SIZE's smaller, UI-friendly granularity)
// keeps the request count reasonable, and the delay between requests keeps this from reading as
// a burst/scrape against the real backend.
const JUMP_PAGE_SIZE = 100;
const JUMP_REQUEST_DELAY_MS = 200;
const MAX_JUMP_PAGES = 100;

interface YearGroup {
    year: number;
    items: MediaNode[];
}

/**
 * /gallery — community-submitted spotting photos. Ported from gallery.component.ts, but fixing
 * the one thing every prior doc pass and this rewrite plan flagged as the real problem: the old
 * page fetched every image that has ever existed in one request (`mediasGroupByPeriod` has no
 * pagination argument at all — see docs/frontend-map/gallery.md). This uses the `medias` Relay
 * connection instead, which is genuinely paginated, loading a reasonable first page and more
 * only on request.
 */
@Component({
    selector: "app-gallery",
    imports: [
        HlmButton,
        HlmSkeleton,
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

    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly graphql = inject(GraphQLClient);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);

    protected readonly skeletonRows = SKELETON_ROWS;
    protected readonly skeletonRowHeight = TARGET_ROW_HEIGHT;
    protected readonly selectedMedia = signal<MediaNode | null>(null);

    protected readonly edges = signal<MediasFeedQueryData["medias"]["edges"]>([]);
    protected readonly hasMore = signal(true);
    protected readonly isLoading = signal(false);
    protected readonly isJumping = signal(false);
    protected readonly jumpTargetYear = signal<number | null>(null);

    private readonly yearCountsResource = graphqlResource<MediaYearCountsQueryData>(() => ({
        query: MEDIA_YEAR_COUNTS_QUERY,
    }));
    protected readonly yearCounts = computed(() =>
        [...(this.yearCountsResource.data()?.mediasGroupByPeriod ?? [])].sort((a, b) => b.year - a.year)
    );

    protected readonly yearGroups = computed<YearGroup[]>(() => {
        const groups: YearGroup[] = [];
        for (const edge of this.edges()) {
            const year = new Date(edge.node.createdDate).getFullYear();
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
        // /gallery/:mediaId opens it once loaded, and Back/Forward closes or reopens it to match.
        // Opening/closing via the UI itself (onOpenMedia/onCloseMedia) sets `selectedMedia`
        // directly for instant feedback and navigates separately — by the time that navigation
        // lands here, `openMediaById`'s own already-open check makes this a no-op.
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

    /** Returns whether the load actually succeeded — callers that loop (jumpToYear,
     * openMediaById) need to know so they can stop instead of hammering a failing request
     * repeatedly. Concurrent calls share the same in-flight request rather than one bailing out
     * with `false`: the constructor's own initial load and a same-tick `openMediaById` (from a
     * deep link, via the constructor's effect) race by construction, and a bailed-out `false`
     * read as a real failure — which then gave up and redirected away, discarding a perfectly
     * valid id purely because it arrived a moment before the first page had loaded. */
    async loadMore(pageSize = PAGE_SIZE): Promise<boolean> {
        if (this.inFlightLoad) {
            return this.inFlightLoad;
        }
        this.isLoading.set(true);
        this.inFlightLoad = (async () => {
            try {
                const after = this.edges().at(-1)?.cursor ?? null;
                const data = await this.graphql.request<MediasFeedQueryData, MediasFeedQueryVars>(MEDIAS_QUERY, {
                    first: pageSize,
                    after,
                });
                this.hasMore.set(data.medias.pageInfo.hasNextPage);
                this.edges.update((list) => [...list, ...data.medias.edges]);
                return true;
            } catch (err) {
                this.toast.error("Couldn't load photos", err instanceof Error ? err.message : "Unknown error");
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
        if (this.isBrowser) {
            queueMicrotask(() => {
                document.getElementById(`gallery-year-${year}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }
    }

    /** Same shape of problem as jumpToYear — there's no single-media-by-id query on the backend
     * either (only the paginated connection), so opening a deep link means paging through in
     * `created` order until the target id turns up or we run out. */
    private async openMediaById(id: string): Promise<void> {
        if (this.selectedMedia()?.id === id) {
            return;
        }
        const { found, stoppedOnError } = await this.loadUntil(() => this.edges().some((e) => e.node.id === id));
        if (found) {
            this.selectedMedia.set(this.edges().find((e) => e.node.id === id)!.node);
            return;
        }
        if (!stoppedOnError) {
            this.toast.error("Couldn't find that photo", "It may have been removed, or the link is out of date.");
        }
        this.router.navigate(["/gallery"], { replaceUrl: true });
    }

    /** Pages through `medias` (in `created` order) until `isFound()` is satisfied or we run out —
     * the shared loop behind jumpToYear and openMediaById, which only differ in what "found"
     * means. `stoppedOnError` lets a caller skip its own "ran out" messaging when `loadMore` has
     * already toasted the real reason. */
    private async loadUntil(isFound: () => boolean): Promise<{ found: boolean; stoppedOnError: boolean }> {
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
