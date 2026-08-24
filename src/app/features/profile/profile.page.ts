import { Component, computed, effect, inject, input, signal } from "@angular/core";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { AuthService } from "../../core/auth/auth.service";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { UserCardComponent } from "./user-card/user-card.component";
import { SpottingActivityHeatmap } from "../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import { MySpottingsComponent } from "./my-spottings/my-spottings.component";
import {
  GET_USER_DATA_QUERY,
  GET_PUBLIC_USER_QUERY,
  GetUserDataData,
  GetUserDataVars,
  GetPublicUserData,
  GetPublicUserVars,
  UserData,
  PublicUserData,
} from "./data/profile.queries";

/**
 * /profile/:id — a user's profile, keyed by their Firebase uid. Anyone can open this route for
 * any id, but it only ever renders real data when `:id` is the signed-in caller's own uid.
 *
 * That's not a frontend restriction we chose — the backend has no query that can fetch another
 * user's data by id at all today: `CommonScalars.user` always resolves `info.context.user` (the
 * caller), with no id argument, and no other field/filter anywhere in the schema accepts one
 * either (see docs/frontend-map/profile.md's rewrite notes for the full gap writeup). Rendering
 * the query result for a non-owner id would either fail outright or — worse — silently show the
 * *caller's own* data mislabeled as someone else's, so this deliberately shows neither: for any
 * id that isn't yours, it says so rather than guessing.
 */
@Component({
  selector: "app-profile",
  imports: [
    HlmSkeleton,
    AppNavComponent,
    AppFooterComponent,
    UserCardComponent,
    SpottingActivityHeatmap,
    MySpottingsComponent,
  ],
  template: `
    <app-nav />
    <div class="mx-auto flex min-h-screen w-full flex-col gap-6 p-4 sm:p-6 lg:w-[90%]">
      <main class="flex flex-1 flex-col gap-6">
        @if (!isAuthReady()) {
          <div class="flex flex-col gap-3">
            <div hlmSkeleton class="h-24 w-full"></div>
            <div hlmSkeleton class="h-72 w-full"></div>
          </div>
        } @else if (isOwnProfile()) {
          @if (_isLoading()) {
            <div class="flex flex-col gap-3">
              <div hlmSkeleton class="h-24 w-full"></div>
              <div hlmSkeleton class="h-72 w-full"></div>
            </div>
          } @else if (_user(); as user) {
            <app-profile-user-card [user]="user" (nicknameSaved)="onNicknameSaved($event)" />
            <spotting-activity-heatmap
              [data]="user.spottingTrends"
              [totalAllTime]="user.spottingsCount"
            />
            <app-my-spottings [user]="user" [isOwnProfile]="true" />
          } @else {
            <p class="text-destructive text-sm">
              Couldn't load your profile. Please try again shortly.
            </p>
          }
        } @else {
          @if (_isLoading()) {
            <div class="flex flex-col gap-3">
              <div hlmSkeleton class="h-24 w-full"></div>
              <div hlmSkeleton class="h-72 w-full"></div>
            </div>
          } @else if (_user(); as user) {
            <app-profile-user-card [user]="user" [isOwnProfile]="false" />
            <spotting-activity-heatmap
              [data]="user.spottingTrends"
              [totalAllTime]="user.spottingsCount"
            />
            <app-my-spottings [user]="user" [isOwnProfile]="false" />
          } @else {
            <p class="text-destructive text-sm">User not found or profile unavailable.</p>
          }
        }
      </main>

      <app-footer />
    </div>
  `,
})
export class ProfilePage {
  readonly id = input.required<string>();

  private readonly graphql = inject(GraphQLClient);
  protected readonly auth = inject(AuthService);

  protected readonly isAuthReady = signal(false);
  protected readonly isOwnProfile = computed(() => this.auth.user()?.uid === this.id());

  protected readonly _isLoading = signal(true);
  protected readonly _user = signal<PublicUserData | undefined>(undefined);

  constructor() {
    this.auth.whenReady.then(() => this.isAuthReady.set(true));

    effect(() => {
      if (!this.isAuthReady()) {
        return;
      }
      this.load();
    });
  }

  private async load(): Promise<void> {
    this._isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();

      if (this.isOwnProfile()) {
        const data = await this.graphql.request<GetUserDataData, GetUserDataVars>(
          GET_USER_DATA_QUERY,
          { typeGroup: true, freeRange: true },
          idToken ? { "firebase-auth-key": idToken } : {},
        );
        // `spottings` stays null on the owner branch: GET_USER_DATA_QUERY doesn't return them,
        // and the owner's history is fetched by <app-my-spottings> itself (GET_MY_EVENTS_QUERY,
        // paginated) — only public profiles inherit a ready-made list here.
        this._user.set({ ...data.user, spottings: null });
      } else {
        const data = await this.graphql.request<GetPublicUserData, GetPublicUserVars>(
          GET_PUBLIC_USER_QUERY,
          { id: this.id(), typeGroup: true, freeRange: true },
          idToken ? { "firebase-auth-key": idToken } : {},
        );
        this._user.set(data.publicUser ?? undefined);
      }
    } catch {
      this._user.set(undefined);
    } finally {
      this._isLoading.set(false);
    }
  }

  protected onNicknameSaved(nickname: string): void {
    const current = this._user();
    if (current) {
      this._user.set({ ...current, nickname });
    }
  }
}
