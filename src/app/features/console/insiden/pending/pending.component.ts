import { DatePipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import { HlmBadge, type BadgeVariants } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmCardImports } from "../../../../ui/card/card";
import { HlmInput } from "../../../../ui/input/input";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../../ui/sheet/sheet";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { HlmTableImports } from "../../../../ui/table/table";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { ConsoleNavComponent } from "../../console-nav.component";
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
import { CalendarIncident } from "../../../insiden/data/insiden.queries";
import { IncidentCardComponent } from "../../../insiden/incident-card/incident-card.component";
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
 */
@Component({
  selector: "app-console-pending-incidents",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    DatePipe,
    HlmBadge,
    HlmButton,
    HlmInput,
    ...HlmCardImports,
    ...HlmTableImports,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    HlmSkeleton,
    ConsoleNavComponent,
    IncidentCardComponent,
  ],
  templateUrl: "./pending.component.html",
})
export class PendingIncidentsComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
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
  protected readonly editTitle = signal("");
  protected readonly editBrief = signal("");
  protected readonly panelIncident = computed(() => {
    const row = this.selectedRow();
    return row ? asCalendarIncident(row) : null;
  });

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

  protected openDetail(row: PendingIncident): void {
    this.selectedRow.set(row);
    this.editTitle.set(row.title);
    this.editBrief.set(row.brief);
  }

  protected closePanel(): void {
    this.selectedRow.set(null);
    this.editTitle.set("");
    this.editBrief.set("");
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

  /** Quick edit — title/brief only. The backend update replaces lines/vehicles/stations/
   *  categories and chronologies from the input verbatim, so the full fetched state is echoed. */
  protected async savePanelEdit(): Promise<void> {
    const row = this.selectedRow();
    const title = this.editTitle().trim();
    const brief = this.editBrief().trim();
    if (!row || !title || !brief) {
      return;
    }
    this.isMutating.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UpdateCalendarIncidentData, UpdateCalendarIncidentVars>(
        UPDATE_CALENDAR_INCIDENT_MUTATION,
        {
          calendarIncidentId: row.id,
          input: {
            title,
            brief,
            startDatetime: row.startDatetime,
            severity: row.severity,
            endDatetime: row.endDatetime,
            longTerm: row.longTerm,
            inaccurate: row.inaccurate,
            impactFactor: row.impactFactor,
            details: row.details,
            lineIds: row.lines.map((line) => line.id),
            vehicleIds: row.vehicles.map((vehicle) => vehicle.id),
            stationIds: row.stations.map((station) => station.id),
            categoryIds: row.categories.map((category) => category.id),
            chronologies: [...row.chronologies]
              .sort((a, b) => a.order - b.order)
              .map((chronology) => ({
                indicator: chronology.indicator,
                datetime: chronology.datetime,
                sourceUrl: chronology.sourceUrl,
                content: chronology.content,
              })),
          },
        },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      const updated: PendingIncident = { ...row, title, brief };
      this.rows.update((rows) => rows.map((r) => (r.id === row.id ? updated : r)));
      this.selectedRow.set(updated);
      this.toast.success("Incident updated", `"${title}" saved.`);
    } catch (err) {
      this.toast.error(
        "Couldn't save changes",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isMutating.set(false);
    }
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
