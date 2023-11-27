import { QueryRef } from "apollo-angular";
import { Subscription } from "rxjs";
import { ThemeService } from "src/app/services/theme/theme.service";

import { Component, Input, NgZone, OnInit } from "@angular/core";
import { PathCommand, ShapeAttrs } from "@antv/g-base/lib";
import { Data } from "@antv/g2";
import { Datum, G2, Heatmap, HeatmapOptions } from "@antv/g2plot";

import {
    GetDataGqlService,
    GetSpottingVehicleCalendarHeatmapResponse,
} from "./services/get-data-gql/get-data-gql.service";
import { GetDataService } from "./services/get-data/get-data.service";

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type MutableHeatmapOptions = {
    -readonly [K in keyof HeatmapOptions]: HeatmapOptions[K];
};

@Component({
    selector: "spotting-vehicle-calendar-heatmap",
    templateUrl: "./spotting-vehicle-calendar-heatmap.component.html",
    styleUrls: ["./spotting-vehicle-calendar-heatmap.component.scss"],
})
export class SpottingVehicleCalendarHeatmapComponent implements OnInit {
    @Input() vehicleId!: string;

    gqlSubscription!: Subscription;
    watchQueryOption!: QueryRef<GetSpottingVehicleCalendarHeatmapResponse>;

    loading = true;
    heatmapPlot: Heatmap | undefined = undefined;
    heatmapPlotOptions: MutableHeatmapOptions = {
        data: [],
        height: 400,
        autoFit: false,
        xField: "weekOfYear",
        yField: "dayOfWeek",
        colorField: "count",
        reflect: "y",
        shape: "boundary-polygon",
        legend: {},
        // theme: "light",
        color: "puRd",
        meta: {
            dayOfWeek: {
                type: "cat",
                values: daysOfWeek,
            },
            weekOfYear: {
                type: "cat",
            },
            count: {
                sync: true,
            },
            dateKey: {
                type: "cat",
            },
        },
        yAxis: {
            grid: null,
        },
        tooltip: {
            title: "dateKey",
            showMarkers: false,
        },
        interactions: [{ type: "element-active" }],
        xAxis: {
            position: "top",
            tickLine: null,
            line: null,
            label: {
                offset: 12,
                style: {
                    fontSize: 12,
                    fill: "#666",
                    textBaseline: "top",
                },
            },
        },
    };


    registerPolygons() {
        G2.registerShape("polygon", "boundary-polygon", {
            draw(cfg, container) {
                const group = container.addGroup();
                const points = cfg.points as G2.Types.ShapeVertices;
                const path: PathCommand[] = [
                    [
                        "M",
                        (points[0] as G2.Types.Point).x,
                        (points[0] as G2.Types.Point).y,
                    ],
                    [
                        "L",
                        (points[1] as G2.Types.Point).x,
                        (points[1] as G2.Types.Point).y,
                    ],
                    [
                        "L",
                        (points[2] as G2.Types.Point).x,
                        (points[2] as G2.Types.Point).y,
                    ],
                    [
                        "L",
                        (points[3] as G2.Types.Point).x,
                        (points[3] as G2.Types.Point).y,
                    ],
                    ["Z"],
                ];
                const attrs: ShapeAttrs = {
                    stroke: "#fff",
                    lineWidth: 1,
                    fill: cfg.color,
                    path: (this as G2.Types.Shape).parsePath(path),
                };

                group.addShape("path", {
                    attrs,
                });

                if ((cfg.data as Datum | Data).isLastWeekOfMonth) {
                    const linePath = [
                        [
                            "M",
                            (points[2] as G2.Types.Point).x,
                            (points[2] as G2.Types.Point).y,
                        ],
                        [
                            "L",
                            (points[3] as G2.Types.Point).x,
                            (points[3] as G2.Types.Point).y,
                        ],
                    ];
                    // 最后一周的多边形添加右侧边框
                    group.addShape("path", {
                        attrs: {
                            path: (this as G2.Types.Shape).parsePath(linePath),
                            lineWidth: 4,
                            stroke: "#404040",
                        },
                    });
                    if ((cfg.data as Datum | Data).isLastDayOfMonth) {
                        group.addShape("path", {
                            attrs: {
                                path: (this as G2.Types.Shape).parsePath([
                                    [
                                        "M",
                                        (points[1] as G2.Types.Point).x,
                                        (points[1] as G2.Types.Point).y,
                                    ],
                                    [
                                        "L",
                                        (points[2] as G2.Types.Point).x,
                                        (points[2] as G2.Types.Point).y,
                                    ],
                                ]),
                                lineWidth: 4,
                                stroke: "#404040",
                            },
                        });
                    }
                }
                return group;
            },
        });
    }

    constructor(
        private gqlService: GetDataGqlService,
        private getDataService: GetDataService,
        private ngZone: NgZone,
        themeService: ThemeService
    ) {
        this.registerPolygons();

        // themeService.colorScheme.subscribe((theme) => {
        //     console.log(theme);
        //     // this.heatmapPlotOptions.theme = theme;

        //     this.heatmapPlot?.update(this.heatmapPlotOptions);
        //     this.heatmapPlot?.render();
        // });
    }

    ngOnInit(): void {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 10);
        startDate.setDate(1);

        this.getDataService
            .getData(
                this.vehicleId,
                startDate.toISOString().split("T")[0],
                new Date().toISOString().split("T")[0]
            )
            .then((data) => {
                this.heatmapPlotOptions["data"] = data;

                this.heatmapPlot = this.ngZone.runOutsideAngular(() => {
                    return new Heatmap(
                        document.getElementById("container") as HTMLElement,
                        this.heatmapPlotOptions
                    );
                });

                this.heatmapPlot.render();

                this.loading = false;
            });
    }
}
