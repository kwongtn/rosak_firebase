import { NzMenuItemDirective } from "ng-zorro-antd/menu";
import { filter, Observable, Subscription } from "rxjs";

import { Component } from "@angular/core";
import {
    ActivatedRoute,
    DefaultUrlSerializer,
    NavigationEnd,
    Router,
} from "@angular/router";

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

    lineId: string | undefined = undefined;
    assetType: string | undefined = undefined;
    assetId: string | undefined = undefined;

    displayLineString!: string;
    displayAssetString!: string;
    titleString!: string;

    breadcrumbsData: BreadcrumbsData[] = [];
    router: Router;

    private routeSubscription!: Subscription;

    constructor(
        themeService: ThemeService,
        router: Router,
        private route: ActivatedRoute
    ) {
        this.$theme = themeService.colorScheme.asObservable();
        this.router = router;
        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe((event) => {
                const url = (event as NavigationEnd).url;
                const segments = new DefaultUrlSerializer().parse(url).root
                    .children["primary"].segments;

                this.lineId =
                    segments.length > 1 ? segments[1].path : undefined;
                this.assetType =
                    segments.length > 2 ? segments[2].path : undefined;
                this.assetId =
                    segments.length > 3 ? segments[3].path : undefined;

                this.breadcrumbsData = [];

                const currentLine = this.menuData.find((elem) => {
                    return elem.id === this.lineId;
                });

                if (currentLine && this.lineId) {
                    this.breadcrumbsData.push({
                        displayText: currentLine.displayName,
                        href: [this.lineId],
                    });

                    if (this.assetType) {
                        const assetVerb: "vehicles" | "stations" = (this
                            .assetType + "s") as any; // Assume is 'vehicles' or'stations'
                        this.breadcrumbsData.push({
                            displayText:
                                assetVerb.charAt(0).toUpperCase() +
                                assetVerb.slice(1),
                            href: [this.lineId, this.assetType],
                        });

                        const displayAsset = currentLine[assetVerb].find(
                            (asset) => {
                                return this.assetId === asset.id;
                            }
                        );

                        if (displayAsset && this.assetId) {
                            this.titleString = displayAsset.displayName;

                            this.breadcrumbsData.push({
                                displayText: this.titleString,
                                href: [
                                    this.lineId,
                                    this.assetType,
                                    this.assetId,
                                ],
                            });
                        } else {
                            this.titleString =
                                currentLine.displayName +
                                " - " +
                                assetVerb.charAt(0).toUpperCase() +
                                assetVerb.slice(1);
                        }
                    } else {
                        this.titleString = currentLine.displayName;
                    }
                } else {
                    this.titleString = "Situasi";
                }
            });
    }

    onMenuItemClick(event: NzMenuItemDirective): void {
        console.log(event);
    }

    ngOnDestroy(): void {
        this.routeSubscription?.unsubscribe();
    }
}
