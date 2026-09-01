import { DatePipe } from "@angular/common";
import {
  Component,
  DestroyRef,
  OnDestroy,
  afterNextRender,
  computed,
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
  CalendarIncident,
  CalendarIncidentSeverity,
  ChronologyIndicator,
} from "../data/insiden.queries";
import { getReadableTimeDifference } from "../data/elapsed-time.util";
import { isPendingIncidentStatus } from "../data/incident-status.util";

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

/** Synthesized when the backend has no chronology entries at all — matches the old app's
 * EventCardComponent fallback, so every incident shows at least a start (and end, if resolved). */
function defaultChronology(incident: CalendarIncident): CalendarIncident["chronologies"] {
  const entries: CalendarIncident["chronologies"] = [
    {
      order: 0,
      indicator: "BLUE",
      datetime: incident.startDatetime,
      content: "Start of incident",
      sourceUrl: null,
    },
  ];
  if (incident.endDatetime) {
    entries.push({
      order: 1,
      indicator: "GREEN",
      datetime: incident.endDatetime,
      content: "Issue resolved",
      sourceUrl: null,
    });
  }
  return entries;
}

/**
 * One line/vehicle/station-level service disruption. Ported from insiden's EventCardComponent —
 * same domain rules (default chronology when the backend has none, pre-May-2023 entries treated
 * as inaccurate regardless of the backend's own flag, live elapsed-timer while unresolved) — but
 * "Details" and "Photos" expand in place rather than opening a modal/drawer, matching this app's
 * established collapse/expand idiom (see vehicle-list.component.ts) instead of introducing one.
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
  ],
  templateUrl: "./incident-card.component.html",
})
export class IncidentCardComponent implements OnDestroy {
  readonly incident = input.required<CalendarIncident>();

  private readonly uploads = inject(ImageUploadService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detailsExpanded = signal(false);
  protected readonly photosExpanded = signal(false);
  /** Emits the new expanded state whenever the details toggle is clicked. Coordination hook for
   * the 2-ad-per-page cap: the feed slot (`insidenFeed`, added by T4 in insiden.page.html) is
   * hidden while any card is expanded, so this page never shows more than two units at once. */
  readonly detailsExpandedChange = output<boolean>();
  protected readonly insidenDetailsInlineSlotId = resolveAdSlot("insidenDetailsInline");
  protected readonly pendingPhotos = signal<ImageFile[]>([]);
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

  protected readonly chronology = computed(() => {
    const incident = this.incident();
    const entries =
      incident.chronologies.length > 0 ? incident.chronologies : defaultChronology(incident);
    return [...entries].sort((a, b) => a.order - b.order);
  });

  protected readonly duration = computed(() => {
    const incident = this.incident();
    return incident.endDatetime
      ? getReadableTimeDifference(new Date(incident.startDatetime), new Date(incident.endDatetime))
      : "";
  });

  protected readonly severityVariant = computed(() => SEVERITY_VARIANT[this.incident().severity]);
  protected readonly severityLabel = computed(() => SEVERITY_LABEL[this.incident().severity]);

  constructor() {
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
    this.detailsExpandedChange.emit(next);
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
