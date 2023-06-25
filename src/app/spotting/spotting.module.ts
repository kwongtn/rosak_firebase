import { CheckBoxModule, DevUIModule, PanelModule } from "ng-devui";
import { AlertModule } from "ng-devui/alert";
import { CascaderModule } from "ng-devui/cascader";
import { DataTableModule } from "ng-devui/data-table";
import { DatepickerModule } from "ng-devui/datepicker";
import { IconModule } from "ng-devui/icon";
import { LoadingModule } from "ng-devui/loading";
import { ModalModule } from "ng-devui/modal";
import { SelectModule } from "ng-devui/select";
import { TabsModule } from "ng-devui/tabs";
import { TagsModule } from "ng-devui/tags";
import { TimeAxisModule } from "ng-devui/time-axis";
import { TooltipModule } from "ng-devui/tooltip";
import { UploadModule } from "ng-devui/upload";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzPopconfirmModule } from "ng-zorro-antd/popconfirm";
import { NzProgressModule } from "ng-zorro-antd/progress";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    SpottingImageListModule,
} from "src/app/@ui/spotting-image-list/spotting-image-list.module";
import {
    SpottingStorageService,
} from "src/app/services/spotting/storage.service";

import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

import {
    SpottingTypeCellDisplayModule,
} from "../@ui/spotting-type-cell-display/spotting-type-cell-display.module";
import {
    ImagePreviewButtonModule,
} from "../@ui/spotting/image-preview-button/image-preview-button.module";
import {
    VehicleStatusTagModule,
} from "../@ui/vehicle-status-tag/vehicle-status-tag.module";
import { GraphQLModule } from "../graphql.module";
import {
    CoordinatesHumanizerModule,
} from "../pipes/coordinates-humanizer/coordinates-humanizer.module";
import {
    SpottingTypePipeModule,
} from "../pipes/spotting-type/spotting-type.module";
import {
    VehicleStatusPipeModule,
} from "../pipes/vehicle-status/vehicle-status.module";
import {
    GetLinesAndVehiclesGqlService,
} from "./services/get-lines-vehicles-gql.service";
import {
    GetStationLinesGqlService,
} from "./services/get-station-lines-gql.service";
import {
    FormUploadComponent,
} from "./spotting-form/form-upload/form-upload.component";
import { SpottingFormComponent } from "./spotting-form/spotting-form.component";
import { SpottingMainComponent } from "./spotting-main/spotting-main.component";
import {
    InlineHistoryComponent,
} from "./vehicle-type-container/spotting-table/inline-history/inline-history.component";
import {
    InlineTimelineComponent,
} from "./vehicle-type-container/spotting-table/inline-timeline/inline-timeline.component";
import {
    SpottingTableComponent,
} from "./vehicle-type-container/spotting-table/spotting-table.component";
import {
    VehicleTypeContainerComponent,
} from "./vehicle-type-container/vehicle-type-container.component";

@NgModule({
    declarations: [
        FormUploadComponent,
        InlineHistoryComponent,
        InlineTimelineComponent,
        SpottingFormComponent,
        SpottingMainComponent,
        SpottingTableComponent,
        VehicleTypeContainerComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        HttpClientModule,
        ReactiveFormsModule,

        // DevUI
        AlertModule,
        CascaderModule,
        CheckBoxModule,
        DataTableModule,
        DatepickerModule,
        DevUIModule,
        IconModule,
        LoadingModule,
        ModalModule,
        PanelModule,
        SelectModule,
        TabsModule,
        TagsModule,
        TimeAxisModule,
        TooltipModule,
        UploadModule,

        // Internal Imports
        CoordinatesHumanizerModule,
        GraphQLModule,
        ImagePreviewButtonModule,
        SpottingImageListModule,
        SpottingTypeCellDisplayModule,
        SpottingTypePipeModule,
        VehicleStatusPipeModule,
        VehicleStatusTagModule,

        // ng-zorro
        NzGridModule,
        NzIconModule,
        NzPopconfirmModule,
        NzProgressModule,
        NzSpinModule,
        NzToolTipModule,
    ],
    exports: [SpottingFormComponent, SpottingMainComponent],
    providers: [
        SpottingStorageService,
        GetLinesAndVehiclesGqlService,
        GetStationLinesGqlService,
    ],
})
export class SpottingModule {}
