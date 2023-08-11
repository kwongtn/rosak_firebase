import { NzMenuItemDirective } from "ng-zorro-antd/menu";
import { Observable } from "rxjs";

import { Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { ThemeService } from "../services/theme/theme.service";
import { BreadcrumbsData } from "./content/content.component";
import { data } from "./data";

@Component({
    selector: "app-situasi",
    templateUrl: "./situasi.component.html",
    styleUrls: ["./situasi.component.scss"],
})
export class SituasiComponent {
    $theme!: Observable<"light" | "dark">;

    menuData = data;

    lineId: string = "";
    assetType: string = "";
    assetId: string = "";

    displayLineString!: string;
    displayAssetString!: string;

    breadcrumbsData: BreadcrumbsData[] = [];
    router: Router;

    constructor(
        themeService: ThemeService,
        router: Router,
        private route: ActivatedRoute
    ) {
        this.$theme = themeService.colorScheme.asObservable();
        this.router = router;
    }

    onMenuItemClick(event: NzMenuItemDirective): void {
        console.log(event);
    }
}
