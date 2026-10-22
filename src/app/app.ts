import { Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { BrnSonnerToaster } from "@spartan-ng/brain/sonner";
import { NavProgressComponent } from "./core/navigation/nav-progress/nav-progress.component";
import { AnalyticsService } from "./core/analytics/analytics.service";
import { ThemeService } from "./core/theme/theme.service";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, BrnSonnerToaster, NavProgressComponent],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
})
export class App {
  protected readonly theme = inject(ThemeService);

  constructor() {
    // Injected for its side effect: it starts `page_view` tracking once this first render is done.
    inject(AnalyticsService);
  }
}
