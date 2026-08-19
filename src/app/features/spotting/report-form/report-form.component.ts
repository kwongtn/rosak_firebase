import { Component, computed, effect, inject, output, signal, viewChild } from "@angular/core";
import { form as createForm, FormField, submit } from "@angular/forms/signals";
import {
  graphqlResource,
  GraphQLClient,
  GraphQLRequestError,
} from "../../../core/graphql/graphql-client";
import { SpottingType, VehicleStatus, WheelStatus } from "../../../core/graphql/types";
import { AuthService } from "../../../core/auth/auth.service";
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
import { allowRunNumber, numberSeenToSetNumbers } from "../data/vehicle-search.util";
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
import { emptyReportFormModel, reportFormSchema } from "./report-form.schema";
import { PhotoPickerComponent } from "./photo-picker/photo-picker.component";
import { ImageFile } from "../../../core/upload/image-file";

const ABNORMAL_STATUSES = new Set(["DECOMMISSIONED", "MARRIED", "OUT_OF_SERVICE", "UNKNOWN"]);

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
  readonly submitted = output<void>();

  protected readonly linesStore = inject(SpottingLinesStore);
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);
  private readonly uploads = inject(ImageUploadService);
  private readonly reportSheet = inject(ReportSheetService);

  protected readonly photos = signal<ImageFile[]>([]);
  private readonly photoPickerRef = viewChild(PhotoPickerComponent);
  /** Public so the sheet shell's footer can disable Submit while true — see the doc comment on
   * PhotoPickerComponent.isCompressing for why submitting mid-compression is a real bug, not
   * just an edge case: a photo captured into the upload queue before its compression settles
   * never gets uploaded, silently, forever. */
  readonly isPhotosCompressing = computed(() => this.photoPickerRef()?.isCompressing() ?? false);

  protected readonly model = signal(emptyReportFormModel());
  protected readonly reportForm = createForm(this.model, reportFormSchema);

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
    this._vehiclesForLine().map((v) => ({
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
  protected readonly isAbnormalVehicle = computed(() =>
    ABNORMAL_STATUSES.has(this.model().selectedVehicleStatus),
  );
  protected readonly selectedVehicleStatusValue = computed(() => {
    const status = this.model().selectedVehicleStatus;
    return status ? (status as VehicleStatus) : undefined;
  });

  private readonly stationLinesResource = graphqlResource<
    StationLinesQueryData,
    StationLinesQueryVars
  >(() => {
    const { lineId, type } = this.model();
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

  private _lastLineId = "";
  private _wasSheetOpen = false;

  constructor() {
    // Changing the line discards the vehicle selection — same as the old app.
    effect(() => {
      const lineId = this.model().lineId;
      if (lineId !== this._lastLineId) {
        this._lastLineId = lineId;
        this.model.update((m) => ({ ...m, vehicleId: "", selectedVehicleStatus: "" }));
      }
    });

    // Keep selectedVehicleStatus (used only by the sanity-test schema rule) in sync with
    // whichever vehicle is currently selected.
    effect(() => {
      const vehicleId = this.model().vehicleId;
      const status = this._vehiclesForLine().find((v) => v.id === vehicleId)?.status ?? "";
      if (status !== this.model().selectedVehicleStatus) {
        this.model.update((m) => ({ ...m, selectedVehicleStatus: status }));
      }
    });

    // Reset the whole draft, including touched state (see clear()), on the open→closed
    // edge — otherwise a field like line, once touched, stays filled in and "touched" for
    // the next time the sheet opens, regardless of *how* it closed (Cancel, backdrop click,
    // Escape — anything that isn't the submit-success path, which already calls clear()
    // itself; calling it again here on that same edge is harmless). The line and vehicle
    // fields deliberately always start blank, even when opened from a vehicle-detail page's
    // own "Add a Spotting Entry" button — the vehicle you were just looking at isn't
    // necessarily the one you're reporting on.
    effect(() => {
      const isSheetOpen = this.reportSheet.isOpen();
      if (!isSheetOpen && this._wasSheetOpen) {
        this.clear();
      }
      this._wasSheetOpen = isSheetOpen;
    });
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
        this.capturedLocation.set(position.coords);
        this.toast.info(
          "Location accessed",
          "Take note that we will not know your location until you submit the form.",
        );
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
                      altitudeAccuracy: location.altitudeAccuracy,
                      heading: location.heading,
                      speed: location.speed,
                      latitude: location.latitude,
                      longitude: location.longitude,
                      altitude: location.altitude,
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
        this.clear();
        this.submitted.emit();
      }
    } catch (err) {
      if (err instanceof GraphQLRequestError) {
        return;
      }
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Public so the sheet shell's "Clear form" footer button can reset the draft in place
   * without closing the sheet. */
  clear(): void {
    this.model.set(emptyReportFormModel());
    this.photos.set([]);
    // A cleared form is untouched, not "touched-and-now-invalid" — without this, required
    // fields like lineId immediately show their error again since clearing doesn't undo the
    // touched state from before.
    this.reportForm().reset();
  }
}
