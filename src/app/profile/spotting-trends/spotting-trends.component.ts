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
            theme: {
                components: {
                    axis: {
                        common: {
                            label: {
                                style: {
                                    fill: "var(--devui-text, #252b3a)",
                                },
                            },
                        },
                    },
                    legend: {
                        common: {
                            itemName: {
                                style: {
                                    fill: "var(--devui-text, #252b3a)",
                                },
                            },
                        },
                    },
                    slider: {
                        common: {
                            textStyle: {
                                fill: "var(--devui-text, #252b3a)",
                            },
                        },
                    },
                    tooltip: {
                        domStyles: {
                            "g2-tooltip": {
                                backgroundColor: "var(--devui-form-control-bg, #ffffff)",
                                color: "var(--devui-float-block-shadow, rgba(94, 124, 224, 0.3))",
                            },
                            "g2-tooltip-title": {
                                color: "var(--devui-text, #252b3a)",
                            },
                            "g2-tooltip-list": {
                                color: "var(--devui-text, #252b3a)",
                            },
                            "g2-tooltip-list-item": {
                                color: "var(--devui-text, #252b3a)",
                            },
                            "g2-tooltip-marker": {
                                color: "var(--devui-text, #252b3a)",
                            },
                            "g2-tooltip-value": {
                                color: "var(--devui-text, #252b3a)",
                            },
                        },
                    },
                },
            },
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
