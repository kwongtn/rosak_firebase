import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { form as createForm, FormField, submit } from "@angular/forms/signals";
import {
  graphqlResource,
  GraphQLClient,
  GraphQLRequestError,
} from "../../../core/graphql/graphql-client";
import { toastSubmitFailure } from "../../../core/graphql/submit-failure";
import { SpottingType, WheelStatus } from "../../../core/graphql/types";
import { AuthService } from "../../../core/auth/auth.service";
import { injectIsBrowser } from "../../../core/composables/is-browser";
import {
  readSessionDraft,
  removeStorageItem,
  writeStorageItem,
} from "../../../core/util/web-storage.util";
import { ImageUploadService } from "../../../core/upload/image-upload.service";
import { ReportSheetService } from "../data/report-sheet.service";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { HlmCombobox, ComboboxItem } from "../../../ui/combobox/combobox";
import { ToastService } from "../../../ui/toast/toast.service";
import { VehicleStatusBadge } from "../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import {
  allowRunNumber,
  numberSeenToSetNumbers,
  sortVehiclesForPicker,
} from "../data/vehicle-search.util";
import {
  ADD_SPOTTING_EVENT_MUTATION,
  AddSpottingEventData,
  AddSpottingEventVars,
  LINES_AND_VEHICLES_QUERY,
  LinesAndVehiclesQueryData,
  STATION_LINES_QUERY,
  StationLinesQueryData,
  StationLinesQueryVars,
} from "../data/spotting.queries";
import {
  ABNORMAL_VEHICLE_STATUSES,
  emptyReportFormModel,
  reportFormSchema,
  type ReportFormModel,
} from "./report-form.schema";
import {
  parseReportFormDraft,
  REPORT_FORM_DRAFT_KEY,
  sameReportFormDraft,
  serializeReportFormDraft,
} from "./report-form-draft.util";
import { PhotoPickerComponent } from "./photo-picker/photo-picker.component";
import { ImageFile } from "../../../core/upload/image-file";

/**
 * "Add a Spotting Entry" — a single form (per user feedback, no multi-step wizard), but still
 * progressively discloses fields that only make sense once earlier ones are filled in (e.g. the
 * vehicle picker waits for a line, station pickers only appear for the relevant spotting type).
 * Domain rules (station requirements, the sanity-test gate, the run-number search heuristic) are
 * ported unchanged from spotting-form.component.ts / spotting-form.utils.ts.
 */
@Component({
  selector: "app-report-form",
  imports: [
    FormField,
    HlmButton,
    HlmInput,
    HlmNativeSelect,
    HlmCheckbox,
    HlmCombobox,
    VehicleStatusBadge,
    LineStatusBadge,
    PhotoPickerComponent,
  ],
  templateUrl: "./report-form.component.html",
})
export class ReportFormComponent {
  /**
   * Emitted after a successful submit, carrying the line the entry was filed against (or `null` if
   * the model had none). The payload is the point: `ReportSheetService.lineId` is consumed-once by
   * the open edge above, so a host cannot recover the line from the service afterwards — and the
   * front page needs it to send the reader back to the line they just reported about. Hosts that do
   * not care ignore the argument.
   */
  readonly submitted = output<string | null>();

  protected readonly linesStore = inject(SpottingLinesStore);
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);
  private readonly uploads = inject(ImageUploadService);
  private readonly reportSheet = inject(ReportSheetService);
  private readonly isBrowser = injectIsBrowser();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly photos = signal<ImageFile[]>([]);
  private readonly photoPickerRef = viewChild(PhotoPickerComponent);
  /** Public so the sheet shell's footer can disable Submit while true — see the doc comment on
   * PhotoPickerComponent.isCompressing for why submitting mid-compression is a real bug, not
   * just an edge case: a photo captured into the upload queue before its compression settles
   * never gets uploaded, silently, forever. */
  readonly isPhotosCompressing = computed(() => this.photoPickerRef()?.isCompressing() ?? false);

  protected readonly model = signal(emptyReportFormModel());
  protected readonly reportForm = createForm(
    this.model,
    reportFormSchema(() => this.selectedVehicleStatusValue() ?? ""),
  );

  private readonly linesAndVehiclesResource = graphqlResource<LinesAndVehiclesQueryData>(() => ({
    query: LINES_AND_VEHICLES_QUERY,
  }));

  protected readonly lineItems = computed<ComboboxItem<string>[]>(() =>
    this.linesStore.lines().map((line) => ({
      label: `${line.code} — ${line.displayName}`,
      value: line.id,
      meta: { status: line.status },
    })),
  );

  private readonly _vehiclesForLine = computed(() => {
    const lineId = this.model().lineId;
    const line = this.linesAndVehiclesResource.data()?.lines.find((l) => l.id === lineId);
    return line?.vehicleTypes.flatMap((vt) => vt.vehicles) ?? [];
  });

  protected readonly vehicleItems = computed<ComboboxItem<string>[]>(() =>
    sortVehiclesForPicker(this._vehiclesForLine()).map((v) => ({
      label: v.identificationNo,
      value: v.id,
      meta: { status: v.status },
    })),
  );

  protected readonly vehicleFilterFn = computed(() => {
    const lineId = this.model().lineId;
    return (items: ComboboxItem<string>[], query: string) => {
      if (!query) return items;
      const heuristicMatches = new Set(
        numberSeenToSetNumbers(query, lineId).map((s) => s.toLowerCase()),
      );
      return items.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          [...heuristicMatches].some((match) => item.label.toLowerCase().includes(match)),
      );
    };
  });

  protected readonly allowRunNumber = computed(() => allowRunNumber(this.model().lineId));
  /** The selected vehicle's current status: its badge, and the schema's sanity-test gate. */
  protected readonly selectedVehicleStatusValue = computed(
    () => this._vehiclesForLine().find((v) => v.id === this.model().vehicleId)?.status,
  );
  protected readonly isAbnormalVehicle = computed(() =>
    ABNORMAL_VEHICLE_STATUSES.has(this.selectedVehicleStatusValue() ?? ""),
  );

  // Project only the primitives the station query depends on, so the resource re-runs on a
  // line/type change but NOT on every unrelated model write (otherwise each keystroke in Notes
  // re-issues StationLinesByLine).
  private readonly _stationLineId = computed(() => this.model().lineId);
  private readonly _stationType = computed(() => this.model().type);

  private readonly stationLinesResource = graphqlResource<
    StationLinesQueryData,
    StationLinesQueryVars
  >(() => {
    const lineId = this._stationLineId();
    const type = this._stationType();
    if (!lineId || (type !== "BETWEEN_STATIONS" && type !== "AT_STATION")) {
      return undefined;
    }
    return { query: STATION_LINES_QUERY, variables: { lineId } };
  });
  protected readonly stationOptions = computed(
    () => this.stationLinesResource.data()?.stationLines ?? [],
  );

  protected readonly capturedLocation = signal<GeolocationCoordinates | null>(null);
  /** Public so the sheet shell hosting this form can drive its own Submit/Clear footer buttons. */
  readonly isSubmitting = signal(false);

  /**
   * True from the open that restored a saved draft until the draft is discarded, cleared, submitted
   * or the sheet closes. Drives the "Draft restored" line.
   */
  protected readonly draftRestored = signal(false);
  /** Photos the restored draft had. Files are not saved, so the line asks for them again. */
  protected readonly restoredPhotoCount = signal(0);

  private _lastLineId = "";
  private _wasSheetOpen = false;
  /**
   * The model as the open edge left it (restored draft and line seed applied); `null` while the
   * sheet is closed, which is also what keeps the persist effect from writing before the restore.
   */
  private _draftBaseline: ReportFormModel | null = null;
  /** Whether this open wrote the saved draft, so a return to the baseline may remove it again. */
  private _wroteDraft = false;

  constructor() {
    // The form is created lazily, so on a cold first open the sheet's focus trap has already
    // captured focus (onto the footer's "Clear form") before this exists: move it in once rendered.
    // On a warm open this re-focuses the control the trap chose, so it is harmless.
    afterNextRender(() => {
      if (this.reportSheet.isOpen()) {
        this.host.nativeElement.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
      }
    });

    // Changing the line discards the vehicle and station selections, which belong to the old
    // line: a kept station id would still pass the schema and be sent with the new line's report.
    effect(() => {
      const lineId = this.model().lineId;
      if (lineId !== this._lastLineId) {
        this._lastLineId = lineId;
        this.model.update((m) => ({
          ...m,
          vehicleId: "",
          atStation: "",
          originStation: "",
          destinationStation: "",
        }));
      }
    });

    // Sheet-state edge handling, deliberately one effect (not two) so the seed and the reset
    // can never race against each other or the `_wasSheetOpen` latch: on close, reset the whole
    // form including touched state (see resetForm()) — otherwise a field like line, once touched,
    // stays filled in and "touched" for the next time the sheet opens, regardless of *how* it
    // closed (Cancel, backdrop click, Escape — anything that isn't the submit-success path,
    // which already calls clear() itself; resetting again here on that same edge is harmless).
    // On open, apply ReportSheetService's one-shot line seed when a trigger supplied one (the
    // home page's line cards do); without a seed or a saved draft the line and vehicle fields
    // start blank, even when opened from a vehicle-detail page's own "Add a Spotting Entry"
    // button — the vehicle you were just looking at isn't necessarily the one you're reporting on.
    //
    // The saved draft (sessionStorage, see report-form-draft.util.ts) is restored on the same open
    // edge, BEFORE the seed: a closed sheet resets the form in memory but keeps the saved draft, so
    // an accidental close (backdrop, Escape, a swipe) loses nothing. Only Clear form, Discard and a
    // successful submit forget it (`clear()`).
    effect(() => {
      const isSheetOpen = this.reportSheet.isOpen();
      if (isSheetOpen && !this._wasSheetOpen) {
        const seedLineId = this.reportSheet.lineId();
        untracked(() => this.restoreDraft(seedLineId));
        if (seedLineId) {
          // Consumed here, never retained: a later seedless open() (the /spotting shell's own
          // buttons) must not resurrect a line from an unrelated, already-closed sheet.
          this.reportSheet.lineId.set(null);
          this.model.update((m) => ({ ...m, lineId: seedLineId }));
        }
        this._draftBaseline = untracked(() => this.model());
        this._wroteDraft = false;
      }
      if (!isSheetOpen && this._wasSheetOpen) {
        this._draftBaseline = null;
        this.resetForm();
      }
      this._wasSheetOpen = isSheetOpen;
    });

    // Saves the draft while the sheet is open, behind the browser check. Created after the edge
    // effect, and gated on `_draftBaseline`, which only the open edge sets: whichever order the two
    // run in, nothing is written over a saved draft before the open edge has read it.
    effect(() => {
      const model = this.model();
      // A restored draft keeps its photo count until the form resets, though the files are gone, so
      // a reload after an edit still asks for the photos again.
      const photoCount = Math.max(this.restoredPhotoCount(), this.photos().length);
      const restored = this.draftRestored();
      const baseline = this._draftBaseline;
      if (!this.isBrowser || !this.reportSheet.isOpen() || baseline === null) {
        return;
      }
      if (!restored && photoCount === 0 && sameReportFormDraft(model, baseline)) {
        // Untouched since the sheet opened, so nothing here is the rider's. A saved draft this open
        // did not write (one for another line, left alone by a line-seeded open) is not ours to
        // remove; one it wrote is, now that the rider has undone it.
        if (this._wroteDraft) {
          removeStorageItem("session", REPORT_FORM_DRAFT_KEY);
          this._wroteDraft = false;
        }
        return;
      }
      writeStorageItem(
        "session",
        REPORT_FORM_DRAFT_KEY,
        serializeReportFormDraft(model, photoCount),
      );
      this._wroteDraft = true;
    });
  }

  /**
   * Restores the saved draft on the open edge. A line-seeded open (home's line cards) is for that
   * line, so a draft for a different line is left saved for its own open; a draft without a line
   * takes the seed. Browser only: the form is created inside `@defer`, which never renders on the
   * server, but the guard keeps that a property of this file rather than of its hosts.
   */
  private restoreDraft(seedLineId: string | null): void {
    if (!this.isBrowser) {
      return;
    }
    // Another account's draft is not this reader's to see (`readSessionDraft`).
    const draft = parseReportFormDraft(
      readSessionDraft(REPORT_FORM_DRAFT_KEY, this.auth.user()?.uid ?? null),
    );
    if (!draft || (seedLineId && draft.model.lineId !== "" && draft.model.lineId !== seedLineId)) {
      return;
    }
    // Set first, or the line-change effect would read the restored line as a change and drop the
    // restored vehicle.
    this._lastLineId = draft.model.lineId;
    this.model.set(draft.model);
    this.restoredPhotoCount.set(draft.photoCount);
    this.draftRestored.set(true);
    if (draft.model.type === "LOCATION") {
      // The position is never saved (it would be stale): ask for a fresh one, as choosing the type does.
      this.onTypeChanged();
    }
  }

  /** Discard on the "Draft restored" line: forget the saved draft and start the form over. */
  protected discardDraft(): void {
    // The button removes itself, and a removed focused control drops focus to `body`, outside the
    // sheet's focus trap (MISTAKES.md, a11y): hand focus to the Line picker first.
    this.host.nativeElement.querySelector<HTMLElement>("hlm-combobox input")?.focus();
    this.clear();
  }

  protected onTypeChanged(): void {
    if (this.model().type !== "LOCATION") {
      this.capturedLocation.set(null);
      return;
    }
    if (!navigator.geolocation) {
      this.toast.error("Location unavailable", "Your browser doesn't support geolocation.");
      this.model.update((m) => ({ ...m, type: "JUST_SPOTTING" }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // No toast: the helper text under the type field already says who sees the position.
        this.capturedLocation.set(position.coords);
      },
      (error) => {
        this.toast.error("Couldn't get your location", error.message);
        this.model.update((m) => ({ ...m, type: "JUST_SPOTTING" }));
      },
      { maximumAge: 0, enableHighAccuracy: true },
    );
  }

  /** Public so the sheet shell hosting this form can drive it from its own footer buttons. */
  async submit(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to submit a spotting report.");
      return;
    }
    if (this.model().type === "LOCATION" && !this.capturedLocation()) {
      this.toast.error(
        "Location not captured",
        "Please wait for location access, or pick a different type.",
      );
      return;
    }
    if (this.isPhotosCompressing()) {
      // Belt-and-suspenders: the sheet shell already disables Submit on this same signal,
      // but this form is also reachable via the vehicle-detail page's own trigger and isn't
      // guaranteed to always be wrapped by that shell's disabled binding.
      this.toast.error(
        "Photos still processing",
        "Please wait a moment for photo compression to finish.",
      );
      return;
    }

    this.isSubmitting.set(true);
    try {
      const ok = await submit(this.reportForm, async () => {
        const m = this.model();
        const location = this.capturedLocation();

        const idToken = await this.auth.idToken();
        const data = await this.graphql.request<AddSpottingEventData, AddSpottingEventVars>(
          ADD_SPOTTING_EVENT_MUTATION,
          {
            data: {
              spottingDate: m.spottingDate,
              vehicle: m.vehicleId,
              // Always sent, even empty — the backend's wheel_status save condition
              // is (incorrectly) keyed off notes's presence, not wheel_status's.
              notes: m.notes,
              runNumber: this.allowRunNumber() ? m.runNumber || null : null,
              status: m.status,
              type: m.type as SpottingType,
              wheelStatus: (m.wheelStatus || null) as WheelStatus | null,
              originStation:
                m.type === "BETWEEN_STATIONS"
                  ? m.originStation
                  : m.type === "AT_STATION"
                    ? m.atStation
                    : null,
              destinationStation: m.type === "BETWEEN_STATIONS" ? m.destinationStation : null,
              location:
                m.type === "LOCATION" && location
                  ? {
                      accuracy: location.accuracy,
                      latitude: location.latitude,
                      longitude: location.longitude,
                    }
                  : null,
              isAnonymous: m.isAnonymous,
            },
          },
          idToken ? { "firebase-auth-key": idToken } : {},
        );

        for (const photo of this.photos()) {
          this.uploads.addToQueue(data.addEvent.id, photo, "SPOTTING_EVENT");
        }
        return [];
      });

      if (ok) {
        this.toast.success(
          "Spotting entry recorded! 🥳",
          this.photos().length > 0
            ? "Please wait for uploads to complete before closing this tab."
            : undefined,
        );
        // Read BEFORE clear() — the payload carries the line so a host can send the reader back to
        // it, and the reset below is exactly what would take that away.
        const reportedLineId = this.model().lineId || null;
        this.clear();
        this.submitted.emit(reportedLineId);
      }
    } catch (err) {
      if (err instanceof GraphQLRequestError) {
        return;
      }
      toastSubmitFailure(this.toast);
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Public so the sheet shell's "Clear form" footer button can reset the draft in place
   * without closing the sheet. Also forgets the saved draft: Clear form, Discard and a successful
   * submit are the three ways a draft ends. */
  clear(): void {
    this.resetForm();
    if (this.isBrowser) {
      removeStorageItem("session", REPORT_FORM_DRAFT_KEY);
    }
    this._wroteDraft = false;
    if (this._draftBaseline !== null) {
      // Still open: the cleared form is the new untouched state.
      this._draftBaseline = this.model();
    }
  }

  /** The in-memory reset, shared by `clear()` and the close edge (which keeps the saved draft). */
  private resetForm(): void {
    this.model.set(emptyReportFormModel());
    this.photos.set([]);
    this.draftRestored.set(false);
    this.restoredPhotoCount.set(0);
    // A cleared form is untouched, not "touched-and-now-invalid" — without this, required
    // fields like lineId immediately show their error again since clearing doesn't undo the
    // touched state from before.
    this.reportForm().reset();
  }
}
