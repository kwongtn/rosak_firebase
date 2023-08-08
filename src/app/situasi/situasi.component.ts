import { Observable } from "rxjs";

import { Component } from "@angular/core";

import { ThemeService } from "../services/theme/theme.service";

@Component({
    selector: "app-situasi",
    templateUrl: "./situasi.component.html",
    styleUrls: ["./situasi.component.scss"],
})
export class SituasiComponent {
    $theme!: Observable<"light" | "dark">;

    constructor(themeService: ThemeService) {
        this.$theme = themeService.colorScheme.asObservable();
    }
}
