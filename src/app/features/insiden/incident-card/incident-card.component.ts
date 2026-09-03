import { DatePipe } from "@angular/common";
import {
  Component,
  DestroyRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { MarkdownComponent } from "ngx-markdown";
import { resolveAdSlot } from "../../../core/ads/ads.config";
import { AdSlotComponent } from "../../../ui/ad-slot/ad-slot.component";
import { HlmButton } from "../../../ui/button/button";
import { HlmBadge, type BadgeVariants } from "../../../ui/badge/badge";
import { HlmCardImports } from "../../../ui/card/card";
import { ImageUploadService } from "../../../core/upload/image-upload.service";
import { ImageFile } from "../../../core/upload/image-file";
import { ToastService } from "../../../ui/toast/toast.service";
import { PhotoPickerComponent } from "../../spotting/report-form/photo-picker/photo-picker.component";
import { VoteButtonComponent } from "../vote-button/vote-button.component";
import {
  CALENDAR_INCIDENT_HISTORY_QUERY,
  CalendarIncident,
  CalendarIncidentHistoryData,
  CalendarIncidentHistoryEntry,
  CalendarIncidentHistoryVars,
  CalendarIncidentSeverity,
  CalendarChronologyStatus,
  ChronologyIndicator,
} from "../data/insiden.queries";
import { getReadableTimeDifference } from "../data/elapsed-time.util";
import { incidentHistoryLine } from "../data/incident-history-line.util";
import { isPendingIncidentStatus } from "../data/incident-status.util";
import {
  chronologyStatusLabel,
  isChronologyDeletionRequestable,
} from "../data/chronology-status.util";
import { canEditIncident } from "../data/can-edit.incident.util";
import { buildChronologyEntries, ChronologyEntry } from "../data/incident-chronology.util";
import { IncidentSheetService } from "../data/incident-sheet.service";
import { LinkSheetService } from "../data/link-sheet.service";
import { incidentLinkLine } from "../data/incident-link-line.util";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import {
  ChronologyDeletionRequestData,
  ChronologyDeletionRequestVars,
  CalendarIncidentLinkEdge,
  REQUEST_CHRONOLOGY_DELETION_MUTATION,
} from "../data/insiden.queries";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLinksQueryData,
  PublicSocialMediaLinksVars,
} from "../data/social-links.queries";
import { InfiniteScrollDirective } from "../../../ui/infinite-scroll/infinite-scroll.directive";
import { MediaViewerComponent } from "../../gallery/media-viewer/media-viewer.component";
import type { MediaNode } from "../../gallery/data/gallery.queries";
import { CalendarIncidentMedia } from "../data/insiden.queries";
import { incidentMediaToViewerNode } from "../data/incident-media-viewer.util";

const LINK_PAGE_SIZE = 10;

const SEVERITY_VARIANT: Record<CalendarIncidentSeverity, BadgeVariants["variant"]> = {
  MAJOR: "destructive",
  MINOR: "warning",
  OTHERS: "neutral",
};

const SEVERITY_LABEL: Record<CalendarIncidentSeverity, string> = {
  MAJOR: "Major",
  MINOR: "Minor",
  OTHERS: "Other",
};

const CHRONOLOGY_DOT: Record<ChronologyIndicator, string> = {
  GREEN: "bg-emerald-500",
  RED: "bg-red-500",
  BLUE: "bg-blue-500",
  GRAY: "bg-neutral-400",
};

const CHRONOLOGY_STATUS_VARIANT: Record<string, BadgeVariants["variant"]> = {
  PENDING_APPROVAL: "warning",
  pending_approval: "warning",
  PENDING_DELETION: "destructive",
  pending_deletion: "destructive",
};

/**
 * One line/vehicle/station-level service disruption. Ported from insiden's EventCardComponent —
 * same domain rules (default chronology when the backend has none, pre-May-2023 entries treated
 * as inaccurate regardless of the backend's own flag, live elapsed-timer while unresolved) — but
 * "Details" and "Photos" expand in place rather than opening a modal/drawer, matching this app's
 * established collapse/expand idiom (see vehicle-list.component.ts) instead of introducing one.
 * Photo thumbnails open the gallery's MediaViewerComponent in-page (Task 19) — the same
 * same-page preview /gallery uses, not a new tab.
 */
@Component({
  selector: "app-incident-card",
  imports: [
    DatePipe,
    MarkdownComponent,
    HlmButton,
    AdSlotComponent,
    HlmBadge,
    ...HlmCardImports,
    PhotoPickerComponent,
    VoteButtonComponent,
    InfiniteScrollDirective,
    MediaViewerComponent,
  ],
  templateUrl: "./incident-card.component.html",
})
export class IncidentCardComponent implements OnDestroy {
  readonly incident = input.required<CalendarIncident>();

  /** Host-opt-out for the Edit affordance: the console's pending queue has its own panel-based
   * editing, so it never hosts `<app-incident-form />` and passes `false` here. Site-safe
   * default `true` — /insiden stays unchanged. Also gates the Add-link affordance (same
   * rationale: the console queue is moderated via the panel, and its query doesn't fetch the
   * `links` sub-select — see decision note in the notepad entry). */
  readonly editActionEnabled = input(true);

  private readonly uploads = inject(ImageUploadService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sheet = inject(IncidentSheetService);
  private readonly linkSheet = inject(LinkSheetService);
  private readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);

  protected readonly detailsExpanded = signal(false);
  protected readonly photosExpanded = signal(false);
  /** Emits the new expanded state whenever the details toggle is clicked. Coordination hook for
   * the 2-ad-per-page cap: the feed slot (`insidenFeed`, added by T4 in insiden.page.html) is
   * hidden while any card is expanded, so this page never shows more than two units at once. */
  readonly detailsExpandedChange = output<boolean>();
  protected readonly insidenDetailsInlineSlotId = resolveAdSlot("insidenDetailsInline");
  /** Latest history entry for the details area (Task 18) — lazily loaded on expand
   * (spec: only the latest entry shown), null while unloaded/hidden. */
  protected readonly historyEntry = signal<CalendarIncidentHistoryEntry | null>(null);
  /** Coalesces the lazy history fetch: an in-flight request is never re-issued. */
  private historyFetchInFlight = false;
  /** Single-line summary of the latest entry for the details area; null hides the line
   * (not loaded, load failed, or a "deleted" record — soft-deleted incidents never
   * appear in the public feed, so showing "Deleted by …" on a live card is wrong). */
  protected readonly historyLine = computed<string | null>(() => {
    const entry = this.historyEntry();
    if (!entry || entry.changeType === "deleted") {
      return null;
    }
    return incidentHistoryLine(entry);
  });
  protected readonly pendingPhotos = signal<ImageFile[]>([]);
  /** Photo open in the gallery-style same-page preview (Task 19). Mapped through
   * incidentMediaToViewerNode into MediaViewerComponent's input shape; null = closed. */
  protected readonly viewerMedia = signal<MediaNode | null>(null);
  private readonly photoPickerRef = viewChild(PhotoPickerComponent);
  /** See PhotoPickerComponent.isCompressing's doc comment — submitting a photo that's still
   * mid-compression captures a stale reference that ImageUploadService will retry forever
   * without ever actually uploading it. */
  protected readonly isPhotosCompressing = computed(
    () => this.photoPickerRef()?.isCompressing() ?? false,
  );
  protected readonly elapsedTime = signal("");

  private timer: ReturnType<typeof setInterval> | undefined;

  protected readonly isOngoing = computed(() => this.incident().endDatetime === null);

  /** DRAFT / PENDING_APPROVAL entries (either casing) — awaiting admin approval. `status` is
   * optional on the payload (backend exposes it only after the scalar backport), so the badge
   * stays hidden for LIVE entries and for backends that don't send the field yet. */
  protected readonly isPending = computed(() => isPendingIncidentStatus(this.incident().status));

  /** Edit affordance visibility: host opt-out AND per-incident permission (mirrors the
   * backend's `may_edit`; see can-edit.incident.util). */
  protected readonly canEdit = computed(() => {
    const auth = this.auth;
    return (
      this.editActionEnabled() &&
      canEditIncident(this.incident(), {
        isLoggedIn: auth.isLoggedIn(),
        isAdmin: auth.isAdmin(),
        userId: auth.user()?.uid ?? null,
      })
    );
  });

  /** Add-link affordance (spec F9): any logged-in user, gated by the same host opt-out
   * that hides the Edit affordance on the console queue. No per-incident permission —
   * the backend allows any authenticated user to tag a link to an incident. */
  protected readonly canAddLink = computed(
    () => this.editActionEnabled() && this.auth.isLoggedIn(),
  );

  /** Link list rows in the spec format (F7/F8). First page arrives inline with the
   * incident (`links` sub-select); continuation pages append below it. */
  protected readonly linkRows = computed(() =>
    this.linkEdges().map((edge) => ({ id: edge.node.id, ...incidentLinkLine(edge.node) })),
  );

  private readonly appendedEdges = signal<CalendarIncidentLinkEdge[]>([]);
  private readonly appendedHasNext = signal<boolean | null>(null);
  private readonly nextCursor = signal<string | null>(null);
  protected readonly linksLoading = signal(false);
  /** Non-null while the last continuation page failed — the template swaps the
   * sentinel for an inline retry so a broken network can't spin a failing loop. */
  protected readonly linkLoadError = signal<string | null>(null);

  protected readonly linkEdges = computed(() => [
    ...(this.incident().links?.edges ?? []),
    ...this.appendedEdges(),
  ]);

  protected readonly linksHasNext = computed(
    () => this.appendedHasNext() ?? this.incident().links?.pageInfo.hasNextPage ?? false,
  );

  protected readonly linksNextCursor = computed(
    () => this.nextCursor() ?? this.incident().links?.pageInfo.endCursor ?? null,
  );

  /** Backend's own `inaccurate` flag, OR'd with the old app's blanket "anything from before
   * May 2023 is unreliable" heuristic — ported as-is rather than re-derived, since it reflects
   * a real, specific data-quality note about that period, not a guess. */
  protected readonly isInaccurate = computed(() => {
    const incident = this.incident();
    if (incident.inaccurate) {
      return true;
    }
    const start = new Date(incident.startDatetime);
    return start.getFullYear() < 2023 || (start.getFullYear() === 2023 && start.getMonth() <= 3);
  });

  /** Sorted timeline rows; unresolved incidents gain a synthetic RED "Ongoing for X" tail entry.
   * A successful deletion request flips the row to PENDING_DELETION via the override map so the
   * Task 13 tag renders immediately (the fetched payload is a read model — never mutated). */
  protected readonly chronology = computed(() => {
    const overrides = this.deletionOverride();
    return buildChronologyEntries(this.incident()).map((entry) =>
      entry.id && overrides.has(entry.id) ? { ...entry, status: overrides.get(entry.id) } : entry,
    );
  });

  protected readonly duration = computed(() => {
    const incident = this.incident();
    return incident.endDatetime
      ? getReadableTimeDifference(new Date(incident.startDatetime), new Date(incident.endDatetime))
      : "";
  });

  protected readonly severityVariant = computed(() => SEVERITY_VARIANT[this.incident().severity]);
  protected readonly severityLabel = computed(() => SEVERITY_LABEL[this.incident().severity]);

  protected readonly chronologyStatusLabel = chronologyStatusLabel;
  protected readonly isChronologyDeletionRequestable = isChronologyDeletionRequestable;

  /** Per-row status flips applied after a successful requestChronologyDeletion (keyed by
   * chronology id): the row's tag renders PENDING_DELETION until the next list refresh. */
  private readonly deletionOverride = signal<Map<string, CalendarChronologyStatus>>(
    new Map<string, CalendarChronologyStatus>(),
  );

  /** Id of the chronology whose deletion request is in flight — disables that row's
   * affordance only (mirrors VoteButtonComponent's per-control isVoting). */
  protected readonly deletionRequestingId = signal<string | null>(null);

  protected chronologyStatusVariant(status: string | undefined): BadgeVariants["variant"] {
    return CHRONOLOGY_STATUS_VARIANT[status ?? ""] ?? "neutral";
  }

  constructor() {
    /** The incident input is a new object on every list refresh — reset the
     * continuation state so appended pages never leak across incidents. */
    let lastIncidentId: string | null = null;
    effect(() => {
      const incident = this.incident();
      if (incident.id !== lastIncidentId) {
        lastIncidentId = incident.id;
        // History belongs to a specific incident: a same-id refresh keeps the line,
        // a re-targeted card (day navigation reuses the wrapper) clears it and
        // refetches immediately when the details area stays open.
        this.historyEntry.set(null);
        if (this.detailsExpanded()) {
          void this.loadHistory();
        }
      }
      this.appendedEdges.set([]);
      this.appendedHasNext.set(null);
      this.nextCursor.set(null);
      this.linkLoadError.set(null);
      this.linksLoading.set(false);
      // A list refresh replaces the payload — don't keep a stale viewer open for a photo
      // that may no longer belong to this incident.
      this.viewerMedia.set(null);
    });

    afterNextRender(() => {
      if (!this.isOngoing()) {
        return;
      }
      const start = new Date(this.incident().startDatetime);
      const tick = () => this.elapsedTime.set(getReadableTimeDifference(start, new Date()));
      tick();
      this.timer = setInterval(tick, 1000);
      this.destroyRef.onDestroy(() => clearInterval(this.timer));
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  protected dotClass(indicator: ChronologyIndicator): string {
    return CHRONOLOGY_DOT[indicator];
  }

  protected toggleDetails(): void {
    const next = !this.detailsExpanded();
    this.detailsExpanded.set(next);
    if (next) {
      // Lazy history fetch: only when the details area opens — collapsed cards never
      // query history (see loadHistory).
      void this.loadHistory();
    }
    this.detailsExpandedChange.emit(next);
  }

  protected editIncident(): void {
    this.sheet.open(this.incident());
  }

  protected addLink(): void {
    this.linkSheet.open({
      incidentId: this.incident().id,
      incidentTitle: this.incident().title,
    });
  }

  /** Open a photo thumbnail in the gallery's same-page preview (spec §H). */
  protected openPhoto(media: CalendarIncidentMedia): void {
    this.viewerMedia.set(incidentMediaToViewerNode(media));
  }

  protected closeViewer(): void {
    this.viewerMedia.set(null);
  }

  /** Lazily fetch the latest history entry when the details area expands (Task 18):
   * never on page load, so collapsed cards stay quiet. The query is IsLoggedIn and
   * graphqlResource() has no header channel (its httpResource body carries only
   * query/variables) — so this follows the card's existing imperative lazy pattern
   * (loadMoreLinks): GraphQLClient.request + the Firebase idToken. */
  private async loadHistory(): Promise<void> {
    if (!this.auth.isLoggedIn() || this.historyFetchInFlight) {
      return;
    }
    this.historyFetchInFlight = true;
    const incidentId = this.incident().id;
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<
        CalendarIncidentHistoryData,
        CalendarIncidentHistoryVars
      >(
        CALENDAR_INCIDENT_HISTORY_QUERY,
        { id: incidentId, limit: 1 },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      // The wrapper can be re-targeted to a different incident while the request is in
      // flight (day navigation reuses the component instance) — only apply the match.
      if (this.incident().id === incidentId) {
        this.historyEntry.set(data.calendarIncidentHistory[0] ?? null);
      }
    } catch {
      // Expected-failure degradation by design: the line is decorative one-line info
      // (spec: latest entry only, no history UI), so an IsLoggedIn rejection or network
      // failure hides it rather than surfacing toast/retry chrome — the card hides every
      // logged-in-only affordance the same way. GraphQL-level errors are already reported
      // to Sentry inside GraphQLClient.request; nothing is silently lost.
      this.historyEntry.set(null);
    } finally {
      this.historyFetchInFlight = false;
    }
  }

  /** Load the next nested page of incident links through the ROOT
   * publicSocialMediaLinks query (the nested `links` field batches page one
   * server-side, but continuation cursors are per-parent — see the backend
   * field's docstring). Coalesced by `linksLoading`; failure surfaces an inline
   * retry instead of a toast so the sentinel can't spin a failing loop. */
  protected async loadMoreLinks(): Promise<void> {
    const cursor = this.linksNextCursor();
    if (this.linksLoading() || !this.linksHasNext() || !cursor) {
      return;
    }
    this.linksLoading.set(true);
    this.linkLoadError.set(null);
    try {
      const data = await this.graphql.request<
        PublicSocialMediaLinksQueryData,
        PublicSocialMediaLinksVars
      >(PUBLIC_SOCIAL_MEDIA_LINKS_QUERY, {
        first: LINK_PAGE_SIZE,
        after: cursor,
        incidentId: this.incident().id,
      });
      const connection = data.publicSocialMediaLinks;
      this.appendedEdges.update((prev) => [...prev, ...connection.edges]);
      this.appendedHasNext.set(connection.pageInfo.hasNextPage);
      this.nextCursor.set(connection.pageInfo.endCursor);
    } catch (err) {
      this.linkLoadError.set(err instanceof Error ? err.message : "Unknown error");
    } finally {
      this.linksLoading.set(false);
    }
  }

  /** Request deletion of a LIVE chronology (spec E1): Task 6 mutation, author-or-admin gated;
   * success flips the row to PENDING_DELETION locally, failure toasts verbatim. */
  protected async requestChronologyDeletion(entry: ChronologyEntry): Promise<void> {
    const id = entry.id;
    if (
      !id ||
      this.deletionRequestingId() !== null ||
      !isChronologyDeletionRequestable(entry.status)
    ) {
      return;
    }
    this.deletionRequestingId.set(id);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<ChronologyDeletionRequestData, ChronologyDeletionRequestVars>(
        REQUEST_CHRONOLOGY_DELETION_MUTATION,
        { chronologyId: id },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.deletionOverride.update((map) => new Map(map).set(id, "PENDING_DELETION"));
      this.toast.success("Deletion requested", "An admin will approve or reject this request.");
    } catch (err) {
      this.toast.error(
        "Couldn't request deletion",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.deletionRequestingId.set(null);
    }
  }

  protected uploadPhotos(): void {
    const files = this.pendingPhotos();
    if (files.length === 0) {
      return;
    }
    if (this.isPhotosCompressing()) {
      this.toast.error(
        "Photos still processing",
        "Please wait a moment for photo compression to finish.",
      );
      return;
    }
    for (const file of files) {
      this.uploads.addToQueue(this.incident().id, file, "INCIDENT_CALENDAR_INCIDENT");
    }
    this.toast.info(
      "Photo upload queued",
      "Please wait for uploads to complete before closing this tab.",
    );
    this.pendingPhotos.set([]);
  }
}
