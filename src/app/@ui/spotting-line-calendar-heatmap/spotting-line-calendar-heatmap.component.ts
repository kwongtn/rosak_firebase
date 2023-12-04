import {
    Component,
    Input,
    NgZone,
    OnChanges,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import { Chart } from "@antv/g2";
import { RuntimeOptions } from "@antv/g2/lib/api/runtime";

import { GetDataService } from "./get-data/get-data.service";

@Component({
    selector: "spotting-line-calendar-heatmap",
    templateUrl: "./spotting-line-calendar-heatmap.component.html",
    styleUrls: ["./spotting-line-calendar-heatmap.component.scss"],
})
export class SpottingLineCalendarHeatmapComponent implements OnInit, OnChanges {
    @Input() lineId!: string;

    chart: Chart | undefined = undefined;
    loading: boolean = true;

    chartOptions: RuntimeOptions = {
        scrollbar: true,
        container: "container",
        type: "view",
        scale: {
            color: {
                palette: "BuPu",
                relations: [
                    [(d: string) => d === null, "#eee"],
                    [0, "#fff"],
                ],
            },
        },
        axis: {
            y: { labelAutoRotate: false, title: "Set Number" },
            x: {
                tickFilter: (d: string) => {
                    const week = d.split("-W")[1];
                    return Number.parseInt(week) % 3 === 0;
                },
                position: "top",
                title: "Week of Year",
            },
        },
        children: [
            {
                type: "cell",
                encode: {
                    x: "dateKey",
                    y: "vehicle",
                    color: "count",
                },
                style: { inset: 0.5 },
                tooltip: {
                    title: {
                        channel: "y",
                    },
                    items: [
                        {
                            name: "Week of Year",
                            channel: "x",
                            field: "dateKey",
                        },
                        {
                            name: "Vehicle",
                            channel: "y",
                            field: "vehicle",
                        },
                        {
                            name: "Count",
                            channel: "color",
                            field: "count",
                        },
                    ],
                },
            },
        ],
    };

    getNewChartWidthHeight(rowCount: number): [number, number] {
        const MULTIPLIER = 30; // 50px per unique value
        return [1600, rowCount * MULTIPLIER];
    }

    constructor(
        private getDataService: GetDataService,
        private ngZone: NgZone
    ) {
        return;
    }

    setAndRenderChart() {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 12);
        startDate.setDate(1);
        const startDateString = startDate.toISOString().split("T")[0];

        const endDateString = new Date().toISOString().split("T")[0];

        this.getDataService
            .getData(this.lineId, startDateString, endDateString)
            .then((data) => {
                const vehicleSet = new Set(data.map((item) => item.vehicle));
                const [width, height] = this.getNewChartWidthHeight(
                    vehicleSet.size
                );

                this.chartOptions.width = width;
                this.chartOptions.height = height;
                this.chartOptions.data = {
                    value: data,
                    type: "inline",
                };

                this.chart = this.ngZone.runOutsideAngular(() => {
                    return new Chart(this.chartOptions);
                });

                this.chart.render();
                this.loading = false;
            });
    }

    ngOnChanges(changes: SimpleChanges) {
        if (!changes["lineId"].firstChange) {
            this.chart?.destroy();
            this.chart = undefined;

            this.loading = true;
            this.setAndRenderChart();
        }
    }

    ngOnInit(): void {
        this.setAndRenderChart();
    }
}
