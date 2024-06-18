import { Subscription } from "rxjs";
import {
    BackendBuildInfo,
    BuildInfoService,
} from "src/app/services/build-info/build-info.service";

import { Component, OnDestroy } from "@angular/core";

import build from "../../../build";

@Component({
    selector: "app-footer",
    templateUrl: "./footer.component.html",
    styleUrls: ["./footer.component.scss"],
    standalone: true,
})
export class FooterComponent implements OnDestroy {
    backendBuildInfo!: BackendBuildInfo;
    buildInfo = build;

    $backendBuildInfo!: Subscription;

    constructor(private buildInfoService: BuildInfoService) {
        this.buildInfo = this.buildInfoService.getBuildInfo();
        this.buildInfoService.backendBuildInfo.subscribe((info) => {
            this.backendBuildInfo = info;
        });
    }

    ngOnDestroy(): void {
        this.$backendBuildInfo?.unsubscribe();
    }
}
