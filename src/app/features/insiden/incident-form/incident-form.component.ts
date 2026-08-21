import { Component, computed, effect, inject, signal } from "@angular/core";
import { form as createForm, FormField, submit } from "@angular/forms/signals";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
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
import { emptyIncidentFormModel, incidentFormSchema } from "./incident-form.schema";

const SEVERITIES: CalendarIncidentSeverity[] = ["MAJOR", "MINOR", "OTHERS"];
const INDICATORS: ChronologyIndicator[] = ["GREEN", "RED", "BLUE", "GRAY"];

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
  imports: [FormField, HlmButton, HlmInput, HlmSheet, HlmSheetHeader, HlmSheetBody, HlmSheetFooter],
  templateUrl: "./incident-form.component.html",
})
export class IncidentFormComponent {
  protected readonly sheet = inject(IncidentSheetService);
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);

  protected readonly model = signal(emptyIncidentFormModel());
  protected readonly incidentForm = createForm(this.model, incidentFormSchema);

  protected readonly chronologies = signal<ChronologyDraft[]>([]);
  private nextKey = 0;

  protected readonly severities = SEVERITIES;
  protected readonly indicators = INDICATORS;

  readonly isSubmitting = signal(false);

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
  }

  protected toggleChronologyCollapsed(key: number): void {
    this.chronologies.update((list) => toggleCollapsed(list, key));
  }

  protected moveChronologyBy(index: number, offset: -1 | 1): void {
    this.chronologies.update((list) => moveChronology(list, index, index + offset));
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
    this.incidentForm().reset();
  }
}
