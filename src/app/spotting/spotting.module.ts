import { CheckBoxModule, DevUIModule, PanelModule } from "ng-devui";
import { CascaderModule } from "ng-devui/cascader";
import { DataTableModule } from "ng-devui/data-table";
import { DatepickerModule } from "ng-devui/datepicker";
import { IconModule } from "ng-devui/icon";
import { SelectModule } from "ng-devui/select";
import { TagsModule } from "ng-devui/tags";
import { TimeAxisModule } from "ng-devui/time-axis";
import { NzAlertModule } from "ng-zorro-antd/alert";
import { NzButtonModule } from "ng-zorro-antd/button";
import { NzDrawerModule } from "ng-zorro-antd/drawer";
import { NzEmptyModule } from "ng-zorro-antd/empty";
import { NzFormModule } from "ng-zorro-antd/form";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzImageModule } from "ng-zorro-antd/image";
import { NzListModule } from "ng-zorro-antd/list";
import { NzPopconfirmModule } from "ng-zorro-antd/popconfirm";
import { NzProgressModule } from "ng-zorro-antd/progress";
import { NzSelectModule } from "ng-zorro-antd/select";
import { NzSpaceModule } from "ng-zorro-antd/space";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzTabsModule } from "ng-zorro-antd/tabs";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    SpottingImageListModule,
} from "src/app/@ui/spotting-image-list/spotting-image-list.module";
import {
    FormUploadModule,
} from "src/app/@ui/spotting/form-upload/form-upload.module";
import {
    SpottingStorageService,
} from "src/app/services/spotting/storage.service";

import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

import { ActionListModule } from "../@ui/action-list/action-list.module";
import {
    LineStatusTagModule,
} from "../@ui/line-status-tag/line-status-tag.module";
import {
    SpottingTypeCellDisplayModule,
} from "../@ui/spotting-type-cell-display/spotting-type-cell-display.module";
import {
    ImagePreviewButtonModule,
} from "../@ui/spotting/image-preview-button/image-preview-button.module";
import {
    VehicleStatusTagModule,
} from "../@ui/vehicle-status-tag/vehicle-status-tag.module";
import {
    WheelStatusTagModule,
} from "../@ui/wheel-status-tag/wheel-status-tag.module";
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
import { SpottingFormComponent } from "./spotting-form/spotting-form.component";
import { SpottingMainComponent } from "./spotting-main.component";
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
        CascaderModule,
        CheckBoxModule,
        DataTableModule,
        DatepickerModule,
        DevUIModule,
        IconModule,
        PanelModule,
        SelectModule,
        TagsModule,
        TimeAxisModule,

        // Internal Imports
        ActionListModule,
        CoordinatesHumanizerModule,
        FormUploadModule,
        GraphQLModule,
        ImagePreviewButtonModule,
        LineStatusTagModule,
        SpottingImageListModule,
        SpottingTypeCellDisplayModule,
        SpottingTypePipeModule,
        VehicleStatusPipeModule,
        VehicleStatusTagModule,
        WheelStatusTagModule,

        // ng-zorro
        NzAlertModule,
        NzButtonModule,
        NzDrawerModule,
        NzEmptyModule,
        NzFormModule,
        NzGridModule,
        NzGridModule,
        NzIconModule,
        NzIconModule,
        NzImageModule,
        NzListModule,
        NzPopconfirmModule,
        NzProgressModule,
        NzSelectModule,
        NzSpaceModule,
        NzSpinModule,
        NzTabsModule,
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
