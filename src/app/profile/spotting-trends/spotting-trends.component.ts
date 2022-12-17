import {
    SpottingType,
    SpottingTypePipe,
} from "src/app/pipes/spotting-type/spotting-type.pipe";

import { Component, HostListener, Input, OnInit } from "@angular/core";
import { Line } from "@antv/g2plot";

import { UserSpottingTrends } from "../services/get-user-data.service";

@Component({
    selector: "profile-spotting-trends",
    templateUrl: "./spotting-trends.component.html",
    styleUrls: ["./spotting-trends.component.scss"],
})
export class SpottingTrendsComponent implements OnInit {
    @Input() data!: UserSpottingTrends[];

    chart: Line | undefined = undefined;

    constructor() {
        return;
    }

    getLegendPosition(): "right" | "top" {
        return document.body.clientWidth > 1024 ? "right" : "top";
    }

    getSliderHeight(): number {
        return document.body.clientWidth > 1024 ? 50 : 30;
    }

    @HostListener("window:resize")
    resize(): void {
        this.chart?.update({
            legend: {
                position: this.getLegendPosition(),
            },
            slider: {
                height: this.getSliderHeight(),
            },
        });
    }

    ngOnInit(): void {
        const pipeObj = new SpottingTypePipe();
        this.data = this.data.map((value) => {
            return {
                ...value,
                eventType: pipeObj.transform(
                    value.eventType as SpottingType
                ) as string,
            };
        });

        this.chart = new Line("container", {
            data: this.data,
            xField: "dateKey",
            yField: "count",
            seriesField: "eventType",
            renderer: "svg",
            syncViewPadding: true,
            legend: {
                position: this.getLegendPosition(),
            },
            smooth: true,
            animation: {
                appear: {
                    animation: "path-in",
                    duration: 1000,
                },
            },
            slider: {
                height: this.getSliderHeight(),
            },
        });

        this.chart.render();
    }
}
