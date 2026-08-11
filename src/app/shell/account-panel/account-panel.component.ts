import { Component, OnDestroy, computed, inject, output, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { ToastService } from "../../ui/toast/toast.service";
import { HlmButton } from "../../ui/button/button";
import { HlmCardImports } from "../../ui/card/card";
import {
  REQUEST_VERIFICATION_CODE_MUTATION,
  RequestVerificationCodeData,
} from "./data/account-panel.queries";

const COUNTDOWN_SECONDS = 60;
const LOGOUT_CONFIRM_WINDOW_MS = 3000;
const TELEGRAM_LINKING_WIKI_URL =
  "https://github.com/kwongtn/rosak_firebase/wiki/Linking-to-Telegram";

/**
 * Content of the account sheet opened from the nav bar's avatar button — who you are, the
 * Telegram bot-linking code (ported from the old app's `verification-code-card`, its one real
 * feature besides logout), and logout itself. Deliberately not split into its own bot-linking
 * sub-component the way the old app did: this is the only place it's used here too, so a whole
 * extra component just for it would be a layer of indirection nothing actually needs yet.
 */
@Component({
  selector: "app-account-panel",
  imports: [RouterLink, HlmButton, ...HlmCardImports],
  template: `
    <div class="flex h-full flex-col gap-4">
      <div class="flex items-center gap-3">
        <span
          class="bg-muted text-muted-foreground relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full"
        >
          @if (photoUrl() && !avatarErrored()) {
            <img
              [src]="photoUrl()"
              alt=""
              class="size-full object-cover"
              (error)="avatarErrored.set(true)"
            />
          } @else {
            <svg
              viewBox="0 0 24 24"
              class="size-8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"
              />
            </svg>
          }
        </span>
        <div class="min-w-0">
          <a [routerLink]="['/profile', uid()]" class="hover:underline">
            <p class="truncate font-semibold">{{ displayName() }}</p>
          </a>
          <p class="text-muted-foreground truncate text-sm">{{ email() }}</p>
        </div>
      </div>

      <div hlmCard>
        <div hlmCardHeader>
          <h3 hlmCardTitle class="flex items-center justify-between gap-2">
            Bot Linking
            <a
              [href]="wikiUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-muted-foreground hover:text-foreground"
              aria-label="How does this work?"
              title="How does this work?"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path stroke-linecap="round" d="M12 11v5M12 8h.01" />
              </svg>
            </a>
          </h3>
        </div>
        <div hlmCardContent>
          @if (code() === null) {
            <button hlmBtn size="sm" [disabled]="isRequesting()" (click)="requestCode()">
              {{ isRequesting() ? "Requesting…" : "Request code" }}
            </button>
          } @else {
            <div class="flex flex-col items-center gap-1 py-1">
              <span class="text-3xl font-bold tracking-widest tabular-nums">{{ code() }}</span>
              <span class="text-muted-foreground text-xs">Expires in {{ countdown() }}s</span>
            </div>
          }
        </div>
      </div>

      <button
        hlmBtn
        [variant]="logoutArmed() ? 'destructive' : 'outline'"
        class="mt-auto"
        (click)="onLogoutClick()"
      >
        {{ logoutArmed() ? "Click again to confirm Log Out" : "Log out" }}
      </button>
    </div>
  `,
})
export class AccountPanelComponent implements OnDestroy {
  /** Lets the sheet hosting this close itself once logout actually happens, rather than staying
   * open on a now-meaningless "who you are" panel. */
  readonly loggedOut = output<void>();

  private readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);

  protected readonly wikiUrl = TELEGRAM_LINKING_WIKI_URL;

  protected readonly uid = computed(() => this.auth.user()?.uid ?? "");
  protected readonly displayName = computed(() => this.auth.user()?.displayName ?? "Anonymous");
  protected readonly email = computed(() => this.auth.user()?.email ?? "");
  protected readonly photoUrl = computed(() => this.auth.user()?.photoURL ?? null);
  protected readonly avatarErrored = signal(false);

  protected readonly code = signal<number | null>(null);
  protected readonly isRequesting = signal(false);
  protected readonly countdown = signal(COUNTDOWN_SECONDS);
  private countdownInterval: ReturnType<typeof setInterval> | undefined;

  /** Logout needs a confirming second click — a single misclick shouldn't end the session. */
  protected readonly logoutArmed = signal(false);
  private logoutArmedTimeout: ReturnType<typeof setTimeout> | undefined;

  protected async requestCode(): Promise<void> {
    this.isRequesting.set(true);
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<RequestVerificationCodeData>(
        REQUEST_VERIFICATION_CODE_MUTATION,
        {},
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.code.set(data.requestVerificationCode.code);
      this.startCountdown();
    } catch (err) {
      this.toast.error(
        "Couldn't request a code",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isRequesting.set(false);
    }
  }

  private startCountdown(): void {
    clearInterval(this.countdownInterval);
    this.countdown.set(COUNTDOWN_SECONDS);
    this.countdownInterval = setInterval(() => {
      const next = this.countdown() - 1;
      this.countdown.set(next);
      if (next <= 0) {
        clearInterval(this.countdownInterval);
        this.code.set(null);
      }
    }, 1000);
  }

  protected onLogoutClick(): void {
    if (!this.logoutArmed()) {
      this.logoutArmed.set(true);
      this.logoutArmedTimeout = setTimeout(
        () => this.logoutArmed.set(false),
        LOGOUT_CONFIRM_WINDOW_MS,
      );
      return;
    }
    clearTimeout(this.logoutArmedTimeout);
    this.auth.logout();
    this.loggedOut.emit();
  }

  ngOnDestroy(): void {
    clearInterval(this.countdownInterval);
    clearTimeout(this.logoutArmedTimeout);
  }
}
