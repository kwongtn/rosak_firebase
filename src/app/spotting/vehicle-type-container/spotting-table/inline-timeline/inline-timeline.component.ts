import { Apollo, gql } from "apollo-angular";
import { TimeAxisData } from "ng-devui/time-axis";
import { Subscription } from "rxjs";
import { GetVehicleIncidentsResponse } from "src/app/models/query/get-vehicles";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

import { severityToDotColor } from "./utils";

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
    selector: "app-inline-timeline",
    templateUrl: "./inline-timeline.component.html",
    styleUrls: ["./inline-timeline.component.scss"],
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
                            dotColor: severityToDotColor(value.severity as any),
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
                                color: severityToDotColor(
                                    value.severity as any
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
