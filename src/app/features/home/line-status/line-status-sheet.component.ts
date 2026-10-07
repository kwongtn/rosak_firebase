import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";
import {
  GraphQLClient,
  GraphQLRequestError,
  graphqlResource,
} from "../../../core/graphql/graphql-client";
import { PreferencesService } from "../../../core/preferences/preferences.service";
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
import { passengerMetric } from "../data/line-status-metrics.util";
import { PASSENGER_LABEL } from "../data/passenger-status.util";

/** The 7 PassengerStatus values as large, tappable chips — labels reuse the shared util. */
const STATUS_OPTIONS: Array<{ value: PassengerStatus; label: string }> = (
  Object.keys(PASSENGER_LABEL) as PassengerStatus[]
).map((value) => ({ value, label: PASSENGER_LABEL[value] }));

/**
 * The mobile "Submit line status" bottom sheet: a short, link-less live report (status, optional
 * delay, notes, affected stations). Opened by LinePulseCardComponent / LinePulseRowComponent
 * through LineStatusSheetService, and by the report chooser (which can also pre-select the status);
 * the sheet's own `open`/`lineId`/`presetStatus` state lives in that service.
 *
 * The line is passed in as an input (the host already renders it in the board) so this component is
 * testable standalone; `LineStatusSheetService.lineId()` is the fallback for hosts that only know the
 * id. Stations load lazily — only while the sheet is open and a line is targeted — mirroring the
 * report form's reactive-resource pattern.
 *
 * 🔴 **DRAFT-FIRST.** The form renders whether or not anyone is signed in; being logged out adds a
 * banner above it and takes away nothing except the ability to submit, which is asked for at submit
 * time (inline copy + toast) and never earlier. The reader is composing a report from what they can
 * see on the platform, and a login wall in front of that form discards the observation that produced
 * it — the same trade the spotting report form already makes, deliberately, one sentence of copy
 * shared between them. The draft is discarded on exactly ONE edge (open→closed), so the sign-in
 * popup cannot cost the reader their typing.
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
    <hlm-sheet
      [open]="sheet.isOpen()"
      (openChange)="sheet.setOpen($event)"
      [side]="isDesktop() ? 'right' : 'bottom'"
    >
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

      <div hlmSheetBody [scrollable]="false">
        <!-- DRAFT-FIRST, and this banner is the whole of the difference from a login wall. The form
             below ALWAYS renders: the reader is standing on a platform deciding what to type, and a
             wall that appears before they have said anything wastes that decision — it makes them
             sign in first and (very often) then not bother at all. So the only thing being logged
             out removes is the ability to SUBMIT, which is asked for at the moment it is needed.
             Same wording as the spotting report form, deliberately: one sentence the rider reads
             twice on the same page must not read two different ways. -->
        @if (!auth.isLoggedIn()) {
          <div class="bg-muted flex flex-col gap-2 rounded-lg p-3 text-sm">
            You'll need to log in before submitting, but feel free to fill in the details first.
            <button
              hlmBtn
              size="sm"
              variant="outline"
              class="self-start"
              data-testid="login-button"
              (click)="auth.login()"
            >
              Log in
            </button>
          </div>
        }

        <form
          class="flex min-h-0 flex-1 flex-col gap-4"
          (submit)="$event.preventDefault(); submit()"
        >
          <div class="flex flex-col gap-2">
            <span class="text-sm">Line status</span>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Line passenger status">
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
            @if (statusHelp(); as help) {
              <p class="text-muted-foreground text-xs" data-testid="status-help" aria-live="polite">
                {{ help }}
              </p>
            }
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
              class="flex-1 min-h-0"
              heading="Stations affected"
              [optional]="true"
              [fillHeight]="true"
              [options]="stationOptions()"
              [(selectedIds)]="selectedStationIds"
              [pinnedSelected]="true"
              [isLoading]="stationsResource.isLoading()"
              emptyMessage="No stations listed for this line."
              searchPlaceholder="Search stations"
            />
          }

          @if (submitError(); as error) {
            <p class="text-destructive text-xs" data-testid="line-status-submit-error" role="alert">
              {{ error }}
            </p>
          }
        </form>
      </div>

      <!-- The footer is unconditional for the same reason the form is: a reader who has filled the
           whole thing in must be able to press Submit and be told what is missing (an account),
           not discover the button is not there. Disabled only by an in-flight submit. -->
      <div hlmSheetFooter style="padding-bottom: calc(env(safe-area-inset-bottom) + 1.25rem)">
        <button
          hlmBtn
          variant="outline"
          class="h-11"
          data-testid="cancel-line-status-report"
          (click)="sheet.setOpen(false)"
        >
          Cancel
        </button>
        <button
          hlmBtn
          class="h-11 flex-1 text-base"
          data-testid="submit-line-status-report"
          [disabled]="isSubmitting()"
          (click)="submit()"
        >
          {{ isSubmitting() ? "Submitting…" : "Submit line status" }}
        </button>
      </div>
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
  private readonly preferences = inject(PreferencesService);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** `sm` — the same breakpoint HlmSheet's side-panel width cap uses. Read once, eagerly rather
   * than via afterNextRender, so the sheet never renders on one edge and visibly flips; SSR
   * keeps this desktop default, which is inert because HlmSheet mounts no panel until opened. */
  protected readonly isDesktop = signal(true);

  protected readonly STATUS_OPTIONS = STATUS_OPTIONS;

  protected readonly status = signal<PassengerStatus | null>(null);
  protected readonly delayMinutes = signal("");
  protected readonly notes = signal("");
  protected readonly selectedStationIds = signal<string[]>([]);
  /** Public so the host can reflect the busy state if it adds its own controls. */
  readonly isSubmitting = signal(false);

  /** Inline submission failure shown above the footer; null when there is nothing to report. */
  protected readonly submitError = signal<string | null>(null);

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

  /** Universal-metric copy for the selected status; null until a chip is picked. */
  protected readonly statusHelp = computed(() => {
    const status = this.status();
    return status ? passengerMetric(status) : null;
  });

  private _wasOpen = false;

  constructor() {
    if (this.isBrowser) {
      this.isDesktop.set(window.matchMedia("(min-width: 640px)").matches);
    }

    // One effect for BOTH sheet edges, deliberately: the seed and the reset must never race against
    // the same `_wasOpen` latch, and the order matters — a preset applies when the sheet OPENS, and
    // a draft is dropped when it CLOSES. Nothing else touches `status` on the open edge, so a
    // chooser-seeded "Stopped" report cannot be overwritten by the reset path.
    effect(() => {
      const isOpen = this.sheet.isOpen();
      if (isOpen && !this._wasOpen) {
        // Consume-once, exactly like the spotting form's line seed: a seedless open afterwards (the
        // board's own per-row Report button) must not resurrect a status from a report that was
        // already submitted or cancelled. Cleared BEFORE the write so a rejected value cannot leave
        // the draft in a state that looks pre-selected.
        const preset = this.sheet.presetStatus();
        if (preset) {
          this.sheet.presetStatus.set(null);
          this.status.set(preset);
        }
      }
      if (!isOpen && this._wasOpen) {
        // Drop the draft on the open→closed edge so the next line's report starts clean. This is the
        // ONLY place the draft is discarded — signing in mid-report is not a close, so a reader who
        // fills the form, is sent through the login popup and comes back still has everything they
        // typed.
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
    this.submitError.set(null);
    // 🔴 THE DRAFT-FIRST GUARD. This is the ONLY place an account is required, and it is reached only
    // when the reader presses Submit — never on open, never while they are still typing. Nothing is
    // cleared on this path, which is what makes the draft survive: `auth.login()` is a popup the
    // reader returns from, `isLoggedIn()` flips, and every signal above still holds what they typed.
    // The inline copy matters as much as the toast — the toast is transient and can be missed by a
    // reader looking at the button they just pressed, while this sits above the footer until the
    // next attempt.
    if (!this.auth.isLoggedIn()) {
      this.submitError.set(
        "You need an account to submit a line status report — log in and try again.",
      );
      this.toast.error("Please log in", "You need an account to submit a line status report.");
      return;
    }
    const status = this.status();
    if (!status) {
      this.submitError.set("Pick a line status — choose the condition that best fits right now.");
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
      const data = await this.graphql.request<
        SubmitLineStatusReportData,
        SubmitLineStatusReportVars
      >(SUBMIT_LINE_STATUS_REPORT_MUTATION, vars, idToken ? { "firebase-auth-key": idToken } : {});
      if (!data.submitLineStatusReport.ok) {
        // Business-level rejection: GraphQL returned no top-level errors, but nothing was saved.
        this.submitError.set("Couldn't submit your report. Please try again.");
        return;
      }
      this.toast.success("Line status reported", "Thanks for keeping the community informed.");
      // The prefill for next time: the chooser orders its line picker by pinned → recent → severity,
      // so recording the line here is what makes "the line I just reported about" the one at hand.
      // `pushRecentLine` too, because a report is the strongest possible signal that this is the line
      // the reader is working on — stronger than having merely expanded its row.
      this.preferences.setLastReportedLine(lineId);
      this.preferences.pushRecentLine(lineId);
      this.clear();
      this.sheet.setOpen(false);
      this.submitted.emit();
    } catch (err) {
      if (err instanceof GraphQLRequestError) {
        // GraphQLClient already toasted the server message; keep the sheet open and mirror it here.
        this.submitError.set(err.message);
        return;
      }
      this.submitError.set("Couldn't reach the server. Check your connection and try again.");
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
    this.submitError.set(null);
  }
}
