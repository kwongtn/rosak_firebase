import { QueryRef } from "apollo-angular";
import { Subscription } from "rxjs";
import { ThemeService } from "src/app/services/theme.service";

import {
    Component,
    Input,
    NgZone,
    OnChanges,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import { PathCommand, ShapeAttrs } from "@antv/g-base/lib";
import { Data } from "@antv/g2";
import { Datum, G2, Heatmap, HeatmapOptions } from "@antv/g2plot";

import {
    GetSpottingVehicleCalendarHeatmapResponse,
} from "./services/get-data-gql/get-data-gql.service";
import {
    GetDataService,
    TVehicleSpottingTrendData,
} from "./services/get-data/get-data.service";

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthStr = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

type MutableHeatmapOptions = {
    -readonly [K in keyof HeatmapOptions]: HeatmapOptions[K];
};

@Component({
    selector: "spotting-vehicle-calendar-heatmap",
    templateUrl: "./spotting-vehicle-calendar-heatmap.component.html",
    styleUrls: ["./spotting-vehicle-calendar-heatmap.component.scss"],
})
export class SpottingVehicleCalendarHeatmapComponent implements OnInit, OnChanges {
    @Input() vehicleId!: string;

    gqlSubscription!: Subscription;
    watchQueryOption!: QueryRef<GetSpottingVehicleCalendarHeatmapResponse>;

    loading = true;
    heatmapPlot: Heatmap | undefined = undefined;
    heatmapPlotOptions: MutableHeatmapOptions = {
        data: [],
        height: 400,
        autoFit: false,
        xField: "index",
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
            index: {
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
                formatter: (txt, itm, idx) => {
                    const val = this.heatmapPlotOptions["data"].filter(
                        (item) => {
                            return item["dayOfWeek"] === 6;
                        }
                    )[idx] as TVehicleSpottingTrendData;

                    if (val) {
                        const [year, month, day] = val.dateKey.split("-");

                        if (Number.parseInt(day) <= 7) {
                            return `${year}\n${
                                monthStr[Number.parseInt(month) - 1]
                            }`;
                        }
                    } else {
                        /**
                         * val being undefined will only happen at the last column of the heatmap,
                         * and that there are no saturday entries.
                         */
                        const monthYear: { [key: string]: string[] } = {};
                        [0, 1, 2, 3, 4, 5].forEach((day) => {
                            const newVal = this.heatmapPlotOptions[
                                "data"
                            ].filter((item) => {
                                return item["dayOfWeek"] === day;
                            })[idx - 1] as TVehicleSpottingTrendData;

                            if (newVal) {
                                const [year, month, day] =
                                    newVal.dateKey.split("-");

                                if (monthYear[year]) {
                                    monthYear[year].push(month);
                                } else {
                                    monthYear[year] = [month];
                                }
                            }
                        });

                        console.log(monthYear);

                        const year = Math.max(
                            ...Object.keys(monthYear).map((elem) => {
                                return Number.parseInt(elem);
                            })
                        );
                        const month = Math.max(
                            ...monthYear[year].map((elem) => {
                                return Number.parseInt(elem) - 1;
                            })
                        );
                        return `${year}\n${monthStr[month]}`;
                    }

                    return "";
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
        private getDataService: GetDataService,
        private ngZone: NgZone,
        themeService: ThemeService
    ) {
        this.registerPolygons();

        themeService.colorScheme.subscribe((theme) => {
            this.heatmapPlotOptions.theme = theme;

            this.heatmapPlot?.update({
                theme,
            });
            this.heatmapPlot?.render();
        });
    }

    setAndRenderChart() {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 10);
        startDate.setDate(1);

        this.getDataService
            .getData(
                this.vehicleId,
                startDate.toISOString().split("T")[0],
                new Date().toISOString().split("T")[0]
            )
            .then((res) => {
                this.heatmapPlotOptions["data"] = res.data.map((val) => {
                    return {
                        ...val,
                        index: res.mappings.yearWeek[val.yearWeek],
                    };
                });

                this.heatmapPlot = this.ngZone.runOutsideAngular(() => {
                    return new Heatmap(
                        "spotting-vehicle-calendar-heatmap-container",
                        this.heatmapPlotOptions
                    );
                });

                this.heatmapPlot.render();

                this.loading = false;
            });
    }

    ngOnInit(): void {
        this.setAndRenderChart();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (!changes["vehicleId"].firstChange) {
            this.heatmapPlot?.destroy();
            this.heatmapPlot = undefined;

            this.loading = true;
            this.setAndRenderChart();
        }
    }
}
