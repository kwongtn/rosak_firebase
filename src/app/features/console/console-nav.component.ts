import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { CONSOLE_LINKS } from "../../shell/nav-config";

/**
 * Section switcher shared by every console page — pill links whose active
 * state comes from RouterLinkActive, so highlighting follows the real URL.
 * The sections come from `CONSOLE_LINKS`, the same list `<app-nav>` and the compact nav render.
 */
@Component({
  selector: "app-console-nav",
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="flex flex-wrap items-center gap-2" aria-label="Console sections">
      @for (item of items; track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="bg-primary text-primary-foreground border-primary"
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: item.exact }"
          class="hover:bg-muted rounded-lg border px-3 py-1.5 text-sm transition-colors"
        >
          {{ item.label }}
        </a>
      }
    </nav>
  `,
})
export class ConsoleNavComponent {
  protected readonly items = CONSOLE_LINKS;
}
