import { Component, RESPONSE_INIT, computed, inject, signal } from "@angular/core";
import { Location } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { injectIsBrowser } from "../../core/composables/is-browser";
import { HlmButton } from "../../ui/button/button";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { LineStatusBadge } from "../../domain-ui/line-status-badge/line-status-badge";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { NOT_FOUND_MESSAGES, hashString, scrollLineFor } from "./not-found-messages";

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
 * `app.routes.server.ts`'s own wildcard entry used to set a real HTTP 404 status for this route,
 * but that stamped 404 onto matcher-based routes (/gallery, /insiden) too — Angular SSR's route
 * extraction gives every matcher route the path '**', so they can only ever match the wildcard
 * server route. The status is set here instead, via RESPONSE_INIT (SSR only, naturally — a
 * client-side navigation to a dead link can't retroactively change the status of the document
 * response that already loaded) so this doesn't just *look* like a missing page to a person, it
 * *is* one to a crawler or an uptime check too.
 *
 * Layout: two viewport-tall screens rather than one. The 404 joke fills the first, and the pet
 * photo is centred in a second, so the reward for scrolling a screen's length is finding a cat or
 * a dog — see the template comment for the `dvh`-vs-`vh` and footer decisions.
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

    <!-- Two full-height screens, not one: the joke fills the first, the pet photo is centred in
         the second, so it only turns up once you've scrolled a screen's worth. dvh rather
         than vh deliberately — on a phone vh is the viewport *including* the space behind
         the browser chrome, which would push the pet off-centre by exactly the height of the
         URL bar you can't see. -->
    <main class="mx-auto flex w-full flex-col lg:w-[90%]">
      <div
        class="flex min-h-dvh flex-col items-center justify-center gap-8 p-4 py-16 text-center sm:px-6"
      >
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
      </div>

      <!-- Browser-only, fetched once after hydration rather than during SSR — there's no
                   reason to burn a server-side request on a decorative image that's different
                   every single load anyway, and (same reasoning as about.page.ts's own
                   Firestore listener) nothing here needs to exist in the server-rendered HTML
                   for this to work correctly the moment the client takes over.

                   pb-28 is not decoration: it's the reservation matching the viewport-pinned
                   footer below, so the photo (centred, so within ~150px of this section's bottom
                   edge once scrolled into view) can never end up behind it. Both that reservation
                   and the pin are dropped on a viewport too short to hold the 404 block — see the
                   component's styles block and the footer's own comment. -->
      <div
        class="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 pb-28 sm:px-6"
        data-testid="not-found-pet"
      >
        @if (petPic(); as pet) {
          <p class="text-muted-foreground max-w-md text-center text-sm">
            {{ petCaption(pet.kind) }}
          </p>
          <img
            [src]="pet.url"
            [alt]="'A random ' + pet.kind"
            class="max-h-72 rounded-lg object-cover shadow-md"
          />
        } @else if (!petPicFailed()) {
          <div hlmSkeleton class="h-56 w-64 rounded-lg"></div>
        }
      </div>
    </main>

    <!-- Every other page leaves the footer in normal flow at the end of a min-h-screen shell,
         which is what pins it to the bottom of a short viewport. Here the page is deliberately
         two screens tall, so a flow footer would sit two screens down and effectively never be
         seen — pinned to the viewport instead, it stays put while the reader scrolls on to the
         pet. Scoped to this page on purpose: no other page changes, and the shared
         AppFooterComponent stays layout-agnostic. z-40 is below the nav's sticky bar (z-45) and
         below the app's z-50 overlay layer, matching the z-index ladder app-nav.component.ts
         documents. styles unpins it again on a viewport too short to hold the 404 block. -->
    <div class="bg-background fixed inset-x-0 bottom-0 z-40" data-testid="not-found-footer">
      <app-footer />
    </div>
  `,
  /**
   * The short-viewport escape hatch, and the reason it can't be a Tailwind arbitrary variant:
   * `[@media(max-height:640px)]:static` in a template attribute is parsed by **Angular**, not
   * Tailwind — `@media(...)` reads as an `@` control-flow block and the template fails to compile
   * (TS1005/TS1135). Writing `&#64;` instead fixes the parser but then Tailwind's scanner sees
   * the entity, not the variant, and generates no rule. So the one case a utility class can't
   * express lives here instead, in the component's own scoped styles.
   *
   * The threshold is measured, not guessed. Below ~640px tall, this page's first section can't
   * hold the 404 block (its own content is ~404px, before any padding), so it overflows its
   * `min-h-dvh` and shoves the photo section further down than one screen — far enough that a
   * pinned bar lands on top of the photo. Measured on a 1280px-wide window: 222px of the photo
   * hidden behind the footer at 400px tall, 122px at 450px, and only 21px of clearance at 550px.
   * A pinned bar and a fully visible photo are mutually exclusive that short, so below the
   * threshold the footer goes back to normal flow — where it sat before, at the end of the
   * document, which cannot overlap anything — and the photo's reservation goes with it. Every
   * phone in portrait and every ordinary window is well above 640px, so the pin is what almost
   * everyone sees.
   *
   * Emulated encapsulation's attribute selector is what lets these beat the `fixed`/`pb-28`
   * utilities they override (specificity 0-2-0 vs 0-1-0), not source order.
   */
  styles: [
    `
      @media (max-height: 640px) {
        [data-testid="not-found-footer"] {
          position: static;
        }
        [data-testid="not-found-pet"] {
          padding-bottom: 1.5rem;
        }
      }
    `,
  ],
})
export class NotFoundPage {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly isBrowser = injectIsBrowser();
  private readonly responseInit = inject(RESPONSE_INIT);

  protected readonly attemptedPath = () => this.router.url;
  protected readonly message = computed(() => {
    const index = hashString(this.attemptedPath()) % NOT_FOUND_MESSAGES.length;
    return NOT_FOUND_MESSAGES[index];
  });

  protected readonly petPic = signal<PetPic | null>(null);
  protected readonly petPicFailed = signal(false);

  /** The line above the photo — hashed off the same dead URL as the message itself, so one URL
   * keeps one joke, and the `{kind}` token inside it becomes the actual animal. A function
   * reference rather than a `computed()` because it takes the pet as an argument: the line can
   * only be picked once the browser-only fetch has resolved and told us cat or dog. */
  protected readonly petCaption = (kind: string): string =>
    scrollLineFor(this.attemptedPath(), kind);

  constructor() {
    // SSR only (RESPONSE_INIT is null in the browser): make genuinely unknown routes a real
    // HTTP 404. See the class doc comment for why this lives here rather than on the wildcard
    // server route.
    if (this.responseInit) {
      this.responseInit.status = 404;
    }
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
