import { NzAvatarModule } from "ng-zorro-antd/avatar";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzTagModule } from "ng-zorro-antd/tag";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import { NzTypographyModule } from "ng-zorro-antd/typography";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { AboutComponent } from "./about.component";
import { AvatarCardComponent } from "./avatar-card/avatar-card.component";
import { ProjectsCardComponent } from "./projects-card/projects-card.component";
import {
    TechstackCardComponent,
} from "./techstack-card/techstack-card.component";

@NgModule({
    declarations: [
        AboutComponent,
        AvatarCardComponent,
        ProjectsCardComponent,
        TechstackCardComponent,
    ],
    imports: [
        CommonModule,

        // ng-zorro-antd
        NzAvatarModule,
        NzCardModule,
        NzGridModule,
        NzIconModule,
        NzListModule,
        NzSpinModule,
        NzTagModule,
        NzToolTipModule,
        NzTypographyModule,
    ],
})
export class AboutModule {}
