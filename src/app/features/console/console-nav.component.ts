import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

interface ConsoleNavItem {
  path: string;
  label: string;
  /** "/" is a prefix of every other console route, so it alone must match exactly. */
  exact: boolean;
}

const ITEMS: ConsoleNavItem[] = [
  { path: "/console", label: "Spotting Queue", exact: true },
  { path: "/console/insiden/pending", label: "Incident Approval", exact: false },
  { path: "/console/insiden/links", label: "Social Media Links", exact: false },
];

/**
 * Section switcher shared by every console page — pill links whose active
 * state comes from RouterLinkActive, so highlighting follows the real URL.
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
  protected readonly items = ITEMS;
}
