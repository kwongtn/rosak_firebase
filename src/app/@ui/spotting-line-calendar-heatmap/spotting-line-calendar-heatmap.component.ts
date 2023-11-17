import { environment } from "src/environments/environment";

import { Component, HostListener, Input, OnInit } from "@angular/core";
import { Chart } from "@antv/g2";

@Component({
    selector: "spotting-line-calendar-heatmap",
    templateUrl: "./spotting-line-calendar-heatmap.component.html",
    styleUrls: ["./spotting-line-calendar-heatmap.component.scss"],
})
export class SpottingLineCalendarHeatmapComponent implements OnInit {
    @Input() lineId!: string;

    chart: Chart | undefined = undefined;

    getNewChartWidthHeight(): [number, number] {
        return [window.innerWidth - 300, window.innerHeight - 200];
    }

    @HostListener("window:resize")
    resize(): void {
        const [width, height] = this.getNewChartWidthHeight();
        this.chart?.changeSize(width, height);
        this.chart?.render();
    }

    constructor() {
        return;
    }

    ngOnInit(): void {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 12);
        startDate.setDate(1);
        const startDateString = startDate.toISOString().split("T")[0];

        const endDateString = new Date().toISOString().split("T")[0];

        const [width, height] = this.getNewChartWidthHeight();

        this.chart = new Chart({
            scrollbar: true,
            container: "container",
            type: "view",
            data: {
                type: "fetch",
                value: `${environment.backendUrl}operation/line_vehicles_spotting_trend/${this.lineId}/${startDateString}/${endDateString}/`,
                format: "json",
            },
            width: 1600,
            height: 2000,
            scale: {
                color: {
                    palette: "puRd",
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
        });

        this.chart.render();
    }
}
