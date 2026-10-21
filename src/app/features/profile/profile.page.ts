import {
  Component,
  ErrorHandler,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { Title } from "@angular/platform-browser";
import { GraphQLClient, GraphQLRequestError } from "../../core/graphql/graphql-client";
import { resolveAdSlot } from "../../core/ads/ads.config";
import { AuthService } from "../../core/auth/auth.service";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import {
  RetryBannerComponent,
  RetryableResource,
} from "../../ui/retry-banner/retry-banner.component";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { UserCardComponent } from "./user-card/user-card.component";
import { FleetProgressComponent } from "./fleet-progress/fleet-progress.component";
import { SpottingActivityHeatmap } from "../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import { MySpottingsComponent } from "./my-spottings/my-spottings.component";
import { MyLinksComponent } from "./my-links/my-links.component";
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

/** The route's own title (`app.routes.ts`), put back whenever no profile is showing. */
const PROFILE_FALLBACK_TITLE = "MLPTF | Profile";

/**
 * /profile/:id — a user's profile, keyed by their Firebase uid. Anyone can open this route for
 * any id, but it only ever renders real data when `:id` is the signed-in caller's own uid.
 *
 * That's not a frontend restriction we chose — the backend has no query that can fetch another
 * user's data by id at all today: `CommonScalars.user` always resolves `info.context.user` (the
 * caller), with no id argument, and no other field/filter anywhere in the schema accepts one
 * either (see archive/frontend-map/profile.md's rewrite notes for the full gap writeup). Rendering
 * the query result for a non-owner id would either fail outright or — worse — silently show the
 * *caller's own* data mislabeled as someone else's, so this deliberately shows neither: for any
 * id that isn't yours, it says so rather than guessing.
 */
@Component({
  selector: "app-profile",
  imports: [
    HlmSkeleton,
    RetryBannerComponent,
    AdSlotComponent,
    AppNavComponent,
    AppFooterComponent,
    UserCardComponent,
    FleetProgressComponent,
    SpottingActivityHeatmap,
    MySpottingsComponent,
    MyLinksComponent,
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
        } @else if (_isError()) {
          <app-retry-banner [resource]="retryResource" message="Couldn't load this profile." />
        } @else if (isOwnProfile()) {
          @if (_isLoading()) {
            <div class="flex flex-col gap-3">
              <div hlmSkeleton class="h-24 w-full"></div>
              <div hlmSkeleton class="h-72 w-full"></div>
            </div>
          } @else if (_user(); as user) {
            <app-profile-user-card
              [user]="user"
              (nicknameSaved)="onNicknameSaved($event)"
              (privacySaved)="onPrivacySaved($event)"
            />
            <spotting-activity-heatmap
              [data]="user.spottingTrends"
              [totalAllTime]="user.spottingsCount"
            />
            <!-- Own profile only, and it loads itself: the whole spotted-vehicle list is slow, so
                 this page's first read does not wait for it. A public profile has one vehicle. -->
            <app-fleet-progress />

            <!-- Density cap: see profileBetweenCardsSlotId — footerEnd + this = 2 (max). -->
            <app-ad-slot
              [slotId]="profileBetweenCardsSlotId"
              [minHeightPx]="250"
              [label]="'Advertisement'"
            />

            <app-my-spottings [user]="user" [isOwnProfile]="true" />
            <app-my-links [isOwnProfile]="true" />
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

            <!-- Density cap: see profileBetweenCardsSlotId — footerEnd + this = 2 (max). -->
            <app-ad-slot
              [slotId]="profileBetweenCardsSlotId"
              [minHeightPx]="250"
              [label]="'Advertisement'"
            />

            <app-my-spottings [user]="user" [isOwnProfile]="false" />
          } @else {
            <p class="text-destructive text-sm">User not found or profile unavailable.</p>
          }
        }
      </main>

      <div class="grid gap-3 sm:grid-cols-2">
        <app-ad-slot [slotId]="footerEndSlotId" [minHeightPx]="250" [label]="'Advertisement'" />
        <app-ad-slot
          [slotId]="footerEndRightSlotId"
          [minHeightPx]="250"
          [label]="'Advertisement'"
        />
      </div>

      <app-footer />
    </div>
  `,
})
export class ProfilePage {
  readonly id = input.required<string>();

  private readonly graphql = inject(GraphQLClient);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly title = inject(Title);
  protected readonly auth = inject(AuthService);

  protected readonly footerEndSlotId = resolveAdSlot("footerEnd");
  protected readonly footerEndRightSlotId = resolveAdSlot("footerEndRight");

  // Density cap: footerEnd + this between-cards unit = 2, the per-page maximum.
  protected readonly profileBetweenCardsSlotId = resolveAdSlot("profileBetweenCards");

  protected readonly isAuthReady = signal(false);
  protected readonly isOwnProfile = computed(() => this.auth.user()?.uid === this.id());

  protected readonly _isLoading = signal(true);
  protected readonly _user = signal<PublicUserData | undefined>(undefined);
  protected readonly _isError = signal(false);

  /** Banner adapter: a manual retry re-runs the load for whatever the page is showing now. */
  protected readonly retryResource: RetryableResource = {
    retryCountdownSec: () => null,
    retryNow: () => void this.load(this.id(), this.isOwnProfile()),
  };

  /** Bumped by every `load()`. A response whose number is no longer current belongs to a profile
   * (or a session) the page has since moved on from, and must not overwrite what is showing. */
  private _loadSeq = 0;

  constructor() {
    this.auth.whenReady.then(() => this.isAuthReady.set(true));

    effect(() => {
      if (!this.isAuthReady()) {
        return;
      }
      // The dependencies are read HERE, not inside `load()`: it runs untracked and reads neither
      // after its first `await`. /profile/A -> /profile/B keeps this instance mounted
      // (`withComponentInputBinding` only updates `id`), so this effect is what notices.
      // `auth.user()` is tracked too: a login, logout or account switch re-loads.
      const id = this.id();
      const isOwn = this.auth.user()?.uid === id;
      untracked(() => void this.load(id, isOwn));
    });

    // Names the tab, history and bookmarks after the spotter once their profile has loaded. A
    // profile with no nickname keeps the route's title. While another profile loads, `_user` still
    // holds the previous one, so `_isLoading` gates this too, and the cleanup puts the route title
    // back whenever the profile it named is gone.
    effect((onCleanup) => {
      const nickname = this._user()?.nickname?.trim();
      if (!nickname || this._isLoading()) {
        return;
      }
      this.title.setTitle(`${nickname} | MLPTF`);
      onCleanup(() => this.title.setTitle(PROFILE_FALLBACK_TITLE));
    });
  }

  private async load(id: string, isOwn: boolean): Promise<void> {
    const seq = ++this._loadSeq;
    this._isLoading.set(true);
    this._isError.set(false);
    try {
      const idToken = await this.auth.idToken();
      const headers: Record<string, string> = idToken ? { "firebase-auth-key": idToken } : {};
      let user: PublicUserData | undefined;

      if (isOwn) {
        const data = await this.graphql.request<GetUserDataData, GetUserDataVars>(
          GET_USER_DATA_QUERY,
          { typeGroup: true, freeRange: true },
          headers,
        );
        // `spottings` stays null on the owner branch: GET_USER_DATA_QUERY doesn't return them,
        // and the owner's history is fetched by <app-my-spottings> itself (GET_MY_EVENTS_QUERY,
        // paginated) — only public profiles inherit a ready-made list here.
        user = { ...data.user, spottings: null };
      } else {
        const data = await this.graphql.request<GetPublicUserData, GetPublicUserVars>(
          GET_PUBLIC_USER_QUERY,
          { id, typeGroup: true, freeRange: true },
          headers,
        );
        user = data.publicUser ?? undefined;
      }
      if (seq === this._loadSeq) {
        this._user.set(user);
      }
    } catch (err) {
      if (seq === this._loadSeq) {
        this._user.set(undefined);
        this._isError.set(true);
      }
      // A GraphQLRequestError is already toasted and reported by GraphQLClient. Anything else (a
      // transport failure, a bug in this method) is unexpected and must reach Sentry.
      if (!(err instanceof GraphQLRequestError)) {
        this.errorHandler.handleError(err);
      }
    } finally {
      if (seq === this._loadSeq) {
        this._isLoading.set(false);
      }
    }
  }

  protected onNicknameSaved(nickname: string): void {
    const current = this._user();
    if (current) {
      this._user.set({ ...current, nickname });
    }
  }

  protected onPrivacySaved(spottingDataPublic: boolean): void {
    const current = this._user();
    if (current) {
      this._user.set({ ...current, spottingDataPublic });
    }
  }
}
