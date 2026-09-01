import { DatePipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { form as createForm, FormField, submit } from "@angular/forms/signals";
import { AuthService } from "../../../../core/auth/auth.service";
import { graphqlResource, GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import { HlmBadge, type BadgeVariants } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmCardImports } from "../../../../ui/card/card";
import { HlmCheckbox } from "../../../../ui/checkbox/checkbox";
import { ErrorBoxComponent } from "../../../../ui/error-box/error-box";
import { HlmInput } from "../../../../ui/input/input";
import { HlmNativeSelect } from "../../../../ui/select/native-select";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../../ui/sheet/sheet";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { HlmTableImports } from "../../../../ui/table/table";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { ConsoleNavComponent } from "../../console-nav.component";
import {
  AssetMultiSelectComponent,
  type AssetMultiSelectOption,
} from "../../../insiden/asset-multi-select/asset-multi-select.component";
import {
  CalendarIncident,
  CalendarIncidentSeverity,
  ChronologyIndicator,
  INSIDEN_REFERENCE_QUERY,
  InsidenReferenceQueryData,
} from "../../../insiden/data/insiden.queries";
import {
  ExtractedIncidentData,
  IncidentAiService,
} from "../../../insiden/data/incident-ai.service";
import { IncidentCardComponent } from "../../../insiden/incident-card/incident-card.component";
import {
  canMoveDown,
  canMoveUp,
  emptyChronology,
  moveChronology,
  removeChronology,
  toggleCollapsed,
  type ChronologyDraft,
} from "../../../insiden/incident-form/chronology-list.util";
import {
  applyExtractionToChronology,
  isoToDateTimeLocal,
} from "../../../insiden/incident-form/extract-data.util";
import {
  emptyIncidentFormModel,
  incidentFormSchema,
} from "../../../insiden/incident-form/incident-form.schema";
import {
  APPROVE_INCIDENT_MUTATION,
  ApproveIncidentVars,
  IncidentMutationData,
  PENDING_INCIDENTS_QUERY,
  PendingIncident,
  PendingIncidentsQueryData,
  PendingIncidentsQueryVars,
  REJECT_INCIDENT_MUTATION,
  RejectIncidentVars,
  UPDATE_CALENDAR_INCIDENT_MUTATION,
  UpdateCalendarIncidentData,
  UpdateCalendarIncidentVars,
} from "../data/insiden-console.queries";
import {
  SEARCH_DEBOUNCE_MS,
  createTrailingDebounce,
  searchTermOrUndefined,
} from "../data/search-debounce.util";
import { linesLabel } from "../../../../core/util/lines-label.util";

const SEVERITY_VARIANT: Record<PendingIncident["severity"], BadgeVariants["variant"]> = {
  MAJOR: "destructive",
  MINOR: "warning",
  OTHERS: "neutral",
};

const SEVERITY_LABEL: Record<PendingIncident["severity"], string> = {
  MAJOR: "Major",
  MINOR: "Minor",
  OTHERS: "Other",
};

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

/** Map a pending row onto the public `CalendarIncident` shape so the /insiden source-page
 *  element — `IncidentCardComponent` — can be embedded as-is in the detail panel. */
function asCalendarIncident(row: PendingIncident): CalendarIncident {
  return {
    id: row.id,
    startDatetime: row.startDatetime,
    endDatetime: row.endDatetime,
    severity: row.severity,
    title: row.title,
    brief: row.brief,
    details: row.details,
    hasDetails: row.hasDetails,
    impactFactor: row.impactFactor,
    longTerm: row.longTerm,
    inaccurate: row.inaccurate,
    lastUpdated: row.lastUpdated,
    lines: row.lines,
    vehicles: row.vehicles,
    stations: row.stations,
    chronologies: row.chronologies,
    voteScore: row.voteScore,
    voteBreakdown: row.voteBreakdown,
    userVote: row.userVote,
    medias: row.medias,
  };
}

/**
 * /console/insiden/pending — admin approval queue for calendar incidents.
 * Lists PENDING_APPROVAL submissions oldest-first with a debounced text
 * search (title/brief/details/chronology source URLs, matched server-side)
 * and per-row Approve / Reject actions. Reject requires a reason, entered
 * in a modal sheet; approve is immediate. Both remove the row locally on
 * success — the queue only ever shows what still needs a decision.
 *
 * Row click opens a fully editable detail panel: the same field set as
 * "Report an Incident" — title/brief/details, start/end datetimes, severity,
 * long-term/inaccurate flags, impact factor, lines/vehicles/stations/categories
 * multi-selects, and the full chronology editor (add/remove/collapse/reorder
 * plus per-entry AI Extract and the Summarize Incident action) — pre-filled
 * from the selected row. Save calls the IsAdmin `updateCalendarIncident`,
 * which replaces the M2M sets and chronologies verbatim, so the payload
 * carries the complete edited form state; the row and the detail card are
 * then patched locally. Approve/Reject keep operating on the queued row.
 */
@Component({
  selector: "app-console-pending-incidents",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    AssetMultiSelectComponent,
    DatePipe,
    ErrorBoxComponent,
    FormField,
    HlmBadge,
    HlmButton,
    HlmCheckbox,
    HlmInput,
    HlmNativeSelect,
    HlmSkeleton,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    ...HlmCardImports,
    ...HlmTableImports,
    ConsoleNavComponent,
    IncidentCardComponent,
  ],
  templateUrl: "./pending.component.html",
})
export class PendingIncidentsComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly ai = inject(IncidentAiService);
  private readonly searchDebouncer = createTrailingDebounce(SEARCH_DEBOUNCE_MS);
  protected readonly linesLabel = linesLabel;

  protected readonly rows = signal<PendingIncident[]>([]);
  protected readonly isLoading = signal(false);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly searchTerm = signal("");
  protected readonly isMutating = signal(false);

  protected readonly rejectTarget = signal<PendingIncident | null>(null);
  protected readonly rejectReason = signal("");

  protected readonly selectedRow = signal<PendingIncident | null>(null);
  protected readonly panelIncident = computed(() => {
    const row = this.selectedRow();
    return row ? asCalendarIncident(row) : null;
  });

  /* --------------------------------------------------------------------- *
   * Full edit form state — mirrors IncidentFormComponent's field set so the
   * panel behaves identically to "Report an Incident": a Signal Forms form
   * for the flat model, separate array signals for the chronologies and the
   * affected-asset selections (dynamic/lists don't fit the flat model).
   * --------------------------------------------------------------------- */

  protected readonly model = signal(emptyIncidentFormModel());
  protected readonly incidentForm = createForm(this.model, incidentFormSchema);

  protected readonly chronologies = signal<ChronologyDraft[]>([]);
  private nextKey = 0;

  protected readonly severities = SEVERITIES;
  protected readonly indicators = INDICATORS;

  /** Impact factor lives outside the report form's model (the public form never
   *  exposes it), but the panel keeps it editable and echoes it in the update. */
  protected readonly editImpactFactor = signal(0);

  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedVehicleIds = signal<string[]>([]);
  protected readonly selectedStationIds = signal<string[]>([]);
  protected readonly selectedCategoryIds = signal<string[]>([]);

  protected readonly referenceResource = graphqlResource<InsidenReferenceQueryData>(() => ({
    query: INSIDEN_REFERENCE_QUERY,
  }));

  protected readonly lineOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.lines ?? []).map((line) => ({
      id: line.id,
      label: `${line.code} — ${line.displayName}`,
    })),
  );

  private readonly _linesById = computed(() => {
    const lines = this.referenceResource.data()?.lines ?? [];
    return new Map(lines.map((line) => [line.id, line]));
  });

  /** A vehicle's true line memberships, built over ALL lines (not just the
   * selected-filtered view vehicleOptions() uses) — a vehicle's parent codes
   * shouldn't disappear just because its line got unchecked. */
  private readonly _vehicleParentCodes = computed(() => {
    const lines = this.referenceResource.data()?.lines ?? [];
    const map = new Map<string, string[]>();
    for (const line of lines) {
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          const codes = map.get(vehicle.id);
          if (codes) {
            if (!codes.includes(line.code)) {
              codes.push(line.code);
            }
          } else {
            map.set(vehicle.id, [line.code]);
          }
        }
      }
    }
    return map;
  });

  private readonly _vehiclesById = computed(() => {
    const map = new Map<string, { id: string; identificationNo: string }>();
    for (const line of this.referenceResource.data()?.lines ?? []) {
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          map.set(vehicle.id, { id: vehicle.id, identificationNo: vehicle.identificationNo });
        }
      }
    }
    return map;
  });

  protected readonly vehicleOptions = computed<AssetMultiSelectOption[]>(() => {
    const selected = this.selectedLineIds();
    const lines =
      selected.length > 0
        ? selected.map((id) => this._linesById().get(id))
        : [...this._linesById().values()];
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
            parentCodes: this._vehicleParentCodes().get(vehicle.id),
          });
        }
      }
    }
    return options;
  });

  private readonly _stationsById = computed(
    () => new Map((this.referenceResource.data()?.stations ?? []).map((s) => [s.id, s])),
  );

  protected readonly stationOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.stations ?? []).map((station) => ({
      id: station.id,
      label: station.displayName,
      parentCodes: (station.lines ?? []).map((l) => l.code),
    })),
  );

  private readonly _categoriesById = computed(
    () =>
      new Map(
        (this.referenceResource.data()?.calendarIncidentCategories ?? []).map((c) => [c.id, c]),
      ),
  );

  protected readonly categoryOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.calendarIncidentCategories ?? []).map((category) => ({
      id: category.id,
      label: category.name,
    })),
  );

  /** Mirrors incident-form.schema's required(title/brief/startDatetime/severity)
   *  plus the end>=start tree check — Save is disabled while the form is invalid. */
  protected readonly canSave = computed(() => {
    const m = this.model();
    if (!m.title.trim() || !m.brief.trim() || !m.startDatetime.trim() || !m.severity) {
      return false;
    }
    if (m.endDatetime && m.endDatetime < m.startDatetime) {
      return false;
    }
    return true;
  });

  private readonly extractStates = signal(new Map<number, ChronologyExtractState>());
  protected readonly isSummarizing = signal(false);

  private appliedSearch: string | undefined;

  constructor() {
    this.load();
  }

  protected eventValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected severityVariant(severity: PendingIncident["severity"]): BadgeVariants["variant"] {
    return SEVERITY_VARIANT[severity];
  }

  protected severityLabel(severity: PendingIncident["severity"]): string {
    return SEVERITY_LABEL[severity];
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.searchDebouncer.push(() => {
      this.appliedSearch = searchTermOrUndefined(this.searchTerm());
      this.load();
    });
  }

  protected async approve(row: PendingIncident): Promise<boolean> {
    const ok = await this.runIncidentMutation(APPROVE_INCIDENT_MUTATION, {
      incidentId: row.id,
    });
    if (ok) {
      this.removeRow(row.id);
      this.toast.success("Incident approved", `"${row.title}" is now live.`);
    }
    return ok;
  }

  protected openReject(row: PendingIncident): void {
    this.rejectTarget.set(row);
    this.rejectReason.set("");
  }

  protected cancelReject(): void {
    this.rejectTarget.set(null);
    this.rejectReason.set("");
  }

  protected async confirmReject(): Promise<void> {
    const target = this.rejectTarget();
    const reason = this.rejectReason().trim();
    if (!target || !reason) {
      return;
    }
    const ok = await this.runIncidentMutation(REJECT_INCIDENT_MUTATION, {
      incidentId: target.id,
      reason,
    });
    if (ok) {
      this.removeRow(target.id);
      this.cancelReject();
      this.toast.success("Incident rejected", "The submitter can revise and resubmit.");
    }
  }

  /** Opens the detail panel with the full edit form pre-filled from the row —
   *  flat scalars through `model`, datetimes converted to datetime-local
   *  values (`isoToDateTimeLocal`), chronologies rebuilt as local drafts with
   *  fresh keys, and the affected-asset ids seeded into the multi-selects. */
  protected openDetail(row: PendingIncident): void {
    this.selectedRow.set(row);
    this.model.set({
      title: row.title,
      brief: row.brief,
      details: row.details,
      startDatetime: isoToDateTimeLocal(row.startDatetime),
      endDatetime: isoToDateTimeLocal(row.endDatetime),
      severity: row.severity,
      longTerm: row.longTerm,
      inaccurate: row.inaccurate,
    });
    this.incidentForm().reset();
    this.editImpactFactor.set(row.impactFactor);
    this.chronologies.set(
      row.chronologies
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((chronology) => ({
          key: this.nextKey++,
          indicator: chronology.indicator,
          datetime: isoToDateTimeLocal(chronology.datetime),
          sourceUrl: chronology.sourceUrl ?? "",
          content: chronology.content ?? "",
          collapsed: false,
        })),
    );
    this.extractStates.set(new Map());
    this.isSummarizing.set(false);
    this.selectedLineIds.set(row.lines.map((line) => line.id));
    this.selectedVehicleIds.set(row.vehicles.map((vehicle) => vehicle.id));
    this.selectedStationIds.set(row.stations.map((station) => station.id));
    this.selectedCategoryIds.set(row.categories.map((category) => category.id));
  }

  protected closePanel(): void {
    this.selectedRow.set(null);
    this.model.set(emptyIncidentFormModel());
    this.incidentForm().reset();
    this.editImpactFactor.set(0);
    this.chronologies.set([]);
    this.extractStates.set(new Map());
    this.isSummarizing.set(false);
    this.selectedLineIds.set([]);
    this.selectedVehicleIds.set([]);
    this.selectedStationIds.set([]);
    this.selectedCategoryIds.set([]);
  }

  protected async approveFromPanel(): Promise<void> {
    const row = this.selectedRow();
    if (!row) {
      return;
    }
    const ok = await this.approve(row);
    if (ok) {
      this.closePanel();
    }
  }

  protected rejectFromPanel(): void {
    const row = this.selectedRow();
    if (!row) {
      return;
    }
    this.closePanel();
    this.openReject(row);
  }

  /* ----------------------------------------------------------------- *
   * Form actions — same surface as IncidentFormComponent.
   * ----------------------------------------------------------------- */

  protected isExtracting(key: number): boolean {
    return this.extractStates().get(key)?.extracting ?? false;
  }

  protected hasLateResult(key: number): boolean {
    return (this.extractStates().get(key)?.lateResult ?? null) !== null;
  }

  protected isReplaced(key: number): boolean {
    return this.extractStates().get(key)?.replaced ?? false;
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

  /** Full edit — same field set as "Report an Incident". The backend replaces
   *  lines/vehicles/stations/categories and chronologies from the input
   *  verbatim, so the payload carries the complete form state (not just the
   *  edited scalars). Validation runs through `submit(...)` — an invalid form
   *  is rejected before the mutation fires and the inline errors appear.
   *  On success the queue row and the detail card are patched locally. */
  protected async savePanelEdit(): Promise<void> {
    const row = this.selectedRow();
    if (!row) {
      return;
    }
    this.isMutating.set(true);
    try {
      const ok = await submit(this.incidentForm, async () => {
        const m = this.model();
        const idToken = await this.auth.idToken();
        await this.graphql.request<UpdateCalendarIncidentData, UpdateCalendarIncidentVars>(
          UPDATE_CALENDAR_INCIDENT_MUTATION,
          {
            calendarIncidentId: row.id,
            input: {
              title: m.title,
              brief: m.brief,
              startDatetime: new Date(m.startDatetime).toISOString(),
              severity: m.severity as CalendarIncidentSeverity,
              endDatetime: m.endDatetime ? new Date(m.endDatetime).toISOString() : null,
              longTerm: m.longTerm,
              inaccurate: m.inaccurate,
              impactFactor: this.editImpactFactor(),
              details: m.details || null,
              lineIds: this.selectedLineIds(),
              vehicleIds: this.selectedVehicleIds(),
              stationIds: this.selectedStationIds(),
              categoryIds: this.selectedCategoryIds(),
              chronologies: this.chronologies().map((chronology) => ({
                indicator: chronology.indicator,
                datetime: chronology.datetime ? new Date(chronology.datetime).toISOString() : null,
                sourceUrl: chronology.sourceUrl || null,
                content: chronology.content || null,
              })),
            },
          },
          idToken ? { "firebase-auth-key": idToken } : {},
        );
        return [];
      });
      if (!ok) {
        // submit() marked the fields touched; the inline errors are showing.
        // Nothing was sent — the amended payload stays in the panel.
        return;
      }
      const updated = this.buildUpdatedRow(row);
      this.rows.update((rows) => rows.map((r) => (r.id === row.id ? updated : r)));
      this.selectedRow.set(updated);
      this.toast.success("Incident updated", `"${updated.title}" saved.`);
    } catch (err) {
      this.toast.error(
        "Couldn't save changes",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isMutating.set(false);
    }
  }

  /** Rebuilds the local row from the saved form state so the table row and the
   *  detail card show exactly what the backend now holds. Preference goes to
   *  reference data (it carries the display labels); anything the reference set
   *  doesn't know yet falls back to the row's own objects. */
  private buildUpdatedRow(row: PendingIncident): PendingIncident {
    const m = this.model();
    const resolve = <T extends { id: string }>(
      ids: string[],
      current: T[],
      lookup: (id: string) => T | undefined,
    ): T[] =>
      ids
        .map((id) => lookup(id) ?? current.find((item) => item.id === id))
        .filter((x): x is T => x !== undefined);
    const linesById = this._linesById();
    const vehiclesById = this._vehiclesById();
    const stationsById = this._stationsById();
    const categoriesById = this._categoriesById();
    return {
      ...row,
      title: m.title,
      brief: m.brief,
      details: m.details,
      hasDetails: m.details.trim().length > 0,
      startDatetime: new Date(m.startDatetime).toISOString(),
      endDatetime: m.endDatetime ? new Date(m.endDatetime).toISOString() : null,
      severity: m.severity as CalendarIncidentSeverity,
      longTerm: m.longTerm,
      inaccurate: m.inaccurate,
      impactFactor: this.editImpactFactor(),
      lines: resolve(this.selectedLineIds(), row.lines, (id) => linesById.get(id)),
      vehicles: resolve(this.selectedVehicleIds(), row.vehicles, (id) => vehiclesById.get(id)),
      stations: resolve(this.selectedStationIds(), row.stations, (id) => stationsById.get(id)),
      categories: resolve(this.selectedCategoryIds(), row.categories, (id) =>
        categoriesById.get(id),
      ),
      chronologies: this.chronologies().map((chronology, index) => ({
        order: index,
        indicator: chronology.indicator,
        datetime: chronology.datetime ? new Date(chronology.datetime).toISOString() : "",
        content: chronology.content || "",
        sourceUrl: chronology.sourceUrl || null,
      })),
    };
  }

  private async runIncidentMutation(
    mutation: string,
    variables: ApproveIncidentVars | RejectIncidentVars,
  ): Promise<boolean> {
    this.isMutating.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<IncidentMutationData, typeof variables>(
        mutation,
        variables,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      return true;
    } catch (err) {
      this.toast.error("Action failed", err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.isLoading()) {
      return;
    }
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<PendingIncidentsQueryData, PendingIncidentsQueryVars>(
        PENDING_INCIDENTS_QUERY,
        { search: this.appliedSearch },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.rows.set(data.pendingCalendarIncidents);
    } catch (err) {
      this.toast.error(
        "Couldn't load the approval queue",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  private removeRow(id: string): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }
}
