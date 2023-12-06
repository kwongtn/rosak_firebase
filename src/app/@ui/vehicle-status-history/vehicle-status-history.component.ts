import { Component, Input, NgZone, OnInit } from "@angular/core";
import { Datum, Line } from "@antv/g2plot";
import { LooseObject } from "@antv/g2plot/node_modules/@antv/g2/lib/interface";
import * as AntVUtil from "@antv/util";

import {
    GetDataService,
    TVehicleStatusTrendCount,
} from "./services/get-data.service";

@Component({
    selector: "ui-vehicle-status-history",
    templateUrl: "./vehicle-status-history.component.html",
    styleUrls: ["./vehicle-status-history.component.scss"],
})
export class VehicleStatusHistoryComponent implements OnInit {
    @Input() lineId!: string;

    tooltipItems: any[] = [];
    activeTooltipTitle: string | undefined = undefined;
    activeSeriesList: any[] = [];

    sourceString: "MLPTF" | "MTREC" = "MLPTF";

    chartRef: Line | undefined = undefined;
    colors10: LooseObject = {};

    constructor(
        private ngZone: NgZone,
        private getDataService: GetDataService
    ) {}

    setAndRenderChart() {
        this.chartRef?.destroy();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 10);

        this.getDataService
            .getData(
                this.lineId,
                this.sourceString,
                startDate.toISOString().split("T")[0],
                new Date().toISOString().split("T")[0]
            )
            .then((data) => {
                this.chartRef = this.ngZone.runOutsideAngular(() => {
                    return new Line("vehicle-status-history-container", {
                        data,
                        autoFit: true,
                        xField: "date",
                        yField: "count",
                        seriesField: "status",
                        connectNulls: true,
                        xAxis: {
                            type: "cat",
                            label: {
                                autoRotate: false,
                                formatter: (v) => {
                                    return v.split("/").reverse().join("-");
                                },
                            },
                        },
                        yAxis: {
                            grid: {
                                line: {
                                    style: {
                                        lineWidth: 0.5,
                                    },
                                },
                            },
                        },
                        meta: {
                            date: {
                                range: [0.04, 0.96],
                            },
                        },
                        point: {
                            shape: "circle",
                            size: 2,
                            style: () => {
                                return {
                                    fillOpacity: 0,
                                    stroke: "transparent",
                                };
                            },
                        },
                        appendPadding: [0, 0, 0, 0],
                        legend: false,
                        smooth: true,
                        lineStyle: {
                            lineWidth: 1.5,
                        },
                        tooltip: {
                            showContent: false,
                            showMarkers: false,
                            follow: false,
                            position: "top",
                        },
                        theme: {
                            geometries: {
                                point: {
                                    circle: {
                                        active: {
                                            style: {
                                                r: 4,
                                                fillOpacity: 1,
                                                stroke: "#000",
                                                lineWidth: 1,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        interactions: [
                            { type: "marker-active" },
                            { type: "brush" },
                        ],
                    });
                });

                this.chartRef.render();

                // Set initial highlighted data point to latest
                const lastData = AntVUtil.last(data);
                const point = this.chartRef.chart.getXY(lastData);
                this.chartRef.chart.showTooltip(point);
                this.activeTooltipTitle = lastData.date;

                this.tooltipItems = data.filter(
                    (d: TVehicleStatusTrendCount) => {
                        return d.date === this.activeTooltipTitle;
                    }
                );

                this.chartRef.on("plot:mouseleave", () => {
                    (this.chartRef as Line).chart.hideTooltip();
                });
                this.chartRef.on("tooltip:change", (evt: any) => {
                    const { title } = evt.data;
                    this.tooltipItems = data.filter(
                        (d: TVehicleStatusTrendCount) => {
                            return d.date === title;
                        }
                    );

                    this.activeTooltipTitle = title;
                });

                this.colors10 = this.chartRef.chart.getTheme();
                console.log(this.colors10);
            });
    }

    changeActiveSeries(activeSeries: string) {
        console.log(activeSeries);
        let newList: TVehicleStatusTrendCount[] = [];

        if (!this.activeSeriesList.includes(activeSeries)) {
            newList = [...this.activeSeriesList, activeSeries];
        } else {
            newList = this.activeSeriesList.filter((s) => s !== activeSeries);
        }

        console.log(this.activeSeriesList);
        this.activeSeriesList = newList;
        console.log(this.activeSeriesList);
        const chart = this.chartRef?.chart;

        if (chart && activeSeries) {
            chart.filter("series", (series) => {
                return newList.includes(series) ? false : true;
            });
            chart.render(true);
            chart.geometries
                .find((geom) => {
                    return geom.type === "point";
                })
                ?.elements.forEach((ele) => {
                    const { date, status } = ele.getModel().data as Datum;
                    if (
                        date === this.activeTooltipTitle &&
                        status === activeSeries
                    ) {
                        ele.setState("active", true);
                    }
                });
        }
    }

    ngOnInit(): void {
        this.setAndRenderChart();
    }
}
