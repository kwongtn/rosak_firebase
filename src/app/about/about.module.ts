import { AvatarModule } from "ng-devui/avatar";
import { CardModule } from "ng-devui/card";
import { LoadingModule } from "ng-devui/loading";
import { TagsModule } from "ng-devui/tags";
import { TooltipModule } from "ng-devui/tooltip";
import { NzAvatarModule } from "ng-zorro-antd/avatar";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { AboutComponent } from "./about/about.component";
import { AvatarCardComponent } from "./avatar-card/avatar-card.component";
import { ProjectsCardComponent } from "./projects-card/projects-card.component";
import {
    TechstackCardComponent,
} from "./techstack-card/techstack-card.component";

@NgModule({
    declarations: [
        AboutComponent,
        AvatarCardComponent,
        TechstackCardComponent,
        ProjectsCardComponent,
    ],
    imports: [
        CommonModule,
        CardModule,
        AvatarModule,
        TagsModule,
        LoadingModule,
        TooltipModule,
        NzCardModule,
        NzAvatarModule,
        NzToolTipModule,
        NzListModule,
        NzGridModule,
        NzSpinModule,
        NzIconModule,
    ],
})
export class AboutModule {}
