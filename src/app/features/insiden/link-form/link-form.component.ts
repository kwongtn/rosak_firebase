import { Component, computed, effect, inject, signal } from "@angular/core";
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
import { LinkSheetService } from "../data/link-sheet.service";

interface LinkFormModel {
  url: string;
  title: string;
}

function emptyLinkFormModel(): LinkFormModel {
  return { url: "", title: "" };
}

const linkFormSchema = schema<LinkFormModel>((f) => {
  required(f.url, { message: "Enter a URL" });
});

/**
 * "Submit a link" — the just-dumping path for social media posts, blog articles
 * and other sources. Only the URL is required; title and asset/category tags
 * are optional. Submissions land in the admin triage queue (/console/insiden/links).
 */
@Component({
  selector: "app-link-form",
  imports: [FormField, ErrorBoxComponent, HlmButton, HlmInput, AssetMultiSelectComponent],
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
            [isLoading]="referenceResource.isLoading()"
            emptyMessage="No lines available."
            searchPlaceholder="Search lines"
          />

          <app-asset-multi-select
            heading="Vehicles"
            [options]="vehicleOptions()"
            [(selectedIds)]="selectedVehicleIds"
            [isLoading]="referenceResource.isLoading()"
            emptyMessage="No vehicles listed."
            searchPlaceholder="Search vehicles"
          />

          <app-asset-multi-select
            heading="Stations"
            [options]="stationOptions()"
            [(selectedIds)]="selectedStationIds"
            [isLoading]="referenceResource.isLoading()"
            emptyMessage="No stations available."
            searchPlaceholder="Search stations"
          />

          <app-asset-multi-select
            heading="Categories"
            [options]="categoryOptions()"
            [(selectedIds)]="selectedCategoryIds"
            [isLoading]="referenceResource.isLoading()"
            emptyMessage="No categories available."
            searchPlaceholder="Search categories"
          />
        }
      </section>
    </form>
  `,
})
export class LinkFormComponent {
  protected readonly sheet = inject(LinkSheetService);
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);

  protected readonly model = signal(emptyLinkFormModel());
  protected readonly linkForm = createForm(this.model, linkFormSchema);

  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedVehicleIds = signal<string[]>([]);
  protected readonly selectedStationIds = signal<string[]>([]);
  protected readonly selectedCategoryIds = signal<string[]>([]);

  readonly isSubmitting = signal(false);

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

  private _wasSheetOpen = false;

  constructor() {
    effect(() => {
      const isOpen = this.sheet.isOpen();
      if (!isOpen && this._wasSheetOpen) {
        this.clear();
      }
      this._wasSheetOpen = isOpen;
    });
  }

  async submit(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.toast.error("Please log in", "You need an account to submit a link.");
      return;
    }
    this.isSubmitting.set(true);
    try {
      const ok = await submit(this.linkForm, async () => {
        const m = this.model();
        const idToken = await this.auth.idToken();
        const vars: SubmitSocialMediaLinkVars = {
          input: {
            url: m.url,
            title: m.title || null,
            lineIds: this.selectedLineIds(),
            vehicleIds: this.selectedVehicleIds(),
            stationIds: this.selectedStationIds(),
            categoryIds: this.selectedCategoryIds(),
          },
        };
        await this.graphql.request<SubmitSocialMediaLinkData, SubmitSocialMediaLinkVars>(
          SUBMIT_SOCIAL_MEDIA_LINK_MUTATION,
          vars,
          idToken ? { "firebase-auth-key": idToken } : {},
        );
        return [];
      });
      if (ok) {
        this.toast.success("Link submitted", "An admin will review it shortly.");
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
    this.model.set(emptyLinkFormModel());
    this.selectedLineIds.set([]);
    this.selectedVehicleIds.set([]);
    this.selectedStationIds.set([]);
    this.selectedCategoryIds.set([]);
    this.linkForm().reset();
  }
}
