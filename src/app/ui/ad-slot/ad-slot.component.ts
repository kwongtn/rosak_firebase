import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { ADS_CONFIG } from "../../core/ads/ads.config";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * True when the given query string (e.g. `window.location.search`) opts into the ad-preview
 * placeholder. Exported as a pure predicate so it is unit-testable without a component harness.
 */
export function isAdPreviewEnabled(search: string): boolean {
  return new URLSearchParams(search).has("adpreview");
}

/**
 * A single manually-placed AdSense unit.
 *
 * ## Config contract
 * The publisher client (`data-ad-client`) and every logical slot → unit-id mapping live in
 * `core/ads/ads.config.ts` (`ADS_CONFIG`). Call sites either pass a resolved id via `slotId`, or
 * use `resolveAdSlot()` against a typed `AdSlotKey`. All slots currently reuse the one unit
 * `"3724291191"` ("mlptf"); adding a distinct unit is a one-line config change, not a component
 * change.
 *
 * ## Render-nothing rules
 * - Server-side: `render` stays `false` (there is no `afterNextRender` on the server), so the SSR
 *   HTML contains zero ad DOM and hydration never mismatches. On the client, `afterNextRender`
 *   flips `render` and the unit mounts after hydration completes.
 * - Unconfigured: when `slotId` is absent and placeholder mode is off, nothing is rendered — not
 *   even an empty box — so an unconfigured slot never reserves layout or emits ad markup.
 *
 * ## Placeholder modes (QA)
 * 1. `placeholder` input — force the dashed preview box from a template.
 * 2. `?adpreview=1` query param — read once at init (browser-guarded `location.search` check) for
 *    ad-hoc QA without a code change. Either mode shows the slot id in a dashed box instead of
 *    the real `<ins>`, so placements can be verified in dev (where `ADS_CONFIG.enabled` is false).
 *
 * ## Ad push
 * The `adsbygoogle` loader script is already in `index.html` (do NOT re-add it). The push
 * `(window.adsbygoogle = window.adsbygoogle || []).push({})` is queued only when the browser
 * platform is active, a real (non-placeholder) slot id is set, and the element first scrolls into
 * view (a one-shot `IntersectionObserver`), so no fill is requested for off-screen units.
 *
 * ## Caps
 * Per the plan, no more than **2 ad units per page** — enforce that at the page level; this
 * component renders exactly one unit per instance.
 */
@Component({
  selector: "app-ad-slot",
  host: { class: "block" },
  template: `
    @if (shouldRender()) {
      <div
        class="border-border/60 bg-background flex flex-col justify-center gap-1 rounded-lg border p-3"
        [style.min-height.px]="minHeightPx()"
      >
        @if (label()) {
          <span class="text-muted-foreground text-center text-[10px] tracking-wider uppercase">
            {{ label() }}
          </span>
        }
        @if (isPlaceholder()) {
          <div
            class="border-border text-muted-foreground flex flex-1 items-center justify-center rounded-md border-2 border-dashed p-4 text-center text-xs"
          >
            {{ placeholderText() }}
          </div>
        } @else {
          <ins
            class="adsbygoogle"
            [attr.data-ad-client]="adClient"
            [attr.data-ad-slot]="slotId()"
            [attr.data-ad-format]="format()"
            data-full-width-responsive="true"
            style="display: block"
          ></ins>
        }
      </div>
    }
  `,
})
export class AdSlotComponent implements OnDestroy {
  /** The AdSense unit id for this placement. `undefined` (unset) → nothing renders. */
  readonly slotId = input<string | undefined>();
  /** The `data-ad-format` value handed to AdSense. Defaults to the responsive `"auto"`. */
  readonly format = input<string>("auto");
  /** Reserved minimum height (px) so the unit's box is laid out before the ad fills — CLS guard. */
  readonly minHeightPx = input.required<number>();
  /** Optional disclosure caption rendered above the unit (typically `"Advertisement"`). */
  readonly label = input<string | undefined>();
  /** Force the dashed QA preview box regardless of config. */
  readonly placeholder = input<boolean>(false);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private observer: IntersectionObserver | undefined;

  private readonly adPreviewParam = this.isBrowser && isAdPreviewEnabled(window.location.search);

  protected readonly adClient = ADS_CONFIG.client;
  protected readonly render = signal(false);
  protected readonly isPlaceholder = computed(() => this.placeholder() || this.adPreviewParam);
  protected readonly placeholderText = computed(() => this.slotId() ?? "unconfigured");
  protected readonly shouldRender = computed(
    () => this.render() && (this.isPlaceholder() || !!this.slotId()),
  );

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) {
        return;
      }
      this.render.set(true);
      if (this.isPlaceholder() || !this.slotId()) {
        return;
      }
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.pushAd();
              this.observer?.disconnect();
              this.observer = undefined;
              break;
            }
          }
        },
        { threshold: 0 },
      );
      this.observer.observe(this.elementRef.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private pushAd(): void {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}
