import { Component, computed, input } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmCardImports } from "../../../ui/card/card";
import { PublicSocialMediaLink } from "../data/social-links.queries";
import { faviconHostnameOf } from "../data/social-link.util";

/**
 * One public social-media link submitted by a community member (a post/tweet/thread referencing
 * an incident). Visual language mirrors IncidentCardComponent (hlmCard grid, badge + title
 * header row, muted right-hand timestamp, tag badges row, trailing action row), but the whole
 * card IS the navigation affordance: clicking anywhere opens the source in a new tab. Favicon
 * comes from Google's s2 service; a URL whose hostname can't be extracted (or isn't http/https)
 * falls back to a plain link icon instead of a broken image. SSR-safe: no browser APIs.
 */
@Component({
  selector: "app-link-card",
  imports: [DatePipe, HlmBadge, ...HlmCardImports],
  template: `
    <a [href]="link().url" target="_blank" rel="noopener noreferrer" hlmCard class="gap-3 p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex items-center gap-1.5">
            @if (faviconDomain(); as domain) {
              <img
                [src]="'https://www.google.com/s2/favicons?domain=' + domain"
                class="size-4 rounded-sm"
                alt=""
              />
            } @else {
              <svg
                viewBox="0 0 24 24"
                class="text-muted-foreground size-4"
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
            <span class="text-sm font-semibold">{{ displayDomain() }}</span>
          </div>
          @if (link().title) {
            <p class="text-muted-foreground line-clamp-1 text-sm">{{ link().title }}</p>
          }
        </div>
        <div class="text-muted-foreground text-right text-xs whitespace-nowrap">
          {{ link().created | date: "MMM d, y HH:mm" }}
        </div>
      </div>

      @if (link().lines.length > 0) {
        <div class="flex flex-wrap gap-1.5">
          @for (line of link().lines; track line.id) {
            <span hlmBadge variant="outline" [title]="line.displayName">{{ line.code }}</span>
          }
        </div>
      }

      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          @if (!link().completed) {
            <span hlmBadge variant="warning">Pending</span>
          }
        </div>
        <svg
          viewBox="0 0 24 24"
          class="text-muted-foreground size-3"
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
      </div>
    </a>
  `,
})
export class LinkCardComponent {
  readonly link = input.required<PublicSocialMediaLink>();

  /** Hostname for the Google favicon lookup — null when the URL is invalid or non-http(s). */
  protected readonly faviconDomain = computed(() => faviconHostnameOf(this.link().url));

  /** Bold domain text; falls back to the raw URL so the card still identifies the link when the
   * hostname can't be extracted. */
  protected readonly displayDomain = computed(() => this.faviconDomain() ?? this.link().url);
}
