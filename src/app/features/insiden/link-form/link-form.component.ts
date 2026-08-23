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
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { ToastService } from "../../../ui/toast/toast.service";
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
  imports: [FormField, ErrorBoxComponent, HlmButton, HlmInput, HlmSkeleton],
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
          Title <span class="text-muted-foreground text-xs">(optional)</span>
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
          <div class="flex flex-col gap-1.5 text-sm">
            <span>Lines</span>
            <div
              class="border-border flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5"
            >
              @if (referenceResource.isLoading()) {
                <div hlmSkeleton class="h-4 w-full"></div>
                <div hlmSkeleton class="h-4 w-4/5"></div>
              } @else {
                @for (line of lineOptions(); track line.id) {
                  <label
                    class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      class="size-4 accent-primary"
                      [checked]="isSelected(selectedLineIds, line.id)"
                      (change)="toggleSelection(selectedLineIds, line.id)"
                    />
                    {{ line.label }}
                  </label>
                } @empty {
                  <p class="text-muted-foreground text-xs">No lines available.</p>
                }
              }
            </div>
          </div>

          <div class="flex flex-col gap-1.5 text-sm">
            <span>Vehicles</span>
            <div
              class="border-border flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5"
            >
              @if (referenceResource.isLoading()) {
                <div hlmSkeleton class="h-4 w-full"></div>
                <div hlmSkeleton class="h-4 w-4/5"></div>
              } @else {
                @for (vehicle of vehicleOptions(); track vehicle.id) {
                  <label
                    class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      class="size-4 accent-primary"
                      [checked]="isSelected(selectedVehicleIds, vehicle.id)"
                      (change)="toggleSelection(selectedVehicleIds, vehicle.id)"
                    />
                    {{ vehicle.label }}
                  </label>
                } @empty {
                  <p class="text-muted-foreground text-xs">No vehicles listed.</p>
                }
              }
            </div>
          </div>

          <div class="flex flex-col gap-1.5 text-sm">
            <span>Stations</span>
            <div
              class="border-border flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5"
            >
              @if (referenceResource.isLoading()) {
                <div hlmSkeleton class="h-4 w-full"></div>
                <div hlmSkeleton class="h-4 w-4/5"></div>
              } @else {
                @for (station of stationOptions(); track station.id) {
                  <label
                    class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      class="size-4 accent-primary"
                      [checked]="isSelected(selectedStationIds, station.id)"
                      (change)="toggleSelection(selectedStationIds, station.id)"
                    />
                    {{ station.label }}
                  </label>
                } @empty {
                  <p class="text-muted-foreground text-xs">No stations available.</p>
                }
              }
            </div>
          </div>

          <div class="flex flex-col gap-1.5 text-sm">
            <span>Categories</span>
            <div
              class="border-border flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5"
            >
              @if (referenceResource.isLoading()) {
                <div hlmSkeleton class="h-4 w-full"></div>
                <div hlmSkeleton class="h-4 w-4/5"></div>
              } @else {
                @for (category of categoryOptions(); track category.id) {
                  <label
                    class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      class="size-4 accent-primary"
                      [checked]="isSelected(selectedCategoryIds, category.id)"
                      (change)="toggleSelection(selectedCategoryIds, category.id)"
                    />
                    {{ category.label }}
                  </label>
                } @empty {
                  <p class="text-muted-foreground text-xs">No categories available.</p>
                }
              }
            </div>
          </div>
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

  protected readonly lineOptions = computed(() =>
    (this.referenceResource.data()?.lines ?? []).map((line) => ({
      id: line.id,
      label: `${line.code} — ${line.displayName}`,
    })),
  );

  private readonly _linesById = computed(() => {
    const lines = this.referenceResource.data()?.lines ?? [];
    return new Map(lines.map((line) => [line.id, line]));
  });

  protected readonly vehicleOptions = computed(() => {
    const selected = this.selectedLineIds();
    const lines =
      selected.length > 0
        ? selected.map((id) => this._linesById().get(id))
        : [...this._linesById().values()];
    const seen = new Set<string>();
    const options: { id: string; label: string }[] = [];
    for (const line of lines) {
      if (!line) continue;
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          if (seen.has(vehicle.id)) continue;
          seen.add(vehicle.id);
          options.push({ id: vehicle.id, label: vehicle.identificationNo });
        }
      }
    }
    return options;
  });

  protected readonly stationOptions = computed(() =>
    (this.referenceResource.data()?.stations ?? []).map((station) => ({
      id: station.id,
      label: station.displayName,
    })),
  );

  protected readonly categoryOptions = computed(() =>
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

  protected toggleSelection(selection: ReturnType<typeof signal<string[]>>, id: string): void {
    selection.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected isSelected(selection: ReturnType<typeof signal<string[]>>, id: string): boolean {
    return selection().includes(id);
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
