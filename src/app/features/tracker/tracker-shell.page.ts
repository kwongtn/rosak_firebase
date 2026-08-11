import { Component, OnDestroy, effect, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import * as Sentry from "@sentry/angular";
import { ThemeService } from "../../core/theme/theme.service";
import { GtfsRealtimeService } from "./data/gtfs-realtime.service";
import { TrackerMapComponent } from "./map/tracker-map.component";
import { StatusCardComponent } from "./status-card/status-card.component";
import { MobileLayerSheetComponent } from "./status-card/mobile-layer-sheet.component";
import { ThemeToggleComponent } from "../../ui/theme-toggle/theme-toggle.component";

/**
 * /tracker — full-bleed live vehicle map. Ported from tracker.component.ts, but with a real
 * `ngOnDestroy` that actually stops realtime polling (the old app's `ngOnInit`/`ngOnDestroy`
 * bodies were both fully commented out — see Known Quirks in tracker.md — so navigating away
 * left every active feed's `setInterval` running in the background indefinitely).
 *
 * Keeps its own compact floating nav rather than the shared <app-nav> used by /spotting,
 * /profile and /about — a full-width bar would eat into the full-bleed map for no benefit here.
 */
@Component({
  selector: "app-tracker-shell",
  imports: [
    RouterLink,
    TrackerMapComponent,
    StatusCardComponent,
    MobileLayerSheetComponent,
    ThemeToggleComponent,
  ],
  template: `
    <div class="relative h-screen w-screen overflow-hidden">
      <!-- max-w: room for the AntV logo parked in the top-right on mobile (see styles.css)
                 instead of the two fighting for the same row. flex-wrap on the top row is a safety
                 net for a narrow *desktop* width (above the sm breakpoint, where every link still
                 renders inline) rather than the primary mobile answer — below that breakpoint, the
                 other links are hidden behind the chevron toggle instead (see navExpanded), expanding as a
                 vertical list beneath this row rather than wrapping inline, so the pill stays a
                 predictable one- or two-row shape instead of growing wide and colliding with
                 whatever's on the other side of the screen (the layer panel, most narrow-desktop-
                 width's real complaint) the more links get added to it. -->
      <div
        class="bg-background/90 absolute top-3 left-3 z-10 flex max-w-[calc(100vw-5rem)] flex-col rounded-lg px-3 py-1.5 text-sm shadow sm:max-w-[calc(100vw-1.5rem)]"
      >
        <div class="flex flex-wrap items-center gap-3">
          <!-- A <button>, not an <a>: this shell only ever renders on /tracker itself,
                         so a routerLink back to the same route was always a no-op navigation —
                         freeing this whole "Tracker" word + logo up to double as the mobile
                         dropdown trigger (see navExpanded) instead of that trigger being just the
                         small chevron off to the side, which read as "the icon opens something
                         unrelated to the word next to it" rather than one control. The chevron
                         itself stays sm:hidden — on desktop this click toggles a signal nothing
                         below reads (the expanded-links block and the chevron are both sm:hidden
                         too), so it's a harmless no-op there, same as the old routerLink was. -->
          <button
            type="button"
            class="flex items-center gap-1.5 font-semibold"
            [attr.aria-expanded]="navExpanded()"
            aria-label="Tracker — more links"
            (click)="navExpanded.set(!navExpanded())"
          >
            <svg viewBox="0 0 570.14 178.35" class="h-5 w-auto" aria-hidden="true">
              <path fill="#ee7104" d="M1.5,6.23L.29,132.87l82.39-2.27L1.5,6.23Z" />
              <path fill="#ee7104" d="M1.5,6.23l117.75,125.57,101.07-1.06L1.5,6.23Z" />
              <path fill="#ee7104" d="M1.5,6.23l275.87,125.29,247.58-2.86L1.5,6.23" />
              <path
                fill="currentColor"
                d="M0,134.4L37.77,5.22l38.17-.4,4.69,89.06L126.83,4.42l38.57-.4-19.96,127.9-27.99,.4,19.39-104.19-54.17,102.47-21.78,.38-5.87-101.33-27.57,104.15-27.46,.6Z"
              />
              <path
                fill="currentColor"
                d="M188.57,4.69l-28.33,127.05,80.12-1.14,4.36-22.25-51.61,.09L216.4,4.27l-27.82,.42Z"
              />
              <path
                fill="currentColor"
                d="M309.78,.67c-13.14,.73-22.17,2.41-33.32,4.5-1.16,7.99-27.89,126.34-27.89,126.34h28.79l9.78-46.47s16.7,1.7,38.17-2.28c14.6-7.41,19.82-7.99,29.6-22.23,3.57-5.62,11.96-20.36,2.68-41.38-7.05-12.59-25.12-17.74-47.81-18.48Zm-1.17,23.21c2.46,0,5.13,.11,7.34,.49,7.19,.31,11.83,3.31,14.87,6.03,2.05,2.05,1.87,10.45,1.87,10.45-.53,4.91-2.28,8.21-5.09,12.59-4.2,5.54-7.99,6.79-15.54,8.3-8.97,1.12-19.69,.8-19.69,.8l8.57-38.3s3.56-.35,7.66-.36h0Z"
              />
              <path
                fill="currentColor"
                d="M367.37,.94l-4.82,24.37,34.42-.13-22.1,104.46,28.39-.54,22.77-104.73h36.03l5.22-23.3-99.91-.13Z"
              />
              <path
                fill="currentColor"
                d="M476.38,.94l-28.53,128.04h28.93l11.25-52.5,46.61-.54,4.69-22.23-46.34,.27,6.96-30.67,49.96-.27,4.96-23.04-78.48,.94Z"
              />
            </svg>
            Tracker
            <svg
              viewBox="0 0 24 24"
              class="size-4 shrink-0 transition-transform duration-150 sm:hidden"
              [class.rotate-180]="navExpanded()"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <!-- Desktop: every link inline, as before. -->
          <a
            routerLink="/spotting"
            class="text-muted-foreground hover:text-foreground hidden sm:inline"
            >TranSPOT</a
          >
          <a
            routerLink="/insiden"
            class="text-muted-foreground hover:text-foreground hidden sm:inline"
            >Insiden</a
          >
          <a
            routerLink="/profile"
            class="text-muted-foreground hover:text-foreground hidden sm:inline"
            >Profile</a
          >
          <a
            routerLink="/about"
            class="text-muted-foreground hover:text-foreground hidden sm:inline"
            >About</a
          >

          <!-- Same createForm()-based Sentry feedback widget as the global <app-nav> (see
                         its own doc comment for why this uses a plain (click) binding rather than
                         attachTo()) — /tracker keeps its own compact nav instead of <app-nav> (see
                         the class doc comment), so this button is duplicated here rather than shared. -->
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-full outline-none"
            aria-label="Report a bug"
            title="Report a bug"
            (click)="onReportBug()"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m8 2 1.88 1.88" />
              <path d="M14.12 3.88 16 2" />
              <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
              <path
                d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"
              />
              <path d="M12 20v-9" />
              <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
              <path d="M6 13H2" />
              <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
              <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
              <path d="M22 13h-4" />
              <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
            </svg>
          </button>
          <app-theme-toggle />
        </div>

        @if (navExpanded()) {
          <div class="mt-2 flex flex-col gap-2 border-t pt-2 sm:hidden">
            <a
              routerLink="/spotting"
              class="text-muted-foreground hover:text-foreground"
              (click)="navExpanded.set(false)"
              >TranSPOT</a
            >
            <a
              routerLink="/insiden"
              class="text-muted-foreground hover:text-foreground"
              (click)="navExpanded.set(false)"
              >Insiden</a
            >
            <a
              routerLink="/profile"
              class="text-muted-foreground hover:text-foreground"
              (click)="navExpanded.set(false)"
              >Profile</a
            >
            <a
              routerLink="/about"
              class="text-muted-foreground hover:text-foreground"
              (click)="navExpanded.set(false)"
              >About</a
            >
          </div>
        }
      </div>
      <app-tracker-map class="absolute inset-0" />
      <div class="absolute top-3 right-3 z-10">
        <app-status-card />
      </div>
      <app-mobile-layer-sheet />
    </div>
  `,
})
export class TrackerShellPage implements OnDestroy {
  private readonly gtfsRealtime = inject(GtfsRealtimeService);
  private readonly theme = inject(ThemeService);

  /** Below the sm breakpoint, whether the collapsed nav pill's other links (TranSPOT, Insiden,
   * Profile, About) are currently shown as a vertical list under the top row. */
  protected readonly navExpanded = signal(false);

  /** Created once, on first use, then reused on every later click — same pattern as
   * AppNavComponent.onReportBug(), see its doc comment for why createForm() over attachTo(). */
  private feedbackDialog: Awaited<
    ReturnType<Exclude<ReturnType<typeof Sentry.getFeedback>, undefined>["createForm"]>
  > | null = null;

  /** GtfsRealtimeService is root-provided — it (and its RtSources) outlive this component
   * across navigations. Resuming here (a no-op the very first time, since nothing's applied
   * yet) is what makes returning to /tracker fetch immediately rather than silently sitting on
   * whatever stale data/countdown was showing when `ngOnDestroy` paused everything below. */
  constructor() {
    this.gtfsRealtime.resumeAll();

    effect(() => {
      Sentry.getFeedback()?.setTheme(this.theme.resolvedTheme());
    });
  }

  ngOnDestroy(): void {
    this.gtfsRealtime.pauseAll();
  }

  protected async onReportBug(): Promise<void> {
    if (!this.feedbackDialog) {
      this.feedbackDialog = (await Sentry.getFeedback()?.createForm()) ?? null;
    }
    this.feedbackDialog?.appendToDom();
    this.feedbackDialog?.open();
  }
}
