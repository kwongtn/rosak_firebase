import { Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { AuthService } from "../../../core/auth/auth.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { HlmButton } from "../../../ui/button/button";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import {
  UPDATE_USER_MUTATION,
  UpdateUserData,
  UpdateUserVars,
  GET_USER_DATA_QUERY,
  GetUserDataData,
  GetUserDataVars,
} from "../data/profile.queries";

@Component({
  selector: "app-profile-settings",
  imports: [FormsModule, HlmButton, HlmCheckbox],
  template: `
    <div class="mx-auto max-w-2xl p-4">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">Privacy Settings</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Control what information is visible on your public profile.
        </p>
      </div>

      <div class="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <label for="privacy-toggle" class="text-sm font-medium leading-none cursor-pointer">
              Share Historical Spotting Data
            </label>
            <p class="text-xs text-muted-foreground">
              Allow others to view your detailed spotting history. Your stats (counts, heatmap,
              favorite trains) are always visible.
            </p>
          </div>
          <hlm-checkbox
            id="privacy-toggle"
            [checked]="spottingDataPublic()"
            (checkedChange)="onPrivacyToggle($event)"
            [disabled]="isSaving()"
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

      <div class="mt-4 flex justify-end">
        <button hlmBtn variant="outline" size="sm" (click)="goBack()">Back to Profile</button>
      </div>
    </div>
  `,
})
export class SettingsComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly spottingDataPublic = signal<boolean>(false);
  protected readonly isSaving = signal<boolean>(false);

  constructor() {
    this.loadCurrentSettings();
  }

  private async loadCurrentSettings(): Promise<void> {
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<GetUserDataData, GetUserDataVars>(
        GET_USER_DATA_QUERY,
        { typeGroup: true, freeRange: true },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.spottingDataPublic.set(data.user.spottingDataPublic);
    } catch (err) {
      this.toast.error(
        "Failed to load settings",
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  }

  protected async onPrivacyToggle(desiredState: boolean): Promise<void> {
    if (desiredState) {
      const confirmed = window.confirm(
        "Make Spotting History Public?\n\nThis will allow anyone to view your detailed spotting records. You can change this back anytime.",
      );
      if (confirmed) {
        await this.savePrivacySetting(true);
      } else {
        this.spottingDataPublic.set(false);
      }
    } else {
      await this.savePrivacySetting(false);
    }
  }

  private async savePrivacySetting(value: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UpdateUserData, UpdateUserVars>(
        UPDATE_USER_MUTATION,
        { data: { nickname: this.auth.user()?.displayName || "User", spottingDataPublic: value } },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.spottingDataPublic.set(value);
      this.toast.success(
        value ? "Spotting history is now public" : "Spotting history is now private",
      );
    } catch (err) {
      this.toast.error("Save failed", err instanceof Error ? err.message : "Unknown error");
      // Revert local state on error
      this.spottingDataPublic.set(!value);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected goBack(): void {
    this.router.navigate(["/profile", this.auth.user()?.uid]);
  }
}
