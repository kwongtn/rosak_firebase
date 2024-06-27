import { Apollo, gql } from "apollo-angular";
import { LoadingModule } from "ng-devui";
import { TimeAxisData, TimeAxisModule } from "ng-devui/time-axis";
import { Subscription } from "rxjs";
import {
    GetVehicleIncidentsResponse,
    IncidentSeverityType,
} from "src/app/models/query/get-vehicles";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

const GET_TIMELINE_DATA = gql`
    query ($vehicleIncidentFilter: VehicleIncidentFilter) {
        vehicleIncidents(filters: $vehicleIncidentFilter) {
            order
            date
            severity
            title
            brief
            isLast
        }
    }
`;

@Component({
    selector: "spotting-table-inline-timeline",
    templateUrl: "./inline-timeline.component.html",
    styleUrls: ["./inline-timeline.component.scss"],
    standalone: true,
    imports: [LoadingModule, TimeAxisModule],
})
export class InlineTimelineComponent implements OnInit, OnDestroy {
    @Input() vehicleId!: string | number;

    showLoading: boolean = true;
    querySubscription!: Subscription;

    timelineData: TimeAxisData = {
        direction: "horizontal",
        horizontalAlign: "left",
        widthMode: "fitContent",
        model: "template",
        list: [],
    };

    constructor(private apollo: Apollo) {
        return;
    }

    severityToDotColor(severity: IncidentSeverityType): string {
        const myMap = {
            TRIVIA: "var(--devui-info)",
            STATUS: "var(--devui-success)",
            CRITICAL: "var(--devui-danger)",
        };

        return myMap[severity];
    }

    ngOnInit(): void {
        this.querySubscription = this.apollo
            .query<GetVehicleIncidentsResponse>({
                query: GET_TIMELINE_DATA,
                variables: {
                    vehicleIncidentFilter: {
                        vehicle: { id: this.vehicleId },
                    },
                },
            })
            .subscribe(({ data, loading }) => {
                this.showLoading = false;
                this.timelineData.list = [...data.vehicleIncidents]
                    .sort((a, b) => {
                        return a.order - b.order;
                    })
                    .map((value, index, arr) => {
                        return {
                            dotColor: this.severityToDotColor(
                                value.severity as IncidentSeverityType
                            ),
                            lineStyle: {
                                style: value.isLast
                                    ? "none"
                                    : index == arr.length - 1
                                        ? "dashed"
                                        : "solid",
                                color: "var(--devui-form-control-line-hover)",
                            },
                            data: {
                                title: value.title,
                                date: value.date,
                                status: value.severity,
                                color: this.severityToDotColor(
                                    value.severity as IncidentSeverityType
                                ),
                                position: index % 2 ? "top" : "bottom",
                                brief: value.brief,
                            },
                        };
                    });
            });
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
    }
}
