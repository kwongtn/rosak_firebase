import { QueryRef } from "apollo-angular";
import { Subscription } from "rxjs";

import { Component, Input, OnInit } from "@angular/core";
import { G2, Heatmap } from "@antv/g2plot";

import {
    GetDataGqlService,
    GetSpottingVehicleCalendarHeatmapResponse,
} from "./services/get-data-gql/get-data-gql.service";

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

@Component({
    selector: "spotting-vehicle-calendar-heatmap",
    templateUrl: "./spotting-vehicle-calendar-heatmap.component.html",
    styleUrls: ["./spotting-vehicle-calendar-heatmap.component.scss"],
})
export class SpottingVehicleCalendarHeatmapComponent implements OnInit {
    @Input() vehicleId!: string;

    gqlSubscription!: Subscription;
    watchQueryOption!: QueryRef<GetSpottingVehicleCalendarHeatmapResponse>;

    isLoading = true;

    registerPolygons() {
        G2.registerShape("polygon", "boundary-polygon", {
            draw(cfg, container) {
                const group = container.addGroup();
                const attrs = {
                    stroke: "#fff",
                    lineWidth: 1,
                    fill: cfg.color,
                    paht: [],
                };
                const points = cfg.points as G2.Types.ShapeVertices;
                const path = [
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
                (attrs as any).path = (this as any).parsePath(path);
                group.addShape("path", {
                    attrs,
                });

                if ((cfg.data as any).isLastWeekOfMonth) {
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
                            path: (this as any).parsePath(linePath),
                            lineWidth: 4,
                            stroke: "#404040",
                        },
                    });
                    if ((cfg.data as any).isLastDayOfMonth) {
                        group.addShape("path", {
                            attrs: {
                                path: (this as any).parsePath([
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

    constructor(private gqlService: GetDataGqlService) {
        this.registerPolygons();
    }

    ngOnInit(): void {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 10);
        startDate.setDate(1);

        this.watchQueryOption = this.gqlService.watch({
            vehicleFilter: {
                id: this.vehicleId,
            },
            startDate: startDate.toISOString().split("T")[0],
            endDate: new Date().toISOString().split("T")[0],
        });

        this.gqlSubscription = this.watchQueryOption.valueChanges.subscribe(
            ({ data, loading }) => {
                this.isLoading = loading;

                const spottingTrends = [...data.vehicles[0].spottingTrends].map(
                    (val) => {
                        return {
                            ...val,
                            weekOfYear: val.weekOfYear.toString(),
                        };
                    }
                );

                const heatmapPlot = new Heatmap(
                    document.getElementById("container") as HTMLElement,
                    {
                        data: spottingTrends,
                        height: 400,
                        autoFit: false,
                        xField: "weekOfYear",
                        yField: "dayOfWeek",
                        colorField: "count",
                        reflect: "y",
                        shape: "boundary-polygon",
                        legend: {},
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
                    }
                );
                heatmapPlot.render();
            }
        );
    }
}
