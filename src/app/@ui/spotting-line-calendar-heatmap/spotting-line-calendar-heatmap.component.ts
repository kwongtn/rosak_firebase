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
    chartData: any[] = [];

    getNewChartWidthHeight(): [number, number] {
        return [window.innerWidth - 300, window.innerHeight - 200];
    }

    @HostListener("window:resize")
    resize(): void {
        const [width, height] = this.getNewChartWidthHeight();
        this.chart?.changeSize(width, height);
        this.chart?.render();
    }

    ngOnInit(): void {
        const [width, height] = this.getNewChartWidthHeight();
        this.chart = new Chart({
            container: "container",
            type: "view",
            data: {
                type: "inline",
                value: this.chartData.map((val) => {
                    return {
                        ...val,
                        vehicle: val.vehicle.id,
                    };
                }),
            },
            autoFit: true,
            width,
            height,

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
                y: { labelAutoRotate: false },
                x: { tickFilter: (d: number) => d % 10 === 0, position: "top" },
            },
            children: [
                {
                    type: "cell",
                    encode: { x: "dateKey", y: "vehicle", color: "count" },
                    style: { inset: 0.5 },
                    tooltip: {
                        title: {
                            channel: "y",
                        },
                        items: [
                            {
                                name: "Date",
                                channel: "x",
                                field: "dateKey",
                            },
                            {
                                name: "Vehicle",
                                channel: "y",
                                field: "vehicle",
                            },
                        ],
                    },
                },
            ],
        });

        this.chart.render();
    }
}
