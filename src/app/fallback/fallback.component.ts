import { NzButtonModule } from "ng-zorro-antd/button";
import { NzResultModule } from "ng-zorro-antd/result";

import { Component } from "@angular/core";
import { Router } from "@angular/router";

@Component({
    selector: "app-fallback",
    templateUrl: "./fallback.component.html",
    styleUrls: ["./fallback.component.scss"],
    standalone: true,
    imports: [NzButtonModule, NzResultModule],
})
export class FallbackComponent {
    title = "Whoops! Page does not exist.";
    subTitle = "It seems that you have wandered into uncharted waters. Shall we send you back? 😉";

    constructor(private router: Router) {
        return;
    }

    onClick() {
        this.router.navigate(["/spotting"]);
    }
}
