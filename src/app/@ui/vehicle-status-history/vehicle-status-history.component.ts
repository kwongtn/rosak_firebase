import {
    LineVehiclesChartographySource,
} from "src/app/situasi/vehicles/get-gql-data/get-gql-data.service";

import {
    Component,
    Input,
    NgZone,
    OnChanges,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import { Area, Datum } from "@antv/g2plot";
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
export class VehicleStatusHistoryComponent implements OnInit, OnChanges {
    @Input() lineId!: string;
    @Input() sources!: LineVehiclesChartographySource[];

    loading: boolean = true;

    tooltipItems: any[] = [];
    activeTooltipTitle: string | undefined = undefined;
    activeSeriesList: any[] = [];

    chartRef: Area | undefined = undefined;
    sequenceColors: LooseObject = {};

    sourceString: "MLPTF" | "MTREC" = "MLPTF";
    infoTip: string | undefined = undefined;
    dataSourceOptions = [
        { label: "MLPTF", value: "MLPTF", disabled: false, infoTip: undefined },
        {
            label: "MTREC",
            value: "MTREC",
            disabled: false,
            infoTip:
                "Data is scraped on a best effort basis from Malaysia Trains & Rail Enthusiasts (MTREC) and hence may be inaccurate.",
        },
        {
            label: "Prasarana",
            value: "prasarana",
            disabled: true,
            infoTip:
                "Official data from Prasarana website collected on a best effort basis.",
        },
    ];

    constructor(
        private ngZone: NgZone,
        private getDataService: GetDataService
    ) {}

    ngOnChanges(changes: SimpleChanges) {
        if (!changes["sources"].isFirstChange()) {
            const hasMtrec =
                changes["sources"].currentValue.filter(
                    (val: LineVehiclesChartographySource) => {
                        return val.name === "MTREC";
                    }
                ).length > 0;

            this.dataSourceOptions = this.dataSourceOptions.map((option) => {
                return {
                    ...option,
                    disabled:
                        option.value === "MTREC" ? !hasMtrec : option.disabled,
                };
            });
        }
    }

    setInitialHighlight(data: TVehicleStatusTrendCount[]) {
        if (!this.chartRef) {
            return;
        }

        const lastData = AntVUtil.last(data);
        const point = this.chartRef.chart.getXY(lastData);
        this.chartRef.chart.showTooltip(point);
        this.activeTooltipTitle = lastData.date;

        this.tooltipItems = data.filter((d: TVehicleStatusTrendCount) => {
            return d.date === this.activeTooltipTitle;
        });

        this.chartRef.on("plot:mouseleave", () => {
            (this.chartRef as Area).chart.hideTooltip();
        });
        this.chartRef.on("tooltip:change", (evt: any) => {
            const { title } = evt.data;
            this.tooltipItems = data.filter((d: TVehicleStatusTrendCount) => {
                return d.date === title;
            });

            this.activeTooltipTitle = title;
        });
    }

    setAndRenderChart() {
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
                    return new Area("vehicle-status-history-container", {
                        data,
                        autoFit: true,
                        xField: "date",
                        yField: "count",
                        seriesField: "status",
                        // connectNulls: true,
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
                        // lineStyle: {
                        //     lineWidth: 1.5,
                        // },
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
                this.setInitialHighlight(data);

                this.sequenceColors =
                    this.chartRef.chart.getTheme()["colors10"];
                this.loading = false;
            });
    }

    changeActiveSeries(activeSeries: string) {
        let newList: TVehicleStatusTrendCount[] = [];

        if (!this.activeSeriesList.includes(activeSeries)) {
            newList = [...this.activeSeriesList, activeSeries];
        } else {
            newList = this.activeSeriesList.filter((s) => s !== activeSeries);
        }

        this.activeSeriesList = newList;
        const chart = this.chartRef?.chart;

        if (chart && activeSeries) {
            chart.filter("status", (status) => {
                return newList.includes(status) ? false : true;
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

    onDataSourceChange(index: number) {
        this.loading = true;
        this.sourceString = this.dataSourceOptions[index].value as any;
        this.infoTip = this.dataSourceOptions[index].infoTip;

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
                if (!this.chartRef) {
                    return;
                }
                this.chartRef.update({
                    data,
                });
                this.setInitialHighlight(data);

                this.chartRef.render();
                this.loading = false;
            });
    }

    ngOnInit(): void {
        this.setAndRenderChart();
    }
}
