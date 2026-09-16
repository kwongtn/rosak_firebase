import { Component, computed, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmBadge } from "../../../ui/badge/badge";
import { PublicSocialMediaLink } from "../data/social-links.queries";
import { faviconHostnameOf } from "../data/social-link.util";

/**
 * One public social-media link submitted by a community member (a post/tweet/thread referencing
 * an incident), in the compact day-group layout of the links tab: favicon + domain + timestamp
 * on one row, one-line title, line badges, pending badge. The whole card IS the navigation
 * affordance: clicking anywhere opens the source in a new tab. When `editable()` (author or
 * admin — gated by the host with canEditLink) an absolutely-positioned pencil button sits in
 * the top-right corner and emits `edit`. Favicon comes from Google's s2 service; a URL whose
 * hostname can't be extracted (or isn't http/https) falls back to a plain link icon instead of
 * a broken image. SSR-safe: no browser APIs.
 */
@Component({
  selector: "app-link-card",
  imports: [DatePipe, HlmBadge],
  template: `
    <div class="relative">
      <!-- Deliberately not hlmCard: its host classes include gap-4 p-5, and Tailwind v4 emits
           later spacing utilities after the host-class rules, so an element-class override
           (gap-1.5 p-2.5) is beaten by the host's gap-4 p-5. These explicit classes are
           hlmCard's own tokens minus the padding/row-gap the compact layout drops. -->
      <a
        [href]="link().url"
        target="_blank"
        rel="noopener noreferrer"
        class="bg-card text-card-foreground border-border flex flex-col gap-1.5 rounded-xl border p-2.5 shadow-sm transition-colors hover:bg-muted/40"
        [class.pr-8]="editable()"
      >
        <div class="flex min-w-0 items-center gap-1.5">
          @if (faviconDomain(); as domain) {
            <img
              [src]="'https://www.google.com/s2/favicons?domain=' + domain"
              class="size-4 shrink-0 rounded-sm"
              alt=""
            />
          } @else {
            <svg
              viewBox="0 0 24 24"
              class="text-muted-foreground size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M14 5h5v5M19 5 10 14M8 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"
              />
            </svg>
          }
          <span class="min-w-0 truncate text-sm font-semibold">{{ displayDomain() }}</span>
          <span class="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap">
            {{ link().created | date: "MMM d, y HH:mm" }}
          </span>
        </div>
        @if (link().title) {
          <p class="text-muted-foreground line-clamp-1 text-sm">{{ link().title }}</p>
        }
        <div class="flex flex-wrap items-center gap-1.5">
          @for (line of link().lines; track line.id) {
            <span
              hlmBadge
              variant="outline"
              class="px-1.5 py-0.5 text-xs"
              [title]="line.displayName"
            >
              {{ line.code }}
            </span>
          }
          @if (!link().completed) {
            <span hlmBadge variant="warning" class="self-start px-1.5 py-0.5 text-xs">Pending</span>
          }
        </div>
      </a>
      @if (editable()) {
        <button
          type="button"
          data-testid="edit-link"
          aria-label="Edit link"
          (click)="edit.emit(link())"
          class="top-1.5 right-1.5 absolute z-10 flex size-6 cursor-pointer items-center justify-center rounded-md bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      }
    </div>
  `,
})
export class LinkCardComponent {
  readonly link = input.required<PublicSocialMediaLink>();

  /** Show the edit affordance (host gates this with canEditLink — author or admin). */
  readonly editable = input(false);

  /** Emitted with the link when the edit pencil is clicked; the host opens the edit flow. */
  readonly edit = output<PublicSocialMediaLink>();

  /** Hostname for the Google favicon lookup — null when the URL is invalid or non-http(s). */
  protected readonly faviconDomain = computed(() => faviconHostnameOf(this.link().url));

  /** Bold domain text; falls back to the raw URL so the card still identifies the link when the
   * hostname can't be extracted. */
  protected readonly displayDomain = computed(() => this.faviconDomain() ?? this.link().url);
}
