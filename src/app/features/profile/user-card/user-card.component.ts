import { Component, afterNextRender, computed, inject, input, output, signal } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { AuthService } from "../../../core/auth/auth.service";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
import { HlmCardImports } from "../../../ui/card/card";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { HlmSheet, HlmSheetHeader, HlmSheetBody } from "../../../ui/sheet/sheet";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  UPDATE_USER_MUTATION,
  UpdateUserData,
  UpdateUserVars,
  UserData,
} from "../data/profile.queries";

/**
 * Identity header + nickname editor + stat cards. Ported from user/user.component.ts, but with
 * the zero-spotting crash bugs actually fixed rather than reproduced: the old version read
 * `favouriteVehicles[0]` with no emptiness guard, and the backend's `withMostEntries` resolver
 * raises IndexError for a user with no spottings (see Known Quirks in profile.md) — both are
 * guarded here so a brand-new user gets an empty state instead of a broken page.
 */
@Component({
  selector: "app-profile-user-card",
  imports: [
    FormsModule,
    DecimalPipe,
    HlmButton,
    HlmInput,
    HlmCheckbox,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    ...HlmCardImports,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center gap-4">
        @if (auth.user()?.photoURL; as photo) {
          <img [src]="photo" alt="" class="size-16 rounded-full" />
        }
        <div>
          <h1 class="text-xl font-semibold">{{ auth.user()?.displayName || "Anonymous" }}</h1>
          <p class="text-muted-foreground text-sm">
            @if (auth.user()?.emailVerified && auth.user()?.email) {
              {{ auth.user()?.email }}
            }
            @if (auth.user()?.phoneNumber) {
              ({{ auth.user()?.phoneNumber }})
            }
          </p>
        </div>
      </div>

      <div hlmCard class="max-w-sm">
        <div hlmCardContent class="flex-row items-center justify-between">
          @if (isEditing()) {
            <input
              hlmInput
              [(ngModel)]="nicknameDraft"
              placeholder="Enter your desired nickname"
              class="flex-1"
            />
            <button hlmBtn size="icon-sm" variant="ghost" [disabled]="isSaving()" (click)="save()">
              ✓
            </button>
            <button hlmBtn size="icon-sm" variant="ghost" (click)="cancel()">✕</button>
          } @else {
            <div>
              <p class="text-muted-foreground text-xs">Nickname</p>
              <p class="font-medium">{{ _displayedNickname() || "N/A" }}</p>
            </div>
            @if (isOwnProfile()) {
              <button hlmBtn size="sm" variant="outline" (click)="startEdit()">
                {{ _displayedNickname() ? "Edit" : "Add" }}
              </button>
            }
          }
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div hlmCard>
          <div hlmCardContent>
            <p class="text-muted-foreground text-xs">Total Spottings</p>
            <p class="text-lg font-semibold">{{ user().spottingsCount | number }}</p>
          </div>
        </div>
        <div hlmCard>
          <div hlmCardContent>
            <p class="text-muted-foreground text-xs">Media Uploaded</p>
            <p class="text-lg font-semibold">{{ user().mediaCount | number }}</p>
          </div>
        </div>
        @if (user().withMostEntriesMonth; as month) {
          <div hlmCard>
            <div hlmCardContent>
              <p class="text-muted-foreground text-xs">Best month ({{ month.dateKey }})</p>
              <p class="text-lg font-semibold">{{ month.count | number }}</p>
            </div>
          </div>
        }
        @if (user().withMostEntriesDay; as day) {
          <div hlmCard>
            <div hlmCardContent>
              <p class="text-muted-foreground text-xs">Best day ({{ day.dateKey }})</p>
              <p class="text-lg font-semibold">{{ day.count | number }}</p>
            </div>
          </div>
        }
        @if (_favouriteVehicle(); as fav) {
          <div hlmCard>
            <div hlmCardContent>
              <p class="text-muted-foreground text-xs">
                Favourite Train ({{ fav.count }} spottings)
              </p>
              <p class="text-lg font-semibold">{{ fav.vehicle.identificationNo }}</p>
              <p class="text-muted-foreground text-xs">{{ _favouriteVehicleLines() }}</p>
            </div>
          </div>
        }
      </div>

      @if (isOwnProfile()) {
        <div class="mt-4">
          <button hlmBtn variant="outline" size="sm" (click)="openPrivacySheet()">
            <svg class="mr-2 size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Privacy Settings
          </button>
        </div>
      }
    </div>

    <hlm-sheet
      [open]="_sheetOpen()"
      (openChange)="_sheetOpen.set($event)"
      [side]="_hoverCapable() ? 'full' : 'bottom'"
    >
      <div hlmSheetHeader>
        <h2 class="text-lg font-semibold">Privacy Settings</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Control what information is visible on your public profile.
        </p>
      </div>
      <div hlmSheetBody>
        <div class="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <label for="privacy-toggle" class="cursor-pointer text-sm font-medium leading-none">
                Share Historical Spotting Data
              </label>
              <p class="text-xs text-muted-foreground">
                Allow others to view your detailed spotting history. Your stats (counts, heatmap,
                favorite trains) are always visible.
              </p>
            </div>
            <hlm-checkbox
              id="privacy-toggle"
              [checked]="_spottingDataPublicDraft()"
              (checkedChange)="onPrivacyToggle($event)"
              [disabled]="_isSavingPrivacy()"
            />
          </div>
        </div>

        <div class="mt-6 rounded-lg border border-border bg-muted/30 p-4">
          <h3 class="mb-2 text-sm font-semibold">What's Always Public:</h3>
          <ul class="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>Nickname</li>
            <li>Total spottings count</li>
            <li>Media uploaded count</li>
            <li>Best month and day</li>
            <li>Favorite train</li>
            <li>Activity heatmap</li>
          </ul>
        </div>
      </div>
    </hlm-sheet>
  `,
})
export class UserCardComponent {
  readonly isOwnProfile = input<boolean>(true);
  readonly user = input.required<UserData>();
  readonly nicknameSaved = output<string>();
  readonly privacySaved = output<boolean>();

  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);

  protected readonly isEditing = signal(false);
  protected readonly isSaving = signal(false);
  protected nicknameDraft = "";

  /** Overrides `user().nickname` for immediate feedback after a save, without mutating the input. */
  private readonly _savedNickname = signal<string | null>(null);
  protected readonly _displayedNickname = computed(
    () => this._savedNickname() ?? this.user().nickname,
  );

  protected readonly _favouriteVehicle = computed(() => this.user().favouriteVehicles[0]);
  protected readonly _favouriteVehicleLines = computed(() =>
    this._favouriteVehicle()
      ?.vehicle.lines.map((l) => l.code)
      .join(", "),
  );

  protected readonly _sheetOpen = signal(false);
  protected readonly _hoverCapable = signal(false);
  protected readonly _spottingDataPublicDraft = signal(false);
  protected readonly _isSavingPrivacy = signal(false);

  constructor() {
    afterNextRender(() => {
      this._hoverCapable.set(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    });
  }

  protected startEdit(): void {
    this.nicknameDraft = this._displayedNickname();
    this.isEditing.set(true);
  }

  protected cancel(): void {
    this.isEditing.set(false);
  }

  protected async save(): Promise<void> {
    this.isSaving.set(true);
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<UpdateUserData, UpdateUserVars>(
        UPDATE_USER_MUTATION,
        { data: { nickname: this.nicknameDraft } },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this._savedNickname.set(data.updateUser.nickname);
      this.nicknameSaved.emit(data.updateUser.nickname);
      this.isEditing.set(false);
    } catch (err) {
      this.toast.error("Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      this.isSaving.set(false);
    }
  }

  protected openPrivacySheet(): void {
    this._spottingDataPublicDraft.set(this.user().spottingDataPublic);
    this._sheetOpen.set(true);
  }

  protected async onPrivacyToggle(desiredState: boolean): Promise<void> {
    if (desiredState) {
      const confirmed = window.confirm(
        "Make Spotting History Public?\n\nThis will allow anyone to view your detailed spotting records. You can change this back anytime.",
      );
      if (!confirmed) {
        this._spottingDataPublicDraft.set(false);
        return;
      }
    }
    await this.savePrivacySetting(desiredState);
  }

  private async savePrivacySetting(value: boolean): Promise<void> {
    this._isSavingPrivacy.set(true);
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<UpdateUserData, UpdateUserVars>(
        UPDATE_USER_MUTATION,
        { data: { nickname: this._displayedNickname(), spottingDataPublic: value } },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this._spottingDataPublicDraft.set(value);
      this.privacySaved.emit(value);
      this._sheetOpen.set(false);
      this.toast.success(
        value ? "Spotting history is now public" : "Spotting history is now private",
      );
    } catch (err) {
      this.toast.error("Save failed", err instanceof Error ? err.message : "Unknown error");
      this._spottingDataPublicDraft.set(!value);
    } finally {
      this._isSavingPrivacy.set(false);
    }
  }
}
