import { Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { BrnSonnerToaster } from "@spartan-ng/brain/sonner";
import { ThemeService } from "./core/theme/theme.service";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, BrnSonnerToaster],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
})
export class App {
  protected readonly theme = inject(ThemeService);
}
