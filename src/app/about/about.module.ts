import { AvatarModule } from "ng-devui/avatar";
import { CardModule } from "ng-devui/card";
import { TagsModule } from "ng-devui/tags";

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
    imports: [CommonModule, CardModule, AvatarModule, TagsModule],
})
export class AboutModule {}
