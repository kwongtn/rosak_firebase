import { Component } from "@angular/core";
import { Router } from "@angular/router";

@Component({
    selector: "app-construction",
    templateUrl: "./construction.component.html",
    styleUrls: ["./construction.component.scss"],
})
export class ConstructionComponent {
    constructor(private router: Router) {
        return;
    }

    onClick() {
        this.router.navigate(["/spotting"]);
    }
}
