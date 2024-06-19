import { DevUIModule, PanelModule } from "ng-devui";
import { DataTableModule } from "ng-devui/data-table";
import { IconModule } from "ng-devui/icon";
import { TagsModule } from "ng-devui/tags";
import { TimeAxisModule } from "ng-devui/time-axis";
import { NzAlertModule } from "ng-zorro-antd/alert";
import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzDatePickerModule } from "ng-zorro-antd/date-picker";
import { NzDrawerModule } from "ng-zorro-antd/drawer";
import { NzEmptyModule } from "ng-zorro-antd/empty";
import { NzFormModule } from "ng-zorro-antd/form";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzInputModule } from "ng-zorro-antd/input";
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
    FormUploadComponent,
} from "src/app/@ui/spotting/form-upload/form-upload.component";
import {
    VehicleStatusPipe,
} from "src/app/pipes/vehicle-status/vehicle-status.pipe";
import {
    SpottingStorageService,
} from "src/app/services/spotting-storage.service";

import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

import { ActionListComponent } from "../@ui/action-list/action-list.component";
import {
    LineStatusTagComponent,
} from "../@ui/line-status-tag/line-status-tag.component";
import {
    SpottingTypeCellDisplayComponent,
} from "../@ui/spotting-type-cell-display/spotting-type-cell-display.component";
import {
    ImagePreviewButtonComponent,
} from "../@ui/spotting/image-preview-button/image-preview-button.component";
import {
    VehicleStatusTagModule,
} from "../@ui/vehicle-status-tag/vehicle-status-tag.module";
import {
    WheelStatusTagComponent,
} from "../@ui/wheel-status-tag/wheel-status-tag.component";
import { GraphQLModule } from "../graphql.module";
import {
    CoordinatesHumanizerPipe,
} from "../pipes/coordinates-humanizer/coordinates-humanizer.pipe";
import { SpottingTypePipe } from "../pipes/spotting-type/spotting-type.pipe";
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
        DataTableModule,
        DevUIModule,
        IconModule,
        PanelModule,
        TagsModule,
        TimeAxisModule,

        // Internal Imports
        ActionListComponent,
        CoordinatesHumanizerPipe,
        FormUploadComponent,
        GraphQLModule,
        ImagePreviewButtonComponent,
        LineStatusTagComponent,
        SpottingImageListModule,
        SpottingTypeCellDisplayComponent,
        SpottingTypePipe,
        VehicleStatusPipe,
        VehicleStatusTagModule,
        WheelStatusTagComponent,

        // ng-zorro
        NzAlertModule,
        NzButtonModule,
        NzCheckboxModule,
        NzDatePickerModule,
        NzDrawerModule,
        NzEmptyModule,
        NzFormModule,
        NzGridModule,
        NzIconModule,
        // NzImageModule,
        NzInputModule,
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
