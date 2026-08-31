import { Component, computed, effect, inject, signal } from "@angular/core";
import { form as createForm, FormField, submit } from "@angular/forms/signals";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import {
  AssetMultiSelectComponent,
  type AssetMultiSelectOption,
} from "../asset-multi-select/asset-multi-select.component";
import { HlmButton } from "../../../ui/button/button";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { ErrorBoxComponent } from "../../../ui/error-box/error-box";
import { HlmInput } from "../../../ui/input/input";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  CalendarIncidentSeverity,
  ChronologyIndicator,
  CREATE_CALENDAR_INCIDENT_MUTATION,
  CreateCalendarIncidentData,
  CreateCalendarIncidentVars,
  SUBMIT_CALENDAR_INCIDENT_MUTATION,
  SubmitCalendarIncidentData,
  SubmitCalendarIncidentVars,
} from "../data/insiden.queries";
import { IncidentAiService } from "../data/incident-ai.service";
import { InsidenReferenceStore } from "../data/insiden-reference.store";
import { IncidentSheetService } from "../data/incident-sheet.service";
import {
  canMoveDown,
  canMoveUp,
  emptyChronology,
  moveChronology,
  removeChronology,
  toggleCollapsed,
  type ChronologyDraft,
} from "./chronology-list.util";
import { applyExtractionToChronology } from "./extract-data.util";
import { emptyIncidentFormModel, incidentFormSchema } from "./incident-form.schema";
import { ExtractedIncidentData } from "../data/incident-ai.service";

const SEVERITIES: CalendarIncidentSeverity[] = ["MAJOR", "MINOR", "OTHERS"];
const INDICATORS: ChronologyIndicator[] = ["GREEN", "RED", "BLUE", "GRAY"];
/** Client-side ceiling on an Extract Data call; the firebase function itself
 * runs with a 20s timeout, so a 15s front-end cap means a slow extraction is
 * surfaced to the user (and offered as a late result) rather than hanging. */
const EXTRACT_TIMEOUT_MS = 15_000;

/** Per-chronology state for the Extract Data flow. Late results (responses that
 * arrive after the 15s cap) are held here until the user opts to apply them. */
interface ChronologyExtractState {
  extracting: boolean;
  lateResult: ExtractedIncidentData | null;
  preReplaceSnapshot: { datetime: string; content: string } | null;
  replaced: boolean;
}

/**
 * "Report an Incident" sheet — right-side sidebar hosting the calendar-incident form.
 * The incident fields are a Signal Forms form; chronologies are a separate array signal
 * (dynamic nested lists don't fit the flat form model) edited through the pure operations
 * in chronology-list.util.ts — add/remove/collapse plus MVP up/down arrow reordering.
 *
 * TODO: Replace the up/down arrows with drag-and-drop reordering via Angular CDK
 * (DropList/DragDrop module) once the MVP ships:
 *   1. `ng add @angular/cdk` (the CDK package is already a dependency; this step is only
 *      needed if it were ever removed).
 *   2. Import `DragDropModule` (or the standalone `CdkDropList`/`CdkDrag` directives) here.
 *   3. Wrap the chronology list with `cdkDropList` and each card with `cdkDrag`:
 *        <div cdkDropList (cdkDropListDropped)="onChronologyDropped($event)">
 *          @for (c of chronologies(); track c.key) {
 *            <div cdkDrag [cdkDragData]="c.key"> ... </div>
 *          }
 *        </div>
 *   4. Implement the handler with the same pure helper the arrows already use:
 *        onChronologyDropped(event: CdkDragDrop<ChronologyDraft[]>): void {
 *          this.chronologies.update((list) =>
 *            moveChronology(list, event.previousIndex, event.currentIndex),
 *          );
 *        }
 *   5. Remove the up/down buttons; keep moveChronology as the single source of truth for
 *      ordering so both UIs stay behaviorally identical.
 *   Reference: https://material.angular.io/cdk/drag-drop/overview
 */
@Component({
  selector: "app-incident-form",
  imports: [
    AssetMultiSelectComponent,
    FormField,
    ErrorBoxComponent,
    HlmButton,
    HlmCheckbox,
    HlmInput,
    HlmNativeSelect,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
  ],
  templateUrl: "./incident-form.component.html",
})
export class IncidentFormComponent {
  protected readonly sheet = inject(IncidentSheetService);
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);
  private readonly ai = inject(IncidentAiService);
  protected readonly referenceStore = inject(InsidenReferenceStore);

  protected readonly model = signal(emptyIncidentFormModel());
  protected readonly incidentForm = createForm(this.model, incidentFormSchema);

  protected readonly chronologies = signal<ChronologyDraft[]>([]);
  private nextKey = 0;

  protected readonly severities = SEVERITIES;
  protected readonly indicators = INDICATORS;

  readonly isSubmitting = signal(false);
  protected readonly isSummarizing = signal(false);

  /** Affected-asset multi-selects live outside the flat form model (like chronologies):
   * they're arrays, and Signal Forms' flat fields don't model list selections. */
  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedVehicleIds = signal<string[]>([]);
  protected readonly selectedStationIds = signal<string[]>([]);

  /** Reference data (lines/vehicles/stations/categories) is fetched once by the
   * root-provided `InsidenReferenceStore`; this component only projects it. */
  protected readonly referenceResource = this.referenceStore.resource;

  protected readonly lineOptions = this.referenceStore.lineOptions;

  /** Vehicles filtered by the selected lines (preserves the form's prior behavior).
   * The store's `vehicleOptions` is unfiltered (all vehicles); we re-derive the
   * selected-filtered view here from `linesById` + `vehicleParentCodes`. */
  protected readonly vehicleOptions = computed<AssetMultiSelectOption[]>(() => {
    const selected = this.selectedLineIds();
    const linesById = this.referenceStore.linesById();
    const lines =
      selected.length > 0 ? selected.map((id) => linesById.get(id)) : [...linesById.values()];
    const seen = new Set<string>();
    const options: AssetMultiSelectOption[] = [];
    for (const line of lines) {
      if (!line) continue;
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          if (seen.has(vehicle.id)) continue;
          seen.add(vehicle.id);
          options.push({
            id: vehicle.id,
            label: vehicle.identificationNo,
            parentCodes: this.referenceStore.vehicleParentCodes().get(vehicle.id),
          });
        }
      }
    }
    return options;
  });

  protected readonly stationOptions = this.referenceStore.stationOptions;

  private readonly extractStates = signal(new Map<number, ChronologyExtractState>());

  private _wasSheetOpen = false;

  constructor() {
    // Reset the whole draft (including touched state) whenever the sheet closes, so the
    // next open starts blank regardless of how the previous session ended.
    effect(() => {
      const isOpen = this.sheet.isOpen();
      if (!isOpen && this._wasSheetOpen) {
        this.clear();
      }
      this._wasSheetOpen = isOpen;
    });
  }

  /** Type-safe value extraction for change/input events. Avoids `$any()` and the
   * inline `as` cast that Angular's template parser rejects inside event bindings. */
  protected eventValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected indicatorValue(event: Event): ChronologyIndicator {
    return (event.target as HTMLSelectElement).value as ChronologyIndicator;
  }

  protected isExtracting(key: number): boolean {
    return this.extractStates().get(key)?.extracting ?? false;
  }

  protected hasLateResult(key: number): boolean {
    return (this.extractStates().get(key)?.lateResult ?? null) !== null;
  }

  protected isReplaced(key: number): boolean {
    return this.extractStates().get(key)?.replaced ?? false;
  }

  protected severityLabel(severity: CalendarIncidentSeverity): string {
    return severity.charAt(0) + severity.slice(1).toLowerCase();
  }

  protected canMove(index: number, direction: "up" | "down"): boolean {
    return direction === "up"
      ? canMoveUp(this.chronologies(), index)
      : canMoveDown(this.chronologies(), index);
  }

  protected addChronology(): void {
    const chronology = emptyChronology(this.nextKey++);
    this.chronologies.update((list) => [...list, chronology]);
  }

  protected removeChronology(key: number): void {
    this.chronologies.update((list) => removeChronology(list, key));
    this.extractStates.update((map) => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  /** "Extract Data" — asks the Gemini-backed extractIncidentData callable to fill
   * this chronology entry from its source URL. Results within the 15s cap are
   * applied directly; anything later is offered through a replace/undo box. */
  protected async extractChronology(key: number): Promise<void> {
    const row = this.chronologies().find((c) => c.key === key);
    if (!row || this.isExtracting(key)) {
      return;
    }
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to use AI extraction.");
      return;
    }
    const url = row.sourceUrl.trim();
    if (!url) {
      this.toast.error("Enter a source URL", "Paste a link before extracting data.");
      return;
    }

    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${key}-${Math.random().toString(36).slice(2)}`;

    this.setExtractState(key, {
      extracting: true,
      lateResult: null,
      preReplaceSnapshot: null,
      replaced: false,
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.setExtractState(key, {
        extracting: false,
        lateResult: null,
        preReplaceSnapshot: null,
        replaced: false,
      });
      this.toast.error("Data extraction failed", "Please fill in manually.");
    }, EXTRACT_TIMEOUT_MS);

    try {
      const result = await this.ai.extract(url, requestId);
      clearTimeout(timer);
      if (this.extractStates().get(key) === undefined) {
        return;
      }
      if (timedOut) {
        this.setExtractState(key, {
          extracting: false,
          lateResult: result?.data ?? null,
          preReplaceSnapshot: null,
          replaced: false,
        });
        return;
      }
      if (result) {
        this.applyExtraction(key, result.data);
      }
    } catch {
      clearTimeout(timer);
      if (!timedOut) {
        this.setExtractState(key, {
          extracting: false,
          lateResult: null,
          preReplaceSnapshot: null,
          replaced: false,
        });
      }
    }
  }

  /** Applies a late extraction result, snapshotting the entry first so Undo can
   * restore the user's pre-replace values. */
  protected replaceWithExtraction(key: number): void {
    const state = this.extractStates().get(key);
    const row = this.chronologies().find((c) => c.key === key);
    if (!state?.lateResult || !row) {
      return;
    }
    this.extractStates.update((map) => {
      const next = new Map(map);
      next.set(key, {
        ...state,
        preReplaceSnapshot: { datetime: row.datetime, content: row.content },
        replaced: true,
      });
      return next;
    });
    this.applyExtraction(key, state.lateResult);
  }

  protected undoExtraction(key: number): void {
    const state = this.extractStates().get(key);
    if (!state?.preReplaceSnapshot || !state.replaced) {
      return;
    }
    this.chronologies.update((list) =>
      list.map((c) => (c.key === key ? { ...c, ...state.preReplaceSnapshot! } : c)),
    );
    this.extractStates.update((map) => {
      const next = new Map(map);
      next.set(key, {
        ...state,
        replaced: false,
        lateResult: null,
        preReplaceSnapshot: null,
      });
      return next;
    });
  }

  private setExtractState(key: number, state: ChronologyExtractState): void {
    this.extractStates.update((map) => {
      const next = new Map(map);
      next.set(key, state);
      return next;
    });
  }

  private applyExtraction(key: number, data: ExtractedIncidentData): void {
    this.chronologies.update((list) =>
      list.map((c) => (c.key === key ? applyExtractionToChronology(c, data) : c)),
    );
  }

  protected toggleChronologyCollapsed(key: number): void {
    this.chronologies.update((list) => toggleCollapsed(list, key));
  }

  protected moveChronologyBy(index: number, offset: -1 | 1): void {
    this.chronologies.update((list) => moveChronology(list, index, index + offset));
  }

  /** "Summarize Incident" — asks the Gemini-backed summarizeIncident callable to condense
   * the drafted chronology entries into the title/brief/details fields. */
  protected async summarize(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to use AI summarization.");
      return;
    }
    const entries = this.chronologies()
      .map((c) => ({
        indicator: c.indicator,
        datetime: c.datetime,
        content: c.content,
        sourceUrl: c.sourceUrl,
      }))
      .filter((c) => c.content?.trim());
    if (entries.length === 0) {
      this.toast.error(
        "Nothing to summarize",
        "Add at least one chronology entry with content first.",
      );
      return;
    }
    this.isSummarizing.set(true);
    try {
      const result = await this.ai.summarize(entries);
      if (!result) {
        return;
      }
      this.model.update((m) => ({
        ...m,
        title: result.title,
        brief: result.brief,
        details: result.details,
      }));
      this.toast.success("Summary ready", "Title, brief and details were filled in.");
    } finally {
      this.isSummarizing.set(false);
    }
  }

  /** Public so a hosting shell's footer can drive Submit/Clear like the spotting sheet does. */
  async submit(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to report an incident.");
      return;
    }

    this.isSubmitting.set(true);
    try {
      const ok = await submit(this.incidentForm, async () => {
        const m = this.model();
        const idToken = await this.auth.idToken();
        const headers: Record<string, string> = idToken ? { "firebase-auth-key": idToken } : {};
        const created = await this.graphql.request<
          CreateCalendarIncidentData,
          CreateCalendarIncidentVars
        >(
          CREATE_CALENDAR_INCIDENT_MUTATION,
          {
            data: {
              title: m.title,
              brief: m.brief,
              details: m.details || null,
              startDatetime: new Date(m.startDatetime).toISOString(),
              endDatetime: m.endDatetime ? new Date(m.endDatetime).toISOString() : null,
              severity: m.severity as CalendarIncidentSeverity,
              longTerm: m.longTerm,
              inaccurate: m.inaccurate,
              lineIds: this.selectedLineIds(),
              vehicleIds: this.selectedVehicleIds(),
              stationIds: this.selectedStationIds(),
              chronologies: this.chronologies().map((c) => ({
                indicator: c.indicator,
                datetime: c.datetime ? new Date(c.datetime).toISOString() : null,
                sourceUrl: c.sourceUrl || null,
                content: c.content || null,
              })),
            },
          },
          headers,
        );
        // Admin creates land LIVE directly; only non-admin drafts need the approval queue.
        if (!this.auth.isAdmin() && created.createCalendarIncident.id !== null) {
          await this.graphql.request<SubmitCalendarIncidentData, SubmitCalendarIncidentVars>(
            SUBMIT_CALENDAR_INCIDENT_MUTATION,
            { calendarIncidentId: String(created.createCalendarIncident.id) },
            headers,
          );
        }
        return [];
      });

      if (ok) {
        this.toast.success("Incident submitted", "It will appear once approved.");
        this.clear();
        this.sheet.close();
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

  clear(): void {
    this.model.set(emptyIncidentFormModel());
    this.chronologies.set([]);
    this.extractStates.set(new Map());
    this.selectedLineIds.set([]);
    this.selectedVehicleIds.set([]);
    this.selectedStationIds.set([]);
    this.incidentForm().reset();
  }
}
