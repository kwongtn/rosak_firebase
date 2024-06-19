import { DevUIModule, PanelModule } from "ng-devui";
import { DataTableModule } from "ng-devui/data-table";
import { IconModule } from "ng-devui/icon";
import { TagsModule } from "ng-devui/tags";
import { TimeAxisModule } from "ng-devui/time-axis";
import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzDrawerModule } from "ng-zorro-antd/drawer";
import { NzEmptyModule } from "ng-zorro-antd/empty";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzPopconfirmModule } from "ng-zorro-antd/popconfirm";
import { NzProgressModule } from "ng-zorro-antd/progress";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzTabsModule } from "ng-zorro-antd/tabs";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    SpottingImageListModule,
} from "src/app/@ui/spotting-image-list/spotting-image-list.module";
import {
    VehicleStatusPipe,
} from "src/app/pipes/vehicle-status/vehicle-status.pipe";
import {
    SpottingStorageService,
} from "src/app/services/spotting-storage.service";

import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

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
        SpottingMainComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        HttpClientModule,

        // DevUI
        DataTableModule,
        DevUIModule,
        IconModule,
        PanelModule,
        TagsModule,
        TimeAxisModule,

        // Internal Imports
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
        NzButtonModule,
        NzCheckboxModule,
        NzDrawerModule,
        NzEmptyModule,
        NzIconModule,
        NzListModule,
        NzPopconfirmModule,
        NzProgressModule,
        NzSpinModule,
        NzTabsModule,
        NzToolTipModule,

        InlineHistoryComponent,
        SpottingFormComponent,
        InlineTimelineComponent,
        SpottingTableComponent,
        VehicleTypeContainerComponent,
    ],
    exports: [SpottingFormComponent, SpottingMainComponent],
    providers: [
        SpottingStorageService,
        GetLinesAndVehiclesGqlService,
        GetStationLinesGqlService,
    ],
})
export class SpottingModule {}
