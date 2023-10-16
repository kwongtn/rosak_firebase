import { Apollo, gql } from "apollo-angular";
import { NzDrawerRef, NzDrawerService } from "ng-zorro-antd/drawer";
import { firstValueFrom, Observable, Subscription } from "rxjs";
import {
    GetLinesAndVehiclesResponse,
    GetLinesResponse,
    LineStatus,
} from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";
import {
    ImageUploadService,
} from "src/app/services/spotting/image-upload.service";
import { environment } from "src/environments/environment";

import {
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    TemplateRef,
    ViewChild,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import {
    SessionHistoryService,
} from "../services/session-history/session-history.service";
import { ToastService } from "../services/toast/toast.service";
import {
    SpottingFormComponent,
    SpottingFormReturnType,
} from "./spotting-form/spotting-form.component";
import { lineQueryResultToTabEntries, LineTabType } from "./utils";

const GET_LINES = gql`
    query GetLinesAndVehicles {
        lines {
            id
            code
            displayName
            status
        }
    }
`;

@Component({
    selector: "app-spotting-main",
    templateUrl: "./spotting-main.component.html",
    styleUrls: ["./spotting-main.component.scss"],
})
export class SpottingMainComponent implements OnInit, OnDestroy {
    env = environment;
    tableData: TableDataType[] = [];
    showLoading: boolean = true;

    tabActiveId: string | number | undefined = undefined;
    tabActiveTitle: string = "";
    tabItems: LineTabType[] = [];
    tabLineStatus: LineStatus = "ACTIVE";

    countIcon: number = 0;
    $countIcon: Subscription | undefined = undefined;

    $totalCountIcon: Observable<number> | undefined = undefined;
    $uploadPercentage: Observable<number> | undefined = undefined;

    hadUpload: boolean = false;

    currentDataId: string | undefined;
    vehicleAndLineData: GetLinesAndVehiclesResponse | undefined = undefined;

    drawerRef:
        | NzDrawerRef<SpottingFormComponent, SpottingFormReturnType | undefined>
        | undefined = undefined;
    @ViewChild("drawerFooter") drawerFooter!: TemplateRef<any>;

    private querySubscription!: Subscription;
    private routeSubscription!: Subscription;

    width: string = "700px";
    @HostListener("window:resize")
    resize(): void {
        const clientWidth = document.body.clientWidth;
        this.width = clientWidth < 700 ? "100vw" : "700px";
    }

    constructor(
        private drawerService: NzDrawerService,
        private toastService: ToastService,
        private apollo: Apollo,
        private router: Router,
        private route: ActivatedRoute,
        private imageUploadService: ImageUploadService,
        private sessionHistoryService: SessionHistoryService
    ) {
        this.resize();
    }

    async onFormCloseHandle(data: SpottingFormReturnType | undefined) {
        console.log(data);
        if (!data) {
            return;
        }
        const { spottingSubmission, uploads } = data;
        try {
            const mutationResult = await spottingSubmission;

            if (!mutationResult) {
                this.toastService.addToast(
                    "Error",
                    "Form is invalid.",
                    "error"
                );
                return;
            }

            if (mutationResult.data?.addEvent.id) {
                console.log(
                    `Mutation successful, adding ${uploads.length} file to upload queue.`
                );
                uploads.forEach((file) => {
                    this.imageUploadService.addToQueue(
                        mutationResult.data?.addEvent.id,
                        file,
                        "SPOTTING_EVENT"
                    );
                });
            }

            let toastMessage = "Spotting entry recorded! ";
            if (uploads.length > 0) {
                toastMessage +=
                    "Please wait for uploads to complete before closing this tab.";
            } else {
                toastMessage += "🥳";
            }

            this.toastService.addMessage(toastMessage, "success");

            return true;
        } catch (reason: any) {
            console.log(reason);

            this.toastService.addToast("Error", reason.message, "error");
            return false;
        }
    }

    openStandardDialog(dialogtype?: string) {
        this.drawerRef = this.drawerService.create<
            SpottingFormComponent,
            unknown,
            SpottingFormReturnType | undefined
        >({
            nzTitle: "Add spotting entry",
            nzFooter: this.drawerFooter,
            nzContent: SpottingFormComponent,
            nzContentParams: {},
            nzWidth: this.width,
        });
    }

    close() {
        this.drawerRef?.close();
    }

    submit() {
        this.drawerRef
            ?.getContentComponent()
            ?.onSubmit()
            ?.then(({ spottingSubmission, uploads, formData }) => {
                this.onFormCloseHandle({
                    uploads,
                    spottingSubmission,
                }).then(async (res) => {
                    if (res) {
                        const submissionData = await spottingSubmission;
                        this.sessionHistoryService.addSessionHistory(
                            "spotting",
                            {
                                ...formData,
                                id: submissionData?.data.addEvent.id,
                            }
                        );

                        this.drawerRef?.close();
                    }
                });
            })
            .catch((reason: any) => {
                this.toastService.addMessage(
                    `Unknown Error: ${reason.message}`,
                    "error"
                );
            });
    }

    ngOnInit(): void {
        this.routeSubscription = this.route.params.subscribe((params: any) => {
            this.currentDataId = params["id"];
        });

        this.$totalCountIcon =
            this.imageUploadService.$totalUploadCount.asObservable();
        this.$uploadPercentage =
            this.imageUploadService.$percentUploaded.asObservable();

        this.$countIcon = this.imageUploadService.$pendingUploadCount.subscribe(
            (count) => {
                this.countIcon = count;

                if (!this.hadUpload && count > 0) {
                    this.hadUpload = true;
                }
            }
        );

        this.apollo
            .query<GetLinesResponse>({
                query: GET_LINES,
            })
            .subscribe(({ data, loading }) => {
                this.showLoading = loading;

                this.tabItems = lineQueryResultToTabEntries(data);

                if (!this.currentDataId) {
                    this.tabActiveId = data.lines[0].id;
                    firstValueFrom(this.route.url).then((value) => {
                        this.router.navigate([value[0].path, data.lines[0].id]);
                    });
                } else {
                    this.tabActiveId = this.currentDataId;
                }

                this.setActiveTitle();
            });
    }

    ngOnDestroy() {
        // this.querySubscription.unsubscribe();
        this.routeSubscription.unsubscribe();
        this.$countIcon?.unsubscribe();
    }

    activeTabChange(event: any) {
        console.log("Active tab change: ", event);

        this.router.navigate(["spotting", event]);

        this.tabActiveId = event;
        // this.filterTabItems();
        this.setActiveTitle();
    }

    setActiveTitle() {
        const currObj = this.tabItems.find((val) => {
            return val.id === this.tabActiveId;
        });
        this.tabActiveTitle = currObj?.detail ?? "";
        this.tabLineStatus = currObj?.lineStatus ?? "ACTIVE";
    }
}
