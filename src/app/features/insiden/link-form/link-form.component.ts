import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { form as createForm, FormField, required, schema, submit } from "@angular/forms/signals";
import { AuthService } from "../../../core/auth/auth.service";
import {
  graphqlResource,
  GraphQLClient,
  GraphQLRequestError,
} from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { ErrorBoxComponent } from "../../../ui/error-box/error-box";
import { HlmInput } from "../../../ui/input/input";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  AssetMultiSelectComponent,
  AssetMultiSelectOption,
} from "../asset-multi-select/asset-multi-select.component";
import {
  INSIDEN_REFERENCE_QUERY,
  InsidenReferenceQueryData,
  SUBMIT_SOCIAL_MEDIA_LINK_MUTATION,
  SubmitSocialMediaLinkData,
  SubmitSocialMediaLinkVars,
} from "../data/insiden.queries";
import { isoToOccurredAtInput, occurredAtInputToIso } from "../data/link-occurred-at.util";
import { LinkSheetService } from "../data/link-sheet.service";
import {
  UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
  UpdateSocialMediaLinkData,
  UpdateSocialMediaLinkVars,
} from "../data/social-links.queries";

interface LinkFormModel {
  url: string;
  title: string;
  /** "When did this happen" — a `datetime-local` value (`YYYY-MM-DDTHH:mm`, naive local wall
   * time), `""` when unset. Optional by design: an empty field means "the backend stamps the
   * report time", which is the right answer for the overwhelming majority of submissions. Kept
   * out of `created`'s slot on purpose — `created` is when someone REPORTED the link, this is
   * when the thing HAPPENED, and a rider reporting an old post needs the second one. */
  occurredAt: string;
}

function emptyLinkFormModel(): LinkFormModel {
  return { url: "", title: "", occurredAt: "" };
}

const linkFormSchema = schema<LinkFormModel>((f) => {
  // `occurredAt` is deliberately NOT validated — see the model comment.
  required(f.url, { message: "Enter a URL" });
});

/**
 * "Submit a link" — the just-dumping path for social media posts, blog articles
 * and other sources. Only the URL is required; title, the "when did this happen" datetime and the
 * asset tags are optional, while the category dropdown is mandatory and pre-fills "Just
 * Reporting". Submissions land in the admin triage queue (/console/insiden/links).
 *
 * The optional datetime is the whole reason this form carries a clock at all: a rider reporting a
 * post from three days ago submits today, and the feed orders on the EVENT instant (`occurredAt`),
 * not the report instant (`created`). Left blank, the backend stamps the report time — which is
 * also exactly what the edit path means by an explicit `null` (see `submit`).
 */
@Component({
  selector: "app-link-form",
  imports: [
    FormField,
    ErrorBoxComponent,
    HlmButton,
    HlmInput,
    HlmNativeSelect,
    AssetMultiSelectComponent,
  ],
  template: `
    <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()">
      @if (!auth.isLoggedIn()) {
        <div class="bg-muted flex flex-col gap-2 rounded-lg p-3 text-sm">
          You'll need to log in before submitting a link.
          <button hlmBtn size="sm" variant="outline" class="self-start" (click)="auth.login()">
            Log in
          </button>
        </div>
      }

      @if (sheet.context(); as context) {
        <p class="bg-muted rounded-lg p-3 text-sm">
          Linking to incident:
          <span class="font-medium">{{ context.incidentTitle || context.incidentId }}</span>
        </p>
      }

      <section class="border-border flex flex-col gap-3 rounded-lg border p-3">
        <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Link</h3>

        <label class="flex flex-col gap-1.5 text-sm">
          URL
          <input
            hlmInput
            type="url"
            placeholder="https://x.com/prasarana/status/…"
            [formField]="linkForm.url"
          />
          @if (linkForm.url().invalid() && linkForm.url().touched()) {
            <p class="text-destructive text-xs">{{ linkForm.url().errors()[0]?.message }}</p>
          }
        </label>

        <label class="flex flex-col gap-1.5 text-sm">
          <span class="flex items-baseline gap-1">
            Title
            <span class="text-muted-foreground text-xs whitespace-nowrap">(optional)</span>
          </span>
          <input
            hlmInput
            type="text"
            placeholder="What is this about?"
            [formField]="linkForm.title"
          />
        </label>

        <!--
          PLACEMENT: last of the "Link" section, i.e. straight after Title and before the whole
          Tags section — deliberately NOT buried among the tags. A rider fills this form in story
          order: what it is (URL) → what it's called (Title) → when it happened → where/what it
          concerns (tags). The datetime is the third fact of the sentence, and the tag block is a
          bulk-assignment panel rather than a linear read; a clock dropped at the bottom of it
          would read like another filter. In edit mode it also belongs with the fields it hydrates
          from the same row (URL/Title), not next to unrelated tag selections.

          SSR note: the control renders an empty value by default — there is deliberately NO
          new Date() "now" default, because a server/client clock (or timezone) skew would then
          produce two different value= attributes for the same request. "" is also the honest
          state: the server decides the report instant. Hydration from an existing link is
          SSR-safe for the same reason — isoToOccurredAtInput round-trips the backend's
          offset-free naive ISO identically on any machine (see link-occurred-at.util.ts).
        -->
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="flex items-baseline gap-1">
            When did this happen?
            <span class="text-muted-foreground text-xs whitespace-nowrap">(optional)</span>
          </span>
          <input hlmInput type="datetime-local" [formField]="linkForm.occurredAt" />
          <p class="text-muted-foreground text-xs">
            Leave blank to use the report time. You can correct this later.
          </p>
        </label>
      </section>

      <section class="border-border flex flex-col gap-3 rounded-lg border p-3">
        <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Tags <span class="normal-case">(optional)</span>
        </h3>

        @if (referenceResource.hasError()) {
          <app-error-box
            title="Couldn't load tag options"
            message="Lines, vehicles, stations and categories are unavailable right now. You can retry, or submit the link without them."
            [showRetry]="true"
            (retry)="referenceResource.reload()"
          />
        } @else {
          <app-asset-multi-select
            heading="Lines"
            [options]="lineOptions()"
            [(selectedIds)]="selectedLineIds"
            [pinnedSelected]="true"
            [isLoading]="referenceResource.isLoading()"
            emptyMessage="No lines available."
            searchPlaceholder="Search lines"
          />

          <app-asset-multi-select
            heading="Vehicles"
            [options]="vehicleOptions()"
            [(selectedIds)]="selectedVehicleIds"
            [pinnedSelected]="true"
            [chipParentCodes]="true"
            [isLoading]="referenceResource.isLoading()"
            emptyMessage="No vehicles listed."
            searchPlaceholder="Search vehicles"
          />

          <app-asset-multi-select
            heading="Stations"
            [options]="stationOptions()"
            [(selectedIds)]="selectedStationIds"
            [pinnedSelected]="true"
            [chipParentCodes]="true"
            [isLoading]="referenceResource.isLoading()"
            emptyMessage="No stations available."
            searchPlaceholder="Search stations"
          />

          <label class="flex flex-col gap-1.5 text-sm">
            Categories
            <select
              hlmSelect
              [value]="selectedCategoryId() ?? ''"
              (change)="_onCategoryChange($event)"
            >
              @if (referenceResource.isLoading()) {
                <option value="" disabled>Loading…</option>
              } @else if (categoryOptions().length === 0) {
                <option value="" disabled>No categories available.</option>
              } @else {
                @for (category of categoryOptions(); track category.id) {
                  <option [value]="category.id">{{ category.label }}</option>
                }
              }
            </select>
          </label>
        }
      </section>
    </form>
  `,
})
export class LinkFormComponent {
  /** Line ids to pre-select in the Lines multi-select when this form is opened — used by the
   * /spotting/:lineId/details "Situasi" tab (hosts this form with `[defaultLineIds]="[lineId()]"`
   * so a submit is tagged to the line being viewed). Optional: the /insiden usage leaves it
   * absent and nothing is pre-selected. */
  readonly defaultLineIds = input<string[]>([]);

  protected readonly sheet = inject(LinkSheetService);
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);

  protected readonly model = signal(emptyLinkFormModel());
  protected readonly linkForm = createForm(this.model, linkFormSchema);

  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedVehicleIds = signal<string[]>([]);
  protected readonly selectedStationIds = signal<string[]>([]);
  /** Category is a single mandatory dropdown value (default "Just Reporting"); the mutation
   * contract still takes an array, derived in `selectedCategoryIds`. */
  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly selectedCategoryIds = computed<string[]>(() => {
    const id = this.selectedCategoryId();
    return id ? [id] : [];
  });

  readonly isSubmitting = signal(false);

  /** True while the sheet is in edit mode (a link is being edited rather than created).
   * Public so the host page can re-label its sheet header/submit button. */
  readonly isEditing = computed(() => this.sheet.editTarget() !== null);

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

  /** vehicle id -> deduped parent line codes, computed over ALL lines (not the selected-filtered view). */
  private readonly _vehicleParentCodes = computed(() => {
    const lines = [...this._linesById().values()];
    const map = new Map<string, string[]>();
    for (const line of lines) {
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          const codes = map.get(vehicle.id);
          if (codes) {
            if (!codes.includes(line.code)) codes.push(line.code);
          } else {
            map.set(vehicle.id, [line.code]);
          }
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

  protected readonly stationOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.stations ?? []).map((station) => ({
      id: station.id,
      label: station.displayName,
      parentCodes: (station.lines ?? []).map((l) => l.code),
    })),
  );

  protected readonly categoryOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.calendarIncidentCategories ?? []).map((category) => ({
      id: category.id,
      label: category.name,
    })),
  );

  protected _onCategoryChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedCategoryId.set(value || null);
  }

  private _wasSheetOpen = false;
  /** True once `defaultLineIds` has been applied during the current open session — a late-arriving
   * reference response must not stomp a selection the user made meanwhile, and `clear()` (footer
   * "Clear form", successful submit) must not be immediately undone by re-applying. Reset on
   * close so the NEXT open re-applies. */
  private _defaultsApplied = false;

  /** Link id the edit form is currently hydrated to — guards the hydration effect against
   * re-running (same id) and against hydrating a closed sheet. Mirrors the incident form's
   * `_hydratedIncidentId` guard so `clear()`/close can't be undone by a stale effect. */
  private _hydratedLinkId: string | null = null;

  /** True once the sheet's one-shot URL prefill has been consumed for the current open
   * session — a late effect re-run (e.g. reference data arriving) must not re-apply it.
   * Reset when the sheet is closed so the NEXT create-open re-applies a new prefill. */
  private _prefillApplied = false;

  constructor() {
    effect(() => {
      const isOpen = this.sheet.isOpen();
      if (!isOpen && this._wasSheetOpen) {
        this.clear();
      }
      this._wasSheetOpen = isOpen;
    });

    // Hydrate the form from the link being edited, once per open. The id guard handles both
    // imperatives: no re-hydration while the same link is targeted (mid-session reference
    // arrivals must not stomp user edits), and no hydration when the sheet closed (clear()
    // nulls the target; the guard resets with it). Create mode instead applies the sheet's
    // one-shot URL prefill below.
    effect(() => {
      const target = this.sheet.editTarget();
      if (!target) {
        this._hydratedLinkId = null;
        this._applyCreatePrefill();
        return;
      }
      if (this._hydratedLinkId === target.id) {
        return;
      }
      this._hydratedLinkId = target.id;
      this.model.set({
        url: target.url,
        title: target.title,
        // The event instant, NOT the row's `created`: a link whose event time differs from its
        // report time is exactly the one being edited here, so hydrating from the wrong column
        // would silently rewrite it to the report time on the next save. A host that doesn't
        // select `occurredAt` hydrates `""` (unset), which saves back as an explicit `null` —
        // the reset semantic — so such a host should not open this sheet for editing.
        occurredAt: isoToOccurredAtInput(target.occurredAt),
      });
      this.selectedLineIds.set(target.lines.map((line) => line.id));
      this.selectedVehicleIds.set((target.vehicles ?? []).map((vehicle) => vehicle.id));
      this.selectedStationIds.set((target.stations ?? []).map((station) => station.id));
      this.selectedCategoryId.set(target.categories?.[0]?.id ?? null);
      this.linkForm().reset();
    });

    // Categories is a mandatory single-select — pre-fill "Just Reporting" whenever the sheet
    // opens for a new submission (no edit target) once the reference data has loaded. Edit
    // hydration and explicit user choices win; this only fills the empty slot.
    effect(() => {
      if (!this.sheet.isOpen() || this.sheet.editTarget() || this.selectedCategoryId()) {
        return;
      }
      const justReporting = (this.referenceResource.data()?.calendarIncidentCategories ?? []).find(
        (category) => category.name === "Just Reporting",
      );
      if (justReporting) {
        this.selectedCategoryId.set(justReporting.id);
      }
    });

    // Pre-select defaultLineIds once per open, but only once the reference data is actually
    // present — the ids must exist in the Lines options to be selectable at all.
    effect(() => {
      if (!this.sheet.isOpen()) {
        this._defaultsApplied = false;
        return;
      }
      const defaults = this.defaultLineIds();
      if (this._defaultsApplied || defaults.length === 0 || !this.referenceResource.data()) {
        return;
      }
      const knownIds = (this.referenceResource.data()?.lines ?? []).map((line) => line.id);
      this.selectedLineIds.set(defaults.filter((id) => knownIds.includes(id)));
      this._defaultsApplied = true;
    });
  }

  /** Applies the sheet's one-shot URL prefill to a create-mode open (the home feed's quick
   * form "Advanced Input"). Consume-once: `takePrefillUrl` nulls the service value and the
   * `_prefillApplied` guard makes any later effect re-run a no-op — so a reopen without a new
   * prefill stays blank. Edit mode never reaches here. */
  private _applyCreatePrefill(): void {
    if (!this.sheet.isOpen()) {
      this._prefillApplied = false;
      return;
    }
    if (this._prefillApplied) {
      return;
    }
    this._prefillApplied = true;
    const url = untracked(() => this.sheet.takePrefillUrl());
    if (url) {
      this.model.update((model) => ({ ...model, url }));
      this.linkForm().reset();
    }
  }

  async submit(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to submit a link.");
      return;
    }
    const target = this.sheet.editTarget();
    this.isSubmitting.set(true);
    try {
      const ok = await submit(this.linkForm, async () => {
        const m = this.model();
        const idToken = await this.auth.idToken();
        if (target) {
          const vars: UpdateSocialMediaLinkVars = {
            socialMediaLinkId: target.id,
            input: {
              url: m.url,
              title: m.title || null,
              lineIds: this.selectedLineIds(),
              vehicleIds: this.selectedVehicleIds(),
              stationIds: this.selectedStationIds(),
              categoryIds: this.selectedCategoryIds(),
              // ⚠️ ALWAYS send this key, and DO NOT rewrite it as `?? undefined`.
              // `SocialMediaLinkInput` is replace-not-patch, and `occurredAt` is tri-state:
              //   omitted        → leave the event time untouched
              //   a datetime     → set it
              //   explicit null  → RESET it to the row's submission time (`link.created`)
              // So a hydrated link round-trips its event time (the normal save), and an EMPTY
              // box sends the explicit `null` on purpose: a rider clearing it means "this
              // actually happened when I reported it", which is precisely what `null` encodes.
              // That also makes the field the one place a rider can deliberately undo a wrong
              // guess — coercing it to `undefined` would make "cleared" unreachable and would
              // strand the control as a value you can see but cannot clear.
              occurredAt: occurredAtInputToIso(m.occurredAt),
            },
          };
          await this.graphql.request<UpdateSocialMediaLinkData, UpdateSocialMediaLinkVars>(
            UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
            vars,
            idToken ? { "firebase-auth-key": idToken } : {},
          );
        } else {
          const context = this.sheet.context();
          const occurredAt = occurredAtInputToIso(m.occurredAt);
          const vars: SubmitSocialMediaLinkVars = {
            input: {
              url: m.url,
              title: m.title || null,
              lineIds: this.selectedLineIds(),
              vehicleIds: this.selectedVehicleIds(),
              stationIds: this.selectedStationIds(),
              categoryIds: this.selectedCategoryIds(),
              // Only when the rider actually set it. On CREATE an omitted key and an explicit
              // `null` both mean "stamp the submission instant" server-side, so either works —
              // but omitting is the honest spelling: `occurredAt: null` reads on the wire like an
              // intent to clear a value that was never set, and it would make the payload
              // indistinguishable from the edit path's deliberate reset.
              ...(occurredAt ? { occurredAt } : {}),
              // Only when a context is set — `incidentId: null` is a server-side error path.
              ...(context ? { incidentId: context.incidentId } : {}),
            },
          };
          await this.graphql.request<SubmitSocialMediaLinkData, SubmitSocialMediaLinkVars>(
            SUBMIT_SOCIAL_MEDIA_LINK_MUTATION,
            vars,
            idToken ? { "firebase-auth-key": idToken } : {},
          );
        }
        return [];
      });
      if (ok) {
        if (target) {
          this.toast.success(
            "Link updated",
            this.auth.isAdmin() ? "Your changes are live." : "An admin will review the changes.",
          );
        } else {
          this.toast.success("Link submitted", "An admin will review it shortly.");
        }
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
    // Also resets `occurredAt` — it is a model field, so the fresh `emptyLinkFormModel()` is the
    // single reset point and there is no second signal to keep in sync. Important because an
    // edit-mode clear followed by a create-mode open must not carry the edited row's event time
    // into the new submission.
    this.model.set(emptyLinkFormModel());
    this.selectedLineIds.set([]);
    this.selectedVehicleIds.set([]);
    this.selectedStationIds.set([]);
    this.selectedCategoryId.set(null);
    // No stale incident targeting or edit target survives into the next open/submission.
    this.sheet.context.set(null);
    this.sheet.editTarget.set(null);
    this._hydratedLinkId = null;
    this.linkForm().reset();
  }
}
