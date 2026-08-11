import { Component, PLATFORM_ID, computed, inject, signal } from "@angular/core";
import { Location, isPlatformBrowser } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { HlmButton } from "../../ui/button/button";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { LineStatusBadge } from "../../domain-ui/line-status-badge/line-status-badge";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { NOT_FOUND_MESSAGES } from "./not-found-messages";

interface PetPic {
  kind: "cat" | "dog";
  url: string;
}

/** thecatapi.com and dog.ceo — both free, keyless, single-image-on-request APIs; nothing here
 * needs an account or a rate-limited key just to show one throwaway photo per 404 hit. */
async function fetchRandomPet(): Promise<PetPic> {
  const kind = Math.random() < 0.5 ? "cat" : "dog";
  if (kind === "cat") {
    const res = await fetch("https://api.thecatapi.com/v1/images/search");
    const [photo] = (await res.json()) as { url: string }[];
    return { kind, url: photo.url };
  }
  const res = await fetch("https://dog.ceo/api/breeds/image/random");
  const photo = (await res.json()) as { message: string };
  return { kind, url: photo.message };
}

/** A small, deterministic string hash (djb2-ish) — not cryptographic, just needs to spread
 * different URLs across the message pool reasonably evenly. */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * The catch-all 404 — see app.routes.ts's final wildcard entry. Ported from the old app's plain
 * "Whoops! Page does not exist" fallback, but leaning into this app's own domain vocabulary
 * rather than a generic error page: every message in NOT_FOUND_MESSAGES is rendered through the
 * app's own `LineStatusBadge` with a real `LineStatus` value, so the badge isn't a lookalike —
 * the joke is that this page genuinely *is* a defunct/disrupted line, using the same component
 * that says so everywhere else in the app.
 *
 * Which message shows is a hash of the attempted URL, not `Math.random()`: SSR renders this page
 * server-side, and hydration then re-runs this same component client-side against that already-
 * rendered DOM — a *random* pick would very likely differ between those two passes and either
 * flash to a different joke right after hydration or trip up Angular's hydration mismatch
 * handling, both exactly the "flash of wrong state" this app avoids elsewhere. Hashing the URL
 * instead gives the same, stable pick on both passes for one dead link, while still varying
 * across different ones — which is the only kind of "random" that actually matters here anyway.
 *
 * `app.routes.server.ts`'s own wildcard entry sets a real HTTP 404 status for this route (SSR
 * only, naturally — a client-side navigation to a dead link can't retroactively change the
 * status of the document response that already loaded) so this doesn't just *look* like a
 * missing page to a person, it *is* one to a crawler or an uptime check too.
 */
@Component({
  selector: "app-not-found",
  imports: [
    RouterLink,
    HlmButton,
    HlmSkeleton,
    LineStatusBadge,
    AppNavComponent,
    AppFooterComponent,
  ],
  template: `
    <app-nav />
    <div class="mx-auto flex min-h-screen w-full flex-col p-4 sm:p-6 lg:w-[90%]">
      <main class="flex flex-1 flex-col items-center justify-center gap-8 py-16 text-center">
        <div class="flex flex-col items-center gap-4">
          <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{{
            message().eyebrow
          }}</span>
          <div class="flex items-center gap-4">
            <svg
              viewBox="0 0 24 24"
              class="text-muted-foreground/40 size-14 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke-dasharray="3 3" />
              <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke-linecap="round" />
            </svg>
            <h1 class="text-7xl font-bold tracking-tight">404</h1>
          </div>
          <line-status-badge [status]="message().status" />
        </div>

        <div class="flex max-w-md flex-col gap-2">
          <h2 class="text-xl font-semibold">{{ message().heading }}</h2>
          <p class="text-muted-foreground text-sm">{{ message().body }}</p>
        </div>

        @if (attemptedPath()) {
          <code
            class="bg-muted text-muted-foreground max-w-full truncate rounded-md px-3 py-1.5 text-xs"
          >
            {{ attemptedPath() }}
          </code>
        }

        <div class="flex flex-wrap items-center justify-center gap-3">
          <a routerLink="/spotting" hlmBtn>Back to TranSPOT</a>
          <button type="button" hlmBtn variant="outline" (click)="goBack()">Go back</button>
        </div>

        <!-- Browser-only, fetched once after hydration rather than during SSR — there's no
                     reason to burn a server-side request on a decorative image that's different
                     every single load anyway, and (same reasoning as about.page.ts's own
                     Firestore listener) nothing here needs to exist in the server-rendered HTML
                     for this to work correctly the moment the client takes over. -->
        @if (petPic(); as pet) {
          <div class="flex flex-col items-center gap-2 pt-4">
            <p class="text-muted-foreground text-sm">Meanwhile, here's a {{ pet.kind }}:</p>
            <img
              [src]="pet.url"
              [alt]="'A random ' + pet.kind"
              class="max-h-72 rounded-lg object-cover shadow-md"
            />
          </div>
        } @else if (!petPicFailed()) {
          <div hlmSkeleton class="h-56 w-64 rounded-lg"></div>
        }
      </main>
    </div>
    <app-footer />
  `,
})
export class NotFoundPage {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly attemptedPath = () => this.router.url;
  protected readonly message = computed(() => {
    const index = hashString(this.attemptedPath()) % NOT_FOUND_MESSAGES.length;
    return NOT_FOUND_MESSAGES[index];
  });

  protected readonly petPic = signal<PetPic | null>(null);
  protected readonly petPicFailed = signal(false);

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    fetchRandomPet()
      .then((pet) => this.petPic.set(pet))
      .catch(() => this.petPicFailed.set(true));
  }

  protected goBack(): void {
    this.location.back();
  }
}
