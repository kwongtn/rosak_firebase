import { Component } from "@angular/core";

/**
 * Small "opens in another tab" arrow for links with `target="_blank"`. Sighted visitors' cue;
 * screen-reader users get an sr-only "(opens in new tab)" on the link itself, so this is hidden.
 */
@Component({
  selector: "app-external-link-icon",
  host: { "aria-hidden": "true", class: "inline-flex size-3.5 shrink-0" },
  template: `
    <svg
      viewBox="0 0 24 24"
      class="size-full"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  `,
})
export class ExternalLinkIconComponent {}
