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

    error: Error | undefined = undefined;

    private readonly MAX_MONTHS = 6;

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

    startDate!: Date;
    endDate!: Date;
    allowNextMonth: boolean = false;

    constructor(private ngZone: NgZone) {
        this.endDate = new Date();

        this.startDate = new Date();
        this.startDate.setMonth(this.startDate.getMonth() - this.MAX_MONTHS);
        this.startDate.setDate(1);

        this.updateAllowNextMonth();
    }

    updateAllowNextMonth(): void {
        this.allowNextMonth =
            this.endDate.valueOf() + 3.6e6 * 24 < new Date().valueOf();
    }

    moveMonths(monthDiff: number): void {
        const newStartDate = new Date(this.startDate);
        newStartDate.setMonth(newStartDate.getMonth() + monthDiff);
        newStartDate.setDate(1);

        const newEndDate = new Date(this.endDate);
        newEndDate.setMonth(newEndDate.getMonth() + monthDiff);

        this.startDate = newStartDate;
        this.endDate = newEndDate;

        this.updateAllowNextMonth();
        this.setAndRenderChart();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (
            !changes["lineId"]?.firstChange ||
            !changes["vehicleCount"]?.firstChange
        ) {
            this.setAndRenderChart();
        }
    }

    ngOnInit(): void {
        this.setAndRenderChart();
    }

    setAndRenderChart() {
        this.loading = true;
        if (this.chart) {
            this.chart.destroy();
            this.chart = undefined;
        }

        const startDateString = this.startDate.toISOString().split("T")[0];
        const endDateString = this.endDate.toISOString().split("T")[0];

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
        this.chart
            ?.render()
            .catch((err) => {
                console.error(err);
                this.error = err;
            })
            .finally(() => {
                this.loading = false;
            });
    }
}
