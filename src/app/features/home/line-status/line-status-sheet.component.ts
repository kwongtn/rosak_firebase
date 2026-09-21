import { Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";
import {
  GraphQLClient,
  GraphQLRequestError,
  graphqlResource,
} from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  AssetMultiSelectComponent,
  AssetMultiSelectOption,
} from "../../insiden/asset-multi-select/asset-multi-select.component";
import {
  STATION_LINES_QUERY,
  StationLinesQueryData,
  StationLinesQueryVars,
} from "../../spotting/data/spotting.queries";
import {
  LinePulse,
  PassengerStatus,
  SUBMIT_LINE_STATUS_REPORT_MUTATION,
  SubmitLineStatusReportData,
  SubmitLineStatusReportVars,
} from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { PASSENGER_LABEL } from "../data/passenger-status.util";

/** The 7 PassengerStatus values as large, tappable chips — labels reuse the shared util. */
const STATUS_OPTIONS: Array<{ value: PassengerStatus; label: string }> = (
  Object.keys(PASSENGER_LABEL) as PassengerStatus[]
).map((value) => ({ value, label: PASSENGER_LABEL[value] }));

/**
 * The mobile "Submit line status" bottom sheet: a short, link-less live report (status, optional
 * delay, notes, affected stations). Opened by LinePulseCardComponent through
 * LineStatusSheetService; the sheet's own `open`/`lineId` state lives in that service.
 *
 * The line is passed in as an input (the host already renders it in the pulse list) so this
 * component is testable standalone; `LineStatusSheetService.lineId()` is the fallback for hosts
 * that only know the id. Stations load lazily — only while the sheet is open and a line is
 * targeted — mirroring the report form's reactive-resource pattern.
 */
@Component({
  selector: "app-line-status-sheet",
  imports: [
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    HlmButton,
    HlmInput,
    RetryBannerComponent,
    AssetMultiSelectComponent,
  ],
  template: `
    <hlm-sheet [open]="sheet.isOpen()" (openChange)="sheet.setOpen($event)" side="bottom">
      <div hlmSheetHeader>
        <h2 class="text-base font-semibold">
          @if (line(); as pulseLine) {
            <span class="text-muted-foreground">{{ pulseLine.code }}</span>
            · {{ pulseLine.displayName }}
          } @else {
            Submit line status
          }
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">
          Report what you're seeing right now — no link needed.
        </p>
      </div>

      <div hlmSheetBody>
        @if (!auth.isLoggedIn()) {
          <div class="bg-muted flex flex-col gap-3 rounded-lg p-3 text-sm">
            You'll need to log in before submitting a line status report.
            <button
              hlmBtn
              variant="outline"
              class="h-11 self-start"
              data-testid="login-button"
              (click)="auth.login()"
            >
              Log in
            </button>
          </div>
        } @else {
          <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()">
            <div class="flex flex-col gap-2">
              <span class="text-sm">Line status</span>
              <div
                class="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="Line passenger status"
              >
                @for (option of STATUS_OPTIONS; track option.value) {
                  <button
                    type="button"
                    role="radio"
                    [attr.aria-checked]="status() === option.value"
                    [attr.data-testid]="'status-option-' + option.value"
                    [disabled]="isSubmitting()"
                    class="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                    [class]="
                      status() === option.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    "
                    (click)="status.set(option.value)"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
            </div>

            <label class="flex flex-col gap-1.5 text-sm">
              Delay (minutes, optional)
              <input
                hlmInput
                type="number"
                inputmode="numeric"
                min="0"
                class="h-11 text-base"
                [value]="delayMinutes()"
                (input)="_onDelayInput($event)"
              />
            </label>

            <label class="flex flex-col gap-1.5 text-sm">
              Notes (optional)
              <textarea
                hlmInput
                rows="3"
                class="text-base"
                placeholder="Line holdup, delays, crowding…"
                [value]="notes()"
                (input)="_onNotesInput($event)"
              ></textarea>
            </label>

            @if (stationsResource.hasError()) {
              <app-retry-banner
                [resource]="stationsResource"
                message="Couldn't load the stations for this line."
              />
            } @else {
              <app-asset-multi-select
                heading="Stations affected"
                [optional]="true"
                [options]="stationOptions()"
                [(selectedIds)]="selectedStationIds"
                [pinnedSelected]="true"
                [isLoading]="stationsResource.isLoading()"
                emptyMessage="No stations listed for this line."
                searchPlaceholder="Search stations"
              />
            }
          </form>
        }
      </div>

      @if (auth.isLoggedIn()) {
        <div hlmSheetFooter style="padding-bottom: calc(env(safe-area-inset-bottom) + 1.25rem)">
          <button
            hlmBtn
            class="h-11 w-full text-base"
            data-testid="submit-line-status-report"
            [disabled]="isSubmitting()"
            (click)="submit()"
          >
            {{ isSubmitting() ? "Submitting…" : "Submit line status" }}
          </button>
        </div>
      }
    </hlm-sheet>
  `,
})
export class LineStatusSheetComponent {
  /** The line being reported on — the host's LinePulse entry. */
  readonly line = input<LinePulse | null>(null);

  /** Emitted after a successful submission so the host can reload its data. */
  readonly submitted = output<void>();

  protected readonly sheet = inject(LineStatusSheetService);
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);

  protected readonly STATUS_OPTIONS = STATUS_OPTIONS;

  protected readonly status = signal<PassengerStatus | null>(null);
  protected readonly delayMinutes = signal("");
  protected readonly notes = signal("");
  protected readonly selectedStationIds = signal<string[]>([]);
  /** Public so the host can reflect the busy state if it adds its own controls. */
  readonly isSubmitting = signal(false);

  protected readonly lineId = computed(() => this.line()?.id ?? this.sheet.lineId());

  /** Stations of the targeted line; stays inert until the sheet is open on a known line. */
  protected readonly stationsResource = graphqlResource<
    StationLinesQueryData,
    StationLinesQueryVars
  >(() => {
    const lineId = this.lineId();
    if (!lineId || !this.sheet.isOpen()) {
      return undefined;
    }
    return { query: STATION_LINES_QUERY, variables: { lineId } };
  });

  protected readonly stationOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.stationsResource.data()?.stationLines ?? []).map((station) => ({
      id: station.id,
      label: station.displayName,
    })),
  );

  private _wasOpen = false;

  constructor() {
    // Drop the draft on the open→closed edge so the next line's report starts clean.
    effect(() => {
      const isOpen = this.sheet.isOpen();
      if (!isOpen && this._wasOpen) {
        this.clear();
      }
      this._wasOpen = isOpen;
    });
  }

  protected _onDelayInput(event: Event): void {
    this.delayMinutes.set((event.target as HTMLInputElement).value);
  }

  protected _onNotesInput(event: Event): void {
    this.notes.set((event.target as HTMLTextAreaElement).value);
  }

  async submit(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to submit a line status report.");
      return;
    }
    const status = this.status();
    if (!status) {
      this.toast.error("Pick a line status", "Choose the condition that best fits right now.");
      return;
    }
    const lineId = this.lineId();
    if (!lineId) {
      this.toast.error("No line selected", "Reopen the sheet from a line's card.");
      return;
    }

    this.isSubmitting.set(true);
    try {
      const idToken = await this.auth.idToken();
      const parsedDelay = Number.parseInt(this.delayMinutes(), 10);
      const vars: SubmitLineStatusReportVars = {
        input: {
          lineId,
          status,
          stationIds: this.selectedStationIds(),
          delayMinutes: Number.isFinite(parsedDelay) ? parsedDelay : null,
          notes: this.notes().trim() || null,
        },
      };
      await this.graphql.request<SubmitLineStatusReportData, SubmitLineStatusReportVars>(
        SUBMIT_LINE_STATUS_REPORT_MUTATION,
        vars,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success("Line status reported", "Thanks for keeping the community informed.");
      this.clear();
      this.sheet.setOpen(false);
      this.submitted.emit();
    } catch (err) {
      // GraphQLClient already surfaced the error — expected failure, nothing to add.
      if (err instanceof GraphQLRequestError) {
        return;
      }
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Public so the close effect and tests share one reset path. */
  clear(): void {
    this.status.set(null);
    this.delayMinutes.set("");
    this.notes.set("");
    this.selectedStationIds.set([]);
  }
}
