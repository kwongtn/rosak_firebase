import { DatePipe } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import { HlmBadge, type BadgeVariants } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmCardImports } from "../../../../ui/card/card";
import { HlmInput } from "../../../../ui/input/input";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../../ui/sheet/sheet";
import { HlmTableImports } from "../../../../ui/table/table";
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
} from "../data/insiden-console.queries";
import {
  SEARCH_DEBOUNCE_MS,
  createTrailingDebounce,
  searchTermOrUndefined,
} from "../data/search-debounce.util";

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
    ConsoleNavComponent,
  ],
  templateUrl: "./pending.component.html",
})
export class PendingIncidentsComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly searchDebouncer = createTrailingDebounce(SEARCH_DEBOUNCE_MS);

  protected readonly rows = signal<PendingIncident[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly searchTerm = signal("");
  protected readonly isMutating = signal(false);

  protected readonly rejectTarget = signal<PendingIncident | null>(null);
  protected readonly rejectReason = signal("");

  private appliedSearch: string | undefined;

  constructor() {
    this.load();
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

  protected async approve(row: PendingIncident): Promise<void> {
    const ok = await this.runIncidentMutation(APPROVE_INCIDENT_MUTATION, {
      incidentId: row.id,
    });
    if (ok) {
      this.removeRow(row.id);
      this.toast.success("Incident approved", `"${row.title}" is now live.`);
    }
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
