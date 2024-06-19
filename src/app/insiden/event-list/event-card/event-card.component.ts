import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzDrawerRef, NzDrawerService } from "ng-zorro-antd/drawer";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzModalService } from "ng-zorro-antd/modal";
import { NzTagModule } from "ng-zorro-antd/tag";
import { NzTimelineModule } from "ng-zorro-antd/timeline";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    ImageFile,
} from "src/app/@ui/spotting/form-upload/form-upload.component";
import {
    CalendarIncidentSeverityPipe,
} from "src/app/pipes/calendar-incident-severity/calendar-incident-severity.pipe";
import {
    ImageUploadService,
} from "src/app/services/spotting/image-upload.service";
import { ToastService } from "src/app/services/toast.service";

import { CommonModule } from "@angular/common";
import {
    Component,
    HostListener,
    Input,
    OnDestroy,
    OnInit,
    TemplateRef,
    ViewChild,
} from "@angular/core";

import {
    EventDetailsModalComponent,
} from "../event-details-modal/event-details-modal.component";
import { CalendarIncidentListItem } from "../event-list.component";
import { getReadableTimeDifference } from "../event-list.component.util";
import { ImageDrawerComponent } from "./image-drawer/image-drawer.component";

@Component({
    selector: "insiden-event-card",
    templateUrl: "./event-card.component.html",
    styleUrls: ["./event-card.component.scss"],
    standalone: true,
    imports: [
        CalendarIncidentSeverityPipe,
        CommonModule,
        NzBadgeModule,
        NzCardModule,
        NzGridModule,
        NzTagModule,
        NzTimelineModule,
        NzToolTipModule,
    ],
})
export class EventCardComponent implements OnInit, OnDestroy {
    @Input() data!: CalendarIncidentListItem;
    displayData!: CalendarIncidentListItem;

    timer: NodeJS.Timeout | undefined = undefined;
    elapsedTime: string = "";

    constructor(
        private modalService: NzModalService,
        private drawerService: NzDrawerService,
        private imageUploadService: ImageUploadService,
        private toastService: ToastService
    ) {
        this.resize();
    }

    ngOnInit(): void {
        this.displayData = JSON.parse(JSON.stringify(this.data));

        if (this.displayData.chronologies.length === 0) {
            this.displayData.chronologies.push({
                order: "0",
                sourceUrl: "",
                indicator: "blue",
                datetime: this.displayData.startDatetime,
                content: "Start of incident",
            });

            if (this.displayData.endDatetime) {
                this.displayData.chronologies.push({
                    order: "1",
                    sourceUrl: "",
                    indicator: "green",
                    datetime: this.displayData.endDatetime,
                    content: "Issue resolved",
                });
            }
        }

        this.displayData.chronologies = this.displayData.chronologies.map(
            (c) => {
                return {
                    ...c,
                    content: c.content.split("\r\n").join("<br />"),
                };
            }
        );
        this.displayData.chronologies.sort((a, b) => {
            return Number(a.order) - Number(b.order);
        });

        this.displayData.brief = this.displayData.brief
            .split("\r\n")
            .join("<br />");

        const startDatetime: Date = new Date(this.displayData.startDatetime);

        if (this.displayData.endDatetime) {
            this.displayData.duration = getReadableTimeDifference(
                startDatetime,
                new Date(this.displayData.endDatetime)
            );
        } else {
            this.elapsedTime = getReadableTimeDifference(
                startDatetime,
                new Date()
            );
            // Repeating cause I want it to run immediately first
            this.timer = setInterval(() => {
                this.elapsedTime = getReadableTimeDifference(
                    startDatetime,
                    new Date()
                );
            }, 200);
        }

        // All entries before May 2023 are considered inccurate
        if (
            startDatetime.getFullYear() <= 2023 &&
            startDatetime.getMonth() <= 3
        ) {
            this.displayData.inaccurate = true;
        }
    }

    ngOnDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    onDetailsClick($event: MouseEvent): void {
        this.modalService.create({
            nzTitle: this.displayData.title,
            nzContent: EventDetailsModalComponent,
            nzCancelText: null,
            nzClosable: true,
            nzOkText: null,
            nzWidth: "80vw",
            nzData: this.displayData,
        });
    }

    @ViewChild("drawerFooter") drawerFooter!: TemplateRef<any>;

    /**
     * 280px - 1 img
     * 480px - 2 imgs
     * 700px - 3 imgs
     * 905px - 4 imgs
     */
    width: string = "700px";
    drawerRef!: NzDrawerRef<ImageDrawerComponent, string>;

    @HostListener("window:resize")
    resize(): void {
        const clientWidth = document.body.clientWidth;
        this.width =
            clientWidth < 500
                ? "280px"
                : clientWidth < 1024
                    ? "480px"
                    : clientWidth < 1300
                        ? "700px"
                        : "905px";
    }

    onImagePanelClick($event: MouseEvent): void {
        this.drawerRef = this.drawerService.create<
            ImageDrawerComponent,
            { value: string },
            string
        >({
            nzTitle: `🖼️ - ${this.displayData.title}`,
            // nzExtra: 'Extra',
            nzFooter: this.drawerFooter,
            nzWidth: this.width,
            nzContent: ImageDrawerComponent,
            nzContentParams: {
                incidentId: this.data.id,
            },
        });
    }

    close() {
        this.drawerRef?.close();
    }

    submit() {
        const pendingUploads: ImageFile[] =
            this.drawerRef?.getContentComponent()?.pendingUploads ?? [];

        if (pendingUploads.length > 0) {
            pendingUploads.forEach((file: ImageFile) => {
                this.imageUploadService.addToQueue(
                    this.drawerRef?.getContentComponent()?.incidentId as string,
                    file,
                    "INCIDENT_CALENDAR_INCIDENT"
                );
            });
            this.toastService.addMessage(
                "Image upload queued. Please wait for uploads to complete before closing this tab.",
                "info"
            );
        }
        this.drawerRef?.close();
    }
}
