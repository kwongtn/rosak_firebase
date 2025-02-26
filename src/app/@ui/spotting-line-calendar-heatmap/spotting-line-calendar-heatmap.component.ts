import { environment } from "src/environments/environment";

import {
    Component,
    Input,
    NgZone,
    OnChanges,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import { Chart, Data } from "@antv/g2";
import { RuntimeOptions } from "@antv/g2/lib/api/runtime";

const ROW_HEIGHT = 30;

@Component({
    selector: "spotting-line-calendar-heatmap",
    templateUrl: "./spotting-line-calendar-heatmap.component.html",
    styleUrls: ["./spotting-line-calendar-heatmap.component.scss"],
})
export class SpottingLineCalendarHeatmapComponent implements OnInit, OnChanges {
    @Input() lineId!: string;
    @Input() vehicleCount!: number;

    chart: Chart | undefined = undefined;
    loading: boolean = true;

    chartOptions: RuntimeOptions = {
        scrollbar: true,
        container: "container",
        type: "view",
        autoFit: true,
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

    constructor(private ngZone: NgZone) {
        return;
    }

    setAndRenderChart() {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);
        startDate.setDate(1);
        const startDateString = startDate.toISOString().split("T")[0];

        const endDateString = new Date().toISOString().split("T")[0];

        this.chart = this.ngZone.runOutsideAngular(() => {
            return new Chart({
                ...this.chartOptions,
                data: {
                    value: `${environment.backendUrl}operation/line_vehicles_spotting_trend/${this.lineId}/${startDateString}/${endDateString}/`,
                    type: "fetch",
                    format: "csv",
                } as Data,
                height: this.vehicleCount * ROW_HEIGHT,
            });
        });
        this.chart.render().finally(() => {
            this.loading = false;
        });
    }

    ngOnChanges(changes: SimpleChanges) {
        if (
            !changes["lineId"]?.firstChange ||
            !changes["vehicleCount"]?.firstChange
        ) {
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
