import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { form as createForm, FormField, submit } from "@angular/forms/signals";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { toastSubmitFailure } from "../../../core/graphql/submit-failure";
import { AssetMultiSelectComponent } from "../asset-multi-select/asset-multi-select.component";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { ErrorBoxComponent } from "../../../ui/error-box/error-box";
import { HlmInput } from "../../../ui/input/input";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  CalendarIncident,
  CalendarIncidentSeverity,
  ChronologyIndicator,
  CREATE_CALENDAR_INCIDENT_MUTATION,
  CreateCalendarIncidentData,
  CreateCalendarIncidentVars,
  SUBMIT_CALENDAR_INCIDENT_MUTATION,
  SubmitCalendarIncidentData,
  SubmitCalendarIncidentVars,
  UPDATE_CALENDAR_INCIDENT_MUTATION,
  UpdateCalendarIncidentData,
  UpdateCalendarIncidentVars,
} from "../data/insiden.queries";
import { IncidentAiService } from "../data/incident-ai.service";
import { IncidentSheetService } from "../data/incident-sheet.service";
import {
  defaultCategoryId,
  injectDefaultCategory,
  injectInsidenReferenceOptions,
} from "../data/insiden-reference-options";
import {
  canMoveDown,
  canMoveUp,
  chronologyErrors,
  chronologyInputs,
  emptyChronology,
  indicatorDotClass,
  indicatorLabel,
  moveChronology,
  removeChronology,
  setAllCollapsed,
  toggleCollapsed,
  updateChronology,
  type ChronologyDraft,
} from "./chronology-list.util";
import {
  applyExtractionToChronology,
  describeFillNotes,
  describeFormFill,
  extractionWindow,
  isoToDateTimeLocal,
  planFormFill,
  plausibleDatetime,
  proposeIndicator,
  type FormFillReference,
  type ReferenceMatchOption,
} from "./extract-data.util";
import { incidentToForm } from "./incident-to-form.util";
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
  preReplaceSnapshot: { datetime: string; content: string; indicator: ChronologyIndicator } | null;
  replaced: boolean;
}

/** A line or station a "Fill from link" put into the Affected fields, shown as a dismissible chip. */
interface FillChip {
  kind: "line" | "station";
  id: string;
  label: string;
}

/** What the last fill left behind for the chips and the "Couldn't match" note. */
interface FillNotes {
  lines: ReferenceMatchOption[];
  stations: ReferenceMatchOption[];
  unmatchedLines: string[];
  unmatchedStations: string[];
}

const NO_FILL_NOTES: FillNotes = {
  lines: [],
  stations: [],
  unmatchedLines: [],
  unmatchedStations: [],
};

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
    HlmBadge,
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

  protected readonly model = signal(emptyIncidentFormModel());
  protected readonly incidentForm = createForm(this.model, incidentFormSchema);

  protected readonly chronologies = signal<ChronologyDraft[]>([]);
  private nextKey = 0;

  protected readonly severities = SEVERITIES;
  protected readonly indicators = INDICATORS;

  readonly isSubmitting = signal(false);
  protected readonly isSummarizing = signal(false);

  /** A create or edit went through. The host reloads its list on this, and not on every close. */
  readonly saved = output<void>();

  /** Affected-asset multi-selects live outside the flat form model (like chronologies):
   * they're arrays, and Signal Forms' flat fields don't model list selections. */
  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedVehicleIds = signal<string[]>([]);
  protected readonly selectedStationIds = signal<string[]>([]);

  protected readonly isEditing = computed(() => this.sheet.editTarget() !== null);

  private readonly reference = injectInsidenReferenceOptions(
    this.selectedLineIds,
    this.selectedVehicleIds,
  );
  protected readonly referenceResource = this.reference.resource;
  protected readonly lineOptions = this.reference.lineOptions;
  protected readonly vehicleOptions = this.reference.vehicleOptions;
  protected readonly stationOptions = this.reference.stationOptions;
  protected readonly categoryOptions = this.reference.categoryOptions;

  /** Category is a single mandatory dropdown value (default "Just Reporting") — the mutation
   * contract still takes an array, derived in `selectedCategoryIds`. Mirrors link-form. */
  protected readonly selectedCategoryId = injectDefaultCategory(
    this.categoryOptions,
    this.isEditing,
  );
  protected readonly selectedCategoryIds = computed<string[]>(() => {
    const id = this.selectedCategoryId();
    return id ? [id] : [];
  });

  /** The loaded lines and stations as the extraction matcher wants them; `null` until the reference
   * read has succeeded, so a fill that runs before then skips matching rather than reporting
   * every name as unmatched. */
  private readonly _fillReference = computed<FormFillReference | null>(() => {
    const data = this.referenceResource.data();
    if (!data) {
      return null;
    }
    return {
      lines: data.lines.map((line) => ({
        id: line.id,
        label: line.code,
        names: [line.code, line.displayName],
      })),
      stations: data.stations.map((station) => ({
        id: station.id,
        label: station.displayName,
        names: [station.displayName],
      })),
    };
  });

  private readonly _fillNotes = signal<FillNotes>(NO_FILL_NOTES);

  /** Chips for the lines and stations "Fill from link" selected. They follow the live selection, so
   * removing the line or station in the list below drops its chip too. */
  protected readonly fillChips = computed<FillChip[]>(() => {
    const { lines, stations } = this._fillNotes();
    const selectedLines = this.selectedLineIds();
    const selectedStations = this.selectedStationIds();
    return [
      ...lines
        .filter((line) => selectedLines.includes(line.id))
        .map((line) => ({ kind: "line" as const, id: line.id, label: line.label })),
      ...stations
        .filter((station) => selectedStations.includes(station.id))
        .map((station) => ({ kind: "station" as const, id: station.id, label: station.label })),
    ];
  });

  /** Names the extraction mentioned that match no loaded line or station. */
  protected readonly fillUnmatched = computed(() => {
    const { unmatchedLines, unmatchedStations } = this._fillNotes();
    return [...unmatchedLines, ...unmatchedStations];
  });

  /** The same facts as the chips and the note, as one sentence in an always-present live region:
   * a region inserted already holding text is not reliably announced, and the toast only says how
   * many lines and stations were filled, not which. */
  protected readonly fillAnnouncement = computed(() => {
    const labels = this.fillChips().map((chip) => chip.label);
    const unmatched = this.fillUnmatched();
    return [
      labels.length > 0 ? `Filled from link: ${labels.join(", ")}.` : "",
      unmatched.length > 0 ? `Couldn't match: ${unmatched.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  });

  private readonly affectedHeading = viewChild<ElementRef<HTMLElement>>("affectedHeading");

  protected dismissFillChip(chip: FillChip): void {
    // The focused button leaves the DOM with its chip, which would drop focus to the page. Park it
    // on the section heading instead: the next Tab reaches the next chip.
    this.affectedHeading()?.nativeElement.focus();
    (chip.kind === "line" ? this.selectedLineIds : this.selectedStationIds).update((ids) =>
      ids.filter((id) => id !== chip.id),
    );
    // Also forget it, so selecting the same line by hand later does not bring back a "Filled from
    // link" chip for a choice the rider made themselves.
    this._fillNotes.update((notes) => ({
      ...notes,
      lines: chip.kind === "line" ? notes.lines.filter((line) => line.id !== chip.id) : notes.lines,
      stations:
        chip.kind === "station"
          ? notes.stations.filter((station) => station.id !== chip.id)
          : notes.stations,
    }));
  }

  protected onCategoryChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedCategoryId.set(value || null);
  }

  private readonly extractStates = signal(new Map<number, ChronologyExtractState>());

  /** Id of the incident already hydrated for the current open session — re-running the
   * effect (e.g. reference data arriving) must not stomp user edits. Reset whenever the
   * sheet closes or the target is cleared, so the next open re-hydrates. */
  private _hydratedIncidentId: string | null = null;

  constructor() {
    // Hydrate from `editTarget` once per open: `IncidentSheetService.open(incident)` is the
    // Task 12 edit entry point (also callable as `hydrate()` directly). The reference
    // resource arriving later does NOT re-trigger — the effect only depends on the target.
    effect(() => {
      const target = this.sheet.editTarget();
      if (!this.sheet.isOpen() || !target) {
        this._hydratedIncidentId = null;
        return;
      }
      if (target.id === this._hydratedIncidentId) {
        return;
      }
      this._hydratedIncidentId = target.id;
      this.hydrate(target);
    });
  }

  /** Public edit entry: maps an incident row onto the full form state (model, chronological
   * drafts, and the four affected-asset id arrays) via incidentToForm(), replacing any
   * partially-edited draft. Also adopted by IncidentSheetService.open(incident) hydration. */
  hydrate(incident: CalendarIncident): void {
    const mapped = incidentToForm(incident, this.nextKey);
    this.nextKey += mapped.chronologies.length;
    this.model.set(mapped.model);
    this.chronologies.set(mapped.chronologies);
    this.selectedLineIds.set(mapped.selectedLineIds);
    this.selectedVehicleIds.set(mapped.selectedVehicleIds);
    this.selectedStationIds.set(mapped.selectedStationIds);
    this.selectedCategoryId.set(mapped.selectedCategoryIds[0] ?? null);
    this._fillNotes.set(NO_FILL_NOTES);
    this.extractStates.set(new Map());
    this.isSummarizing.set(false);
    this._showChronologyErrors.set(false);
    this.incidentForm().reset();
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

  protected indicatorLabel(indicator: ChronologyIndicator): string {
    return indicatorLabel(indicator);
  }

  protected indicatorDotClass(indicator: ChronologyIndicator): string {
    return indicatorDotClass(indicator);
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

  protected editChronology(
    key: number,
    field: "datetime" | "sourceUrl" | "content",
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.chronologies.update((list) => updateChronology(list, key, { [field]: value }));
  }

  protected setChronologyIndicator(key: number, event: Event): void {
    // The select only offers INDICATORS.
    const indicator = (event.target as HTMLSelectElement).value as ChronologyIndicator;
    this.chronologies.update((list) => updateChronology(list, key, { indicator }));
  }

  /** Off until the first submit attempt, like a field's touched state; from then on a row's message
   * follows every edit. */
  private readonly _showChronologyErrors = signal(false);
  protected readonly rowErrors = computed(() =>
    this._showChronologyErrors()
      ? chronologyErrors(this.chronologies())
      : new Map<number, string>(),
  );

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
      // Answered inside the cap (data or null): release the row. Only the timeout, late-result and
      // catch paths cleared `extracting` before, so a normal extraction left the whole row locked.
      this.setExtractState(key, {
        extracting: false,
        lateResult: null,
        preReplaceSnapshot: null,
        replaced: false,
      });
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
        preReplaceSnapshot: {
          datetime: row.datetime,
          content: row.content,
          indicator: row.indicator,
        },
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

  /** "Fill from link" for one extraction. The row takes the datetime (when plausible), the content
   * and, for a blank row, the indicator; the form's own title, severity, lines and stations are
   * filled only where still empty. Nothing the rider typed is overwritten, except the row's
   * datetime and content, which an extraction has always replaced. */
  private applyExtraction(key: number, data: ExtractedIncidentData): void {
    const datetime = plausibleDatetime(
      data.datetime,
      extractionWindow(new Date(), this.model().startDatetime),
    );
    // A time the model gave and the window refused, as opposed to no time at all, is worth a word.
    const timeRejected = datetime === null && isoToDateTimeLocal(data.datetime) !== "";
    const checked = { ...data, datetime };
    this.chronologies.update((list) =>
      list.map((c) =>
        c.key === key
          ? { ...applyExtractionToChronology(c, checked), indicator: proposeIndicator(c, data) }
          : c,
      ),
    );
    this.fillFormFields(data, timeRejected);
  }

  private fillFormFields(data: ExtractedIncidentData, timeRejected: boolean): void {
    const { title, severity } = this.model();
    const fill = planFormFill(
      {
        title,
        severity,
        lineIds: this.selectedLineIds(),
        stationIds: this.selectedStationIds(),
      },
      data,
      this._fillReference(),
    );
    if (fill.title !== null || fill.severity !== null) {
      this.model.update((m) => ({
        ...m,
        title: fill.title ?? m.title,
        severity: fill.severity ?? m.severity,
      }));
    }
    if (fill.lines.matched.length > 0) {
      this.selectedLineIds.set(fill.lines.matched.map((line) => line.id));
    }
    if (fill.stations.matched.length > 0) {
      this.selectedStationIds.set(fill.stations.matched.map((station) => station.id));
    }
    // A field the extraction said nothing about (or that was already filled) keeps its earlier note.
    const hasLines = fill.lines.matched.length + fill.lines.unmatched.length > 0;
    const hasStations = fill.stations.matched.length + fill.stations.unmatched.length > 0;
    this._fillNotes.update((notes) => ({
      lines: hasLines ? fill.lines.matched : notes.lines,
      unmatchedLines: hasLines ? fill.lines.unmatched : notes.unmatchedLines,
      stations: hasStations ? fill.stations.matched : notes.stations,
      unmatchedStations: hasStations ? fill.stations.unmatched : notes.unmatchedStations,
    }));
    // The title, severity and chips sit far above the chronology row the rider just pressed.
    const filled = describeFormFill(fill);
    const notes = describeFillNotes(fill, timeRejected);
    if (filled) {
      this.toast.success(
        "Filled from link",
        [`Filled in ${filled}.`, ...notes, "Review before you submit."].join(" "),
      );
    } else if (notes.length > 0) {
      this.toast.info("Fill from link", notes.join(" "));
    }
  }

  protected toggleChronologyCollapsed(key: number): void {
    this.chronologies.update((list) => toggleCollapsed(list, key));
  }

  /** False for an empty list so the header toggle never offers "Expand all" with nothing to
   * expand (the button is disabled anyway). */
  protected readonly allCollapsed = computed(
    () => this.chronologies().length > 0 && this.chronologies().every((c) => c.collapsed),
  );

  protected toggleAllCollapsed(): void {
    this.chronologies.update((list) => setAllCollapsed(list, !this.allCollapsed()));
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
    // Enter in a field (or the keyboard's Go key) reaches here past the disabled footer button.
    if (this.isSubmitting()) {
      return;
    }
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to report an incident.");
      return;
    }

    this._showChronologyErrors.set(true);
    const [firstRowError] = chronologyErrors(this.chronologies()).values();
    if (firstRowError) {
      this.toast.error("Check the chronology", firstRowError);
      return;
    }

    this.isSubmitting.set(true);
    const target = this.sheet.editTarget();
    /** True when the edit created/resumed a DRAFT revision that was chained into the
     * approval queue (backend returned a revision id). Drives the success toast wording. */
    let submittedForApproval = false;
    try {
      const ok = await submit(this.incidentForm, async () => {
        const m = this.model();
        const idToken = await this.auth.idToken();
        const headers: Record<string, string> = idToken ? { "firebase-auth-key": idToken } : {};
        if (target) {
          const updated = await this.graphql.request<
            UpdateCalendarIncidentData,
            UpdateCalendarIncidentVars
          >(
            UPDATE_CALENDAR_INCIDENT_MUTATION,
            {
              calendarIncidentId: target.id,
              input: {
                title: m.title,
                brief: m.brief,
                details: m.details || null,
                startDatetime: new Date(m.startDatetime).toISOString(),
                endDatetime: m.endDatetime ? new Date(m.endDatetime).toISOString() : null,
                severity: m.severity as CalendarIncidentSeverity,
                longTerm: m.longTerm,
                inaccurate: m.inaccurate,
                // Echoed, not editable: the backend defaults an omitted impactFactor to 0,
                // so leaving it out would silently wipe it on every public edit.
                impactFactor: target.impactFactor ?? 0,
                lineIds: this.selectedLineIds(),
                vehicleIds: this.selectedVehicleIds(),
                stationIds: this.selectedStationIds(),
                categoryIds: this.selectedCategoryIds(),
                chronologies: chronologyInputs(this.chronologies()),
                version: target.version ?? null,
              },
            },
            headers,
          );
          // The backend returns a revision id ONLY when the update created/resumed a DRAFT
          // revision (non-admin editing a LIVE incident, incl. same-actor draft resume).
          // Chain the submit mutation so the revision reaches the approval queue — otherwise
          // it sits invisible in DRAFT while the pending queue only shows PENDING_APPROVAL.
          // Mirrors the create flow's CREATE → SUBMIT chaining for non-admins.
          if (updated.updateCalendarIncident.id !== null) {
            submittedForApproval = true;
            await this.graphql.request<SubmitCalendarIncidentData, SubmitCalendarIncidentVars>(
              SUBMIT_CALENDAR_INCIDENT_MUTATION,
              { calendarIncidentId: updated.updateCalendarIncident.id },
              headers,
            );
          }
          return [];
        }
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
              categoryIds: this.selectedCategoryIds(),
              chronologies: chronologyInputs(this.chronologies()),
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
        this.toast.success(
          target ? "Incident updated" : "Incident submitted",
          target
            ? submittedForApproval
              ? "Your changes were submitted for approval."
              : "Your changes were saved."
            : "It will appear once approved.",
        );
        this.saved.emit();
        this.close();
      }
    } catch (err) {
      if (err instanceof GraphQLRequestError) {
        // Backend rejection — e.g. the Task 2 one-open-draft error or the version-mismatch
        // conflict — is surfaced VERBATIM (no rewriting) and the sheet stays open with the
        // form state intact so the user can act on what the backend said.
        this.toast.error("Couldn't save changes", err.message);
        return;
      }
      toastSubmitFailure(this.toast);
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Every way the rider closes the sheet (Cancel, Escape, the backdrop) ends here, so the next open
   * starts blank, touched state included, however this session ended. */
  protected close(): void {
    this.clear();
    this.sheet.close();
  }

  clear(): void {
    this.model.set(emptyIncidentFormModel());
    this.chronologies.set([]);
    this.extractStates.set(new Map());
    this.selectedLineIds.set([]);
    this.selectedVehicleIds.set([]);
    this.selectedStationIds.set([]);
    this.selectedCategoryId.set(defaultCategoryId(this.categoryOptions()));
    this._fillNotes.set(NO_FILL_NOTES);
    this._showChronologyErrors.set(false);
    this.sheet.editTarget.set(null);
    this.incidentForm().reset();
  }

  /** Edit-session variant of `clear()`: re-hydrates the form from the original edit target so
   * all edits since opening are reverted in place ("Undo All"). Non-edit fallback = clear. */
  undoAll(): void {
    const target = this.sheet.editTarget();
    if (!target) {
      this.clear();
      return;
    }
    this.hydrate(target);
  }
}
