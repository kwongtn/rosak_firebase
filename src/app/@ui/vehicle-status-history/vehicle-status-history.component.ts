import { Component, NgZone, OnInit } from "@angular/core";
import { Datum, Line } from "@antv/g2plot";
import { LooseObject } from "@antv/g2plot/node_modules/@antv/g2/lib/interface";
import * as AntVUtil from "@antv/util";

@Component({
    selector: "ui-vehicle-status-history",
    templateUrl: "./vehicle-status-history.component.html",
    styleUrls: ["./vehicle-status-history.component.scss"],
})
export class VehicleStatusHistoryComponent implements OnInit {
    tooltipItems: any[] = [];
    activeTooltipTitle: string | undefined = undefined;
    activeSeriesList: any[] = [];

    chartRef: Line | undefined = undefined;
    colors10: LooseObject = {};

    constructor(private ngZone: NgZone) {}

    setAndRenderChart() {
        this.chartRef?.destroy();
        fetch(
            "https://gw.alipayobjects.com/os/antfincdn/3PtP0m%26VuK/trend-data.json"
        )
            .then((res) => res.json())
            .then((data) => {
                this.chartRef = this.ngZone.runOutsideAngular(() => {
                    return new Line("container", {
                        data,
                        autoFit: true,
                        xField: "Date",
                        yField: "value",
                        seriesField: "series",
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
                            Date: {
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
                this.activeTooltipTitle = lastData.Date;

                this.tooltipItems = data.filter(
                    (d: any) => d.Date === this.activeTooltipTitle
                );

                this.chartRef.on("plot:mouseleave", () => {
                    (this.chartRef as Line).chart.hideTooltip();
                });
                this.chartRef.on("tooltip:change", (evt: any) => {
                    const { title } = evt.data;
                    this.tooltipItems = data.filter(
                        (d: any) => d.Date === title
                    );

                    this.activeTooltipTitle = title;
                });

                this.colors10 = this.chartRef.chart.getTheme();
                console.log(this.colors10);
            });
    }

    changeActiveSeries(activeSeries: string) {
        console.log(activeSeries);
        let newList: any[] = [];

        if (!this.activeSeriesList.includes(activeSeries)) {
            newList = [...this.activeSeriesList, activeSeries];
        } else {
            newList = this.activeSeriesList.filter((s) => s !== activeSeries);
        }

        console.log( this.activeSeriesList);
        this.activeSeriesList = newList;
        console.log( this.activeSeriesList);
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
                    const { Date, series } = ele.getModel().data as Datum;
                    if (
                        Date === this.activeTooltipTitle &&
                        series === activeSeries
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
