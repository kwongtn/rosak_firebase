import { Component } from "@angular/core";
import { Router } from "@angular/router";

@Component({
    selector: "app-fallback",
    templateUrl: "./fallback.component.html",
    styleUrls: ["./fallback.component.scss"],
})
export class FallbackComponent {
    constructor(private router: Router) {
        return;
    }

    onClick() {
        this.router.navigate(["/spotting"]);
    }
}
